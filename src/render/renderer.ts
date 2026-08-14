import { Application, Container, Graphics, Sprite, Texture } from "pixi.js"
import { activeStats, COMPLEMENTO, PLAQUETA, POWERS } from "../sim/powers.ts"
import type { SimState, Tuning } from "../sim/types.ts"
import { buildAtlas, frameOf, type Atlas } from "./atlas.ts"
import { BASE_Y, BODY_H, GLYPH_W, textWidth } from "./font.ts"
import { CROWD_VARIANTS, neuronDendrito, neuronShape } from "./backdrop.ts"
import { hashNoise } from "./pixelbuf.ts"
import {
  COMBO_TIERS,
  DIM0,
  FAST1,
  DIM1,
  GLD2,
  HURT1,
  INK,
  KIND_TINT,
  ORG2,
  PALETTE,
  ECO2,
  INF2,
  INF3,
  LEU3,
  NEU2,
  NUC1,
  NUC2,
  SAL2,
  SHI1,
  WHITE,
} from "./palette.ts"

/**
 * Render em pixel art nativo, 640x360.
 *
 * Duas regras estruturais, das quais tudo o mais decorre:
 *
 * 1. NADA é posicionado ou escalado em fração de pixel. Toda posição passa por
 *    `Math.round`, toda escala é inteira. É o que separa pixel art de "imagem
 *    pequena esticada".
 * 2. Existem DOIS relógios. O corpo do jogador anima em tempo real; patógeno,
 *    fundo e paleta animam em tempo de MUNDO. Com o core de 01/08 isso deixa de
 *    ser detalhe: parado, você continua respirando enquanto a infecção quase
 *    congela. A tese "o tempo só anda quando você anda" passa a ser visível no
 *    desenho dos corpos, não só na barra de HUD.
 *
 * Nada aqui decide nada. Regra mora na sim.
 */
export interface Renderer {
  draw(prev: SimState, cur: SimState, alpha: number): void
  destroy(): void
}

const TAU = Math.PI * 2

/**
 * A roda de cores do sinal sináptico. Seis matizes do topo das rampas.
 *
 * Mesmo critério do halo do item: tom médio some contra o fundo, e a paleta é
 * travada — escolhe-se entre o que já existe. A diferença é que aqui a cor é
 * fixa por LIGAÇÃO em vez de ciclar no tempo, porque o que ela distingue é o
 * canal e não o instante.
 */
const SINAL: ReadonlyArray<number> = [FAST1, SHI1, ECO2, ORG2, INF3, LEU3]

const col = (idx: number): number => PALETTE[idx]!
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Ângulo → uma das 8 direções assadas. */
const dirOf = (vx: number, vy: number): number =>
  (Math.round((Math.atan2(vy, vx) / TAU) * 8) + 8) % 8

/** Velocidade → escalão de forma do jogador. Quatro degraus, bem separados. */
const tierOf = (speed: number): number =>
  speed < 0.07 ? 0 : speed < 0.42 ? 1 : speed < 0.78 ? 2 : 3

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  idx: number
  size: number
}

interface Pop {
  x: number
  y: number
  life: number
  text: string
  scale: number
  idx: number
}

/**
 * Texto em fonte bitmap. Cada letra é um sprite de textura assada, colado na
 * grade — nunca uma webfont rasterizada, que sairia borrada e mataria o resto.
 */
class Label {
  private readonly pool: Sprite[] = []
  private readonly parent: Container
  private readonly atlas: Atlas

  constructor(parent: Container, atlas: Atlas) {
    this.parent = parent
    this.atlas = atlas
  }

  /**
   * `x`,`y` é o canto da célula. Devolve a largura em pixels desenhada.
   *
   * `shadow` desenha uma cópia em `INK` deslocada de UM pixel nativo, atrás.
   *
   * Ela existe porque este jogo escreve por cima do organismo, e o organismo
   * não é fundo — é a arena, com hemácia, cicatriz e bicho passando debaixo da
   * letra. Sem contorno o texto some em cima do tecido claro e vira mancha em
   * cima do escuro, e o H apontou exatamente isso. A regra de 01/08 continua
   * valendo: o deslocamento é `1 × scale`, INTEIRO, senão a sombra cai em meio
   * pixel e a letra fica borrada — que é o defeito que ela deveria consertar.
   *
   * Sombra ANTES do corpo no pool, sempre. A ordem de desenho aqui é a ordem
   * de criação dos filhos, então preencher os índices baixos com a sombra é o
   * que a mantém atrás — e é por isso que os dois passes moram na mesma função
   * em vez de em duas chamadas.
   */
  set(
    text: string,
    idx: number,
    x: number,
    y: number,
    scale = 1,
    center = false,
    shadow = false,
  ): number {
    const up = text.toUpperCase()
    const w = textWidth(up) * scale
    const x0 = Math.round(center ? x - w / 2 : x)
    const y0 = Math.round(y)
    const off = scale
    let used = 0

    const escreve = (cor: number, dx: number, dy: number): void => {
      for (let i = 0; i < up.length; i++) {
        const tex = this.atlas.glyph(up[i]!, cor)
        if (tex === null) continue
        let sp = this.pool[used]
        if (sp === undefined) {
          sp = new Sprite()
          this.pool[used] = sp
          this.parent.addChild(sp)
        }
        sp.visible = true
        sp.texture = tex
        sp.scale.set(scale)
        sp.position.set(x0 + i * (GLYPH_W + 1) * scale + dx, y0 + dy)
        used++
      }
    }

    if (shadow) escreve(INK, off, off)
    escreve(idx, 0, 0)
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.visible = false
    return w
  }

  hide(): void {
    for (const s of this.pool) s.visible = false
  }
}

/** Pool de sprites por índice, para as coleções que variam de tamanho a cada quadro. */
class Pool {
  private readonly items: Sprite[] = []
  private readonly parent: Container
  private used = 0

  constructor(parent: Container) {
    this.parent = parent
  }

  next(tex: Texture): Sprite {
    let sp = this.items[this.used]
    if (sp === undefined) {
      sp = new Sprite()
      sp.anchor.set(0.5)
      this.items[this.used] = sp
      this.parent.addChild(sp)
    }
    sp.visible = true
    sp.texture = tex
    sp.alpha = 1
    sp.scale.set(1)
    this.used++
    return sp
  }

  /** Quantos sprites foram usados neste quadro. */
  get count(): number {
    return this.used
  }

  at(i: number): Sprite {
    return this.items[i]!
  }

  begin(): void {
    this.used = 0
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false
  }
}

/**
 * As linhas que ENSINAM O CONTROLE, por esquema de entrada.
 *
 * Existe porque "ESPAÇO PRA COMEÇAR" num iPad não é texto ruim, é texto FALSO:
 * manda apertar uma tecla que não existe naquele aparelho. E a lição de 02/08
 * vale aqui — foi exatamente esta linha que o H reclamou de não ver. Uma
 * instrução que não pode ser obedecida é pior do que uma que mal se lê.
 */
const PROMPTS = {
  teclado: {
    comecar: "ESPAÇO PRA COMEÇAR",
    outra: "R OU ENTER PRA OUTRA",
    lutar: "ESPAÇO PRA LUTAR",
    voltar: "R OU CLIQUE FORA VOLTA",
    fechar: "R OU CLIQUE FORA FECHA",
  },
  toque: {
    comecar: "TOQUE PRA COMEÇAR",
    outra: "TOQUE PRA OUTRA",
    lutar: "TOQUE PRA LUTAR",
    voltar: "TOQUE FORA VOLTA",
    fechar: "TOQUE FORA FECHA",
  },
} as const

/**
 * O que cada porta do cérebro é. 13/08, nomes do H.
 *
 * Tabela e não `switch`: a sim só conhece índice, então o nome, a cor e o corpo
 * de cada tela são dados do render. A quinta porta é uma linha aqui e uma linha
 * no `tuning.json` — se fosse ramo de código, seria um lugar a mais para
 * esquecer.
 */
const PORTA_NOME: Readonly<Record<string, string>> = {
  historico: "HISTÓRICO",
  inventario: "MEU INVENTÁRIO",
  upgrades: "UPGRADES",
  pandemia: "MODO PANDEMIA",
}

const PORTA_COR: Readonly<Record<string, number>> = {
  historico: NUC2,
  inventario: SHI1,
  upgrades: GLD2,
  pandemia: HURT1,
}

/**
 * O CORPO de cada tela, e a regra dele é uma só: só o que hoje é VERDADE.
 *
 * Em 14/08 o H fechou a lacuna que a versão anterior deixava em quatro telas:
 * **só o modo pandemia está inativo.** As outras três passam a mostrar coisa de
 * verdade, e a nota apologética que cada uma carregava saiu junto — ela existia
 * para confessar que a tela não fazia nada, e três delas fazem.
 *
 * O que cada uma podia honestamente mostrar saiu do que o estado já sabe, não
 * de funcionalidade inventada: o histórico ganhou registro de run no fim de
 * cada uma, o inventário mostra o que de fato atravessa a morte, e os upgrades
 * mostram a moeda e o acumulado — que foi o que ele pediu para manter enquanto
 * o que ela compra não existe.
 */
/** `mm:ss` a partir de ticks de sim. A sim conta ticks; segundo é coisa de tela. */
const relogio = (ticks: number): string => {
  const t = Math.max(0, Math.round(ticks / 60))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`
}

/**
 * O HISTÓRICO: as últimas runs, uma por linha.
 *
 * Onda, tempo e abates, que são as três coisas que respondem "como foi". A
 * moeda fica de fora da linha de propósito: ela já tem tela e faixa próprias, e
 * repeti-la aqui gastaria a largura que o resto precisa.
 */
const linhasHistorico = (cur: SimState): ReadonlyArray<string> => {
  // O vazio é uma linha da mesma lista, e não um destaque: "ainda não houve
  // run" não é uma resposta grande, é a ausência de linhas.
  if (cur.historico.length === 0) return ["NENHUMA RUN AINDA"]
  return cur.historico
    .slice(0, 5)
    .map((r) => `${r.venceu ? "LIMPOU" : `ONDA ${r.wave}`} · ${relogio(r.ticks)} · ${r.kills}`)
}

/**
 * O INVENTÁRIO: o que de fato ATRAVESSA a morte.
 *
 * Hoje é uma coisa só, a memória imunológica, e a tela diz isso em vez de
 * fingir uma mochila. Abaixo dela ficam os itens que se ACHA durante a run —
 * eles não são carregados entre runs, e a linha diz isso também. Um inventário
 * que listasse consumíveis de campo como se fossem posses prometeria uma
 * mecânica que não existe.
 */
const linhasInventario = (cur: SimState): ReadonlyArray<string> => [
  `${cur.bank} DE MEMÓRIA`,
  "É O QUE ATRAVESSA A MORTE",
  "SUPRESSÃO E COMPLEMENTO SÓ EM RUN",
]

const PORTA_CORPO: Readonly<Record<string, (cur: SimState) => ReadonlyArray<string>>> = {
  historico: linhasHistorico,
  inventario: linhasInventario,
  upgrades: (cur) => [`${cur.bank}`],
  pandemia: () => ["EM BREVE"],
}

/**
 * Quais telas são LISTA — linhas iguais, sem destaque.
 *
 * É propriedade da TELA e não da contagem de linhas. A primeira versão usava
 * "mais de três linhas vira lista", e o proxy quebra no caso mais comum que
 * existe: com duas runs no histórico, a primeira saía grande e a segunda
 * pequena, como se uma valesse mais. Numa lista de iguais, nenhuma pode ser
 * maior — e quantas são não muda isso.
 */
const PORTA_LISTA: Readonly<Record<string, boolean>> = { historico: true }

/**
 * A cor de cada habilidade, e ela não é enfeite.
 *
 * A adrenalina veste o CIANO de velocidade — a mesma rampa que o corpo do
 * jogador usa para dizer "estou a toda", e ela é literalmente uma habilidade de
 * relógio. A febre veste o laranja da influenza, que é o vermelho-quente da
 * paleta: calor é a coisa que ela é.
 *
 * Paleta travada, como sempre: escolhe-se entre o que já existe.
 */
const HAB_COR: Readonly<Record<string, number>> = {
  adrenalina: FAST1,
  febre: INF2,
}

/** O nome de cada habilidade na loja. A sim não conhece nenhum destes. */
const HAB_NOME: Readonly<Record<string, string>> = {
  adrenalina: "ADRENALINA",
  febre: "FEBRE",
}

/** Uma linha do que ela faz. Curta: o quadro tem 240px e a fonte 6px por letra. */
const HAB_BLURB: Readonly<Record<string, string>> = {
  adrenalina: "O TEMPO CEDE POR 3S",
  febre: "CALOR LIMPA A VOLTA POR 3S",
}

export async function createRenderer(
  mount: HTMLElement,
  tuning: Tuning,
  crowdArea?: number,
  touch = false,
): Promise<Renderer> {
  const prompt = touch ? PROMPTS.toque : PROMPTS.teclado
  const app = new Application()
  await app.init({
    width: tuning.arena.width,
    height: tuning.arena.height,
    background: col(INK),
    // As três linhas que fazem o pixel existir. Resolução 1 e sem antialias:
    // o buffer é 640x360 de verdade, e o upscale é do CSS, em vizinho próximo.
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
  })
  app.ticker.stop()
  mount.appendChild(app.canvas)

  const t0 = performance.now()
  const atlas = buildAtlas(tuning, crowdArea)
  console.info(
    `arte assada em ${Math.round(performance.now() - t0)}ms · ` +
      `${atlas.player.frames.length} quadros de jogador, ` +
      `${[...atlas.pathogens.values()].reduce((n, s) => n + s.frames.length, 0)} de patógeno`,
  )

  const world = new Container()
  const hud = new Container()
  const overlay = new Container()
  /*
   * O CÉREBRO entra AQUI, na mesma chamada das outras camadas.
   *
   * A primeira versão criava o container junto com os filhos dele, lá embaixo, e
   * o enfiava na cena com `addChildAt(brain, 1)`. O display list ficava certo em
   * toda medição — `stage=4`, `brainIdx=1`, `visible=true`, 411 filhos — e a
   * tela saía PRETA. Até um retângulo magenta sólido desenhado direto nele não
   * aparecia.
   *
   * Não perdi tempo descobrindo o que o Pixi faz de diferente com um filho
   * inserido depois: a lição é outra e é mais barata. Montar a cena em UM lugar,
   * na ordem final, é o que torna a ordem verificável por leitura — e ordem foi
   * a classe de defeito que este arquivo mais produziu (`TASTE.md` §2b).
   */
  const brain = new Container()
  brain.visible = false
  app.stage.addChild(world, brain, hud, overlay)

  // --------------------------------------------------------------- camadas
  const bgPlasma = new Sprite(atlas.plasma[0]!)

  /*
   * A camada de hemácias do parallax saiu: o LEITO ocupa esse papel agora, e
   * manter as duas deixava o parallax "descolado dos elementos novos", que foi a
   * crítica do humano. Sobram fibrina e detritos, que correm ENTRE as células e
   * amarram o fundo ao campo em vez de competir com ele.
   */
  const LAYERS = [
    { kind: "fibrina" as const, speed: 46 },
    { kind: "detritos" as const, speed: 118 },
  ]
  const drift = LAYERS.flatMap((l) =>
    [0, 1].map((slot) => ({
      sprite: new Sprite(atlas.layers.get(l.kind)!),
      kind: l.kind,
      speed: l.speed,
      slot,
    })),
  )

  const bloodLayer = new Container()
  const tissueLayer = new Container()
  const auraLayer = new Container()
  const enemyLayer = new Container()
  const ghostLayer = new Container()
  const playerSprite = new Sprite()
  playerSprite.anchor.set(0.5)
  const powerLayer = new Container()
  const fxLayer = new Container()
  const popLayer = new Container()

  /*
   * A FIBRINA volta para o fundo; só os DETRITOS ficam na frente.
   *
   * Eu tinha subido as duas em 02/08 e o H corrigiu: a malha de fibras é
   * estrutura do vaso e pertence atrás, e por cima do tecido ela virava rede
   * riscando o jogo. Detrito é partícula solta no plasma — esse sim passa na
   * frente, e é o que dá profundidade sem virar grade.
   */
  const driftBack = new Container()
  const driftFront = new Container()
  for (const d of drift) (d.kind === "fibrina" ? driftBack : driftFront).addChild(d.sprite)
  world.addChild(bgPlasma, driftBack)
  /*
   * A multidão entra ANTES da colônia e dos corpos, e isso não é "atrás".
   *
   * Duas tentativas erradas antecederam esta, as duas minhas, e as duas pela
   * mesma confusão: eu lia "entre as hemácias" como ORDEM DE DESENHO e ele
   * queria OCUPAÇÃO DE ESPAÇO. Uma camada por cima (02/08) não resolve nada,
   * porque o problema nunca foi quem cobre quem — é que atravessar uma
   * multidão empurra a multidão. Aqui o jogador fica visualmente por cima, que
   * é o que a legibilidade exige, e o pertencimento ao mesmo plano vem do
   * empurrão, não da profundidade.
   */
  /*
   * `driftLayer` sobe para a FRENTE do tecido em 02/08.
   *
   * Ele estava logo acima do plasma, atrás de tudo — e com a multidão cobrindo
   * quase a tela inteira, fibrina e detritos só apareciam pelas frestas. Era o
   * diagnóstico do "parallax não preenche": não era velocidade nem densidade,
   * era estar atrás de uma parede. Aqui eles cruzam por cima do tecido e da
   * colônia, e param ABAIXO do jogador e dos patógenos — profundidade sem
   * ocluir informação, que é a linha que o projeto já segue.
   */
  world.addChild(bloodLayer, tissueLayer, driftFront, auraLayer, enemyLayer, ghostLayer, playerSprite, powerLayer, fxLayer, popLayer)

  const flashVeil = new Sprite()
  flashVeil.visible = false
  world.addChild(flashVeil)
  /**
   * A moldura da CÂMERA LENTA. Por cima de tudo do mundo, abaixo do HUD.
   *
   * Fica no `world` e não no `hud` de propósito: ela é o que está acontecendo
   * COM O MUNDO, e um quadro desenhado por cima do HUD leria como aviso de
   * interface em vez de estado do jogo.
   */
  const lentoLayer = new Graphics()
  world.addChild(lentoLayer)

  /*
   * ------------------------------------------------------------- O CÉREBRO
   *
   * Container PRÓPRIO, irmão do mundo, e visível só na fase `hub`.
   *
   * Podia ser um estado a mais dentro das camadas da arena — e seria o caminho
   * curto para o defeito que este arquivo mais comete: tecido, multidão de
   * hemácias e parallax de sangue continuariam existindo por trás, gastando
   * quadro e vazando pelas bordas do que o hub desenhasse por cima. Dois
   * lugares, duas cenas; quem não está em cena não é desenhado.
   */
  const brainBack = new Container()
  const brainCrowdLayer = new Container()
  const brainFxLayer = new Graphics()
  /*
   * Os patógenos em ÓRBITA e o JOGADOR, na cena do cérebro.
   *
   * Camada própria acima da multidão: eles são os corpos vivos desta tela, e a
   * multidão é cenário. A ordem aqui é a mesma da arena — cenário, efeitos,
   * corpos — e repetir a ordem entre as duas telas é o que evita a próxima
   * geração de defeitos de composição.
   */
  const brainBodies = new Container()
  const brainOrbit = new Pool(brainBodies)
  const brainPlayer = new Sprite()
  brainPlayer.anchor.set(0.5)
  brainBodies.addChild(brainPlayer)

  brain.addChild(brainBack, brainCrowdLayer, brainFxLayer, brainBodies)

  const brainDrift = atlas.brainLayers.flatMap((tex, i) =>
    [0, 1].map((slot) => {
      const sp = new Sprite(tex)
      brainBack.addChild(sp)
      /*
       * Velocidade por camada, e a PRIMEIRA é zero.
       *
       * O chão não desliza: ele é o chão, e chão que escorre transforma a
       * safezone em esteira. As três de cima seguem a razão da arena — fundo
       * devagar, frente rápida —, que é o que dá profundidade.
       */
      return { sprite: sp, speed: [0, 6, 19, 32][i] ?? 6, slot }
    }),
  )

  /*
   * Os neurônios: um sprite por corpo, como as hemácias.
   *
   * Eles NÃO se movem em corrente — o cérebro é a safezone, e uma safezone que
   * escorre não descansa. O que se move aqui é só a respiração de cada um e o
   * parallax atrás, e a diferença de comportamento é metade do que faz o hub
   * parecer outro lugar.
   */
  /*
   * A CLAREIRA em volta da órbita, e ela veio da captura.
   *
   * Com a multidão adensada a pedido do H, o miolo do cérebro virou uma parede
   * de corpos pálidos — e a órbita, que é a única PORTA da tela, ficou dentro
   * dela: os patógenos giravam por cima de neurônios, o anel do gatilho tinha um
   * soma bem no meio, e o lugar mais importante da tela lia como mais um pedaço
   * de textura.
   *
   * Abrir a densidade inteira desfaria o pedido. Abrir só aqui não: uma clareira
   * é a forma mais antiga de dizer "aqui acontece alguma coisa", e ela custa
   * nada — os corpos de dentro simplesmente não nascem, então some junto o
   * sprite, a respiração dele e as sinapses que sairiam dali.
   *
   * O raio é o da órbita mais meio corpo de neurônio, que é o mínimo para que
   * nenhum deles encoste no anel de fora.
   */
  const CLAREIRA = tuning.hub.orbitRadius + 30
  /** Clareira das outras quatro: elas não têm anel externo, então o vão é o do rótulo. */
  const CLAREIRA_NODE = tuning.hub.nodeRadius + 30
  const longeDasPortas = (c: { hx: number; hy: number }): boolean => {
    const dx = c.hx - tuning.hub.orbitX
    const dy = c.hy - tuning.hub.orbitY
    if (dx * dx + dy * dy <= CLAREIRA * CLAREIRA) return false
    for (const n of tuning.hub.nodes) {
      const ex = c.hx - n.x
      const ey = c.hy - n.y
      if (ex * ex + ey * ey <= CLAREIRA_NODE * CLAREIRA_NODE) return false
    }
    return true
  }
  const neuronios = atlas.brainCrowd.filter(longeDasPortas)

  /*
   * DERIVA e EMPURRÃO dos neurônios — pedido do H, "do mesmo jeito das hemácias".
   *
   * Duas coisas diferentes que somam no mesmo offset:
   *
   * - DERIVA é o vaguear lento de cada corpo, com período e fase próprios. Não é
   *   corrente: a decisão de 13/08 de que o cérebro não escorre continua de pé,
   *   e é o que separa safezone de arena. Cada um vaga em torno da própria casa
   *   e nenhum vai a lugar nenhum — em conjunto lê como tecido vivo, que é o que
   *   faltava para a multidão parecer viva em vez de um mosaico com respiro.
   *
   * - EMPURRÃO é a hemácia de 02/08 inteira: quem está sob o glóbulo sai pela
   *   normal até encostar, cede rápido e volta devagar. A assimetria é o efeito
   *   — sem ela o corpo acompanha o jogador como se estivesse colado.
   *
   * Aqui o laço é direto sobre os ~245 corpos, sem a grade de buckets da arena.
   * Lá ela existe porque a corrente enrola a coordenada e há dezenas de corpos
   * empurrando por quadro; aqui só o glóbulo empurra, e 245 distâncias por
   * quadro custam menos que manter a grade.
   */
  const nOffX = new Float32Array(neuronios.length)
  const nOffY = new Float32Array(neuronios.length)
  /** Fase e período da deriva, sorteados por corpo. Nunca dois no mesmo passo. */
  const nDrift = neuronios.map((c, i) => ({
    fx: 0.10 + hashNoise(i, 909, 53) * 0.14,
    fy: 0.09 + hashNoise(i, 909, 59) * 0.15,
    px: hashNoise(i, 909, 61) * TAU,
    py: hashNoise(i, 909, 67) * TAU,
    // Amplitude proporcional ao corpo: neurônio grande vaga mais que pequeno,
    // como massa maior num meio viscoso. Uniforme, todos pareceriam boiar juntos.
    amp: 1.6 + c.r * 0.12,
    /** Casa VIVA do corpo neste quadro: base + deriva + empurrão. */
    vx: c.hx,
    vy: c.hy,
  }))

  const neuronSprites: Sprite[] = []
  for (const c of neuronios) {
    const folha = atlas.neurons[c.variant % atlas.neurons.length]!
    const sp = new Sprite(folha.frames[0]!)
    sp.anchor.set(0.5)
    sp.position.set(Math.round(c.hx), Math.round(c.hy))
    neuronSprites.push(sp)
    brainCrowdLayer.addChild(sp)
  }

  /*
   * SINAPSES: as ligações, sorteadas UMA vez e fixas.
   *
   * Cada neurônio liga no vizinho mais próximo à direita dentro de um raio.
   * Sorteadas no boot e não por quadro porque a topologia de um cérebro não
   * muda de quadro em quadro — o que pulsa é o SINAL correndo nela, e isso é
   * fase, não geometria. Recalcular vizinhança a cada quadro custaria O(n²) por
   * quadro para produzir exatamente a mesma imagem.
   */
  /*
   * Raio da ligação, e ele saiu da CAPTURA e não do papel.
   *
   * Comecei em 46 quando os neurônios estavam empilhados. Ao abrir a multidão
   * para 2600 de área — centros a ~51px — o raio antigo passou a não alcançar
   * quase nenhum vizinho, e a primeira imagem do hub arrumado tinha neurônios
   * soltos sem uma linha entre eles. "Conectados e produzindo sinapses" é o
   * pedido literal do H, e metade dele tinha sumido junto com o conserto da
   * outra metade.
   *
   * 84 alcança de dois a quatro vizinhos por corpo, que é o que faz a rede ler
   * como REDE em vez de pares isolados.
   */
  const SINAPSE_R = 84
  /** Até quantos vizinhos cada neurônio liga. Um só desenha pares, não rede. */
  const SINAPSE_MAX = 2

  /*
   * As PONTAS DOS DENDRITOS, e é delas que a ligação sai — pedido do H.
   *
   * Até aqui a sinapse ia de núcleo a núcleo, o que desenhava a linha POR CIMA
   * do soma dos dois lados: o sinal nascia dentro do corpo, atravessava a
   * membrana e sumia dentro do outro. Neurônio não faz isso. Ele faz o
   * contrário — o dendrito existe justamente para ser onde o contato acontece,
   * e desenhar por dentro do soma apagava a única peça que dava nome à coisa.
   *
   * A geometria vem de `neuronDendrito`, a MESMA função que o `neuronSheet` usa
   * para desenhar o braço. Sprite assado não devolve coordenada, então esta
   * posição teria que ser recalculada aqui — e recalcular seria recopiar duas
   * linhas de trigonometria que ninguém manteria em par. Uma cópia é uma a mais:
   * quando a regra de atravessar tela existia em seis, mudá-la deixou duas para
   * trás e as duas viraram teste verde medindo nada.
   */
  /*
   * As pontas são OFFSETS em relação ao centro do corpo, não posições absolutas.
   *
   * Elas eram absolutas até os neurônios ganharem deriva e empurrão, no mesmo
   * 13/08. Corpo que se mexe com a sinapse cravada em coordenada de tela
   * desgruda do próprio braço — o fio fica no ar e o pulso viaja de lugar
   * nenhum a lugar nenhum. Guardar o offset é o que faz a ligação ser uma
   * propriedade do CORPO em vez de um desenho no chão.
   */
  const pontas = neuronios.map((c) => {
    const v = c.variant % CROWD_VARIANTS
    const sh = neuronShape(v)
    void c
    return Array.from({ length: sh.dendritos }, (_, k) => {
      const d = neuronDendrito(sh.r, sh.dendritos, sh.tilt, v, k)
      return { dx: Math.cos(d.a) * d.reach, dy: Math.sin(d.a) * d.reach }
    })
  })

  /** A ponta do neurônio `i` mais próxima de um ponto — por onde o fio sai. */
  const pontaPara = (i: number, tx: number, ty: number): { dx: number; dy: number } => {
    const c = neuronios[i]!
    const lista = pontas[i]!
    let melhor = lista[0]!
    let melhorD = Infinity
    for (const p of lista) {
      const ex = c.hx + p.dx - tx
      const ey = c.hy + p.dy - ty
      const d = ex * ex + ey * ey
      if (d < melhorD) {
        melhorD = d
        melhor = p
      }
    }
    return melhor
  }

  const sinapses: Array<{
    i: number
    j: number
    adx: number
    ady: number
    bdx: number
    bdy: number
    fase: number
  }> = []
  for (let i = 0; i < neuronios.length; i++) {
    const a1 = neuronios[i]!
    /*
     * Só liga para FRENTE na lista (`j > i`), e isso evita a ligação dupla sem
     * precisar de um conjunto de pares já vistos: cada par nasce uma vez só,
     * pelo índice menor.
     */
    const perto: Array<{ j: number; d2: number }> = []
    for (let j = i + 1; j < neuronios.length; j++) {
      const b1 = neuronios[j]!
      const dx = b1.hx - a1.hx
      const dy = b1.hy - a1.hy
      const d2 = dx * dx + dy * dy
      if (d2 <= SINAPSE_R * SINAPSE_R) perto.push({ j, d2 })
    }
    perto.sort((p, q) => p.d2 - q.d2)
    for (const { j } of perto.slice(0, SINAPSE_MAX)) {
      const b1 = neuronios[j]!
      // A ponta que cada um oferece ao OUTRO CENTRO, não à outra ponta: mirar a
      // ponta escolhida do vizinho dependeria da escolha dele, que depende da
      // sua. O centro é o alvo estável, e o resultado é o mesmo par de braços
      // que um humano ligaria olhando.
      const pa = pontaPara(i, b1.hx, b1.hy)
      const pb = pontaPara(j, a1.hx, a1.hy)
      sinapses.push({
        i,
        j,
        adx: pa.dx,
        ady: pa.dy,
        bdx: pb.dx,
        bdy: pb.dy,
        // Fase própria por ligação: sem ela o cérebro inteiro pisca junto, que
        // lê como pisca-pisca de natal em vez de atividade.
        fase: hashNoise(i * 31 + j, 909, 41),
      })
    }
  }

  /**
   * Rascunho das quatro coordenadas vivas de cada sinapse no quadro.
   *
   * Fora do laço para não alocar 60 vezes por segundo — a mesma razão pela qual
   * os acumuladores do empurrão da arena vivem fora do `drawCrowd`.
   */
  const vaos = new Float32Array(sinapses.length * 4)

  /*
   * O tecido: um sprite por tile, posicionado uma vez e com a textura trocada
   * só quando o nível de infecção do tile muda. 576 sprites parados custam
   * quase nada; 576 reposicionados por quadro custariam.
   */
  const tileW = tuning.arena.width / tuning.field.cols
  const tileH = tuning.arena.height / tuning.field.rows
  const tiles: Sprite[] = []
  const tileLevel = new Int8Array(tuning.field.cols * tuning.field.rows).fill(-1)
  for (let i = 0; i < tileLevel.length; i++) {
    const sp = new Sprite()
    sp.position.set((i % tuning.field.cols) * tileW, Math.floor(i / tuning.field.cols) * tileH)
    tiles.push(sp)
    tissueLayer.addChild(sp)
  }
  /*
   * ------------------------------------------------------------- A MULTIDÃO
   *
   * Uma hemácia por sprite, com três movimentos somados e independentes:
   *
   * - **CORRENTE**, global, em tempo de mundo. O sangue corre e você nada nele.
   *   É de onde vem o preenchimento: o parallax de fibrina e detritos não
   *   enchia porque estava ATRÁS da multidão, e a multidão cobre a tela quase
   *   inteira. Nenhum ajuste de velocidade consertava isso — quem tem que se
   *   mexer é a camada que o olho alcança.
   * - **RESPIRAÇÃO**, local, também em tempo de mundo. Cada célula oscila em
   *   torno de si numa fase própria. Existia no leito assado (quatro quadros de
   *   tremor), sumiu quando o leito virou multidão, e o H sentiu a falta na
   *   hora: *"agora percebo comportamento de multidão, mas elas não respiram"*.
   * - **EMPURRÃO**, de quem passa. É a mecânica de 02/08.
   *
   * As duas primeiras em tempo de MUNDO e não real, e isso não é detalhe: com o
   * jogador parado o tecido quase congela junto com tudo, e a tese do projeto
   * fica visível no organismo inteiro em vez de só numa barra de HUD.
   *
   * Custo: com corrente e respiração TODAS as células andam todo quadro, então
   * a otimização anterior — só tocar os perturbados — deixou de existir. Foi
   * troca consciente: ele varreu de 10 a 120 px² por célula na máquina dele e
   * bateu 144fps em todas.
   */
  const crowd = atlas.crowd
  const bloodSprites: Sprite[] = []
  const offX = new Float32Array(crowd.length)
  const offY = new Float32Array(crowd.length)
  const cellLevel = new Int8Array(crowd.length).fill(-1)
  /** Fase da respiração, em passos discretos, para virar consulta a tabela. */
  const WOB_STEPS = 64
  const cellPhase = new Uint8Array(crowd.length)
  for (let i = 0; i < crowd.length; i++) {
    const c = crowd[i]!
    const sp = new Sprite(atlas.blood[0]![c.variant]!)
    sp.anchor.set(0.5)
    sp.position.set(Math.round(c.hx), Math.round(c.hy))
    bloodSprites.push(sp)
    bloodLayer.addChild(sp)
    cellPhase[i] = Math.floor(hashNoise(i, 4242, 71) * WOB_STEPS) % WOB_STEPS
  }

  /*
   * Grade de busca, TOROIDAL no eixo x.
   *
   * A corrente move a multidão inteira pelo mesmo tanto, então em vez de
   * reindexar 2500 corpos por quadro, a grade fica em coordenada de CASA e a
   * consulta é que anda para trás pelo deslocamento da corrente. O toro no x
   * resolve a emenda: quem sai por um lado entra pelo outro, e o balde sabe.
   */
  const BUCKET = 32
  /** Largura do ciclo da corrente. Casa com a margem que `crowdLayout` usa. */
  const SPAN = tuning.arena.width + 16
  const gridW = Math.ceil(SPAN / BUCKET)
  const gridH = Math.ceil(tuning.arena.height / BUCKET) + 2
  const buckets: number[][] = Array.from({ length: gridW * gridH }, () => [])
  const wrapMod = (v: number, m: number): number => ((v % m) + m) % m
  for (let i = 0; i < crowd.length; i++) {
    const c = crowd[i]!
    const bx = wrapMod(Math.floor((c.hx + 8) / BUCKET), gridW)
    const by = Math.max(0, Math.min(gridH - 1, Math.floor(c.hy / BUCKET) + 1))
    buckets[by * gridW + bx]!.push(i)
  }

  /** Deslocamento acumulado da corrente, em px de coordenada de casa. */
  let flow = 0
  /** Px por segundo de MUNDO. Lento: a corrente preenche, não arrasta. */
  const FLOW_SPEED = 11
  const wob = new Float32Array(WOB_STEPS)
  const wobY = new Float32Array(WOB_STEPS)

  const LEVELS = atlas.colony.length
  const VARIANTS = atlas.colony[0]!.length
  const auraPool = new Pool(auraLayer)
  const enemyPool = new Pool(enemyLayer)
  const ghostPool = new Pool(ghostLayer)
  const powerPool = new Pool(powerLayer)
  const fxPool = new Pool(fxLayer)

  // ------------------------------------------------------------------- hud
  const hudBars = new Graphics()
  hud.addChild(hudBars)
  const waveLabel = new Label(hud, atlas)
  const buildLabel = new Label(hud, atlas)
  const buildDots = new Graphics()
  hud.addChild(buildDots)
  const buildLabels = [0, 1, 2, 3].map(() => new Label(hud, atlas))
  const scoreLabel = new Label(hud, atlas)
  const multLabel = new Label(hud, atlas)
  /** O número da tecla ao lado de cada ícone de habilidade. */
  const habTeclas = [0, 1, 2, 3, 4].map(() => new Label(hud, atlas))
  const popLabels: Label[] = []

  const deadVeil = new Sprite(atlas.veil(INK, 2))
  overlay.addChild(deadVeil)
  const deadLines = [0, 1, 2, 3].map(() => new Label(overlay, atlas))

  // ------------------------------------------------------- card da fase
  /*
   * A apresentação da doença. Dá IDENTIDADE, não estratégia (02/08): nome real,
   * morfologia e o bicho grande na tela, animado. O que ela FAZ com você e o
   * que fazer contra ela continuam sendo descoberta — em Flicky ninguém ensinou
   * o objetivo, e é de onde vem a memória do jogo.
   */
  /*
   * Véu de nível 1, não 2. O 2 é o da morte, e apaga o tecido inteiro — olhando
   * a primeira captura, o card virou tela preta com um bicho, e preto lê como
   * ausência (regra do projeto desde 02/08). A fase é apresentada DENTRO do
   * organismo, com a multidão viva por trás, ou não é apresentação de fase.
   */
  const cardVeil = new Sprite(atlas.veil(INK, 1))
  overlay.addChild(cardVeil)
  /*
   * Moldura das duas telas de cima. Entra ANTES do bicho e dos rótulos, senão
   * cobre os dois — foi exatamente o que aconteceu na primeira versão, e o
   * bacilo virou silhueta escura dentro do próprio card que existe para
   * apresentá-lo. Só a captura pegou.
   *
   * Texto sobre tecido vermelho some, e o H apontou isso em 02/08: "ESPAÇO PRA
   * COMEÇAR mal é visto". A saída não é escurecer a tela inteira — isso mataria
   * "a fase acontece DENTRO do corpo" — é dar CHÃO ao texto e deixar o
   * organismo visível em volta da moldura.
   */
  const rewardPanels = new Graphics()
  overlay.addChild(rewardPanels)
  /*
   * O PREVIEW do poder saiu em 13/08, com a tela de recompensa.
   *
   * Ele desenhava o jogador com o efeito ligado, reusando as texturas da
   * partida — e substituiu um emblema geométrico que eu tinha inventado
   * alegando "não desenho", argumento que o H desmontou na hora e com razão
   * (`TASTE.md` §2a: usei limitação declarada como ESCUDO). Fica registrado
   * aqui porque a lição é do modelo, não do código; o código está em
   * `git show 0663754:src/render/renderer.ts` se a recompensa voltar.
   */
  /** A moeda desenhada na faixa do hub, ao lado do número da memória. */
  const hubCoin = new Sprite()
  hubCoin.anchor.set(0.5)
  hubCoin.scale.set(2)
  overlay.addChild(hubCoin)
  const cardBicho = new Sprite()
  cardBicho.anchor.set(0.5)
  // Escala INTEIRA: o pixel art nativo não tolera meio pixel, e o card é a
  // única tela em que o bicho aparece grande o bastante para denunciar isso.
  cardBicho.scale.set(4)
  overlay.addChild(cardBicho)
  const cardLines = [0, 1, 2, 3].map(() => new Label(overlay, atlas))
  const cardPicks = [0, 1, 2].map(() => new Label(overlay, atlas))
  /** Um rótulo por PORTA do cérebro: a órbita e as quatro de 13/08. */
  const hubLabels = [0, 1, 2, 3, 4].map(() => new Label(overlay, atlas))
  /** As linhas do corpo de um painel. Cinco cabem no quadro; o histórico usa todas. */
  const painelLinhas = [0, 1, 2, 3, 4].map(() => new Label(overlay, atlas))
  /** As linhas da LOJA: nome, preço e o que a habilidade faz. */
  const lojaLinhas = [0, 1, 2, 3].map(() => new Label(overlay, atlas))
  const lojaPrecos = [0, 1, 2, 3].map(() => new Label(overlay, atlas))
  const lojaBlurbs = [0, 1, 2, 3].map(() => new Label(overlay, atlas))
  const cardBlurbs = [0, 1, 2].map(() => new Label(overlay, atlas))
  // O que SAI do build se você levar este. Só aparece com o build cheio.
  const cardCusto = [0, 1, 2].map(() => new Label(overlay, atlas))
  const cardBlurb = new Label(overlay, atlas)

  // ---------------------------------------------------------------- estado
  let particles: Particle[] = []
  let pops: Pop[] = []
  /**
   * ANÉIS de impacto do abate e ONDAS do item consumido.
   *
   * Vivem no render e só no render: são a resposta ao "crock" que o H pediu, e
   * nenhum deles toca o hash da sim. É o que permite afinar o feel sem regravar
   * fixture — a lição de hoje, em que três derivas de determinismo custaram
   * três regravações.
   *
   * `step` conta QUADROS da folha, não segundos, porque a folha é assada em
   * raios discretos: avançar por tempo contínuo escolheria o mesmo quadro duas
   * vezes num quadro rápido e pularia raios num lento.
   */
  let impactos: Array<{ x: number; y: number; step: number }> = []
  let ondas: Array<{ x: number; y: number; step: number; patogeno: boolean }> = []
  /** Último `lastPickTick` já animado. Sem isto a onda renasce todo quadro. */
  let pickVisto = -1
  const heading = new Map<number, number>()
  let seenIds = new Set<number>()
  let prevLives = -1
  let prevCombo = 0
  let prevWave = 1
  // Pulso da pontuação: sobe no abate e decai em tempo REAL.
  let scorePulse = 0
  let prevScore = 0
  let flash = 0
  let shake = 0

  /**
   * Os dois relógios. `selfClock` anda com o tempo de parede; `worldClock` anda
   * com a escala de tempo que a sim publica. A distância entre os dois É o jogo.
   */
  let selfClock = 0
  let worldClock = 0
  let driftX = 0
  /** Relógio do parallax do cérebro. Separado: o hub não tem tempo de mundo. */
  let brainDriftX = 0
  let lastFrame = performance.now()

  // Trilha do borrão: as últimas posições, para os fantasmas de velocidade.
  const tailX: number[] = []
  const tailY: number[] = []

  const burst = (x: number, y: number, idx: number, n: number, speed: number): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed * (0.6 + (i % 3) * 0.2),
        vy: Math.sin(a) * speed * (0.6 + (i % 3) * 0.2),
        life: 1,
        idx,
        size: 1 + (i % 3),
      })
    }
  }

  const drawAuras = (cur: SimState): void => {
    auraPool.begin()
    const st = activeStats(tuning, cur.active, cur.owned)
    if (st.interferonRadius > 0) {
      const sp = auraPool.next(atlas.interferon)
      sp.position.set(Math.round(cur.player.x), Math.round(cur.player.y))
    }
    for (const tr of cur.trails) {
      const sp = auraPool.next(atlas.trail)
      sp.position.set(Math.round(tr.x), Math.round(tr.y))
      // Só a visibilidade pisca; a densidade do dither já faz o esmaecimento.
      sp.visible = tr.life > 6 || (cur.tick & 2) === 0
    }
    /*
     * FOCOS plantados pela aura.
     *
     * Desenhados com a MESMA textura de aura da partida, pulsando em tempo
     * REAL — eles curam independentemente do relógio do mundo, e a animação
     * precisa dizer isso: com você parada e o mundo quase congelado, o foco
     * continua trabalhando na cadência dele.
     */
    for (const pu of cur.pulses) {
      const sp = auraPool.next(atlas.interferon)
      sp.position.set(Math.round(pu.x), Math.round(pu.y))
      const fim = Math.min(1, pu.life / 90)
      sp.alpha = (0.35 + 0.25 * Math.sin(selfClock * 5 + pu.id)) * fim
      sp.tint = col(SHI1)
    }

    for (const cl of cur.clouds) {
      const sp = auraPool.next(atlas.cloud)
      sp.position.set(Math.round(cl.x), Math.round(cl.y))
      sp.visible = cl.life > 6 || (cur.tick & 2) === 0
    }
    for (const sh of cur.shocks) {
      const grow = 1 - sh.life / tuning.powers.shockLifeTicks
      const step = Math.min(atlas.shock.length - 1, Math.floor(grow * atlas.shock.length))
      const sp = auraPool.next(atlas.shock[step]!)
      sp.position.set(Math.round(sh.x), Math.round(sh.y))
    }
    auraPool.end()
  }

  const drawPowers = (cur: SimState, phase: number): void => {
    powerPool.begin()
    for (const m of cur.macrophages) {
      const sp = powerPool.next(frameOf(atlas.macrophage, 0, 0, phase + m.id))
      sp.position.set(Math.round(m.x), Math.round(m.y))
    }
    for (const o of cur.orbiters) {
      const sp = powerPool.next(atlas.orbiter)
      sp.position.set(
        Math.round(cur.player.x + o.ox * tuning.powers.orbitRadius),
        Math.round(cur.player.y + o.oy * tuning.powers.orbitRadius),
      )
    }
    for (const d of cur.drops) {
      /*
       * A cápsula veste a cor do que ela AFETA — chamada do H em 13/08.
       *
       * Supressão em verde de limo, COMPLEMENTO na rampa do patógeno da fase.
       * A escolha mora aqui e não em `POWERS[].color` porque a segunda muda com
       * a doença em cena, e `POWERS` é estático.
       */
      const sheet =
        d.power === PLAQUETA
          ? atlas.dropLimo
          : d.power === COMPLEMENTO
            ? (atlas.dropsByKind.get(doencaDaFase(cur)) ?? atlas.drops[d.power]!)
            : (atlas.drops[d.power] ?? atlas.drops[0]!)
      // Prestes a expirar: pisca em quadro cheio, do jeito do console.
      const aceso = d.life >= 90 || (cur.tick & 4) === 0
      /*
       * O HALO vem ANTES do corpo no pool, então fica atrás dele.
       *
       * Ele é a resposta ao conflito que o próprio pedido cria: item da cor do
       * cenário é item invisível. O anel pisca trocando de matiz, coisa que
       * nada mais em campo faz, e a cor do corpo continua sendo a pedida.
       *
       * O relógio é o `selfClock` (tempo de parede), não o da sim: piscar é
       * sinal para o OLHO, e tem que ter a mesma cadência com o jogo lento ou
       * rápido — se dependesse do mundo, o halo quase parava justamente quando
       * o jogador está parado procurando o que fazer.
       */
      if (aceso) {
        const halo = powerPool.next(frameOf(atlas.halo, 0, 0, Math.floor(selfClock * 14) + d.id))
        halo.position.set(Math.round(d.x), Math.round(d.y))
      }
      const sp = powerPool.next(frameOf(sheet, 0, 0, phase + d.id))
      sp.position.set(Math.round(d.x), Math.round(d.y))
      sp.visible = aceso
    }
    /*
     * As MOEDAS. Depois das cápsulas no pool, então por cima delas.
     *
     * Ordem escolhida e não herdada: a cápsula é decisão e a moeda é
     * recompensa, mas a moeda é MENOR e muito mais numerosa — embaixo, ela
     * sumiria sob a primeira cápsula que caísse perto, e o jogador leria como
     * moeda que não caiu.
     *
     * A fase do giro é `id`-dependente: sem isso todas as moedas do campo
     * giram em sincronia e o punhado lê como um objeto só, articulado.
     */
    for (const c of cur.pickups) {
      const sp = powerPool.next(frameOf(atlas.coin, 0, 0, phase + c.id))
      sp.position.set(Math.round(c.x), Math.round(c.y))
      // Prestes a sumir, pisca — mesma convenção da cápsula, e convenção
      // repetida é o que o jogador aprende uma vez e usa para sempre.
      sp.visible = c.life >= 60 || (cur.tick & 4) === 0
    }
    powerPool.end()
  }

  /**
   * O CÉREBRO, desenhado. Parallax, respiração e sinapses correndo.
   *
   * Tudo aqui anda no relógio de PAREDE, não no do mundo: o hub não tem mundo.
   * É a consequência direta de ele ser safezone — nenhuma doença avança, então
   * não há escala de tempo para herdar, e o único relógio honesto é o do olho.
   */
  const drawBrain = (cur: SimState, dt: number): void => {
    brainDriftX -= dt
    for (const d of brainDrift) {
      const span = tuning.arena.width
      const base = ((((brainDriftX * d.speed) % span) + span) % span) - span
      // Inteiro, como na arena: camada de fundo em subpixel treme e denuncia.
      d.sprite.position.set(Math.round(base) + d.slot * span, 0)
    }

    /*
     * Respiração, DERIVA e EMPURRÃO num laço só.
     *
     * O empurrão é o da arena com uma diferença que vale dizer: lá o alvo é
     * recalculado do zero por quadro contra vários corpos, aqui só o glóbulo
     * empurra, então o alvo é a normal dele e mais nada. Cede a 0,5 por quadro e
     * volta a 0,09 — os mesmos números da multidão de 02/08, porque é o mesmo
     * gesto e ter dois valores para a mesma sensação seria inventar diferença.
     */
    const pRaio = tuning.player.size / 2
    for (let i = 0; i < neuronSprites.length; i++) {
      const c = neuronios[i]!
      const dr = nDrift[i]!
      const dvx = Math.sin(selfClock * dr.fx * TAU + dr.px) * dr.amp
      const dvy = Math.cos(selfClock * dr.fy * TAU + dr.py) * dr.amp

      // Empurrão: distância medida da casa JÁ DERIVADA, senão o corpo é empurrado
      // de onde ele não está e escapa por um lado enquanto o desenho sai por outro.
      const bx = c.hx + dvx
      const by = c.hy + dvy
      let alvoX = 0
      let alvoY = 0
      const ex = bx + nOffX[i]! - cur.player.x
      const ey = by + nOffY[i]! - cur.player.y
      const min = pRaio + c.r
      const d2 = ex * ex + ey * ey
      const empurrada = d2 < min * min
      if (empurrada) {
        const d = Math.sqrt(d2)
        // Corpo exatamente sobre o centro: empurra para um lado ESTÁVEL, não um
        // sorteado, senão ele vibra. Mesma nota da multidão da arena.
        const nx = d > 0.001 ? ex / d : 1
        const ny = d > 0.001 ? ey / d : 0
        alvoX = nx * (min - d)
        alvoY = ny * (min - d)
      }
      const taxa = empurrada ? 0.5 : 0.09
      const ox = nOffX[i]! + (alvoX - nOffX[i]!) * taxa
      const oy = nOffY[i]! + (alvoY - nOffY[i]!) * taxa
      nOffX[i] = Math.abs(ox) < 0.02 ? 0 : ox
      nOffY[i] = Math.abs(oy) < 0.02 ? 0 : oy

      // A casa VIVA do corpo, que a sinapse também vai usar. Guardada na deriva
      // para não recalcular seno por ligação logo abaixo.
      dr.vx = bx + nOffX[i]!
      dr.vy = by + nOffY[i]!

      const folha = atlas.neurons[c.variant % atlas.neurons.length]!
      const fase = Math.floor(selfClock * 3 + c.variant * 0.7 + i * 0.11) % folha.frames.length
      const sp = neuronSprites[i]!
      sp.texture = folha.frames[fase]!
      sp.position.set(Math.round(dr.vx), Math.round(dr.vy))
    }

    /*
     * O SINAL correndo pela ligação — a sinapse propriamente dita.
     *
     * Não é a linha que acende: é um PONTO que percorre a linha. Ligação inteira
     * piscando lê como cabo com mau contato; um ponto viajando de um soma ao
     * outro lê como informação indo de um lugar para outro, que é o que uma
     * sinapse faz e o que o H pediu ao dizer "produzindo sinapses".
     */
    /*
     * As pontas são recalculadas por quadro desde que os corpos derivam.
     *
     * `adx/ady` é offset em relação ao centro, e `dr.vx/vy` é a casa viva que o
     * laço acima acabou de escrever — a soma é onde o braço está AGORA. Guardado
     * em `vaos` porque o pulso, mais abaixo, precisa exatamente das mesmas quatro
     * coordenadas, e recalcular seria a segunda chance de elas discordarem.
     */
    brainFxLayer.clear()
    for (let n = 0; n < sinapses.length; n++) {
      const li = sinapses[n]!
      const a = nDrift[li.i]!
      const b = nDrift[li.j]!
      const ax = Math.round(a.vx + li.adx)
      const ay = Math.round(a.vy + li.ady)
      const bx = Math.round(b.vx + li.bdx)
      const by = Math.round(b.vy + li.bdy)
      vaos[n * 4] = ax
      vaos[n * 4 + 1] = ay
      vaos[n * 4 + 2] = bx
      vaos[n * 4 + 3] = by
      brainFxLayer
        .moveTo(ax, ay)
        .lineTo(bx, by)
        // Mesma rampa do dendrito que ela liga, um degrau abaixo: o vão entre
        // duas pontas tem que ler como continuação do braço, não como cabo.
        .stroke({ width: 1, color: col(NEU2), alpha: 0.5 })
    }

    /*
     * A ÓRBITA: os patógenos girando, e a PORTA para a escolha. Pedido do H.
     *
     * O anel é desenhado, não assado, porque ele pulsa com a proximidade do
     * jogador — e é esse pulso que ensina que dá para entrar. Sem ele o jogador
     * teria que descobrir a porta por tentativa, num lugar que existe
     * justamente para não exigir tentativa.
     *
     * Dois círculos: o de fora é a órbita dos corpos, o de dentro é o GATILHO.
     * Desenhar só um mentiria sobre onde a coisa acontece — o `enterRadius` é
     * bem menor que o `orbitRadius`, de propósito, para não disparar de raspão
     * em quem só passeia.
     */
    const hx = tuning.hub.orbitX
    const hy = tuning.hub.orbitY
    const dxp = cur.player.x - hx
    const dyp = cur.player.y - hy
    const perto = Math.max(0, 1 - Math.sqrt(dxp * dxp + dyp * dyp) / (tuning.hub.orbitRadius * 2))
    brainFxLayer
      .circle(hx, hy, tuning.hub.orbitRadius)
      .stroke({ width: 1, color: col(NUC1), alpha: 0.4 + perto * 0.4 })
    brainFxLayer
      .circle(hx, hy, tuning.hub.enterRadius + Math.round(Math.sin(selfClock * 4) * 1.5))
      .stroke({ width: 1, color: col(GLD2), alpha: 0.35 + perto * 0.55 })

    /*
     * As OUTRAS QUATRO PORTAS — 13/08, pedido do H.
     *
     * Mesmo anel pulsante da órbita, e o pulso mede a mesma coisa: a distância
     * até o glóbulo. Cinco portas com cinco linguagens visuais fariam o jogador
     * aprender cinco vezes que ali se entra; com uma linguagem só ele aprende
     * na primeira e reconhece nas outras quatro.
     *
     * O que muda entre elas é a COR, e ela não é enfeite: é o que liga o anel no
     * cérebro ao quadro que abre em cima dele.
     */
    for (const n of tuning.hub.nodes) {
      const ex = cur.player.x - n.x
      const ey = cur.player.y - n.y
      const p = Math.max(0, 1 - Math.sqrt(ex * ex + ey * ey) / (tuning.hub.nodeRadius * 5))
      const cor = col(PORTA_COR[n.id] ?? NUC2)
      brainFxLayer
        .circle(n.x, n.y, tuning.hub.nodeRadius + 6)
        .stroke({ width: 1, color: cor, alpha: 0.18 + p * 0.25 })
      brainFxLayer
        .circle(n.x, n.y, tuning.hub.nodeRadius + Math.round(Math.sin(selfClock * 4) * 1.5))
        .stroke({ width: 1, color: cor, alpha: 0.35 + p * 0.55 })
    }

    /*
     * TODOS os patógenos girando no anel — o H pediu todos, não só o jogável.
     *
     * A `ecoli_filha` fica de fora: ela não é um inimigo, é o que sobra de um
     * abate apressado. Pôr a filha ao lado da mãe na vitrine anunciaria seis
     * doenças onde há cinco, e a órbita é a promessa da tela.
     *
     * Giram em tempo de PAREDE, como todo o resto do hub. A ordem angular vem do
     * índice, então a roda é estável entre quadros e o jogador aprende onde cada
     * um fica — vitrine que embaralha não deixa aprender nada.
     */
    brainOrbit.begin()
    const vitrine = Object.keys(tuning.enemy.kinds).filter((k) => k !== "ecoli_filha")
    for (let i = 0; i < vitrine.length; i++) {
      const kind = vitrine[i]!
      const folha = atlas.pathogens.get(kind)
      if (folha === undefined) continue
      const ang = selfClock * tuning.hub.orbitSpeed * TAU + (i / vitrine.length) * TAU
      const px = Math.round(hx + Math.cos(ang) * tuning.hub.orbitRadius)
      const py = Math.round(hy + Math.sin(ang) * tuning.hub.orbitRadius)
      // A direção do sprite acompanha a tangente: o bicho olha para onde anda,
      // como em campo. Parado na órbita ele viraria ilustração.
      const dir = (Math.round(((ang + Math.PI / 2) / TAU) * 8) + 8) % 8
      const sp = brainOrbit.next(frameOf(folha, 0, dir, Math.floor(selfClock * 7) + i))
      sp.position.set(px, py)
    }
    brainOrbit.end()

    /*
     * O JOGADOR no cérebro, com o mesmo sprite e a mesma leitura de velocidade
     * da arena. É o corpo dele; usar outro aqui seria dizer que o hub é outro
     * jogo.
     */
    const tierHub = tierOf(cur.player.speed)
    const dirHub = cur.player.speed > 0.05 ? dirOf(cur.player.vx, cur.player.vy) : lastDir
    lastDir = dirHub
    brainPlayer.texture = frameOf(
      atlas.player,
      tierHub,
      dirHub,
      Math.floor(selfClock * (4 + cur.player.speed * 16)),
    )
    brainPlayer.position.set(Math.round(cur.player.x), Math.round(cur.player.y))
    /*
     * O GLOW do glóbulo, e ele existe SÓ nesta tela.
     *
     * A primeira tentativa foi uma órbita de contas multicoloridas em volta do
     * corpo, e o H a reprovou por dois motivos que valem mais que o efeito: não
     * era o que ele tinha pedido, e ela resolvia o sintoma errado. Contas
     * girando acrescentam MOVIMENTO ao redor de um corpo que continuava do mesmo
     * tom do fundo — mais coisa na tela para achar a mesma coisa.
     *
     * A causa era de cor, e foi atacada na causa: o neurônio ganhou rampa
     * própria e escureceu (`RAMP_NEU`), e o glóbulo ganhou halo. Fundo recua,
     * sujeito avança — é a ordem certa, e cada metade sozinha teria custado o
     * dobro para metade do efeito.
     *
     * Discos concheiros do maior ao menor, em ciano: glow em pixel art é
     * DEGRAU, não desfoque, e o ciano é a cor que o próprio corpo já usa para
     * dizer "sou eu a toda". No `brainFxLayer`, que está atrás do corpo.
     *
     * Só aqui: na arena o leucócito é a única coisa pálida em cena e o halo
     * seria enfeite — e enfeite permanente vira ruído no exato lugar onde o
     * jogador precisa ler contato.
     */
    const rBase = tuning.player.size / 2
    const respiro = 1 + 0.08 * Math.sin(selfClock * 2.4)
    const camadas: ReadonlyArray<readonly [number, number]> = [
      [rBase * 2.2, 0.09],
      [rBase * 1.7, 0.13],
      [rBase * 1.3, 0.18],
    ]
    for (const [raio, alpha] of camadas) {
      brainFxLayer
        .circle(Math.round(cur.player.x), Math.round(cur.player.y), Math.round(raio * respiro))
        .fill({ color: col(FAST1), alpha })
    }
    /*
     * O SINAL, agora MULTICOLORIDO e em TODA sinapse — pedido do H em 13/08.
     *
     * Duas mudanças, e a segunda é a que custa: antes só metade do ciclo tinha
     * sinal, então a qualquer instante metade das ligações estava vazia. Ele
     * pediu "percorrendo cada sinapse", e agora percorre — o que sobra para
     * evitar o ruído branco não é apagar ligações, é dar a cada uma um ritmo
     * PRÓPRIO (`fase`) e velocidades diferentes, de forma que a tela nunca
     * tenha dois sinais no mesmo ponto do percurso.
     *
     * A cor sai de uma roda de seis, escolhida pelo índice da ligação: fixa por
     * sinapse e não sorteada por quadro. Cor que muda a cada quadro no mesmo fio
     * lê como interferência; cor fixa por fio lê como sinais DIFERENTES viajando
     * em canais diferentes, que é o que o cérebro faz.
     */
    /*
     * E ele virou PULSO ELÉTRICO em vez de ponto — pedido do H na mesma leva.
     *
     * O ponto de 3x3 dizia "alguma coisa se desloca". Um pulso diz o que se
     * desloca: um risco CURTO na direção do percurso, com a cabeça branca e um
     * degrau de um pixel no meio. O degrau é o que faz o olho ler descarga em
     * vez de partícula — corrente lida como corrente porque não anda reta.
     *
     * O degrau alterna num relógio próprio e RÁPIDO (12/s), fora do ritmo do
     * deslocamento: no mesmo ritmo, o risco pareceria dobrar de forma fixa e
     * viraria uma seta viajando.
     */
    for (let i = 0; i < sinapses.length; i++) {
      const li = sinapses[i]!
      // Velocidade própria por ligação, entre 0,35 e 0,75 de volta por segundo.
      const vel = 0.35 + (i % 9) * 0.05
      const u = (selfClock * vel + li.fase) % 1
      // As MESMAS coordenadas que a linha usou neste quadro, não recalculadas:
      // os corpos derivam, e duas contas do mesmo vão são duas oportunidades de
      // o pulso correr por fora do fio.
      const ax = vaos[i * 4]!
      const ay = vaos[i * 4 + 1]!
      const dx = vaos[i * 4 + 2]! - ax
      const dy = vaos[i * 4 + 3]! - ay
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 4) continue
      const ux = dx / len
      const uy = dy / len
      const hx2 = ax + dx * u
      const hy2 = ay + dy * u
      /*
       * O rabo é uma FRAÇÃO do vão, e isso foi medido antes de ser escolhido.
       *
       * Com 7px fixos e o vão mediano em 15,6px (`crowdLayout` a 950 de área, 412
       * ligações), o pulso ocupava metade do percurso — e no décimo mais curto
       * ele nascia maior que o próprio fio, o que lê como traço parado e não como
       * descarga. 45% mantém a mesma silhueta em vão curto e em vão longo.
       *
       * O corte por `len * u` continua: é o que faz o pulso NASCER na ponta do
       * dendrito em vez de já aparecer inteiro fora dela.
       */
      const rabo = Math.min(len * 0.45, len * u)
      const tx = hx2 - ux * rabo
      const ty = hy2 - uy * rabo
      const zig = Math.floor(selfClock * 12 + i) % 2 === 0 ? 1 : -1
      const mx = Math.round((hx2 + tx) / 2 - uy * zig)
      const my = Math.round((hy2 + ty) / 2 + ux * zig)
      const cor = col(SINAL[i % SINAL.length]!)
      /*
       * Duas passadas no MESMO traço: um brilho largo e fraco, e o núcleo fino e
       * cheio. É o que devolve ao pulso a presença que ele perdeu ao deixar de
       * ser um quadrado de 3x3 — o ponto antigo se via de longe por ser gordo, e
       * um risco de um pixel sozinho é fino demais para competir com a multidão.
       *
       * Largura ÍMPAR nas duas, senão o traço largo cai meio pixel fora do fino e
       * o pulso sai com franja de um lado só.
       */
      const traco = (w: number, a: number): void => {
        brainFxLayer
          .moveTo(Math.round(tx), Math.round(ty))
          .lineTo(mx, my)
          .lineTo(Math.round(hx2), Math.round(hy2))
          .stroke({ width: w, color: cor, alpha: a })
      }
      traco(3, 0.22)
      traco(1, 0.95)
      // A cabeça é o único ponto branco: é ela que diz para onde a coisa vai.
      brainFxLayer.rect(Math.round(hx2) - 1, Math.round(hy2) - 1, 2, 2).fill(cor)
      brainFxLayer.rect(Math.round(hx2), Math.round(hy2), 1, 1).fill(col(WHITE))
    }
    void cur
  }

  /** A doença em cena. O item de patógeno veste a rampa dela. */
  const doencaDaFase = (cur: SimState): string =>
    tuning.phases[Math.min(cur.phaseIndex, tuning.phases.length - 1)]!.disease

  let lastDir = 0
  const drawPlayer = (cur: SimState, x: number, y: number): void => {
    const speed = cur.player.speed
    const tier = tierOf(speed)
    const dir = speed > 0.05 ? dirOf(cur.player.vx, cur.player.vy) : lastDir
    lastDir = dir
    const phase = Math.floor(selfClock * (4 + speed * 16))

    const px = Math.round(x)
    const py = Math.round(y)

    // Borrão de velocidade: fantasmas da PRÓPRIA silhueta, recortados em dither.
    // Correr é literalmente ocupar mais tela — a leitura mais direta do relógio.
    tailX.unshift(px)
    tailY.unshift(py)
    if (tailX.length > 18) {
      tailX.length = 18
      tailY.length = 18
    }
    ghostPool.begin()
    if (tier > 0) {
      /*
       * Fantasmas espaçados por DISTÂNCIA percorrida, não por número de quadros.
       * Contando quadros, o rastro se abre num colar de contas assim que a taxa
       * cai — a captura em headless a 20fps expôs isso na hora. Distância dá o
       * mesmo borrão em qualquer máquina.
       */
      const levels = atlas.ghosts[tier]![dir]!
      const step = tuning.player.size * 0.55
      let want = step
      let walked = 0
      let slot = 0
      for (let i = 1; i < tailX.length && slot < levels.length; i++) {
        const dx = tailX[i]! - tailX[i - 1]!
        const dy = tailY[i]! - tailY[i - 1]!
        walked += Math.sqrt(dx * dx + dy * dy)
        while (walked >= want && slot < levels.length) {
          const sp = ghostPool.next(levels[slot]!)
          sp.position.set(tailX[i]!, tailY[i]!)
          slot++
          want += step
        }
      }
    }
    ghostPool.end()

    playerSprite.texture = frameOf(atlas.player, tier, dir, phase)
    playerSprite.position.set(px, py)
    // Troca de paleta no dano — o console fazia exatamente isto. É a única
    // multiplicação de cor do render, e ela cai em cima de um sprite já
    // quantizado, então não inventa tom intermediário.
    playerSprite.tint =
      cur.player.invulnerable && (cur.tick & 4) < 2 ? col(HURT1) : 0xffffff
  }

  const drawEnemies = (cur: SimState, prev: SimState, t: number, phase: number): void => {
    const prevById = new Map(prev.enemies.map((e) => [e.id, e]))
    enemyPool.begin()
    for (const e of cur.enemies) {
      const sheet = atlas.pathogens.get(e.kind)
      if (sheet === undefined) continue
      const form = tuning.enemy.kinds[e.kind]?.form ?? "esfera"
      const p = prevById.get(e.id)
      const x = Math.round(p ? lerp(p.x, e.x, t) : e.x)
      const y = Math.round(p ? lerp(p.y, e.y, t) : e.y)

      let dir: number
      if (form === "bacilo" || form === "flagelado") {
        // Aponta para onde vai. Era o defeito nomeado em 01/08: um flagelado
        // girando no próprio eixo não se move, se exibe.
        if (p !== undefined) {
          const vx = e.x - p.x
          const vy = e.y - p.y
          if (vx * vx + vy * vy > 0.0004) {
            const want = Math.atan2(vy, vx)
            const had = heading.get(e.id) ?? want
            let delta = want - had
            while (delta > Math.PI) delta -= TAU
            while (delta < -Math.PI) delta += TAU
            heading.set(e.id, had + delta * 0.3)
          }
        }
        const h = heading.get(e.id) ?? 0
        dir = (Math.round((h / TAU) * 8) + 8) % 8
      } else {
        // Sem frente: cambaleia em passos de 45°, no tempo de MUNDO.
        dir = Math.floor(worldClock * 2.2 + e.id * 0.7) & 7
      }

      const sp = enemyPool.next(frameOf(sheet, 0, dir, phase + e.id * 3))
      sp.position.set(x, y)

      // Nascimento: pisca em vez de escalar. Escalar sprite quebra a grade.
      const age = cur.tick - e.bornTick
      sp.visible = age > 10 ? true : (age & 2) === 0
      if (age < 14 && (age & 1) === 0) {
        const mark = enemyPool.next(atlas.hatch)
        mark.position.set(x, y)
      }
    }
    enemyPool.end()

    if (heading.size > 400) {
      const live = new Set(cur.enemies.map((e) => e.id))
      for (const key of heading.keys()) if (!live.has(key)) heading.delete(key)
    }
  }

  // Acumuladores do empurrão. Fora do laço para não alocar 60 vezes por segundo.
  const desX = new Float32Array(crowd.length)
  const desY = new Float32Array(crowd.length)
  const tocado = new Uint8Array(crowd.length)
  let tocados: number[] = []

  const tileWf = tuning.arena.width / tuning.field.cols
  const tileHf = tuning.arena.height / tuning.field.rows

  /**
   * A multidão: corrente, respiração, empurrão e necrose num laço só.
   *
   * O empurrão resolve SOBREPOSIÇÃO — se um corpo está dentro de uma hemácia,
   * ela sai pela normal até encostar. Não é força nem colisão elástica: é o
   * mínimo que faz "eu ocupo este espaço, então você não pode".
   *
   * Sai rápido e volta devagar, e a assimetria é o que dá a leitura de estação
   * de trem lotada: quem foi empurrado cede na hora e leva um tempo pra voltar.
   */
  const drawCrowd = (
    cur: SimState,
    px: number,
    py: number,
    dt: number,
    wclock: number,
    doente: number,
  ): void => {
    if (cur.phase === "run") flow += cur.worldScale * dt * FLOW_SPEED

    /*
     * Tabela de respiração: 64 senos por quadro em vez de um por célula.
     *
     * Ritmo e amplitude sobem com a infecção — pedido do H em 02/08, de que a
     * respiração do organismo acompanhe a progressão da doença. Com o campo
     * limpo é um tecido respirando; com o campo tomado é taquicardia, e o
     * colapso passa a ser sentido antes de ser lido na barra de HUD.
     */
    const ritmo = 1.7 + doente * 3.4
    const amp = 1.1 + doente * 1.3
    for (let k = 0; k < WOB_STEPS; k++) {
      const a = wclock * ritmo + (k / WOB_STEPS) * TAU
      wob[k] = Math.sin(a) * amp
      wobY[k] = Math.cos(a * 0.83) * amp
    }

    // ------------------------------------------------------------- empurrão
    for (const i of tocados) {
      desX[i] = 0
      desY[i] = 0
      tocado[i] = 0
    }
    tocados = []

    const fx = wrapMod(flow, SPAN)
    const corpo = (bx: number, by: number, br: number): void => {
      const alcance = br + 14
      // A consulta anda PARA TRÁS pelo deslocamento da corrente, e é isso que
      // deixa a grade ficar em coordenada de casa e nunca ser reconstruída.
      const qx = bx + 8 - fx
      const g0 = Math.floor((qx - alcance) / BUCKET)
      const g1 = Math.floor((qx + alcance) / BUCKET)
      const r0 = Math.max(0, Math.floor((by - alcance) / BUCKET) + 1)
      const r1 = Math.min(gridH - 1, Math.floor((by + alcance) / BUCKET) + 1)
      for (let gy = r0; gy <= r1; gy++) {
        for (let g = g0; g <= g1; g++) {
          const gx = wrapMod(g, gridW)
          for (const i of buckets[gy * gridW + gx]!) {
            const c = crowd[i]!
            // Posição de TELA da célula, com a corrente já aplicada e enrolada.
            const ex = wrapMod(c.hx + 8 + fx, SPAN) - 8
            const dx = ex + offX[i]! - bx
            const dy = c.hy + offY[i]! - by
            const min = br + c.r
            const d2 = dx * dx + dy * dy
            if (d2 >= min * min) continue
            const d = Math.sqrt(d2)
            // Corpo exatamente em cima do centro: empurra para um lado estável,
            // e não para um aleatório, senão a célula vibra.
            const nx = d > 0.001 ? dx / d : 1
            const ny = d > 0.001 ? dy / d : 0
            const need = min - d
            if (tocado[i] === 0) {
              tocado[i] = 1
              tocados.push(i)
            }
            desX[i] = desX[i]! + nx * need
            desY[i] = desY[i]! + ny * need
          }
        }
      }
    }

    corpo(px, py, tuning.player.size / 2)
    for (const e of cur.enemies) {
      const scale = tuning.enemy.kinds[e.kind]?.sizeScale ?? 1
      corpo(e.x, e.y, (tuning.enemy.size * scale) / 2)
    }

    // ------------------------------------------------ posição e necrose
    const maxInf = tuning.field.maxInfection
    for (let i = 0; i < crowd.length; i++) {
      const c = crowd[i]!
      const empurrada = tocado[i] === 1
      // Teto de deslocamento: sem ele, um patógeno grande atravessando arremessa
      // a célula para longe e a multidão vira explosão.
      const teto = c.r + 4
      let tx = desX[i]!
      let ty = desY[i]!
      const tl = Math.sqrt(tx * tx + ty * ty)
      if (tl > teto) {
        tx = (tx / tl) * teto
        ty = (ty / tl) * teto
      }
      const taxa = empurrada ? 0.5 : 0.09
      const ox = offX[i]! + (tx - offX[i]!) * taxa
      const oy = offY[i]! + (ty - offY[i]!) * taxa
      offX[i] = Math.abs(ox) < 0.02 ? 0 : ox
      offY[i] = Math.abs(oy) < 0.02 ? 0 : oy

      const ph = cellPhase[i]!
      const ex = wrapMod(c.hx + 8 + fx, SPAN) - 8 + ox + wob[ph]!
      const ey = c.hy + oy + wobY[ph]!
      const sp = bloodSprites[i]!
      sp.position.set(Math.round(ex), Math.round(ey))

      /*
       * A necrose segue o TILE, não a célula: a hemácia escurece ao entrar na
       * região tomada e clareia ao sair. Com a corrente isso ganhou sentido
       * sozinho — o sangue passa pela zona doente e adoece na passagem.
       */
      const tc = ex < 0 ? 0 : ex >= tuning.arena.width ? tuning.field.cols - 1 : Math.floor(ex / tileWf)
      const tr = ey < 0 ? 0 : ey >= tuning.arena.height ? tuning.field.rows - 1 : Math.floor(ey / tileHf)
      const inf = cur.field[tr * tuning.field.cols + tc]!
      const lv = inf < maxInf * 0.34 ? 0 : inf < maxInf * 0.72 ? 1 : 2
      if (cellLevel[i] === lv) continue
      cellLevel[i] = lv
      sp.texture = atlas.blood[lv]![c.variant]!
    }
  }

  const drawTissue = (cur: SimState): void => {
    const max = tuning.field.maxInfection
    for (let i = 0; i < tiles.length; i++) {
      // 0 = sadio e cheio de hemácias; o último nível = plasma vazio. A arena
      // vazia que o jogo tinha até 01/08 é, literalmente, o estado infectado.
      const inf = cur.field[i]!
      const lv = inf === 0 ? 0 : Math.min(LEVELS - 1, 1 + Math.floor((inf * (LEVELS - 1)) / (max + 1)))
      /*
       * CICATRIZ ou colônia — e o corte é METADE, não um número de tuning.
       *
       * O tile é misto: parte infecção viva, parte necrose. Quando a cicatriz
       * já responde por metade do que há ali, o tile passa a LER como morto.
       * Metade é regra, não balanceamento — é o tipo de corte sem número que o
       * H prefere, e muda de estado num ponto que o jogador consegue prever.
       *
       * `tileLevel` guarda nível E estado no mesmo número (negativo = cicatriz)
       * porque o cache existe para evitar trocar textura à toa, e um cache que
       * ignora metade da chave devolve a textura errada quando só o estado muda.
       */
      const morto = inf > 0 && cur.necrose[i]! * 2 >= inf
      const chave = morto ? -lv - 1 : lv
      if (tileLevel[i] === chave) continue
      tileLevel[i] = chave
      const folha = morto ? atlas.necrose : atlas.colony
      tiles[i]!.texture = folha[lv]![(i * 7 + Math.floor(i / 32) * 3) % VARIANTS]!
    }
  }

  /** Barra de N segmentos. Segmento discreto lê melhor que barra contínua. */
  const segBar = (
    x: number,
    y: number,
    w: number,
    h: number,
    frac: number,
    segs: number,
    on: number,
    off: number,
  ): void => {
    const sw = Math.floor(w / segs)
    const lit = Math.round(Math.max(0, Math.min(1, frac)) * segs)
    for (let i = 0; i < segs; i++) {
      hudBars.rect(x + i * sw, y, sw - 1, h).fill(col(i < lit ? on : off))
    }
  }

  /**
   * As HABILIDADES no HUD: ícone e barra em PÍLULA. 14/08, desenho do H.
   *
   * "Um ícone com a progressão de ativação, e uma barra de progresso em formato
   * de pill abaixo" — as palavras dele. A pílula é a peça que faz a espera ser
   * legível de relance: um anel diria a mesma coisa e obrigaria a estimar
   * ângulo, e o que se quer saber aqui é "falta muito?", não "quanto exatamente".
   *
   * Só as COMPRADAS ocupam lugar, e a fileira é fechada. Espaço vazio reservado
   * anunciaria uma habilidade que não dá para acionar — e a mesma regra vale no
   * `iconeEm` da sim, senão o dedo acertaria um slot que o olho não vê.
   *
   * ATIVA inverte o sentido da pílula: cheia ao ligar, esvaziando com o efeito.
   * É a mesma barra dizendo as duas coisas que importam em momentos diferentes
   * — quanto falta para poder, e quanto falta para acabar.
   */
  const drawHabilidades = (cur: SimState): void => {
    const r = tuning.hud.habRaio
    const py = tuning.hud.habY + r + 5
    let slot = 0
    for (let i = 0; i < cur.habilidades.length; i++) {
      const h = cur.habilidades[i]!
      if (h.nivel <= 0) continue
      const spec = tuning.habilidades[i]
      const nv = spec?.niveis[Math.min(h.nivel - 1, spec.niveis.length - 1)]
      const cx = tuning.hud.habX + slot * tuning.hud.habStep
      const cor = col(HAB_COR[spec?.id ?? ""] ?? WHITE)
      const cheia = nv !== undefined && h.carga >= nv.recarga
      const ativa = h.ativa > 0

      // O corpo do ícone: cheio quando dá para usar, oco quando não dá. É a
      // leitura mais rápida que existe, e não depende de ler a barra.
      hudBars.circle(cx, tuning.hud.habY, r).fill({ color: col(INK), alpha: 0.75 })
      if (cheia || ativa) hudBars.circle(cx, tuning.hud.habY, r - 3).fill({ color: cor, alpha: ativa ? 0.95 : 0.7 })
      hudBars
        .circle(cx, tuning.hud.habY, r)
        .stroke({ width: 1, color: cor, alpha: cheia || ativa ? 0.95 : 0.45 })
      // O número da tecla, no canto: o H pediu 1..5, e a tecla tem que estar
      // onde a mão procura — junto do que ela aciona.
      habTeclas[slot]!.set(`${i + 1}`, cheia || ativa ? WHITE : NUC2, cx + r - 1, tuning.hud.habY - r - 1, 1, true, true)

      // A PÍLULA. Fundo sempre, preenchimento pela fração.
      const pw = tuning.hud.habStep - 10
      const px = cx - pw / 2
      const frac =
        nv === undefined
          ? 0
          : ativa
            ? h.ativa / Math.round(nv.duracao * tuning.sim.hz)
            : Math.min(1, h.carga / nv.recarga)
      hudBars.roundRect(px, py, pw, 4, 2).fill({ color: col(INK), alpha: 0.8 })
      if (frac > 0) {
        hudBars
          .roundRect(px, py, Math.max(2, Math.round(pw * frac)), 4, 2)
          .fill({ color: cor, alpha: ativa ? 0.95 : 0.75 })
      }
      slot++
    }
    for (let k = slot; k < habTeclas.length; k++) habTeclas[k]!.hide()
  }

  /**
   * A CÂMERA LENTA, evidente e com prazo — chamada do H em 14/08.
   *
   * "Alguma animação que evidencie que ele está em câmera lenta e que ele tem
   * um tempo limitado nesse estado." São duas informações, e elas pedem peças
   * diferentes:
   *
   * - QUE ESTÁ: uma moldura ciano pulsando na borda da arena. Borda porque é a
   *   única região da tela que não disputa espaço com o jogo — véu por cima
   *   apagaria justamente o que a câmera lenta existe para deixar você ver.
   *   Ciano porque é a cor que o corpo do jogador já usa para dizer relógio.
   * - QUANTO FALTA: a moldura ENCOLHE pelas bordas conforme o prazo corre, e há
   *   uma barra no alto que drena. Duas leituras do mesmo número, uma
   *   periférica e uma direta: a moldura você vê sem olhar, a barra você
   *   confere quando quer.
   *
   * O pulso corre no relógio de PAREDE. Um aviso de que o tempo está lento não
   * pode ficar lento junto — ficaria quase parado, que é o oposto de evidente.
   *
   * Qual habilidade é "a que freia" sai do DADO (`escala < 1`), e não do nome:
   * a segunda habilidade de tempo que aparecer acende esta moldura sozinha.
   */
  const drawLento = (cur: SimState): void => {
    lentoLayer.clear()
    let resta = 0
    let total = 1
    for (let i = 0; i < cur.habilidades.length; i++) {
      const h = cur.habilidades[i]!
      if (h.ativa <= 0) continue
      const spec = tuning.habilidades[i]
      const nv = spec?.niveis[Math.min(h.nivel - 1, spec.niveis.length - 1)]
      if (nv === undefined || nv.escala >= 1) continue
      resta = h.ativa
      total = Math.max(1, Math.round(nv.duracao * tuning.sim.hz))
    }
    if (resta <= 0) return

    const frac = Math.min(1, resta / total)
    const W = tuning.arena.width
    const H = tuning.arena.height
    const cor = col(FAST1)
    // Pulsa entre 2 e 4px: fino demais some no upscale, grosso demais come a
    // arena. E o pulso é o que separa "moldura" de "borda desenhada".
    const esp = 3 + Math.round(1 + Math.sin(selfClock * 7))
    lentoLayer
      .rect(0, 0, W, esp)
      .rect(0, H - esp, W, esp)
      .rect(0, 0, esp, H)
      .rect(W - esp, 0, esp, H)
      .fill({ color: cor, alpha: 0.5 + 0.18 * Math.sin(selfClock * 7) })
    /*
     * Um HALO interno some para dentro: a borda não é uma linha, é a tela
     * inteira sendo apertada.
     *
     * Duas faixas finas logo depois da moldura, cada vez mais fracas. Custa dois
     * retângulos e é o que separa "desenharam uma borda" de "alguma coisa está
     * acontecendo com o quadro" — que é o que o H pediu ao dizer EVIDENCIE.
     */
    for (let k = 1; k <= 3; k++) {
      const o = esp + k * 3
      lentoLayer
        .rect(o, o, W - o * 2, 1)
        .rect(o, H - o - 1, W - o * 2, 1)
        .rect(o, o, 1, H - o * 2)
        .rect(W - o - 1, o, 1, H - o * 2)
        .fill({ color: cor, alpha: (0.22 - k * 0.05) * (0.7 + 0.3 * Math.sin(selfClock * 7)) })
    }

    /*
     * Os CANTOS encolhem com o prazo: cheios no começo, ausentes no fim.
     *
     * É a leitura periférica — o olho pega comprimento de canto sem precisar
     * ler nada, e quatro cantos encurtando dizem "acabando" antes de qualquer
     * barra ser consultada.
     */
    const perna = Math.round(Math.min(W, H) * 0.22 * frac)
    if (perna > 0) {
      const g = 3
      lentoLayer
        .rect(0, 0, perna, g).rect(0, 0, g, perna)
        .rect(W - perna, 0, perna, g).rect(W - g, 0, g, perna)
        .rect(0, H - g, perna, g).rect(0, H - perna, g, perna)
        .rect(W - perna, H - g, perna, g).rect(W - g, H - perna, g, perna)
        .fill({ color: cor, alpha: 0.85 })
    }

    // A barra que drena, no alto, abaixo da faixa do HUD.
    const bw = Math.round(W * 0.5)
    const bx = Math.round((W - bw) / 2)
    lentoLayer.rect(bx, 16, bw, 3).fill({ color: col(INK), alpha: 0.7 })
    lentoLayer
      .rect(bx, 16, Math.max(1, Math.round(bw * frac)), 3)
      .fill({ color: cor, alpha: 0.95 })
  }

  const drawHud = (cur: SimState, dt: number): void => {
    buildDots.clear()
    hudBars.clear()
    drawHabilidades(cur)
    drawLento(cur)

    for (let i = 0; i < Math.max(0, cur.lives); i++) {
      hudBars.rect(tuning.arena.width - 11 - i * 7, 6, 5, 5).fill(col(WHITE))
    }
    for (let i = 0; i < cur.shields; i++) {
      hudBars
        .rect(tuning.arena.width - 11 - (cur.lives + i) * 7, 6, 5, 5)
        .fill(col(SHI1))
    }

    const max = tuning.field.maxInfection
    const teto = tuning.field.cols * tuning.field.rows * max
    const infFrac = cur.infection / teto
    /*
     * `ONDA 3/10` e não `FASE 1·3`.
     *
     * O rótulo antigo tinha dois contadores porque havia duas hierarquias —
     * cinco doenças, quatro ondas cada. Com uma doença e dez ondas o
     * `phaseIndex` é sempre 1 e sobra ruído, e o `round` sozinho não diz quanto
     * falta. O denominador é o que transforma o número em PROGRESSO: sem ele o
     * jogador não sabe se está na metade ou no começo.
     */
    const total = tuning.phases[Math.min(cur.phaseIndex, tuning.phases.length - 1)]!.waves
    // Com sombra: o HUD fica em cima da arena desde 05/08 (a tela preenchida
    // tirou a tarja preta), e ali o tecido vai de quase branco a quase preto ao
    // longo de uma run. Nenhuma cor chapada é legível contra as duas pontas.
    waveLabel.set(
      `ONDA ${cur.round}/${total}   INFECÇÃO ${Math.ceil(infFrac * 100)}%`,
      infFrac > tuning.field.loseFraction * 0.7 ? HURT1 : WHITE,
      tuning.arena.width / 2,
      4,
      1,
      true,
      true,
    )
    /*
     * Cota centrada e curta, não uma faixa de ponta a ponta.
     *
     * Em largura cheia e em dourado claro ela virava a coisa mais brilhante da
     * tela, acima do jogador e dos patógenos. Barra de ponta a ponta é reservada
     * para o relógio, lá embaixo — é a única informação que merece esse peso.
     */
    /*
     * A barra da infecção enche para a ESQUERDA a partir do centro conforme você
     * cura, e para a direita conforme a doença ganha. Zero é vitória da fase; o
     * limite de perda está marcado, para o jogador ver de quanto é a folga.
     */
    segBar(
      tuning.arena.width / 2 - 100,
      16,
      200,
      2,
      infFrac / tuning.field.loseFraction,
      20,
      infFrac > tuning.field.loseFraction * 0.7 ? HURT1 : ORG2,
      DIM1,
    )

    /*
     * A barra do relógio. Não é decoração: é o único lugar onde o jogador vê
     * quanto tempo de MUNDO está comprando com a própria velocidade. Fica no
     * rodapé, ocupando a largura toda, porque é o número mais importante da tela.
     *
     * SOME com a dilatação desligada, e sumir é o certo. Ela mede uma grandeza
     * que passou a ser constante: 32 segmentos acesos a run inteira não são
     * informação, são uma barra cheia mentindo que algo está sendo comprado. Um
     * mostrador que nunca se move ensina ao jogador que não há nada ali para
     * olhar — e quando o H religar o relógio, ela volta sozinha.
     */
    if (tuning.time.dilation) {
      segBar(
        6,
        tuning.arena.height - 7,
        tuning.arena.width - 12,
        3,
        Math.min(1, cur.worldScale),
        32,
        FAST1,
        DIM0,
      )
    }

    const cd =
      cur.player.dashCooldown > 0 ? 1 - cur.player.dashCooldown / tuning.dash.cooldownTicks : 1
    segBar(tuning.arena.width / 2 - 24, tuning.arena.height - 13, 48, 2, cd, 8, cd >= 1 ? WHITE : DIM0, DIM0)

    if (cur.combo > 1) {
      const tier = Math.min(COMBO_TIERS.length - 1, Math.floor((cur.combo - 1) / 3))
      segBar(
        tuning.arena.width / 2 - 30,
        22,
        60,
        2,
        cur.comboTicks / tuning.powers.comboWindowTicks,
        12,
        COMBO_TIERS[tier]!,
        DIM0,
      )
    }

    /*
     * O BUILD na tela, cada poder na cor dele.
     *
     * Era uma linha cinza única e o H não a via ("eu poderia ver na tela quais
     * powerups estão habilitados"). Em cor própria, o mesmo pixel que o efeito
     * usa em campo, ela vira leitura de relance em vez de texto de rodapé.
     */
    let bx = 6
    for (let i = 0; i < buildLabels.length; i++) {
      const id = cur.buildOrder[i]
      if (id === undefined) {
        buildLabels[i]!.hide()
        continue
      }
      const w = buildLabels[i]!.set(
        POWERS[id]!.name,
        WHITE,
        bx,
        tuning.arena.height - 22,
        1,
      )
      buildDots.circle(bx - 4, tuning.arena.height - 18, 2).fill({ color: POWERS[id]!.color })
      bx += w + 14
    }
    // `buildLabel` era a linha cinza única; o build agora tem rótulo por poder.
    buildLabel.hide()

    /*
     * PONTUAÇÃO com multiplicador vivo, no canto direito.
     *
     * Pedido do H: "estímulo sensorial de que está indo bem", com MegaBonk como
     * referência. O que dá estímulo não é o placar, é o MULTIPLICADOR — número
     * que só sobe é contabilidade; número que sobe mais rápido quando você
     * encadeia é recompensa. Por isso os dois aparecem juntos, e o
     * multiplicador herda a cor do escalão de combo que já existia.
     */
    /*
     * A pontuação REAGE: pulsa no abate e cresce com o multiplicador.
     *
     * Pedido do H: "quando mantenho um streak ela pisca e cresce, o
     * multiplicador deveria estar enfatizado nela". Placar parado é
     * contabilidade; placar que responde ao gesto é recompensa — e o pulso
     * decai em tempo REAL de propósito, porque é feedback para VOCÊ, não para
     * o mundo, e o mundo está devagar justamente quando você está parada.
     */
    const mult = 1 + Math.floor(cur.combo / 3)
    const tier = Math.min(COMBO_TIERS.length - 1, Math.max(0, Math.floor((cur.combo - 1) / 3)))
    if (cur.score > prevScore) scorePulse = 1
    prevScore = cur.score
    scorePulse = Math.max(0, scorePulse - dt * 3.2)

    // Uma linha ABAIXO das vidas: a 4 a pontuação colidia com os quadradinhos,
    // e só a captura mostrou.
    const grande = scorePulse > 0.45 || mult > 1
    const escala = grande ? 2 : 1
    const cor = mult > 1 ? COMBO_TIERS[tier]! : scorePulse > 0.45 ? GLD2 : WHITE
    // Pontuação e multiplicador também moram na arena, e o multiplicador é o
    // que mais brilha por desenho — sem contorno ele se dissolve contra tecido
    // claro justamente no momento em que existe para ser visto.
    scoreLabel.set(
      String(cur.score).padStart(6, "0"),
      cor,
      tuning.arena.width - 6 - 6 * 7 * escala,
      18,
      escala,
      false,
      true,
    )
    if (mult > 1) {
      multLabel.set(
        `${mult}×`,
        COMBO_TIERS[tier]!,
        tuning.arena.width - 6 - 3 * 7 * (scorePulse > 0.3 ? 3 : 2),
        18 + 16 * escala,
        scorePulse > 0.3 ? 3 : 2,
        false,
        true,
      )
    } else {
      multLabel.hide()
    }
  }

  const drawCard = (cur: SimState, phase: number): void => {
    const cx = tuning.arena.width / 2
    const cy = tuning.arena.height / 2
    const spec = tuning.phases[Math.min(cur.phaseIndex, tuning.phases.length - 1)]!
    const kind = tuning.enemy.kinds[spec.disease]
    const sheet = atlas.pathogens.get(spec.disease)
    const tint = col(KIND_TINT[spec.disease] ?? WHITE)

    /*
     * MOLDURA. O card vira card de verdade em vez de texto solto no tecido.
     *
     * O H apontou em 02/08 que "ESPAÇO PRA COMEÇAR" mal era visto — o fundo da
     * fase é vermelho inteiro e o texto sumia. A saída não é escurecer a tela
     * toda: isso mataria "a fase acontece DENTRO do corpo", que é a regra mais
     * cara deste projeto. É dar CHÃO ao texto e manter o organismo em volta.
     *
     * A moldura leva a cor do próprio patógeno, a mesma que ele usa em campo —
     * então a apresentação já ensina a reconhecer a doença pela cor antes de
     * você ver a primeira.
     */
    const W = 264
    const H = 208
    const x0 = Math.round(cx - W / 2)
    const y0 = Math.round(cy - H / 2 - 8)
    rewardPanels
      .clear()
      .rect(x0, y0, W, H)
      .fill({ color: col(INK), alpha: 0.94 })
      .stroke({ width: 1, color: tint, alignment: 0 })
      .rect(x0, y0, W, 18)
      .fill({ color: tint, alpha: 0.22 })

    /*
     * O cabeçalho diz o TAMANHO da luta, não um índice.
     *
     * Era `FASE ${phaseIndex + 1}` e virou ruído em 13/08: com uma doença na
     * lista o número é sempre 1, e um contador que não conta é pior que
     * nenhum. `10 ONDAS` é a única coisa que o jogador ainda não sabe ao ver
     * esta tela, e é o que a progressão nova precisa dizer de cara — sem isso
     * ele descobre que a run tem fim só quando ela acaba.
     */
    cardLines[0]!.set(`${spec.waves} ONDAS`, DIM0, cx, y0 + 6, 1, true)

    if (sheet !== undefined) {
      // Cambaleia em 8 direções, como ele faz em campo. Parado no card o bicho
      // vira ilustração; girando, vira bicho.
      const dir = Math.floor(phase * 0.18) & 7
      cardBicho.texture = frameOf(sheet, 0, dir, phase)
      cardBicho.position.set(cx, y0 + 82)
      cardBicho.visible = true
    } else {
      cardBicho.visible = false
    }

    cardLines[1]!.set((kind?.real ?? spec.disease).toUpperCase(), WHITE, cx, y0 + 136, 2, true)
    cardLines[2]!.set((kind?.form ?? "").toUpperCase(), GLD2, cx, y0 + 162, 1, true)
    // Sem estratégia nesta tela. Só a tecla que segue.
    cardLines[3]!.set(cur.cardLock > 0 ? "" : prompt.comecar, WHITE, cx, y0 + 186, 1, true)
  }

  /**
   * O RESPIRO entre ondas. Três segundos, um número grande, e nada para apertar.
   *
   * A tela de recompensa que morava aqui morreu em 13/08 com o formato onda →
   * upgrade. O que entrou não é um menu mais barato — é o oposto de um menu: o
   * tabuleiro da onda seguinte JÁ ESTÁ montado atrás desta contagem, com os
   * focos semeados e os corpos em cena, e os 3 segundos existem para você
   * OLHAR. Por isso o véu aqui é o leve, o mesmo do card de identidade: o de
   * menu (nível 2) escondia justamente o que a contagem serve para mostrar.
   */
  const drawIntervalo = (cur: SimState): void => {
    const cx = tuning.arena.width / 2
    const cy = tuning.arena.height / 2
    const total = tuning.phases[Math.min(cur.phaseIndex, tuning.phases.length - 1)]!.waves
    // Arredonda para CIMA: com 180 ticks o jogador tem que ver 3, 2, 1 — nunca
    // um 0 pendurado, e nunca um 3 que dura um quadro.
    const segundos = Math.max(1, Math.ceil(cur.countdown / tuning.sim.hz))

    /*
     * O bloco todo sobe, para o dígito não cair EM CIMA do jogador.
     *
     * Ele estava em `cy - 34` e o corpo da célula mora em `cy`, com 20px de
     * lado: a 4x o dígito descia até `cy - 6` e os dois se sobrepunham em seis
     * linhas. Na captura isso aparece como um borrão quadriculado sob o número
     * — legível, mas sujo, e sujo por acidente.
     *
     * Subir em vez de escurecer o véu é o que preserva a razão da tela: ela
     * existe para o tabuleiro ser visto, e o jogador é parte do tabuleiro. As
     * três linhas levam SOMBRA pela mesma razão — a resposta do H para a
     * sobreposição foi contorno e cor forte, não véu mais pesado.
     *
     * `CONTIDA` em escala 2, a pedido dele: é a frase que premia a onda que
     * acabou, e ela estava do tamanho de legenda. Em escala 2 são 14px de
     * altura, então ela mora em `cy - 88` e o dígito começa 22px abaixo.
     */
    rewardPanels.clear()
    cardLines[0]!.set(`ONDA ${cur.round - 1} CONTIDA`, GLD2, cx, cy - 88, 2, true, true)
    cardLines[1]!.set(String(segundos), WHITE, cx, cy - 52, 4, true, true)
    cardLines[2]!.set(`ONDA ${cur.round} DE ${total}`, SHI1, cx, cy + 30, 2, true, true)
    cardLines[3]!.hide()
  }

  /**
   * FECHAMENTO da doença — e hoje, com uma doença na lista, a VITÓRIA da run.
   *
   * O H apontou em 02/08 que oferecer poder depois da última onda não faz
   * sentido: a fase acabou, não há próxima onda para se preparar. O que cabe é
   * o que a fase produziu. Com as 10 ondas de 13/08 isso passou a ser a única
   * tela do jogo que diz que você GANHOU — até aqui só existia perder.
   */
  const drawClosed = (cur: SimState): void => {
    const cx = tuning.arena.width / 2
    const cy = tuning.arena.height / 2
    const spec = tuning.phases[Math.min(cur.phaseIndex, tuning.phases.length - 1)]!
    const nome = tuning.enemy.kinds[spec.disease]?.real ?? spec.disease
    const tint = col(KIND_TINT[spec.disease] ?? WHITE)

    const W = 300
    const H = 150
    const x0 = Math.round(cx - W / 2)
    const y0 = Math.round(cy - H / 2)
    rewardPanels
      .clear()
      .rect(x0, y0, W, H)
      .fill({ color: col(INK), alpha: 0.96 })
      .stroke({ width: 1, color: tint, alignment: 0 })
      .rect(x0, y0, W, 18)
      .fill({ color: tint, alpha: 0.22 })

    cardLines[0]!.set(`${nome} CONTIDA`.toUpperCase(), WHITE, cx, y0 + 6, 1, true)
    cardLines[1]!.set(`${cur.score} PONTOS`, GLD2, cx, y0 + 34, 2, true)
    cardLines[2]!.set(
      `${cur.kills} PATÓGENOS · ${spec.waves} ONDAS · MULT ${cur.bestMult}×`,
      DIM0,
      cx,
      y0 + 66,
      1,
      true,
    )
    cardLines[3]!.set("O ORGANISMO SEGUE DE PÉ", GLD2, cx, y0 + 92, 1, true)
    cardPicks[0]!.set(cur.cardLock > 0 ? "" : prompt.outra, WHITE, cx, y0 + 122, 1, true)
    cardPicks[1]!.hide()
    cardPicks[2]!.hide()
    for (const l of cardBlurbs) l.hide()
    for (const l of cardCusto) l.hide()
    cardBlurb.hide()
  }

  /**
   * A tela do HUB — e ela agora é quase VAZIA, de propósito.
   *
   * Enquanto o hub era um menu, tudo morava aqui: memória, vilão, prompt. Com o
   * cérebro navegável, a escolha ganhou tela própria e o que sobra é o mínimo
   * para orientar quem está ANDANDO: quanto você guardou, e o nome do que está
   * girando no meio da sala.
   *
   * Menos texto não é menos tela. É a diferença entre um lugar e um formulário.
   */
  const drawHub = (cur: SimState): void => {
    const cx = tuning.arena.width / 2
    rewardPanels.clear()

    /*
     * A MEMÓRIA perdeu as palavras e ficou só o número — chamada do H em 13/08.
     *
     * Ele achou a legenda desnecessária, e ele está certo pelo motivo que vale:
     * uma moeda desenhada ao lado de um número não precisa de alguém explicando
     * que aquilo é a moeda. Texto que repete o desenho não informa, ocupa. A
     * mesma tesoura levou o "leve o glóbulo até a órbita" do rodapé.
     *
     * O que ficou é DADO, não mensagem: quanto você tem. Isso a tela não diz
     * sozinha, então continua escrito.
     */
    rewardPanels.rect(cx - 40, 8, 80, 22).fill({ color: col(INK), alpha: 0.8 })
    cardLines[0]!.set(`${cur.bank}`, GLD2, cx + 10, 11, 2, true, true)
    hubCoin.texture = frameOf(atlas.coin, 0, 0, Math.floor(selfClock * 8))
    hubCoin.position.set(Math.round(cx - 14), 19)
    hubCoin.visible = true

    /*
     * As CINCO PORTAS, desenhadas pela mesma regra — pedido do H em 13/08.
     *
     * Um laço só para a órbita e as quatro novas, e não um bloco por porta: elas
     * SÃO a mesma coisa vista de fora (um alvo que se abre ao chegar ou ao
     * clicar), e desenhá-las com códigos diferentes seria a primeira chance de
     * elas passarem a se comportar diferente sem ninguém decidir isso.
     *
     * A órbita entra na lista com o desenho extra dela — os patógenos girando —
     * feito à parte, no `drawBrain`. O que ela divide com as outras é o anel de
     * gatilho, o rótulo e o pulso de proximidade.
     */
    /*
     * O afastamento do rótulo é POR PORTA, e não um número só.
     *
     * A órbita tem cinco corpos girando no raio dela, e sprite de patógeno
     * transborda o raio — com o afastamento das outras quatro, o rótulo saía
     * debaixo da E. coli. As quatro novas não têm nada girando, então o vão
     * delas é só o do próprio anel.
     */
    const portas: ReadonlyArray<readonly [number, number, string, number]> = [
      [
        tuning.hub.orbitX,
        tuning.hub.orbitY,
        "COMBATER PATÓGENOS",
        tuning.hub.orbitRadius + tuning.enemy.size,
      ],
      ...tuning.hub.nodes.map(
        (n) =>
          [n.x, n.y, PORTA_NOME[n.id] ?? n.id.toUpperCase(), tuning.hub.nodeRadius + 6] as const,
      ),
    ]
    for (let i = 0; i < portas.length; i++) {
      const [nx, ny, nome, vao] = portas[i]!
      const w = textWidth(nome.toUpperCase()) + 8
      // O rótulo fica ABAIXO da porta, e o da órbita também. Ele ficava acima
      // enquanto a órbita era grande e o texto teria que atravessá-la; com o
      // alvo reduzido a 26px o de cima passou a colidir com a faixa da memória.
      const ly = ny + vao
      rewardPanels.rect(Math.round(nx - w / 2), ly - 2, w, 12).fill({ color: col(INK), alpha: 0.78 })
      hubLabels[i]!.set(nome, GLD2, nx, ly, 1, true, true)
    }
    for (let i = portas.length; i < hubLabels.length; i++) hubLabels[i]!.hide()

    cardLines[1]!.hide()
    cardLines[2]!.hide()
    cardLines[3]!.hide()
    cardPicks[0]!.hide()
    cardPicks[1]!.hide()
    cardPicks[2]!.hide()
    cardBicho.visible = false
    for (const l of cardBlurbs) l.hide()
    for (const l of cardCusto) l.hide()
    cardBlurb.hide()
  }

  /**
   * O QUADRO comum das telas do cérebro, com o [X] no canto.
   *
   * A geometria vem do `tuning.hub` e não de constantes daqui porque a SIM usa
   * a mesma para decidir o que é "clicar fora". Duas cópias — uma que desenha e
   * outra que decide — divergiriam na primeira mudança de layout, e o sintoma
   * seria o pior possível: o clique fechando onde ainda há painel desenhado.
   */
  const quadro = (tint: number): { x0: number; y0: number; w: number; h: number } => {
    const w = tuning.hub.panelW
    const h = tuning.hub.panelH
    const x0 = Math.round((tuning.arena.width - w) / 2)
    const y0 = Math.round((tuning.arena.height - h) / 2)
    const c = tuning.hub.closeSize
    rewardPanels
      .clear()
      .rect(x0, y0, w, h)
      .fill({ color: col(INK), alpha: 0.95 })
      .stroke({ width: 1, color: tint, alignment: 0 })
      .rect(x0, y0, w, 16)
      .fill({ color: tint, alpha: 0.24 })
      // O [X], desenhado como duas diagonais e não como a letra: a fonte tem X,
      // mas a letra lê como texto e este é um botão.
      .rect(x0 + w - c, y0, c, c)
      .fill({ color: col(INK), alpha: 0.9 })
      .stroke({ width: 1, color: tint, alignment: 0 })
    /*
     * As diagonais são QUADRADO A QUADRADO, e não duas linhas com `stroke`.
     *
     * A primeira versão era `moveTo/lineTo/stroke` e saiu uma caixa VAZIA — a
     * moldura apareceu, o X não. Não fui atrás de por quê: num arquivo onde a
     * regra é grade de pixel, uma diagonal de 4px pedida a um traçador vetorial
     * é a construção errada antes de ser a construção que falhou. Pôr o pixel
     * onde ele vai ficar não tem como sair diferente do que se pediu.
     */
    const bx = x0 + w - c
    for (let i = 0; i < c - 6; i++) {
      rewardPanels
        .rect(bx + 3 + i, y0 + 3 + i, 1, 1)
        .rect(bx + c - 4 - i, y0 + 3 + i, 1, 1)
        .fill({ color: col(WHITE), alpha: 0.9 })
    }
    return { x0, y0, w, h }
  }

  /**
   * As QUATRO portas novas — histórico, inventário, upgrades e modo pandemia.
   *
   * O H pediu os cinco LUGARES e nomeou cada um; o que vai DENTRO de quatro
   * deles ele ainda não desenhou. Então cada tela mostra o que hoje é verdade —
   * e só isso. Inventar conteúdo aqui seria decidir por ele quatro
   * funcionalidades de uma vez, que é exatamente o que o `CLAUDE.md` §4 proíbe.
   *
   * Números vêm do estado real onde existe estado real: runs terminadas e
   * memória acumulada são fatos hoje. Onde não há fato, a tela diz que não há,
   * em vez de encher com número inventado — placeholder que mente é pior que
   * placeholder que se assume.
   */
  /**
   * A LOJA dentro do painel de upgrades — 14/08, duas habilidades a 500.
   *
   * Uma linha por habilidade, na MESMA geometria que a sim usa para decidir o
   * que o clique comprou (`hub.rowTop`, `hub.rowH`). É a regra de ontem
   * aplicada de novo: layout que responde a input não é decoração, e duas
   * cópias divergem na primeira mudança — aqui o sintoma seria comprar a linha
   * de cima da que está desenhada, que é dinheiro do jogador.
   *
   * O preço vira "COMPRADA" quando já é dele, e apaga quando não dá para pagar.
   * Três estados na mesma linha, sem texto extra explicando nenhum deles.
   */
  const desenhaLoja = (cur: SimState, x0: number, y0: number): void => {
    for (let i = 0; i < lojaLinhas.length; i++) {
      const spec = tuning.habilidades[i]
      const h = cur.habilidades[i]
      if (spec === undefined || h === undefined) {
        lojaLinhas[i]!.hide()
        lojaPrecos[i]!.hide()
        continue
      }
      const cor = col(HAB_COR[spec.id] ?? WHITE)
      const ry = y0 + tuning.hub.rowTop + i * tuning.hub.rowH
      const tem = h.nivel > 0
      const paga = cur.bank >= spec.custo
      rewardPanels
        .rect(x0 + 6, ry, tuning.hub.panelW - 12, tuning.hub.rowH - 4)
        .fill({ color: cor, alpha: tem ? 0.16 : 0.07 })
      // O ponto colorido é o mesmo ícone do HUD, em miniatura: o que se compra
      // aqui é o que aparece lá, e a ligação não precisa de legenda.
      rewardPanels.circle(x0 + 18, ry + 11, 5).fill({ color: cor, alpha: tem ? 0.95 : 0.5 })
      lojaLinhas[i]!.set(HAB_NOME[spec.id] ?? spec.id.toUpperCase(), tem ? WHITE : NUC2, x0 + 30, ry + 5, 1)
      /*
       * O preço é alinhado à DIREITA, e isso é feito na mão porque `Label` só
       * sabe alinhar à esquerda ou centralizar.
       *
       * A primeira versão passava a borda como x e o texto saía POR FORA do
       * painel — "500" virava "50" com o zero na multidão de neurônios. Preço
       * cortado num botão de compra é a pior classe de defeito de tela que
       * existe: ele não parece quebrado, parece outro preço.
       */
      const txt = tem ? "NÍVEL 1" : `${spec.custo}`
      lojaPrecos[i]!.set(
        txt,
        tem ? SHI1 : paga ? GLD2 : DIM0,
        x0 + tuning.hub.panelW - 10 - textWidth(txt),
        ry + 5,
        1,
      )
      lojaBlurbs[i]!.set(HAB_BLURB[spec.id] ?? "", DIM1, x0 + 30, ry + 17, 1)
    }
  }

  const drawPainel = (cur: SimState): void => {
    const node = tuning.hub.nodes[cur.painel]
    const id = node?.id ?? ""
    const tint = col(PORTA_COR[id] ?? NUC2)
    const { x0, y0, w } = quadro(tint)
    const cxq = x0 + w / 2
    hubCoin.visible = false
    cardBicho.visible = false
    for (const l of hubLabels) l.hide()

    cardLines[0]!.set(PORTA_NOME[id] ?? id.toUpperCase(), GLD2, cxq, y0 + 5, 1, true)

    /*
     * Dois arranjos, e a escolha é do CONTEÚDO e não da tela.
     *
     * LISTA: uma coluna de iguais, nenhuma linha maior que as outras. É o
     * histórico, onde cada linha é uma run e nenhuma vale mais que a vizinha.
     * DESTAQUE: existe um número que é a RESPOSTA — quanto de memória, qual o
     * estado — e as outras linhas o explicam.
     *
     * A tela declara qual ela é, em `PORTA_LISTA`. A primeira versão inferia
     * pela contagem de linhas ("mais de três vira lista") e quebrava no caso
     * mais comum que existe: com duas runs, a primeira saía grande e a segunda
     * pequena, como se uma valesse mais que a outra.
     */
    const linhas = PORTA_CORPO[id]?.(cur) ?? []
    const lista = PORTA_LISTA[id] === true
    for (let i = 0; i < painelLinhas.length; i++) {
      const t = linhas[i]
      if (t === undefined) {
        painelLinhas[i]!.hide()
        continue
      }
      if (lista) painelLinhas[i]!.set(t, i === 0 ? WHITE : NUC2, cxq, y0 + 42 + i * 20, 1, true)
      else {
        /*
         * O destaque é escala 2 (14px de altura), então a primeira linha de
         * apoio começa DEPOIS dele e não numa progressão que passa por cima.
         *
         * A primeira versão usava `40 + i * 26` para i>=1, o que dava 66 contra
         * um destaque em 56..70: as duas linhas saíram uma dentro da outra na
         * captura do inventário. Erro de aritmética meu, e do tipo que só a
         * imagem pega — o texto estava certo, o número estava certo, e o
         * resultado era ilegível.
         */
        painelLinhas[i]!.set(
          t,
          i === 0 ? WHITE : NUC2,
          cxq,
          y0 + (i === 0 ? 52 : 78 + (i - 1) * 20),
          i === 0 ? 2 : 1,
          true,
        )
      }
    }
    /*
     * A MOEDA desenhada nos upgrades — pedido do H: "manter apenas a moeda e o
     * valor acumulado".
     *
     * Mesma peça que fica na faixa do cérebro e que cai no chão da arena. O
     * jogador vê o mesmo objeto nos três lugares, e a ligação entre juntar,
     * acumular e gastar não precisa de uma palavra.
     */
    if (node?.loja === true) {
      /*
       * Na LOJA o saldo é uma linha fina no topo, e não o destaque grande.
       *
       * O destaque é para telas em que o número É a resposta; aqui a resposta
       * são os itens, e o saldo é a condição para comprá-los. Na primeira
       * versão ele saiu em escala 2 no meio do quadro e a primeira linha da
       * loja passou por cima dele — dois textos disputando as mesmas fileiras,
       * pela quarta vez nesta tela.
       */
      for (const l of painelLinhas) l.hide()
      const saldo = `${cur.bank}`
      hubCoin.texture = frameOf(atlas.coin, 0, 0, Math.floor(selfClock * 8))
      hubCoin.position.set(Math.round(cxq - textWidth(saldo) / 2 - 9), y0 + 23)
      hubCoin.visible = true
      painelLinhas[0]!.set(saldo, GLD2, cxq + 6, y0 + 20, 1, true)
      desenhaLoja(cur, x0, y0)
    } else {
      for (const l of lojaLinhas) l.hide()
      for (const l of lojaPrecos) l.hide()
      for (const l of lojaBlurbs) l.hide()
    }
    for (const l of cardBlurbs) l.hide()
    cardLines[1]!.hide()
    cardLines[2]!.hide()
    cardLines[3]!.hide()
    // Chão sob o prompt: ele fica FORA do quadro, sobre a multidão, e é a
    // terceira vez hoje que um texto desta tela pede isso.
    const fy = y0 + tuning.hub.panelH + 8
    const fw = textWidth(prompt.fechar.toUpperCase()) + 10
    rewardPanels.rect(Math.round(cxq - fw / 2), fy - 2, fw, 12).fill({ color: col(INK), alpha: 0.8 })
    cardPicks[0]!.set(prompt.fechar, SHI1, cxq, fy, 1, true, true)
    cardPicks[1]!.hide()
    cardPicks[2]!.hide()
    for (const l of cardCusto) l.hide()
    cardBlurb.hide()
  }

  /**
   * A tela de SELEÇÃO, aberta ao entrar na órbita.
   *
   * Painel opaco por cima do cérebro, ao contrário do hub: aqui o jogador PAROU
   * de andar e está decidindo, então a tela pode tomar a frente. É a mesma
   * distinção que separa o card do respiro — quem interrompe um gesto se
   * anuncia; quem acompanha um gesto se afasta.
   */
  const drawSelect = (cur: SimState, phase: number): void => {
    const cx = tuning.arena.width / 2
    const spec = tuning.phases[Math.min(cur.villain, tuning.phases.length - 1)]!
    const kind = tuning.enemy.kinds[spec.disease]
    const sheet = atlas.pathogens.get(spec.disease)
    const tint = col(KIND_TINT[spec.disease] ?? WHITE)

    hubCoin.visible = false
    // MESMO quadro das outras quatro portas, com o mesmo [X]. Ele tinha medidas
    // próprias em constantes locais; virou `tuning.hub` no dia em que a sim
    // passou a decidir por elas o que é "clicar fora".
    const { x0, y0, w: W, h: H } = quadro(tint)
    /*
     * Os dois prompts ficam FORA do painel, sobre a multidão, então levam chão
     * próprio — mesma correção do hub, mesmo motivo. E o "R volta ao cérebro"
     * deixou de ser `DIM0`: aquele vermelho escuro é legível sobre o preto do
     * painel e some sobre neurônio pálido, que é justamente onde ele cai.
     */
    rewardPanels
      .rect(x0, y0 + H + 4, W, 32)
      .fill({ color: col(INK), alpha: 0.78 })

    cardLines[0]!.set("ESCOLHA O INIMIGO", GLD2, cx, y0 + 5, 1, true)
    if (sheet !== undefined) {
      cardBicho.texture = frameOf(sheet, 0, Math.floor(phase * 0.18) & 7, phase)
      cardBicho.position.set(cx, y0 + 64)
      cardBicho.visible = true
    } else {
      cardBicho.visible = false
    }
    cardLines[1]!.set((kind?.real ?? spec.disease).toUpperCase(), WHITE, cx, y0 + 108, 2, true)
    cardLines[2]!.set(`${(kind?.form ?? "").toUpperCase()} · ${spec.waves} ONDAS`, GLD2, cx, y0 + 132, 1, true)
    /*
     * Quantos existem, e onde você está — em pontos, não em setas.
     *
     * Com um patógeno jogável a fileira tem um ponto só, e isso é honesto: diz
     * "há um" em vez de prometer um catálogo com "◄ ►". Quando o segundo entrar,
     * a fileira cresce sozinha e as setas passam a fazer sentido.
     */
    const n = tuning.phases.length
    cardLines[3]!.set(
      n > 1 ? `◄ ${"·".repeat(cur.villain)}●${"·".repeat(n - cur.villain - 1)} ►` : "",
      DIM0,
      cx,
      y0 + 150,
      1,
      true,
    )
    cardPicks[0]!.set(prompt.lutar, SHI1, cx, y0 + H + 8, 1, true, true)
    cardPicks[1]!.set(prompt.voltar, NUC2, cx, y0 + H + 22, 1, true, true)
    cardPicks[2]!.hide()
    for (const l of cardBlurbs) l.hide()
    for (const l of cardCusto) l.hide()
    cardBlurb.hide()
  }

  const drawOverlay = (cur: SimState, phase: number): void => {
    const isHub = cur.phase === "hub"
    const isSelect = cur.phase === "select"
    const isCard = cur.phase === "card"
    const isIntervalo = cur.phase === "intervalo"
    const isClosed = cur.phase === "closed"
    const isPainel = cur.phase === "painel"
    const telaDeCima = isHub || isSelect || isPainel || isCard || isIntervalo || isClosed
    const on = cur.phase === "dead" || telaDeCima
    overlay.visible = on
    cardVeil.visible = telaDeCima
    /*
     * Véu LEVE na apresentação e no intervalo; véu de menu só no fechamento.
     *
     * O de nível 2 existia para separar o menu de recompensa do jogo, senão
     * corpo e patógeno passavam por cima dos painéis. O intervalo herdaria esse
     * véu por ser a mesma tela, e seria o erro exato: ele não tem painel para
     * proteger, e o que ele serve para mostrar é justamente o tabuleiro atrás.
     * Escurecer aqui seria apagar a razão de os 3 segundos existirem.
     */
    // Nem o hub nem a seleção levam véu: o cérebro é a tela, não um fundo a
    // esconder, e a seleção já tem painel opaco próprio.
    cardVeil.visible = telaDeCima && !isHub && !isSelect && !isPainel
    cardVeil.texture = atlas.veil(INK, isClosed ? 2 : 1)
    cardBicho.visible = isCard || isSelect
    hubCoin.visible = isHub
    for (const l of hubLabels) if (!isHub) l.hide()
    for (const l of painelLinhas) if (!isPainel) l.hide()
    if (!isPainel) {
      for (const l of lojaLinhas) l.hide()
      for (const l of lojaPrecos) l.hide()
      for (const l of lojaBlurbs) l.hide()
    }
    for (const l of cardLines) if (!telaDeCima) l.hide()
    if (!isClosed && !isHub && !isSelect && !isPainel) {
      for (const l of cardPicks) l.hide()
      for (const l of cardBlurbs) l.hide()
      for (const l of cardCusto) l.hide()
      cardBlurb.hide()
      if (!isIntervalo) rewardPanels.clear()
    }
    for (const l of deadLines) if (telaDeCima) l.hide()
    deadVeil.visible = cur.phase === "dead"
    if (!on) return
    if (isHub) {
      drawHub(cur)
      return
    }
    if (isSelect) {
      drawSelect(cur, phase)
      return
    }
    if (isPainel) {
      drawPainel(cur)
      return
    }
    if (isCard) {
      drawCard(cur, phase)
      return
    }
    if (isIntervalo) {
      drawIntervalo(cur)
      return
    }
    if (isClosed) {
      drawClosed(cur)
      return
    }
    const cy = tuning.arena.height / 2
    const cx = tuning.arena.width / 2
    /*
     * SOMBRA nas quatro, e o prompt sai do `DIM0`.
     *
     * A captura da morte mostrou "R OU ENTER PRA OUTRA" quase invisível: `DIM0`
     * é 0x7a4450, e o campo no fim de uma run perdida é tecido morto, quase da
     * mesma cor. Texto dim só funciona sobre painel opaco — sobre o organismo
     * ele vira a mesma tinta. Aqui a regra passa a ser: linha desenhada DIRETO
     * no campo leva sombra e cor da rampa clara.
     */
    deadLines[0]!.set(
      cur.lostByTissue ? "O TECIDO MORREU" : "A INFECÇÃO VENCEU",
      HURT1,
      cx,
      cy - 40,
      2,
      true,
      true,
    )
    deadLines[1]!.set(`${cur.score} PONTOS · ${cur.kills} PATÓGENOS`, WHITE, cx, cy - 4, 1, true, true)
    deadLines[2]!.set(
      cur.bestMult > 1 ? `MELHOR MULTIPLICADOR ${cur.bestMult}×` : "",
      GLD2,
      cx,
      cy + 10,
      1,
      true,
      true,
    )
    deadLines[3]!.set(prompt.outra, SHI1, cx, cy + 34, 1, true, true)
  }

  return {
    draw(prev, cur, alpha) {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastFrame) / 1000)
      lastFrame = now
      const frozen = cur.frozen > 0
      const t = frozen ? 0 : alpha

      // Os dois relógios avançam aqui, e só aqui.
      if (!frozen) {
        selfClock += dt
        if (cur.phase === "run") worldClock += dt * cur.worldScale
      }
      const worldPhase = Math.floor(worldClock * 9)

      // ------------------------------------------------------------ eventos
      /*
       * O ESTALO do abate — o "crock" que o H pediu em 13/08.
       *
       * A explosão de partículas já existia e era discreta demais: 8 pontos
       * saindo devagar lêem como poeira, não como fagocitose. O que faltava é o
       * que jogo de ação chama de impacto, e ele é feito de três camadas na
       * mesma posição, não de uma maior:
       *
       * 1. ANEL de choque, que dá borda ao evento — sem ele o abate não tem
       *    silhueta e some contra a colônia;
       * 2. partículas mais rápidas e mais numerosas, na cor do bicho;
       * 3. um tranco de câmera MINÚSCULO, que soma quando os abates vêm juntos.
       *
       * O tranco é 0,9 e não 3 de propósito: numa run boa morrem dezenas de
       * bacilos por minuto, e tranco por abate vira tremor contínuo — o efeito
       * pararia de significar "acertei" e passaria a significar "o jogo está
       * rodando". Ele acumula no `Math.min`, então uma rajada dá um solavanco e
       * um abate solto dá um cutucão.
       *
       * Tudo isto é RENDER: nenhuma linha aqui entra no hash da sim, e é por
       * isso que dá para mexer no feel sem regravar fixture nenhuma. O hitstop,
       * que seria o quarto ingrediente óbvio, ficou de fora justamente por não
       * caber nessa regra — congelar o mundo por 3 quadros é decisão de sim, e
       * com esta cadência de abate deixaria o jogo engasgado.
       */
      const live = new Set(cur.enemies.map((e) => e.id))
      let abatesNoQuadro = 0
      for (const e of prev.enemies) {
        if (!live.has(e.id) && seenIds.has(e.id)) {
          const tint = KIND_TINT[e.kind] ?? WHITE
          burst(e.x, e.y, tint, 12, 3.4)
          abatesNoQuadro++
          impactos.push({ x: e.x, y: e.y, step: 0 })
        }
      }
      if (abatesNoQuadro > 0) {
        shake = Math.max(shake, Math.min(3.2, 0.9 + abatesNoQuadro * 0.5))
      }
      seenIds = live

      /*
       * A ANIMAÇÃO DO ITEM CONSUMIDO, pedida junto com os itens.
       *
       * Lida do carimbo `lastPick*` e não da diferença entre `prev` e `cur`: um
       * quadro lento roda vários ticks da sim, e a cápsula pode nascer e sumir
       * inteira dentro dele. Diferença de estado perde o evento; carimbo não.
       *
       * A onda sai na cor do EFEITO, que é a mesma do item — verde de limo para
       * a supressão, rampa do patógeno para o COMPLEMENTO. É o que fecha o laço
       * que o H desenhou: a bolinha diz o que vai mexer, e a onda mostra
       * mexendo.
       */
      if (cur.lastPickTick > pickVisto && cur.lastPickTick >= cur.tick - 3) {
        pickVisto = cur.lastPickTick
        const doPatogeno = cur.lastPickPower === COMPLEMENTO
        ondas.push({
          x: cur.lastPickX,
          y: cur.lastPickY,
          step: 0,
          patogeno: doPatogeno,
        })
        burst(
          cur.lastPickX,
          cur.lastPickY,
          doPatogeno ? (KIND_TINT[doencaDaFase(cur)] ?? WHITE) : SAL2,
          16,
          3.2,
        )
        shake = Math.max(shake, 2.2)
      }

      if (prevLives >= 0 && cur.lives < prevLives) {
        flash = 1
        shake = 7
        burst(cur.player.x, cur.player.y, HURT1, 18, 3.6)
      }
      prevLives = cur.lives

      if (cur.combo > prevCombo && cur.lastKillTick >= cur.tick - 2) {
        const c = cur.combo
        const tier = Math.min(COMBO_TIERS.length - 1, Math.floor((c - 1) / 3))
        pops.push({
          x: cur.lastKillX,
          y: cur.lastKillY,
          life: 1,
          text: c > 1 ? `${c}×` : "+1",
          // Escala INTEIRA. É o que o console fazia e é o que mantém a grade.
          scale: 1 + Math.min(2, Math.floor(tier / 1.5)),
          idx: COMBO_TIERS[tier]!,
        })
        if (c > 1 && c % 3 === 0) {
          burst(cur.lastKillX, cur.lastKillY, GLD2, 6 + tier * 4, 2 + tier)
          shake = Math.max(shake, 1.5 + tier * 1.2)
        }
      }
      prevCombo = cur.combo

      if (cur.wave > prevWave) {
        /*
         * A comemoração ficou; o TEXTO dela saiu, e a captura é que denunciou.
         *
         * Ele dizia `FASE ${prevWave} CONTIDA` em escala 2 no meio da tela, e
         * até 13/08 isso era seguro: a onda só virava quando você CONFIRMAVA a
         * recompensa, então o aviso flutuava por cima do jogo já recomeçado.
         * Com o respiro, a onda vira no instante da contenção — o aviso passou
         * a nascer exatamente sobre a tela do intervalo, e a captura mostrou
         * três textos empilhados no mesmo lugar dizendo a mesma coisa.
         *
         * Defeito de POSIÇÃO E ORDEM, que é a minha classe (`TASTE.md` §2b):
         * passou por revisão de código e por 124 testes verdes, e só apareceu
         * quando alguém olhou. Consertar movendo seria remendo — quem anuncia a
         * contenção agora é a tela do respiro, que está sempre no mesmo lugar e
         * usa o vocabulário certo. Dois anúncios do mesmo fato é um a mais.
         */
        for (let i = 0; i < 3; i++) {
          burst(tuning.arena.width * (0.25 + i * 0.25), tuning.arena.height / 2, SHI1, 14, 3)
        }
      }
      prevWave = cur.wave

      // ------------------------------------------------------------- fundo
      // Ciclagem de paleta: a corrente escorre mesmo com tudo parado na tela.
      /*
       * O BATIMENTO do organismo.
       *
       * A ciclagem de paleta já existia — quatro variantes do plasma que giram
       * a tabela de cor sem mover geometria. O que entra em 02/08, a pedido do
       * H, é ela seguir a DOENÇA: com o campo limpo o pulso é lento e regular;
       * com o campo tomado ele dispara. Um sistema entrando em colapso tem
       * taquicardia, e o fundo é a única superfície grande o bastante para
       * dizer isso sem competir com o jogo.
       *
       * E não é um giro uniforme: a sístole é curta e a diástole é longa, então
       * o fundo BATE em vez de escorrer. Custo zero — é escolha de índice.
       */
      const teto = tuning.field.cols * tuning.field.rows * tuning.field.maxInfection
      const doente = Math.min(1, cur.infection / (teto * tuning.field.loseFraction))
      const bpm = 0.85 + doente * 2.6
      const batida = (worldClock * bpm) % 1
      const passo = batida < 0.14 ? 1 : batida < 0.26 ? 2 : batida < 0.38 ? 3 : 0
      bgPlasma.texture = atlas.plasma[passo % atlas.plasma.length]!
      if (cur.phase === "run" && !frozen) driftX -= cur.worldScale * dt
      for (const d of drift) {
        /*
         * Duas cópias por camada, sempre a `span` uma da outra.
         *
         * A versão anterior normalizava com `while (x > 0) x -= span` DEPOIS de
         * somar o deslocamento da cópia — o que arrastava a segunda de volta para
         * cima da primeira. As duas caíam no mesmo lugar: o dither dobrava numa
         * metade da tela e a outra metade ficava sem camada, o que aparecia como
         * blocos retangulares no fundo. Aqui o resto vem primeiro e o
         * deslocamento depois, então a cobertura de [0, span) é total.
         */
        const span = tuning.arena.width
        const base = ((((driftX * d.speed) % span) + span) % span) - span
        // Inteiro. Camada de fundo em subpixel treme e denuncia o render.
        d.sprite.position.set(Math.round(base) + d.slot * span, 0)
      }

      // ------------------------------------------------------------- corpos
      const pxi = lerp(prev.player.x, cur.player.x, t)
      const pyi = lerp(prev.player.y, cur.player.y, t)
      // Posição INTERPOLADA, não a do tick: com a do tick a multidão abriria em
      // degraus de 60Hz enquanto o corpo desliza suave.
      /*
       * DOIS LUGARES, e só um em cena por vez.
       *
       * No hub o mundo inteiro sai — tecido, multidão de hemácias, parallax de
       * sangue, corpos. Deixá-lo ligado por trás custaria quadro e vazaria pelas
       * bordas do painel, que é a classe de defeito que este arquivo mais comete
       * (`TASTE.md` §2b: posição e ordem, o que o código não denuncia).
       */
      /*
       * A cena do cérebro cobre HUB e SELEÇÃO.
       *
       * A seleção é um painel POR CIMA do cérebro, não outro lugar — parar de
       * desenhar o fundo ali faria a tela piscar do cérebro para o preto no
       * instante em que o jogador entra na órbita, e o gesto de entrar perderia
       * a continuidade que é a razão de ele existir.
       */
      const noHub =
        cur.phase === "hub" || cur.phase === "select" || cur.phase === "painel"
      brain.visible = noHub
      world.visible = !noHub
      if (noHub) {
        if (!frozen) drawBrain(cur, dt)
        drawOverlay(cur, worldPhase)
        /*
         * Sai antes de tudo que é da ARENA: corpos, partículas, tremor e HUD.
         *
         * O HUD some junto de propósito — vidas, infecção e pontuação são da
         * run, e no cérebro não há run. Mostrá-los zerados seria pior que não
         * mostrá-los: um HUD que diz "0 vidas" num lugar onde nada te mata é
         * informação errada.
         */
        hud.visible = false
        overlay.visible = true
        /*
         * APRESENTA o quadro antes de sair, e este `app.render()` é o conserto
         * de um defeito que custou seis diagnósticos.
         *
         * O ticker do Pixi está PARADO (`app.ticker.stop()`, lá em cima) e quem
         * desenha é a chamada no fim desta função. Meu atalho para o hub saía
         * antes dela — então o cérebro inteiro era montado, posicionado e
         * atualizado a cada quadro, e nunca ia para a tela. Preto absoluto, zero
         * erro no console, 65 testes verdes.
         *
         * É a mesma classe do `frontSprite` de 02/08: peça correta, assada e
         * atualizada 60x por segundo, que nunca entrou em cena. O olhar pega o
         * que está ERRADO e não o que está AUSENTE — e o que estava ausente aqui
         * era o próprio ato de desenhar.
         *
         * Fica UM `return` com UM `app.render()` ao lado em vez de um `if`
         * embrulhando duzentas linhas de arena: o custo é esta chamada duplicada,
         * e o comentário é o que impede a próxima sessão de "limpar" a duplicata.
         */
        app.render()
        return
      }
      hud.visible = true
      if (!frozen) drawCrowd(cur, pxi, pyi, dt, worldClock, doente)
      drawTissue(cur)
      drawAuras(cur)
      drawEnemies(cur, prev, t, worldPhase)
      drawPlayer(cur, pxi, pyi)
      drawPowers(cur, worldPhase)

      // --------------------------------------------------------- partículas
      fxPool.begin()
      const nextParticles: Particle[] = []
      for (const q of particles) {
        if (!frozen) {
          q.x += q.vx
          q.y += q.vy
          q.vx *= 0.9
          q.vy *= 0.9
          q.life -= 0.055
        }
        if (q.life <= 0) continue
        const size = Math.max(1, Math.round(q.size * q.life))
        const sp = fxPool.next(atlas.dot(q.idx, size))
        sp.position.set(Math.round(q.x), Math.round(q.y))
        nextParticles.push(q)
      }
      /*
       * Anéis de abate e ondas de item, no MESMO pool das partículas.
       *
       * Depois delas de propósito: o anel é a borda do evento e tem que ficar
       * por cima da poeira, senão a poeira o apaga justo no quadro em que ele
       * é mais forte.
       */
      const proxImpactos: typeof impactos = []
      for (const q of impactos) {
        const tex = atlas.shock[Math.min(atlas.shock.length - 1, q.step)]
        if (tex !== undefined) {
          const sp = fxPool.next(tex)
          sp.position.set(Math.round(q.x), Math.round(q.y))
        }
        if (!frozen) q.step++
        if (q.step < atlas.shock.length) proxImpactos.push(q)
      }
      impactos = proxImpactos

      const proxOndas: typeof ondas = []
      for (const o of ondas) {
        const folha = o.patogeno
          ? (atlas.pulsesByKind.get(doencaDaFase(cur)) ?? atlas.pulseLimo)
          : atlas.pulseLimo
        if (o.step < folha.frames.length) {
          const sp = fxPool.next(folha.frames[o.step]!)
          sp.position.set(Math.round(o.x), Math.round(o.y))
        }
        if (!frozen) o.step++
        if (o.step < folha.frames.length) proxOndas.push(o)
      }
      ondas = proxOndas

      particles = nextParticles
      fxPool.end()

      // ------------------------------------------------------------ tremor
      if (flash > 0) {
        flashVeil.visible = true
        flashVeil.texture = atlas.veil(HURT1, flash > 0.66 ? 2 : flash > 0.33 ? 1 : 0)
        flash -= 0.09
      } else {
        flashVeil.visible = false
      }
      // Deslocamento inteiro, senão a tela inteira sai da grade no tremor.
      world.position.set(
        shake > 0 ? Math.round((((cur.tick * 37) % 7) - 3) * (shake / 7)) : 0,
        shake > 0 ? Math.round((((cur.tick * 53) % 7) - 3) * (shake / 7)) : 0,
      )
      if (shake > 0) shake -= 0.6

      // --------------------------------------------------------------- pops
      const nextPops: Pop[] = []
      for (const q of pops) {
        if (!frozen) q.life -= 0.028
        if (q.life <= 0) continue
        let label = popLabels[nextPops.length]
        if (label === undefined) {
          label = new Label(popLayer, atlas)
          popLabels[nextPops.length] = label
        }
        label.set(
          q.text,
          q.idx,
          q.x,
          // Sobe em passos inteiros de pixel, não numa rampa contínua.
          Math.round(q.y - (1 - q.life) * 24) - (BASE_Y + BODY_H) * q.scale,
          q.scale,
          true,
        )
        nextPops.push(q)
      }
      for (let i = nextPops.length; i < popLabels.length; i++) popLabels[i]!.hide()
      pops = nextPops

      drawHud(cur, dt)
      // O card usa o relógio REAL, não o do mundo: a sim está parada nele, e um
      // bicho que não anima é ilustração, não apresentação.
      drawOverlay(cur, Math.floor(selfClock * 6))
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
