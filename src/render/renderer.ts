import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js"
import { organCellTexture, pathogenTexture, plasmaTexture, playerTexture } from "./textures.ts"
import { MODIFIERS, MOD_SHIELD, applyModifiers } from "../sim/modifiers.ts"
import type { SimState, Tuning } from "../sim/types.ts"

/**
 * Render. A restrição "só primitivas" foi REABERTA pelo humano em 31/07: corpos
 * agora são texturas — geradas em código, em `textures.ts`, porque o modelo não
 * desenha. Efeito (rastro, pulso, leque) segue primitiva, que é onde primitiva
 * é melhor: nítida, barata e legível em movimento.
 *
 * A sim anda em passos fixos de 1/60 de tempo de mundo; aqui só interpolamos.
 * Nada aqui decide nada — efeito que muda regra mora na sim.
 */
export interface Renderer {
  draw(prev: SimState, cur: SimState, alpha: number): void
  destroy(): void
}

const COLOR_BG = 0x14070b
const COLOR_PLASMA = 0x2a0d14
const COLOR_CELL = 0xf4f7ff
const COLOR_CELL_DASH = 0x7fe9ff
const COLOR_NUCLEUS = 0x9fb4d8
const COLOR_HURT = 0xff3b5c
const COLOR_VIRUS = 0xff6a3d
/** Cor por patógeno. A forma vem da morfologia real, em `textures.ts`. */
const KIND_COLOR: Readonly<Record<string, number>> = {
  influenza: 0xff6a3d,
  ecoli: 0xffd23d,
  ecoli_filha: 0xffe58a,
  estafilo: 0x9d6bff,
  salmonela: 0x3dff9e,
  corona: 0xff3b8c,
}
const COLOR_CELL_ORG = 0x6ec2ff
const COLOR_DIM = 0x7a4450
const COLOR_SHIELD = 0x8affc8

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: number
  size: number
}

export async function createRenderer(mount: HTMLElement, tuning: Tuning): Promise<Renderer> {
  const app = new Application()
  await app.init({
    width: tuning.arena.width,
    height: tuning.arena.height,
    background: COLOR_BG,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })
  app.ticker.stop()
  mount.appendChild(app.canvas)

  const world = new Container()
  const floor = new Graphics()
  const fx = new Graphics()
  const enemyLayer = new Container()
  const player = new Graphics()
  world.addChild(floor, enemyLayer, player, fx)

  const hud = new Container()
  const overlay = new Container()
  app.stage.addChild(world, hud, overlay)

  // --- plasma texturizado: veios e hemácias fora de foco
  const plasma = new Sprite(plasmaTexture(tuning.arena.width, tuning.arena.height, COLOR_PLASMA, COLOR_BG))
  floor.visible = false

  /**
   * Parallax que anda na velocidade do MUNDO, não do relógio de parede.
   * O humano disse que o fundo estático "não comunicava com o resto": agora ele
   * é a leitura mais direta da dilatação — parado, o sangue quase não escorre.
   */
  const drift: Array<{ sprite: Sprite; speed: number }> = []
  for (let layer = 0; layer < 3; layer++) {
    const tex = plasmaTexture(
      tuning.arena.width,
      tuning.arena.height,
      COLOR_PLASMA,
      layer === 0 ? COLOR_BG : 0x3a1018,
    )
    for (let copy = 0; copy < 2; copy++) {
      const sp = new Sprite(tex)
      sp.alpha = layer === 0 ? 1 : 0.28 - layer * 0.07
      sp.scale.set(1 + layer * 0.25)
      sp.position.set(copy * tuning.arena.width, 0)
      drift.push({ sprite: sp, speed: 26 + layer * 34 })
    }
  }
  let driftX = 0

  const playerSprite = new Sprite(playerTexture(tuning.player.size, COLOR_CELL, COLOR_NUCLEUS))
  playerSprite.anchor.set(0.5)
  world.addChild(playerSprite)

  const virusTex = new Map<string, ReturnType<typeof pathogenTexture>>()
  const texFor = (kind: string) => {
    let t = virusTex.get(kind)
    if (t === undefined) {
      const spec = tuning.enemy.kinds[kind]
      t = pathogenTexture(
        spec?.form ?? "esfera",
        KIND_COLOR[kind] ?? 0xff6a3d,
        tuning.enemy.size * (spec?.sizeScale ?? 1),
        kind.length * 13,
      )
      virusTex.set(kind, t)
    }
    return t
  }
  const organTex = organCellTexture(tuning.cells.size, COLOR_CELL_ORG)
  const powers = new Graphics()

  const mono = (size: number, fill: number): TextStyle =>
    new TextStyle({ fontFamily: "monospace", fontSize: size, fill })

  const waveText = new Text({ text: "", style: mono(13, COLOR_CELL) })
  waveText.position.set(10, 8)
  const hudBars = new Graphics()
  const buildText = new Text({ text: "", style: mono(10, COLOR_DIM) })
  buildText.position.set(10, 40)
  hud.addChild(hudBars, waveText, buildText)

  // --- telas
  const overlayBg = new Graphics()
  const overlayTitle = new Text({ text: "", style: mono(15, COLOR_CELL) })
  overlay.addChild(overlayBg, overlayTitle)

  const cards = MODIFIERS.map(() => {
    const box = new Graphics()
    const name = new Text({ text: "", style: mono(12, COLOR_CELL) })
    const blurb = new Text({ text: "", style: mono(10, COLOR_DIM) })
    const group = new Container()
    group.addChild(box, name, blurb)
    group.visible = false
    overlay.addChild(group)
    return { group, box, name, blurb }
  })

  const deadText = new Text({
    text: "",
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fill: COLOR_CELL,
      align: "center",
      lineHeight: 24,
    }),
  })
  overlay.addChild(deadText)

  const enemyPool: Sprite[] = []
  const enemyKindAt: string[] = []
  /**
   * Cada tipo tem cor, número de pontas e tamanho próprios. Ler a ameaça pela
   * silhueta é o que faz a variedade valer — se todos parecessem iguais, ter
   * quatro comportamentos seria só dificuldade escondida.
   */
  const enemyFor = (i: number, kind: string): Sprite => {
    let g = enemyPool[i]
    if (g === undefined) {
      g = new Sprite()
      g.anchor.set(0.5)
      enemyPool[i] = g
      enemyLayer.addChild(g)
    }
    // Só troca a textura quando o slot muda de tipo: com 48 vírus em campo,
    // refazer isso todo frame custaria justo onde o jogo é sobre timing.
    if (enemyKindAt[i] === kind) return g
    enemyKindAt[i] = kind
    g.texture = texFor(kind)
    return g
  }

  const cellLayer = new Graphics()
  const popLayer = new Container()
  const organLayer = new Container()
  const organPool: Sprite[] = []
  // Ordem explícita: montar por addChild na ordem de criação deixava o
  // organismo por cima do jogador.
  world.removeChildren()
  world.addChild(plasma)
  for (const d of drift) world.addChild(d.sprite)
  world.addChild(organLayer, cellLayer, powers, enemyLayer, player, playerSprite, fx, popLayer)

  // --- partículas: puramente decorativas, fora da sim
  let particles: Particle[] = []
  const burst = (x: number, y: number, color: number, n: number, speed: number): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed * (0.6 + (i % 3) * 0.2),
        vy: Math.sin(a) * speed * (0.6 + (i % 3) * 0.2),
        life: 1,
        max: 1,
        color,
        size: 2 + (i % 3),
      })
    }
  }

  interface Pop {
    x: number
    y: number
    life: number
    text: string
    size: number
    color: number
  }
  let pops: Pop[] = []
  const popPool: Text[] = []

  let seenIds = new Set<number>()
  let prevCombo = 0
  let prevWave = 1
  let prevLives = -1
  let prevCellsLost = 0
  let flash = 0
  let shake = 0

  const drawPlayer = (cur: SimState, x: number, y: number): void => {
    const dashing = cur.player.dashTicks > 0
    const size = tuning.player.size
    const stats = applyModifiers(tuning, cur.owned)
    player.clear()

    // Leque de corte: o jogador VÊ o que o dash alcança, e vê ESTEIRA e CORTE
    // LARGO mudarem o desenho. Era a recompensa invisível.
    if (dashing) {
      const half = Math.acos(Math.max(-1, Math.min(1, stats.killArc)))
      const base = Math.atan2(cur.player.dashDy, cur.player.dashDx)
      const pts = [x, y]
      for (let i = 0; i <= 12; i++) {
        const a = base - half + (2 * half * i) / 12
        pts.push(x + Math.cos(a) * stats.killRadius, y + Math.sin(a) * stats.killRadius)
      }
      player.poly(pts).fill({ color: COLOR_CELL_DASH, alpha: 0.16 })
      player
        .moveTo(x - cur.player.dashDx * 30, y - cur.player.dashDy * 30)
        .lineTo(x, y)
        .stroke({ width: 4, color: COLOR_CELL_DASH, alpha: 0.4 })
    }

    // Recuperação: um anel que esvazia. A folga encolhendo fica visível.
    if (!dashing && cur.player.recoverTicks > 0) {
      player
        .circle(x, y, size / 2 + 5)
        .stroke({ width: 2, color: COLOR_DIM, alpha: 0.7 })
    }

    if (cur.shields > 0) {
      player.circle(x, y, size / 2 + 4).stroke({ width: 2, color: COLOR_SHIELD, alpha: 0.9 })
    }

    playerSprite.position.set(x, y)
    playerSprite.tint =
      cur.player.invulnerable && cur.tick % 8 < 4 ? COLOR_HURT : dashing ? COLOR_CELL_DASH : 0xffffff

    /*
     * A célula respira. Fora do dash ela pulsa devagar; sob pressão ela pulsa
     * rápido; dashando ela se alonga na direção do movimento e a membrana estica
     * atrás. É o "ganhando forma e vida" pedido em 31/07 — e é informação, não
     * enfeite: dá pra ler o estado do jogador pela silhueta.
     */
    const stress = Math.min(1, cur.enemies.length / 30)
    const breath = Math.sin(cur.tick * (0.05 + stress * 0.14)) * (0.035 + stress * 0.05)
    const growth = 1 + Math.min(0.35, cur.owned.reduce((a, b) => a + b, 0) * 0.035)
    const stretch = dashing ? 1.24 : 1 + breath
    playerSprite.scale.set(stretch * growth, (dashing ? 0.84 : 1 - breath) * growth)
    playerSprite.rotation = dashing ? Math.atan2(cur.player.dashDy, cur.player.dashDx) : 0

    // Pseudópodes: membrana esticando atrás no momento do impulso.
    if (dashing) {
      const back = cur.player.dashTicks / Math.max(1, stats.dashDurationTicks)
      for (const off of [-0.5, 0, 0.5]) {
        const px2 = x - cur.player.dashDx * (18 + back * 16) + cur.player.dashDy * off * 12
        const py2 = y - cur.player.dashDy * (18 + back * 16) - cur.player.dashDx * off * 12
        player
          .moveTo(x, y)
          .lineTo(px2, py2)
          .stroke({ width: 3 - Math.abs(off) * 2, color: COLOR_CELL_DASH, alpha: 0.35 * back })
      }
    }
  }

  /**
   * Rastro, pulso e anticorpo. Primitiva de propósito: são efeito, e efeito
   * precisa ser nítido em movimento — é onde primitiva ganha de textura.
   */
  const drawPowers = (cur: SimState, t: number): void => {
    powers.clear()
    const stats = applyModifiers(tuning, cur.owned)

    if (cur.trails.length > 0) {
      for (const tr of cur.trails) {
        const a = tr.life / Math.max(1, stats.trailTicks)
        powers.circle(tr.x, tr.y, stats.trailRadius * (0.55 + 0.45 * a)).fill({
          color: COLOR_CELL_DASH,
          alpha: 0.06 + 0.22 * a,
        })
      }
    }

    for (const sh of cur.shocks) {
      const a = sh.life / tuning.powers.shockLifeTicks
      powers
        .circle(sh.x, sh.y, sh.radius * (1.05 - a * 0.55))
        .stroke({ width: 2 + 5 * a, color: COLOR_SHIELD, alpha: a * 0.85 })
    }

    const stats2 = stats
    if (stats2.interferonRadius > 0) {
      powers.circle(cur.player.x, cur.player.y, stats2.interferonRadius).fill({
        color: 0x8fd8ff,
        alpha: 0.045,
      })
      powers
        .circle(cur.player.x, cur.player.y, stats2.interferonRadius)
        .stroke({ width: 1, color: 0x8fd8ff, alpha: 0.18 })
    }

    for (const cl of cur.clouds) {
      const a = cl.life / Math.max(1, stats2.cloudTicks)
      powers.circle(cl.x, cl.y, tuning.powers.cloudRadius * (0.6 + 0.4 * a)).fill({
        color: 0xffe58a,
        alpha: 0.05 + 0.16 * a,
      })
    }

    for (const m of cur.macrophages) {
      powers
        .circle(m.x, m.y, tuning.powers.macrophageRadius)
        .fill({ color: 0xbfe6ff, alpha: 0.82 })
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 })
      powers.circle(m.x + 2, m.y - 2, tuning.powers.macrophageRadius * 0.38).fill({
        color: 0x6a86b8,
        alpha: 0.8,
      })
    }

    for (const o of cur.orbiters) {
      const ox = lerp(o.ox, o.ox, t)
      const gx = cur.player.x + ox * tuning.powers.orbitRadius
      const gy = cur.player.y + o.oy * tuning.powers.orbitRadius
      powers
        .circle(gx, gy, tuning.powers.orbitKillRadius)
        .fill({ color: COLOR_SHIELD, alpha: 0.75 })
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 })
      powers
        .moveTo(cur.player.x, cur.player.y)
        .lineTo(gx, gy)
        .stroke({ width: 1, color: COLOR_SHIELD, alpha: 0.16 })
    }
  }

  const drawHud = (cur: SimState): void => {
    waveText.position.set(cur.cells.length > 0 ? 14 + cur.cells.length * 13 : 10, 8)
    waveText.text = `ONDA ${cur.wave}   ${cur.waveKills}/${cur.quota}${
      cur.bestWave > 1 ? `   melhor ${cur.bestWave}` : ""
    }`

    hudBars.clear()
    for (let i = 0; i < Math.max(0, cur.lives); i++) {
      hudBars.circle(tuning.arena.width - 14 - i * 14, 14, 5).fill(COLOR_CELL)
    }
    for (let i = 0; i < cur.shields; i++) {
      hudBars
        .circle(tuning.arena.width - 14 - (cur.lives + i) * 14, 14, 6)
        .stroke({ width: 2, color: COLOR_SHIELD })
    }
    hudBars
      .rect(10, 28, ((tuning.arena.width - 20) * cur.waveKills) / cur.quota, 3)
      .fill(COLOR_VIRUS)

    // Organismo restante, ao lado das vidas: as duas formas de perder, lado a lado.
    for (let i = 0; i < cur.cells.length; i++) {
      hudBars
        .circle(14 + i * 13, 14, 4)
        .fill({ color: COLOR_CELL_ORG, alpha: cur.cells[i]!.hp / tuning.cells.hp })
        .stroke({ width: 1, color: COLOR_CELL_ORG })
    }

    if (cur.phase === "run") {
      hudBars
        .rect(10, tuning.arena.height - 8, (tuning.arena.width - 20) * Math.min(1, cur.worldScale), 3)
        .fill(COLOR_CELL_DASH)
    }

    // Cargas de dash: SEGUNDO FÔLEGO precisa ser contável de relance.
    if (cur.dashCharges > 1 || applyModifiers(tuning, cur.owned).dashCharges > 1) {
      const total = applyModifiers(tuning, cur.owned).dashCharges
      for (let i = 0; i < total; i++) {
        hudBars
          .rect(tuning.arena.width / 2 - total * 6 + i * 12, tuning.arena.height - 20, 8, 3)
          .fill({ color: COLOR_CELL_DASH, alpha: i < cur.dashCharges ? 1 : 0.25 })
      }
    }

    // Combo vivo no HUD: dá alvo pro jogador perseguir entre uma onda e outra.
    if (cur.combo > 1) {
      const tier = Math.min(4, Math.floor((cur.combo - 1) / 3))
      hudBars
        .rect(tuning.arena.width / 2 - 30, 42, (60 * cur.comboTicks) / tuning.powers.comboWindowTicks, 3)
        .fill([0xffffff, 0xffe58a, 0xffb03d, 0xff6a3d, 0xff3b8c][tier]!)
    }

    // A build inteira, sempre visível: escolher passa a ter memória.
    const owned = cur.owned
      .map((n, i) => (n > 0 ? `${MODIFIERS[i]!.name}${n > 1 ? `×${n}` : ""}` : null))
      .filter(Boolean)
    buildText.text = owned.length > 0 ? owned.join("  ·  ") : ""
  }

  const drawOverlay = (cur: SimState): void => {
    const on = cur.phase !== "run"
    overlay.visible = on
    for (const c of cards) c.group.visible = false
    deadText.visible = false
    if (!on) return

    overlayBg
      .clear()
      .rect(0, 0, tuning.arena.width, tuning.arena.height)
      .fill({ color: COLOR_BG, alpha: 0.9 })

    if (cur.phase === "dead") {
      overlayTitle.text = ""
      deadText.visible = true
      deadText.text =
        (cur.lostByCells ? `O ORGANISMO CAIU\n\n` : `A INFECÇÃO VENCEU\n\n`) +
        `onda ${cur.wave} · ${cur.kills} vírus\n` +
        (cur.bestWave > cur.wave ? `melhor: onda ${cur.bestWave}\n` : "") +
        `\nR ou ENTER pra outra`
      deadText.position.set(
        (tuning.arena.width - deadText.width) / 2,
        (tuning.arena.height - deadText.height) / 2,
      )
      return
    }

    overlayTitle.text = `ONDA ${cur.wave} CONTIDA   ←/→ escolhe · espaço confirma`
    overlayTitle.position.set(
      (tuning.arena.width - overlayTitle.width) / 2,
      tuning.arena.height / 2 - 96,
    )

    const cardW = 172
    const cardH = 100
    const gap = 14
    const total = cur.offer.length * cardW + (cur.offer.length - 1) * gap
    let x = (tuning.arena.width - total) / 2
    const y = tuning.arena.height / 2 - cardH / 2

    for (const [i, card] of cards.entries()) {
      const id = cur.offer[i]
      if (id === undefined) continue
      const mod = MODIFIERS[id]!
      const selected = i === cur.cursor
      const owned = cur.owned[mod.id] ?? 0
      card.group.visible = true
      card.box
        .clear()
        .rect(0, 0, cardW, cardH)
        .fill({ color: COLOR_PLASMA, alpha: 1 })
        .stroke({ width: selected ? 2 : 1, color: selected ? COLOR_CELL_DASH : COLOR_DIM })
      if (mod.id === MOD_SHIELD) card.box.circle(cardW - 24, 24, 7).stroke({ width: 2, color: COLOR_SHIELD })
      card.name.text = owned > 0 ? `${mod.name} ×${owned + 1}` : mod.name
      card.blurb.text = mod.blurb
      card.name.position.set(14, 26)
      card.blurb.position.set(14, 52)
      card.group.position.set(x, y)
      x += cardW + gap
    }
  }

  return {
    draw(prev, cur, alpha) {
      // --- eventos, deduzidos por diff de id. A sim não guarda efeito.
      const live = new Set(cur.enemies.map((e) => e.id))
      for (const e of prev.enemies) {
        if (!live.has(e.id) && seenIds.has(e.id)) {
          burst(e.x, e.y, KIND_COLOR[e.kind] ?? 0xff6a3d, 7, 2.6)
        }
      }
      // Célula perdida: explosão grande, porque é a outra forma de perder.
      if (cur.cellsLost > prevCellsLost) {
        const gone = prev.cells.find((c) => !cur.cells.some((k) => k.id === c.id))
        if (gone) burst(gone.x, gone.y, COLOR_CELL_ORG, 22, 3.4)
        flash = 1
        shake = 9
      }
      prevCellsLost = cur.cellsLost
      seenIds = live

      if (prevLives >= 0 && cur.lives < prevLives) {
        flash = 1
        shake = 7
        burst(cur.player.x, cur.player.y, COLOR_HURT, 16, 4)
      }
      prevLives = cur.lives

      // Parallax: a distância percorrida é tempo de MUNDO. Parado, o sangue
      // quase não escorre — é a dilatação virando leitura de fundo.
      if (cur.phase === "run" && cur.frozen === 0) {
        driftX -= (cur.worldScale * 1) / 60
      }
      for (let i = 0; i < drift.length; i++) {
        const d = drift[i]!
        const span = tuning.arena.width * d.sprite.scale.x
        let x = ((driftX * d.speed) % span) + (i % 2) * span
        if (x > 0) x -= span * 2
        d.sprite.position.set(x, -(d.sprite.scale.y - 1) * tuning.arena.height * 0.5)
      }

      const frozen = cur.frozen > 0
      // Congelado, o mundo não interpola — o quadro trava junto com a sim.
      const t = frozen ? 0 : alpha
      drawPlayer(cur, lerp(prev.player.x, cur.player.x, t), lerp(prev.player.y, cur.player.y, t))

      // --- organismo: o que você está defendendo
      cellLayer.clear()
      for (let i = 0; i < cur.cells.length; i++) {
        const c = cur.cells[i]!
        let sprite = organPool[i]
        if (sprite === undefined) {
          sprite = new Sprite(organTex)
          sprite.anchor.set(0.5)
          organLayer.addChild(sprite)
          organPool[i] = sprite
        }
        const frac = c.hp / tuning.cells.hp
        sprite.visible = true
        sprite.position.set(c.x, c.y)
        sprite.alpha = 0.45 + 0.55 * frac
        // Pulsa: uma célula viva não fica parada.
        const pulse = 1 + Math.sin(cur.tick * 0.04 + i) * 0.04
        sprite.scale.set(pulse)
        for (let k = 0; k < c.hp; k++) {
          cellLayer
            .circle(c.x - (c.hp - 1) * 4 + k * 8, c.y + tuning.cells.size / 2 + 10, 2)
            .fill(COLOR_CELL_ORG)
        }
      }
      for (let i = cur.cells.length; i < organPool.length; i++) organPool[i]!.visible = false

      const prevById = new Map(prev.enemies.map((e) => [e.id, e]))
      for (let i = 0; i < cur.enemies.length; i++) {
        const e = cur.enemies[i]!
        const g = enemyFor(i, e.kind)
        const p = prevById.get(e.id)
        g.visible = true
        g.position.set(p ? lerp(p.x, e.x, t) : e.x, p ? lerp(p.y, e.y, t) : e.y)
        const age = Math.min(1, (cur.tick - e.bornTick) / 12)
        g.scale.set(0.25 + 0.75 * age)
        g.rotation = e.id * 0.7 + cur.tick * 0.012
      }
      for (let i = cur.enemies.length; i < enemyPool.length; i++) enemyPool[i]!.visible = false

      // --- partículas e telas de impacto
      fx.clear()
      const next: Particle[] = []
      for (const q of particles) {
        if (!frozen) {
          q.x += q.vx
          q.y += q.vy
          q.vx *= 0.9
          q.vy *= 0.9
          q.life -= 0.055
        }
        if (q.life > 0) {
          fx.circle(q.x, q.y, q.size * q.life).fill({ color: q.color, alpha: q.life })
          next.push(q)
        }
      }
      particles = next

      if (flash > 0) {
        fx.rect(0, 0, tuning.arena.width, tuning.arena.height).fill({
          color: COLOR_HURT,
          alpha: flash * 0.35,
        })
        flash -= 0.09
      }
      world.position.set(
        shake > 0 ? (((cur.tick * 37) % 7) - 3) * (shake / 7) : 0,
        shake > 0 ? (((cur.tick * 53) % 7) - 3) * (shake / 7) : 0,
      )
      if (shake > 0) shake -= 0.6

      /*
       * Escalada de recompensa — o eixo do bar do Candy Crush.
       * Encadear abates faz o número subir, crescer, mudar de cor e tremer a
       * tela. A recompensa precisa ESCALAR, não só existir: 2 abates seguidos
       * têm que valer visivelmente menos que 9.
       */
      if (cur.combo > prevCombo && cur.lastKillTick === cur.tick - 1) {
        const c = cur.combo
        const tier = Math.min(4, Math.floor((c - 1) / 3))
        pops.push({
          x: cur.lastKillX,
          y: cur.lastKillY,
          life: 1,
          text: c > 1 ? `${c}×` : "+1",
          size: 11 + tier * 5,
          color: [0xffffff, 0xffe58a, 0xffb03d, 0xff6a3d, 0xff3b8c][tier]!,
        })
        if (c > 1 && c % 3 === 0) {
          burst(cur.lastKillX, cur.lastKillY, 0xffe58a, 6 + tier * 4, 2 + tier)
          shake = Math.max(shake, 1.5 + tier * 1.2)
        }
      }
      prevCombo = cur.combo

      if (cur.wave > prevWave) {
        for (let i = 0; i < 3; i++) {
          burst(
            tuning.arena.width * (0.25 + i * 0.25),
            tuning.arena.height / 2,
            COLOR_SHIELD,
            14,
            3.2,
          )
        }
        pops.push({
          x: tuning.arena.width / 2,
          y: tuning.arena.height / 2 - 60,
          life: 1,
          text: `ONDA ${prevWave} CONTIDA`,
          size: 20,
          color: COLOR_SHIELD,
        })
      }
      prevWave = cur.wave

      const nextPops: Pop[] = []
      for (let i = 0; i < pops.length; i++) {
        const q = pops[i]!
        if (!frozen) q.life -= 0.028
        if (q.life <= 0) continue
        let label = popPool[nextPops.length]
        if (label === undefined) {
          label = new Text({ text: "", style: mono(12, 0xffffff) })
          label.anchor.set(0.5)
          popPool[nextPops.length] = label
          popLayer.addChild(label)
        }
        label.visible = true
        label.text = q.text
        label.style.fontSize = q.size
        label.style.fill = q.color
        label.alpha = Math.min(1, q.life * 1.6)
        label.scale.set(1 + (1 - q.life) * 0.5)
        label.position.set(q.x, q.y - (1 - q.life) * 26)
        nextPops.push(q)
      }
      for (let i = nextPops.length; i < popPool.length; i++) popPool[i]!.visible = false
      pops = nextPops

      drawPowers(cur, t)
      drawHud(cur)
      drawOverlay(cur)
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
