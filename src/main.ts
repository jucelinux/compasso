import tuningJson from "../tuning.json"
import { createSim } from "./sim/sim.ts"
import type { InputFrame, SimState, Tuning } from "./sim/types.ts"
import { EMPTY_INPUT } from "./input/frame.ts"
import { createKeyboard } from "./input/keyboard.ts"
import {
  createTouchPad,
  fullscreenSupported,
  toggleFullscreen,
  touchMode,
} from "./input/touch.ts"
import { createRecorder, downloadReplay } from "./input/recorder.ts"
import { browserGitSha } from "./harness/gitSha.ts"
import { createRenderer, type Renderer } from "./render/renderer.ts"
import { criaTrilha } from "./audio/audio.ts"
import { applyPaletteVariant, PALETTE_NAMES } from "./render/palette.ts"

const tuning = tuningJson as Tuning
const STEP = 1 / tuning.sim.hz

const params = new URLSearchParams(location.search)
const seed = Number(params.get("seed") ?? 1234) | 0

/*
 * Sonda de paleta: `?palette=gram`. Tem que rodar ANTES de `createRenderer`,
 * porque é lá que o atlas é assado e é o assar que lê a tabela de cor.
 */
const variant = params.get("palette") ?? PALETTE_NAMES[0]!
if (!applyPaletteVariant(variant)) {
  console.warn(`paleta "${variant}" não existe — seguindo com a de sempre`)
}

/*
 * Tecla P: próxima paleta, MESMA seed.
 *
 * Recarrega em vez de trocar a tabela ao vivo, e isso é escolha e não preguiça.
 * A cor está assada dentro das texturas — trocar sem reassar não muda nada — e
 * reassar no meio da run mudaria a arte com o jogo em movimento, que é a única
 * situação em que a comparação não vale. Recarregar com a mesma seed devolve os
 * primeiros segundos idênticos, que é exatamente o que se quer comparar.
 */
window.addEventListener("keydown", (event) => {
  if (event.code !== "KeyP") return
  const i = PALETTE_NAMES.indexOf(variant)
  const next = PALETTE_NAMES[(i + 1) % PALETTE_NAMES.length]!
  const qs = new URLSearchParams(location.search)
  qs.set("palette", next)
  location.search = qs.toString()
})

const mount = document.getElementById("app")!
const hud = document.getElementById("hud")!

/*
 * O esquema de entrada é decidido UMA vez, antes de qualquer coisa nascer.
 *
 * Ele muda três coisas que não são o input: a classe do `<html>` (que revela a
 * camada de toque), o texto do HUD e as linhas de instrução DENTRO do jogo. Um
 * aparelho de toque com "ESPAÇO PRA COMEÇAR" na tela não está com o texto
 * feio — está mandando apertar uma tecla que não existe ali.
 */
const touch = touchMode()
const touchLayer = document.getElementById("toque")!
const fullscreenButton = document.getElementById("tela-cheia")!
if (touch) {
  document.documentElement.classList.add("toque")
  // Instrumentação não é interface. No telefone ela some, e `?hud=1` traz.
  if (!params.has("hud")) document.documentElement.classList.add("sem-hud")
  if (fullscreenSupported()) document.documentElement.classList.add("tem-tela-cheia")
  fullscreenButton.addEventListener("click", toggleFullscreen)
}

const sim = createSim(seed, tuning)
const keyboard = createKeyboard()
/**
 * O ponto de tela cai num ÍCONE de habilidade?
 *
 * Mora aqui porque só aqui se sabe as duas coisas de que a resposta precisa: a
 * geometria do HUD (do `tuning`) e onde o canvas está na tela. O pad lê dedos;
 * o render desenha; a ponte entre os dois é este arquivo, como já era para o
 * ponteiro.
 *
 * A fileira é a das habilidades COMPRADAS, e ela precisa ser a mesma que a sim
 * usa em `iconeEm` e que o render desenha. Três leituras da mesma fileira é
 * duas a mais do que seria seguro — mas as três derivam do mesmo `tuning.hud` e
 * do mesmo `nivel > 0`, e há teste exigindo que elas concordem.
 */
function noIconeDeHabilidade(cx: number, cy: number): boolean {
  const s = sim.state()
  if (s.phase !== "run") return false
  const p = paraArena(cx, cy)
  if (p === null) return false
  const r = tuning.hud.habToque
  let slot = 0
  for (const h of s.habilidades) {
    if (h.nivel <= 0) continue
    const ix = tuning.hud.habX + slot * tuning.hud.habStep
    const dx = p.x - ix
    const dy = p.y - tuning.hud.habY
    if (dx * dx + dy * dy <= r * r) return true
    slot++
  }
  return false
}

const pad = touch ? createTouchPad(touchLayer, noIconeDeHabilidade) : null
const recorder = createRecorder(seed, tuning, browserGitSha())
const crowdParam = params.get("crowd")

/**
 * Teclado OU toque, no mesmo `InputFrame` — nunca um terceiro contrato.
 *
 * O botão único vira `action` ou `restart` conforme a FASE, e é aqui que essa
 * tradução mora porque é aqui que a fase é conhecida. Em `dead` só `restart`
 * faz alguma coisa; em `card` e `closed` os dois avançam; em `intervalo`
 * NENHUM dos dois faz nada, porque a contagem não se pula; em `run`
 * `restart` não faz nada e `action` é o impulso. O resultado é um
 * `InputFrame` legítimo, então o F9 grava e o replay reproduz um toque com a
 * mesma fidelidade com que reproduz uma tecla.
 */
/**
 * O PONTEIRO, em coordenada de ARENA — 13/08, para as portas do cérebro.
 *
 * A conversão mora aqui e não na sim pela mesma razão que a escala inteira mora
 * aqui: a sim não sabe que existe canvas, e não pode saber. O que ela recebe é
 * um ponto em 640x360, igual ao que ela usa para tudo o mais.
 *
 * `getBoundingClientRect` e não a escala calculada em `fitInteger`: o retângulo
 * é a verdade medida depois do layout, e a escala é a intenção. Elas coincidem
 * hoje, e no dia em que não coincidirem o clique tem que seguir o que está na
 * tela — foi o CSS que colocou o canvas onde ele está.
 */
const ponteiro = { x: -1, y: -1, down: false }

/**
 * O PAD DE TOQUE não é a arena, e apertá-lo não é clicar nela.
 *
 * Sem esta guarda o mesmo dedo faria duas coisas: o pad vira `action`, e o
 * `pointerdown` que subiu por baixo dele vira clique na posição do botão. Num
 * aparelho de toque toda a interação passaria por dois caminhos ao mesmo tempo,
 * e o segundo é invisível para quem está jogando.
 */
const noPad = (event: PointerEvent): boolean =>
  touchLayer !== null && event.target instanceof Node && touchLayer.contains(event.target)

/** Ponto de TELA para ponto de ARENA. `null` quando não há canvas medido. */
function paraArena(cx: number, cy: number): { x: number; y: number } | null {
  const canvas = mount.querySelector("canvas")
  if (canvas === null) return null
  const r = canvas.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  return {
    x: ((cx - r.left) / r.width) * tuning.arena.width,
    y: ((cy - r.top) / r.height) * tuning.arena.height,
  }
}

function atualizaPonteiro(event: PointerEvent): void {
  const p = paraArena(event.clientX, event.clientY)
  if (p === null) return
  ponteiro.x = p.x
  ponteiro.y = p.y
}
window.addEventListener("pointermove", (event) => {
  if (noPad(event)) return
  atualizaPonteiro(event)
})
/**
 * O clique fica TRAVADO até ser lido uma vez.
 *
 * O evento do browser chega quando chega; a sim lê input 60 vezes por segundo.
 * Um clique curto o bastante desce e sobe entre duas leituras e nunca existe —
 * e "nunca existe" aqui significa que a porta não abre e ninguém sabe por quê.
 *
 * Achado pelo rig, que clica em milissegundos: `npm run shot` passou a não sair
 * do cérebro. O aparelho é um clicador extremo, mas o defeito é do jogo — um
 * mouse rápido de verdade cai no mesmo buraco, só que mais raramente, que é a
 * pior frequência para um defeito ter.
 */
let cliquePendente = false
window.addEventListener("pointerdown", (event) => {
  if (noPad(event)) return
  atualizaPonteiro(event)
  ponteiro.down = true
  cliquePendente = true
})
// `pointerup` na JANELA e não no canvas: soltar o botão fora dele ainda é
// soltar, e sem isto o clique fica preso ligado para sempre.
window.addEventListener("pointerup", () => {
  ponteiro.down = false
})
window.addEventListener("pointercancel", () => {
  ponteiro.down = false
})

function readInput(): InputFrame {
  const k = keyboard.frame()
  const t = pad?.state()
  const cliqueTravado = ponteiro.down || cliquePendente
  const m = {
    pointerX: ponteiro.x,
    pointerY: ponteiro.y,
    click: cliqueTravado,
  }
  cliquePendente = false
  if (t === undefined) return { ...k, ...m, ability: k.ability }
  const fase = sim.state().phase
  const morto = fase === "dead"
  /*
   * NAS TELAS, o pad DEIXA DE SER PAD e vira ponteiro inteiro. 14/08.
   *
   * O H pegou isto jogando, e a frase dele é o diagnóstico: "quando clico na
   * metade direita da tela, em qualquer região, ativa o impulso". Numa tela não
   * há o que impelir — e na `select` o impulso é LUTAR, então o gesto de sair
   * fazia a única coisa que não dá para desfazer.
   *
   * Aqui o dedo encostado É o botão apertado, na posição em que ele está. Não
   * depende do heurístico de toque curto: um dedo que demora ou escorrega
   * continua fechando a tela, e "clicar fora" passa a significar no aparelho o
   * mesmo que significa no mouse.
   *
   * O HUB fica DE FORA da lista de propósito: lá se anda, então o manche
   * precisa continuar sendo manche e a distinção arrastou/tocou é o que separa
   * caminhar de apontar.
   */
  const soPonteiro =
    fase === "select" || fase === "painel" || fase === "card" || fase === "closed"
  const dedo = t.dedo === null ? null : paraArena(t.dedo.x, t.dedo.y)
  if (soPonteiro) {
    return {
      ...EMPTY_INPUT,
      up: k.up,
      down: k.down,
      left: k.left,
      right: k.right,
      action: k.action,
      restart: k.restart,
      ability: k.ability,
      ...(dedo === null
        ? { pointerX: ponteiro.x, pointerY: ponteiro.y, click: cliqueTravado }
        : { pointerX: dedo.x, pointerY: dedo.y, click: true }),
    }
  }
  /*
   * Fora das telas o pad é pad, e o toque curto vira clique — que é o que faz o
   * ÍCONE de habilidade responder ao dedo, como o H pediu.
   */
  const alvo = t.tap === null ? null : paraArena(t.tap.x, t.tap.y)
  return {
    up: k.up || t.up,
    down: k.down || t.down,
    left: k.left || t.left,
    right: k.right || t.right,
    action: k.action || (t.press && !morto),
    restart: k.restart || (t.press && morto),
    ability: k.ability,
    ...m,
    ...(alvo === null ? {} : { pointerX: alvo.x, pointerY: alvo.y, click: true }),
  }
}

/**
 * Escala inteira — em pixels de DISPOSITIVO, não de CSS.
 *
 * A regra de 01/08 continua a mesma e continua binding: com vizinho-próximo em
 * escala fracionária, uma parte dos pixels ocupa 2 unidades de tela e outra 3,
 * e a diferença aparece como cintilação assim que o fundo rola. O que muda em
 * 05/08 é EM QUE GRADE o inteiro é contado.
 *
 * Contar em px de CSS era certo enquanto a única tela era um monitor com
 * `devicePixelRatio` 1. Num iPad o CSS é uma grade FICTÍCIA: 1180x820 de CSS
 * são 2360x1640 de verdade. Contando em CSS, `floor(1180/640)` dava escala 1 —
 * o jogo saía num retângulo de 640x360 no meio de uma tela quase quatro vezes
 * maior, o que não é "sem espaço sobrando", é ilegível. Contando na grade
 * FÍSICA dá 3, e 3 é inteiro exatamente onde a cintilação nasce: no pixel que
 * a tela realmente acende. Em `dpr` 1 as duas contas são a mesma conta, então
 * nada muda no desktop.
 *
 * A POSIÇÃO também é travada na grade física. `place-items: center` podia
 * deixar o canvas meio pixel de dispositivo fora do lugar — e meio pixel fora
 * do lugar num upscale de vizinho-próximo é uma coluna inteira duplicada.
 *
 * ---
 *
 * **O DEGRAU, e por que ele quebra o telefone.** *(05/08, segunda passada)*
 *
 * Num `dpr` 3 as escalas inteiras disponíveis são 1, 2, 3 — em fração de tela,
 * degraus de 33%. Cair um degrau custa um TERÇO do tamanho do jogo, e o iPhone
 * cai justamente por causa da barra do Safari: em paisagem ela come ~50px de
 * CSS, a altura útil vai de 390 para ~340, e `340·3/360 = 2,83` desce para 2.
 * Canvas de 427x240 numa tela de 844 de largura. Medido, não suposto.
 *
 * Então a regra de 01/08 ganha o qualificador que ela sempre teve implícito:
 * inteiro **na grade que o olho resolve**. Ela nasceu num monitor de `dpr` 1,
 * onde um pixel de dispositivo é ~0,25mm e a irregularidade do vizinho-próximo
 * em escala fracionária é visível como cintilação. Num telefone de ~460ppi e
 * `dpr` 3, o resíduo de uma escala fracionária é 1/3 de pixel de jogo ≈
 * 0,055mm — abaixo do que o olho separa à distância de uso.
 *
 * Isto NÃO é licença para escala fracionária em qualquer lugar. Em `dpr` 1 o
 * comportamento é idêntico ao de antes, byte por byte, porque lá a razão
 * original continua valendo inteira.
 *
 * `?fit=inteiro` força o comportamento antigo, e existe para ele poder comparar
 * os dois no aparelho de verdade — que é o único lugar onde este argumento
 * pode ser conferido de fato.
 */

/** Acima de quanto desperdício vale trocar o inteiro pelo exato. */
const DESPERDICIO_TOLERADO = 0.08
/** `?fit=inteiro` volta ao comportamento de antes, para comparar no aparelho. */
const FORCA_INTEIRO = params.get("fit") === "inteiro"

function fitInteger(): void {
  const canvas = mount.querySelector("canvas")
  if (canvas === null) return
  const dpr = window.devicePixelRatio || 1
  const W = tuning.arena.width
  const H = tuning.arena.height
  /*
   * No iOS o `visualViewport` é o que sobra DEPOIS da barra do Safari e do
   * teclado; `innerHeight` mente durante a transição. É a medida certa de
   * "quanto de tela eu realmente tenho".
   */
  const vv = window.visualViewport
  const vw = vv?.width ?? window.innerWidth
  const vh = vv?.height ?? window.innerHeight

  const exato = Math.min((vw * dpr) / W, (vh * dpr) / H)
  const inteiro = Math.max(1, Math.floor(exato))
  // `dpr` 1 nunca entra aqui: no monitor a razão de 01/08 vale inteira.
  const cabeMaisFracionado =
    !FORCA_INTEIRO && dpr >= 2 && exato > 1 && (exato - inteiro) / exato > DESPERDICIO_TOLERADO
  const device = cabeMaisFracionado ? exato : inteiro

  const scale = device / dpr
  const cssW = W * scale
  const cssH = H * scale
  const snap = (v: number): number => Math.round(v * dpr) / dpr
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvas.style.left = `${snap((vw - cssW) / 2)}px`
  canvas.style.top = `${snap((vh - cssH) / 2)}px`
}
window.addEventListener("resize", fitInteger)
/*
 * O iOS gira a tela ANTES de `innerWidth` mudar, e a barra do Safari some sem
 * disparar `resize` nenhum. Os dois ouvintes extras existem por isso — sem
 * eles o jogo passa a rotação inteira com a escala da orientação anterior.
 */
window.addEventListener("orientationchange", () => setTimeout(fitInteger, 120))
window.visualViewport?.addEventListener("resize", fitInteger)

/*
 * O renderizador nasce em `boot()`, e o `!` é o preço de ele não nascer aqui.
 *
 * Isto era `const renderer = await createRenderer(...)` no topo do módulo, e
 * esse `await` de topo era A CAUSA de o jogo não abrir em produção — ver
 * `boot()` no fim do arquivo. O laço só começa depois da atribuição, então a
 * asserção é verdadeira por construção e não por otimismo.
 */
let renderer!: Renderer

const clone = (s: Readonly<SimState>): SimState => structuredClone(s) as SimState
let prev = clone(sim.state())

let accumulator = 0
let last = performance.now()
// Teto de recuperação: uma aba em segundo plano não pode virar um catch-up de
// mil ticks quando volta ao foco.
const MAX_FRAME_SECONDS = 0.25

/*
 * Contador de quadro no HUD.
 *
 * Entrou em 02/08 porque a multidão de ~1700 hemácias tem custo real e eu não
 * consigo medi-lo daqui: o headless rasteriza por software, então o número que
 * eu leio é de preenchimento, não da GPU dele. Media móvel de 30 quadros — o
 * instantâneo pula demais para ser lido.
 */
const frameMs: number[] = []
let fpsLabel = "—"

/**
 * A PONTE entre o jogo e a trilha. 14/08.
 *
 * Ela lê estado e nunca escreve — a música é RENDER, no mesmo sentido em que o
 * estalo visual do abate é render desde 13/08. Se um dia o som mudar um byte do
 * hash, algo está no lugar errado.
 *
 * Os eventos são lidos por CARIMBO (`lastKillTick`, `lastPickTick`) e não por
 * diferença entre quadros, pelo mesmo motivo que o render já usa carimbo: um
 * quadro lento roda vários ticks, e diferença de estado perde o que aconteceu
 * no meio. Som perdido é pior que som atrasado — atrasado ninguém nota, perdido
 * vira "o jogo às vezes não faz barulho ao abater".
 */
const audio = criaTrilha()
const TETO_INF = tuning.field.cols * tuning.field.rows * tuning.field.maxInfection
let ultimoAbate = -1
let ultimoItem = -1
let ultimaOnda = 0
let ultimasVidas = -1
let ultimaHabilidade = 0

const CENA_DE: Readonly<Record<string, "cerebro" | "arena" | "respiro" | "morte">> = {
  hub: "cerebro",
  select: "cerebro",
  painel: "cerebro",
  card: "cerebro",
  closed: "cerebro",
  intervalo: "respiro",
  run: "arena",
  dead: "morte",
}

function trilha(s: SimState): void {
  audio.quadro({
    cena: CENA_DE[s.phase] ?? "arena",
    relogio: s.worldScale,
    doenca: Math.min(1, s.infection / (TETO_INF * tuning.field.loseFraction)),
    onda: s.wave,
    vidas: s.lives,
  })

  if (s.lastKillTick !== ultimoAbate) {
    if (ultimoAbate >= 0) audio.toca("abate")
    ultimoAbate = s.lastKillTick
  }
  if (s.lastPickTick !== ultimoItem) {
    if (ultimoItem >= 0) audio.toca("item")
    ultimoItem = s.lastPickTick
  }
  // Habilidade LIGANDO: a soma dos prazos sobe de um quadro para o outro só
  // quando alguma acabou de ser acionada.
  const ativas = s.habilidades.reduce((n, h) => n + h.ativa, 0)
  if (ativas > ultimaHabilidade) audio.toca("habilidade")
  ultimaHabilidade = ativas
  if (s.phase === "run" && s.wave > ultimaOnda && ultimaOnda > 0) audio.toca("onda")
  if (s.phase === "run" || s.phase === "intervalo") ultimaOnda = s.wave
  if (ultimasVidas >= 0 && s.lives < ultimasVidas) audio.toca("dano")
  ultimasVidas = s.lives
}

/** Tecla M: cala a boca. Preferência de quem ouve, e não estado de jogo. */
window.addEventListener("keydown", (event) => {
  if (event.code !== "KeyM") return
  const m = audio.mudo()
  console.info(m ? "trilha muda" : "trilha ligada")
})

function frame(now: number): void {
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
  frameMs.push(elapsed * 1000)
  if (frameMs.length > 30) {
    const med = frameMs.reduce((a, b) => a + b, 0) / frameMs.length
    fpsLabel = `${(1000 / med).toFixed(0)}fps ${med.toFixed(1)}ms`
    frameMs.length = 0
  }
  last = now
  accumulator += elapsed

  // A sim SEMPRE anda a 60Hz. A dilatação do tempo é regra de jogo, dentro da
  // sim — mudar a taxa do laço aqui quebraria o replay em silêncio.
  while (accumulator >= STEP) {
    prev = clone(sim.state())
    const input = readInput()
    recorder.push(input)
    sim.step(input)
    accumulator -= STEP
  }

  renderer.draw(prev, sim.state(), accumulator / STEP)
  trilha(sim.state())

  const s = sim.state()
  // `fase` está aqui para o `npm run rec` saber quando a run morreu sem
  // adivinhar por relógio. Instrumentação, como o resto desta linha.
  hud.textContent =
    `run ${s.runIndex + 1} · seed ${seed} · tick ${s.tick} · fase ${s.phase} · ` +
    `${sim.snapshot().hash} · ${fpsLabel}\n` +
    (touch
      ? `arraste na esquerda pra mover · toque na direita = impulso`
      : `WASD/setas movem · espaço = impulso · R recomeça · shift+F9 grava a run · ` +
        `P troca a paleta (${variant}) · ?crowd=<n> muda a densidade das hemácias`)

  requestAnimationFrame(frame)
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "F9") return
  event.preventDefault()
  const full = event.shiftKey
  const replay = full
    ? recorder.dumpAll(`f9-full-${seed}`)
    : recorder.dumpWindow(`f9-${seed}-t${recorder.length}`)
  if (!full && recorder.length > recorder.windowTicks) {
    console.warn(
      `F9: janela começa no tick ${recorder.length - recorder.windowTicks}, não no 0. ` +
        `O replay roda, mas não reproduz o estado que você acabou de ver — ` +
        `use shift+F9 pra isso.`,
    )
  }
  downloadReplay(replay)
})

/**
 * O boot é uma FUNÇÃO, e o módulo termina de avaliar sem esperar por ela.
 *
 * Isto não é estilo: é o conserto do bug que fez o jogo não abrir no Netlify,
 * e o mecanismo merece ficar escrito porque o sintoma não denuncia a causa em
 * lugar nenhum — tela preta, console limpo, zero erro, zero exceção. O jogo
 * simplesmente parava de existir depois dos imports.
 *
 * A causa é `await` no TOPO do módulo de entrada, e só aparece no BUILD:
 *
 * 1. O Pixi carrega o ambiente do browser por `import()` dinâmico, lá dentro
 *    de `renderer.init()` — `environment-browser/browserAll`.
 * 2. No `vite dev` cada módulo é servido solto, e esse `import()` não passa
 *    por aqui. Em produção o Rollup junta o código compartilhado do Pixi no
 *    pedaço de ENTRADA, e o pedaço tardio passa a importar DE VOLTA da
 *    entrada.
 * 3. Um módulo com `await` de topo só conta como avaliado quando a promessa
 *    resolve. A entrada esperava o Pixi; o Pixi esperava a entrada terminar de
 *    avaliar. Impasse circular, sem erro nenhum — a especificação do ESM não
 *    manda ninguém reclamar disso.
 *
 * Por isso a regra, que vale além deste arquivo: **`await` de topo não entra
 * no módulo de entrada.** Trabalho assíncrono de partida mora numa função, e
 * o módulo termina de avaliar na hora.
 */
async function boot(): Promise<void> {
  renderer = await createRenderer(
    mount,
    tuning,
    crowdParam === null ? undefined : Number(crowdParam),
    touch,
  )
  // O canvas só existe depois do renderizador; ajustar antes não ajustava nada.
  fitInteger()
  requestAnimationFrame(frame)
}

void boot()
