import { Application, Container, Graphics, Sprite, Texture } from "pixi.js"
import { activeStats, POWERS } from "../sim/powers.ts"
import type { SimState, Tuning } from "../sim/types.ts"
import { buildAtlas, frameOf, type Atlas } from "./atlas.ts"
import { BASE_Y, BODY_H, GLYPH_W, textWidth } from "./font.ts"
import {
  COMBO_TIERS,
  DIM0,
  FAST1,
  DIM1,
  GLD1,
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

export async function createRenderer(mount: HTMLElement, tuning: Tuning): Promise<Renderer> {
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
  const atlas = buildAtlas(tuning)
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

  const LAYERS = [
    { kind: "hemacias" as const, speed: 14 },
    { kind: "fibrina" as const, speed: 46 },
    { kind: "detritos" as const, speed: 118 },
  ]
  const drift = LAYERS.flatMap((l) =>
    [0, 1].map((slot) => ({
      sprite: new Sprite(atlas.layers.get(l.kind)!),
      speed: l.speed,
      slot,
    })),
  )

  const organLayer = new Container()
  const auraLayer = new Container()
  const enemyLayer = new Container()
  const ghostLayer = new Container()
  const playerSprite = new Sprite()
  playerSprite.anchor.set(0.5)
  const powerLayer = new Container()
  const fxLayer = new Container()
  const popLayer = new Container()

  world.addChild(bgPlasma)
  for (const d of drift) world.addChild(d.sprite)
  world.addChild(organLayer, auraLayer, enemyLayer, ghostLayer, playerSprite, powerLayer, fxLayer, popLayer)

  const flashVeil = new Sprite()
  flashVeil.visible = false
  world.addChild(flashVeil)

  const organPool = new Pool(organLayer)
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
  let prevCellsLost = 0
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

  const drawOrgans = (cur: SimState, phase: number): void => {
    organPool.begin()
    for (let i = 0; i < cur.cells.length; i++) {
      const c = cur.cells[i]!
      const sp = organPool.next(frameOf(atlas.organ, c.hp - 1, 0, phase + i * 2))
      sp.position.set(Math.round(c.x), Math.round(c.y))
    }
    organPool.end()
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

    // esquerda: tecido restante · direita: suas vidas e escudos
    for (let i = 0; i < cur.cells.length; i++) {
      const frac = cur.cells[i]!.hp / tuning.cells.hp
      hudBars.rect(6 + i * 7, 6, 5, 5).fill(col(frac > 0.5 ? ORG2 : DIM0))
    }
    for (let i = 0; i < Math.max(0, cur.lives); i++) {
      hudBars.rect(tuning.arena.width - 11 - i * 7, 6, 5, 5).fill(col(WHITE))
    }
    for (let i = 0; i < cur.shields; i++) {
      hudBars
        .rect(tuning.arena.width - 11 - (cur.lives + i) * 7, 6, 5, 5)
        .fill(col(SHI1))
    }

    // onda e cota
    waveLabel.set(
      `ONDA ${cur.wave}   ${cur.waveKills}/${cur.quota}` +
        (cur.bestWave > 1 ? `   MELHOR ${cur.bestWave}` : ""),
      WHITE,
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
    segBar(tuning.arena.width / 2 - 100, 16, 200, 2, cur.waveKills / cur.quota, 20, GLD1, DIM1)

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
    deadLines[0]!.set(cur.lostByCells ? "O ORGANISMO CAIU" : "A INFECÇÃO VENCEU", HURT1, cx, cy - 40, 2, true)
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

      if (cur.cellsLost > prevCellsLost) {
        const gone = prev.cells.find((c) => !cur.cells.some((k) => k.id === c.id))
        if (gone) burst(gone.x, gone.y, ORG2, 24, 3.2)
        flash = 1
        shake = 9
      }
      prevCellsLost = cur.cellsLost

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
          text: `ONDA ${prevWave} CONTIDA`,
          scale: 2,
          idx: SHI1,
        })
      }
      prevWave = cur.wave

      // ------------------------------------------------------------- fundo
      // Ciclagem de paleta: a corrente escorre mesmo com tudo parado na tela.
      bgPlasma.texture = atlas.plasma[Math.floor(worldClock * 5) % atlas.plasma.length]!
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
      drawOrgans(cur, worldPhase)
      drawAuras(cur)
      drawEnemies(cur, prev, t, worldPhase)
      drawPlayer(cur, lerp(prev.player.x, cur.player.x, t), lerp(prev.player.y, cur.player.y, t))
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
