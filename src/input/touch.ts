/**
 * Controle por TOQUE.
 *
 * A sim não muda uma linha: ela continua recebendo os mesmos seis booleanos
 * por tick, e o replay de um toque é indistinguível do replay de uma tecla.
 * Isso é escolha, não limitação de esforço — um manche ANALÓGICO daria
 * velocidade contínua, que é literalmente o relógio do mundo neste jogo, mas
 * mudaria o contrato do `InputFrame` e invalidaria todo replay já gravado. Se
 * um dia valer a pena, é decisão de design com custo nomeado, não detalhe de
 * porte para celular.
 *
 * O manche é DIGITAL e quantiza em 8 direções — as mesmas oito do teclado, as
 * mesmas oito que o atlas do jogador tem assadas.
 */

/** As quatro direções, já quantizadas. */
export interface Axis {
  readonly up: boolean
  readonly down: boolean
  readonly left: boolean
  readonly right: boolean
}

/** Estado cru dos dedos. Quem traduz para `InputFrame` é `main.ts`, que sabe a fase. */
export interface TouchState extends Axis {
  /** O botão de impulso, segurado. Vira `action` ou `restart` conforme a fase. */
  readonly press: boolean
  /**
   * O TOQUE CURTO, em px de tela — encostar e soltar sem arrastar. 14/08.
   *
   * Existe porque o cérebro ganhou cinco portas que se abrem no ponteiro, e no
   * iPad NENHUM clique chegava à sim: a camada de toque cobre a tela inteira,
   * então o guarda que impede o pad de virar clique engolia todos. Medido — a
   * porta não abria no toque, e um painel aberto ANDANDO virava armadilha,
   * porque `restart` no toque só existe na tela de morte.
   *
   * A desambiguação é a mais antiga que existe: arrastou é manche, tocou é
   * ponteiro. Um toque sem arrasto não move nada (fica dentro da zona morta),
   * então as duas leituras não competem pelo mesmo gesto.
   *
   * `null` quando não houve toque no tick. Consumido na leitura, como o trinco.
   */
  readonly tap: { readonly x: number; readonly y: number } | null
  /**
   * Onde o dedo está AGORA, em px de tela, ou `null` se não há dedo. 14/08.
   *
   * Existe porque nas TELAS o pad deixa de ser pad: lá não há o que impelir e
   * não há para onde andar, então a camada inteira é um ponteiro e um dedo
   * encostado é um botão apertado. Sem a posição contínua, "clicar fora" no
   * toque dependeria do heurístico de toque curto — e um dedo que demora ou
   * escorrega deixaria de fechar a tela sem que ninguém soubesse por quê.
   */
  readonly dedo: { readonly x: number; readonly y: number } | null
}

export interface TouchPad {
  state(): TouchState
  dispose(): void
}

const NEUTRO: Axis = { up: false, down: false, left: false, right: false }

/**
 * Raio morto do manche, em px de CSS.
 *
 * Não é conforto: ficar PARADO é mecânica central — é o que faz o mundo andar
 * a `time.creep`, e é onde a cura acontece. Um manche sem zona morta larga
 * transforma "parar" em perícia de dedo, e o core do projeto morre no porte.
 */
export const DEAD_ZONE = 16

/** Até onde o botão do manche acompanha o dedo, em px de CSS. */
export const STICK_RADIUS = 42

const OITAVA = Math.PI / 4

/**
 * Vetor do dedo (em px de tela, y para BAIXO) → as quatro booleanas.
 *
 * Função pura e exportada porque é a única parte disto que dá para travar em
 * teste sem browser — e é a parte onde um erro sai como "o jogo anda torto".
 */
export function stickBits(dx: number, dy: number, dead: number = DEAD_ZONE): Axis {
  if (Math.hypot(dx, dy) < dead) return NEUTRO
  const oct = (Math.round(Math.atan2(dy, dx) / OITAVA) + 8) % 8
  return {
    right: oct === 7 || oct === 0 || oct === 1,
    down: oct === 1 || oct === 2 || oct === 3,
    left: oct === 3 || oct === 4 || oct === 5,
    up: oct === 5 || oct === 6 || oct === 7,
  }
}

/** O ponteiro é grosso? `?touch=1` força ligado, `?touch=0` força desligado. */
export function touchMode(search: string = location.search): boolean {
  const forced = new URLSearchParams(search).get("touch")
  if (forced === "1") return true
  if (forced === "0") return false
  return (
    (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ||
    navigator.maxTouchPoints > 0
  )
}

interface Dedo {
  /** Onde o dedo encostou. O manche é FLUTUANTE: nasce sob o dedo. */
  readonly ox: number
  readonly oy: number
  x: number
  y: number
}

/**
 * Metade esquerda move, metade direita dá impulso.
 *
 * Divisão por metade e não por dois botões desenhados porque no iPad o polegar
 * não mira: ele cai onde a mão já está. Os círculos na tela são afordância —
 * a área que responde é a metade inteira.
 */
export function createTouchPad(layer: HTMLElement): TouchPad {
  const manche = layer.querySelector<HTMLElement>("#manche")
  const botao = layer.querySelector<HTMLElement>("#botao-manche")
  const impulso = layer.querySelector<HTMLElement>("#impulso")

  /** Um dedo por lado. O segundo dedo do mesmo lado é ignorado. */
  let stick: { id: number; dedo: Dedo } | null = null
  const pressing = new Set<number>()

  /**
   * TRINCO do toque curto.
   *
   * O teclado não precisa disto e por isso o defeito não existia antes: uma
   * tecla fica presa milhares de ticks. Um toque de verdade dura ~80ms, mas um
   * toque APRESSADO dura menos de 16ms — e a sim lê o controle uma vez por
   * tick, com detecção de BORDA. Um toque inteiro cabendo entre dois ticks
   * simplesmente não acontece: o card não dispensa, o impulso não sai, e para
   * quem está com o iPad na mão o jogo "ignorou o toque".
   *
   * O trinco garante que todo toque seja visto por PELO MENOS um tick. Ele é
   * consumido na leitura, então dura exatamente uma borda — nunca vira toque
   * fantasma no tick seguinte.
   */
  let latch = false

  /**
   * O TOQUE CURTO pendente, e o que faz dele curto.
   *
   * `DEAD_ZONE` de deslocamento é o mesmo limiar que decide se o manche saiu do
   * neutro — reusado de propósito: o gesto que não moveu o jogador é
   * exatamente o gesto que sobra para significar outra coisa. Dois limiares
   * diferentes deixariam uma faixa onde o dedo move E toca.
   */
  let tap: { x: number; y: number } | null = null
  const inicio = new Map<number, { x: number; y: number; t: number }>()
  /** O último dedo que encostou, enquanto ele estiver encostado. */
  let dedo: { x: number; y: number } | null = null
  /**
   * O dedo que ACABOU de sair, guardado para UMA leitura.
   *
   * É o mesmo trinco do toque curto e do impulso, pela mesma razão: um toque
   * que encosta e sai entre dois ticks nunca existiu para a sim. O `dedo`
   * contínuo resolve o dedo que DEMORA; este resolve o que não demora nada — e
   * os dois juntos são o que faz "clicar fora" fechar a tela sempre, e não
   * quase sempre.
   */
  let dedoSolto: { x: number; y: number } | null = null

  const isDireita = (x: number): boolean => x >= window.innerWidth / 2

  const pinta = (): void => {
    if (manche !== null && botao !== null) {
      if (stick === null) {
        manche.classList.remove("ativo")
      } else {
        const { ox, oy, x, y } = stick.dedo
        manche.classList.add("ativo")
        manche.style.left = `${ox}px`
        manche.style.top = `${oy}px`
        const dx = x - ox
        const dy = y - oy
        const mag = Math.hypot(dx, dy)
        const k = mag > STICK_RADIUS ? STICK_RADIUS / mag : 1
        botao.style.transform = `translate(${dx * k}px, ${dy * k}px)`
      }
    }
    impulso?.classList.toggle("ativo", pressing.size > 0)
  }

  const onDown = (event: PointerEvent): void => {
    // O botão de tela cheia é o único filho que recebe ponteiro. Deixa passar.
    if (event.target instanceof Element && event.target.closest("#tela-cheia") !== null) return
    event.preventDefault()
    inicio.set(event.pointerId, { x: event.clientX, y: event.clientY, t: 0 })
    dedo = { x: event.clientX, y: event.clientY }
    if (isDireita(event.clientX)) {
      pressing.add(event.pointerId)
      latch = true
    } else if (stick === null) {
      stick = {
        id: event.pointerId,
        dedo: { ox: event.clientX, oy: event.clientY, x: event.clientX, y: event.clientY },
      }
    }
    pinta()
  }

  const onMove = (event: PointerEvent): void => {
    // A posição do dedo é seguida SEMPRE, mesmo do lado do impulso: nas telas
    // não há manche, e quem responde ali é o ponteiro.
    if (inicio.has(event.pointerId)) dedo = { x: event.clientX, y: event.clientY }
    if (stick === null || stick.id !== event.pointerId) return
    event.preventDefault()
    stick.dedo.x = event.clientX
    stick.dedo.y = event.clientY
    dedo = { x: event.clientX, y: event.clientY }
    pinta()
  }

  const onUp = (event: PointerEvent): void => {
    const i0 = inicio.get(event.pointerId)
    inicio.delete(event.pointerId)
    if (i0 !== undefined) {
      const andou = Math.hypot(event.clientX - i0.x, event.clientY - i0.y)
      /*
       * SEM limite de tempo, e isso mudou em 14/08.
       *
       * A primeira versão exigia menos de 400ms, e é um limite que um dedo real
       * estoura sem esforço — apertar para fechar uma tela é um gesto
       * deliberado, não um tapinha. O que separa toque de manche é ter ANDADO,
       * e só isso: dedo parado não moveu o glóbulo, então ele sobra inteiro
       * para significar outra coisa, tenha durado o que tiver durado.
       *
       * O toque é registrado onde COMEÇOU, não onde soltou: o dedo escorrega
       * alguns pixels ao levantar, e o alvo é onde a pessoa mirou.
       */
      if (andou < DEAD_ZONE) tap = { x: i0.x, y: i0.y }
    }
    if (stick !== null && stick.id === event.pointerId) stick = null
    pressing.delete(event.pointerId)
    if (inicio.size === 0) {
      dedoSolto = dedo
      dedo = null
    }
    pinta()
  }

  /*
   * Perder a página com o dedo apoiado deixaria o input grudado — o mesmo
   * defeito que o `blur` do teclado resolve, e aqui ele é pior: um dedo preso
   * mantém o jogador na velocidade máxima, e velocidade máxima é o relógio do
   * mundo a toda.
   */
  const solta = (): void => {
    stick = null
    pressing.clear()
    inicio.clear()
    // O trinco cai junto: um toque perdido junto com a página não é toque.
    latch = false
    tap = null
    dedo = null
    dedoSolto = null
    pinta()
  }

  layer.addEventListener("pointerdown", onDown)
  layer.addEventListener("pointermove", onMove)
  layer.addEventListener("pointerup", onUp)
  layer.addEventListener("pointercancel", onUp)
  window.addEventListener("blur", solta)
  document.addEventListener("visibilitychange", solta)
  // Sem isto o iPad ainda abre o menu de contexto ao segurar.
  layer.addEventListener("contextmenu", (e) => e.preventDefault())

  return {
    state: () => {
      const eixo = stick === null
        ? NEUTRO
        : stickBits(stick.dedo.x - stick.dedo.ox, stick.dedo.y - stick.dedo.oy)
      const press = pressing.size > 0 || latch
      latch = false
      const t = tap
      tap = null
      const d = dedo ?? dedoSolto
      dedoSolto = null
      return { ...eixo, press, tap: t, dedo: d }
    },
    dispose: () => {
      layer.removeEventListener("pointerdown", onDown)
      layer.removeEventListener("pointermove", onMove)
      layer.removeEventListener("pointerup", onUp)
      layer.removeEventListener("pointercancel", onUp)
      window.removeEventListener("blur", solta)
      document.removeEventListener("visibilitychange", solta)
    },
  }
}

/**
 * Tela cheia, com o prefixo que o Safari ainda exige no iPad.
 *
 * Vale o botão porque no iPad a barra do Safari come ~10% da altura, e a
 * altura é justamente o que decide a escala inteira: perder um degrau de
 * escala é perder um terço do tamanho do jogo, não 10%.
 */
interface SafariFullscreen {
  webkitRequestFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
}

export function fullscreenSupported(): boolean {
  const d = document as Document & SafariFullscreen
  return d.fullscreenEnabled === true || d.webkitFullscreenEnabled === true
}

export function toggleFullscreen(): void {
  const d = document as Document & SafariFullscreen
  const el = document.documentElement as HTMLElement & SafariFullscreen
  const aberto = d.fullscreenElement ?? d.webkitFullscreenElement ?? null
  if (aberto === null) {
    if (typeof el.requestFullscreen === "function") void el.requestFullscreen()
    else el.webkitRequestFullscreen?.()
  } else {
    if (typeof d.exitFullscreen === "function") void d.exitFullscreen()
    else d.webkitExitFullscreen?.()
  }
}
