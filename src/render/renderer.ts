import { Application, Container, Graphics, Sprite, Texture } from "pixi.js"
import { activeStats, POWERS } from "../sim/powers.ts"
import type { SimState, Tuning } from "../sim/types.ts"
import { buildAtlas, frameOf, type Atlas } from "./atlas.ts"
import { BASE_Y, BODY_H, GLYPH_W, textWidth } from "./font.ts"
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
  },
  toque: {
    comecar: "TOQUE PRA COMEÇAR",
    outra: "TOQUE PRA OUTRA",
  },
} as const

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
  app.stage.addChild(world, hud, overlay)

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
  const cardBicho = new Sprite()
  cardBicho.anchor.set(0.5)
  // Escala INTEIRA: o pixel art nativo não tolera meio pixel, e o card é a
  // única tela em que o bicho aparece grande o bastante para denunciar isso.
  cardBicho.scale.set(4)
  overlay.addChild(cardBicho)
  const cardLines = [0, 1, 2, 3].map(() => new Label(overlay, atlas))
  const cardPicks = [0, 1, 2].map(() => new Label(overlay, atlas))
  const cardBlurbs = [0, 1, 2].map(() => new Label(overlay, atlas))
  // O que SAI do build se você levar este. Só aparece com o build cheio.
  const cardCusto = [0, 1, 2].map(() => new Label(overlay, atlas))
  const cardBlurb = new Label(overlay, atlas)

  // ---------------------------------------------------------------- estado
  let particles: Particle[] = []
  let pops: Pop[] = []
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
      const sheet = atlas.drops[d.power] ?? atlas.drops[0]!
      const sp = powerPool.next(frameOf(sheet, 0, 0, phase + d.id))
      sp.position.set(Math.round(d.x), Math.round(d.y))
      // Prestes a expirar: pisca em quadro cheio, do jeito do console.
      sp.visible = d.life >= 90 || (cur.tick & 4) === 0
    }
    powerPool.end()
  }

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

  const drawHud = (cur: SimState, dt: number): void => {
    buildDots.clear()
    hudBars.clear()

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

  const drawOverlay = (cur: SimState, phase: number): void => {
    const isCard = cur.phase === "card"
    const isIntervalo = cur.phase === "intervalo"
    const isClosed = cur.phase === "closed"
    const telaDeCima = isCard || isIntervalo || isClosed
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
    cardVeil.texture = atlas.veil(INK, isClosed ? 2 : 1)
    cardBicho.visible = isCard
    for (const l of cardLines) if (!telaDeCima) l.hide()
    if (!isClosed) {
      for (const l of cardPicks) l.hide()
      for (const l of cardBlurbs) l.hide()
      for (const l of cardCusto) l.hide()
      cardBlurb.hide()
      if (!isIntervalo) rewardPanels.clear()
    }
    for (const l of deadLines) if (telaDeCima) l.hide()
    deadVeil.visible = cur.phase === "dead"
    if (!on) return
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
      const live = new Set(cur.enemies.map((e) => e.id))
      for (const e of prev.enemies) {
        if (!live.has(e.id) && seenIds.has(e.id)) {
          burst(e.x, e.y, KIND_TINT[e.kind] ?? WHITE, 8, 2.4)
        }
      }
      seenIds = live

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
