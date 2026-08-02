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

  /** `x`,`y` é o canto da célula. Devolve a largura em pixels desenhada. */
  set(text: string, idx: number, x: number, y: number, scale = 1, center = false): number {
    const up = text.toUpperCase()
    const w = textWidth(up) * scale
    const x0 = Math.round(center ? x - w / 2 : x)
    const y0 = Math.round(y)
    let used = 0
    for (let i = 0; i < up.length; i++) {
      const tex = this.atlas.glyph(up[i]!, idx)
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
      sp.position.set(x0 + i * (GLYPH_W + 1) * scale, y0)
      used++
    }
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

  begin(): void {
    this.used = 0
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false
  }
}

export async function createRenderer(
  mount: HTMLElement,
  tuning: Tuning,
  crowdArea?: number,
): Promise<Renderer> {
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
  const popLabels: Label[] = []

  const deadVeil = new Sprite(atlas.veil(INK, 2))
  overlay.addChild(deadVeil)
  const deadLines = [0, 1, 2, 3].map(() => new Label(overlay, atlas))

  // ---------------------------------------------------------------- estado
  let particles: Particle[] = []
  let pops: Pop[] = []
  const heading = new Map<number, number>()
  let seenIds = new Set<number>()
  let prevLives = -1
  let prevCombo = 0
  let prevWave = 1
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
    const st = activeStats(tuning, cur.active)
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
      if (tileLevel[i] === lv) continue
      tileLevel[i] = lv
      tiles[i]!.texture = atlas.colony[lv]![(i * 7 + Math.floor(i / 32) * 3) % VARIANTS]!
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

  const drawHud = (cur: SimState): void => {
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
    waveLabel.set(
      `FASE ${cur.wave}   INFECÇÃO ${Math.ceil(infFrac * 100)}%` +
        (cur.bestWave > 1 ? `   MELHOR ${cur.bestWave}` : ""),
      infFrac > tuning.field.loseFraction * 0.7 ? HURT1 : WHITE,
      tuning.arena.width / 2,
      4,
      1,
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
     */
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

    const build = cur.active
      .map((ticks, i) => (ticks > 0 ? `${POWERS[i]!.name} ${Math.ceil(ticks / 60)}` : null))
      .filter((s): s is string => s !== null)
      .join(" · ")
    if (build.length > 0) buildLabel.set(build, DIM0, 6, tuning.arena.height - 22)
    else buildLabel.hide()
  }

  const drawOverlay = (cur: SimState): void => {
    const on = cur.phase === "dead"
    overlay.visible = on
    if (!on) return
    const cy = tuning.arena.height / 2
    const cx = tuning.arena.width / 2
    deadLines[0]!.set(cur.lostByTissue ? "O TECIDO MORREU" : "A INFECÇÃO VENCEU", HURT1, cx, cy - 40, 2, true)
    deadLines[1]!.set(`ONDA ${cur.wave} · ${cur.kills} PATÓGENOS`, WHITE, cx, cy - 4, 1, true)
    deadLines[2]!.set(
      cur.comboBest > 1 ? `MELHOR SEQUÊNCIA ${cur.comboBest}×` : "",
      GLD2,
      cx,
      cy + 10,
      1,
      true,
    )
    deadLines[3]!.set("R OU ENTER PRA OUTRA", DIM0, cx, cy + 34, 1, true)
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
        for (let i = 0; i < 3; i++) {
          burst(tuning.arena.width * (0.25 + i * 0.25), tuning.arena.height / 2, SHI1, 14, 3)
        }
        pops.push({
          x: tuning.arena.width / 2,
          y: tuning.arena.height / 2 - 50,
          life: 1,
          text: `FASE ${prevWave} CONTIDA`,
          scale: 2,
          idx: SHI1,
        })
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

      drawHud(cur)
      drawOverlay(cur)
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
