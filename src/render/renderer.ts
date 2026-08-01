import { Application, Container, Graphics, Text, TextStyle } from "pixi.js"
import { MODIFIERS, MOD_SHIELD, applyModifiers } from "../sim/modifiers.ts"
import type { SimState, Tuning } from "../sim/types.ts"

/**
 * Render. Só primitivas — círculo, polígono, linha, cor sólida. A decisão de
 * 31/07 continua valendo; o tema (célula imunológica na corrente sanguínea) é
 * cor e forma, não asset.
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
const KIND_STYLE: Readonly<Record<string, { color: number; spikes: number; ring: boolean }>> = {
  comum: { color: 0xff6a3d, spikes: 7, ring: false },
  divisor: { color: 0xffd23d, spikes: 5, ring: true },
  estilhaco: { color: 0xffe58a, spikes: 4, ring: false },
  blindado: { color: 0x9d6bff, spikes: 9, ring: true },
  invasor: { color: 0x3dff9e, spikes: 3, ring: false },
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

  // --- plasma: manchas fixas, só pra o dash ter referência de deslocamento
  floor.rect(0, 0, tuning.arena.width, tuning.arena.height).fill(COLOR_PLASMA)
  for (let i = 0; i < 26; i++) {
    const x = ((i * 97) % tuning.arena.width) + 11
    const y = ((i * 61) % tuning.arena.height) + 7
    floor.circle(x, y, 3 + (i % 4)).fill({ color: COLOR_BG, alpha: 0.55 })
  }

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

  const shapeFor = (spikes: number): number[] => {
    const pts: number[] = []
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2
      const r = i % 2 === 0 ? 1 : 0.5
      pts.push(Math.cos(a) * r, Math.sin(a) * r)
    }
    return pts
  }

  const enemyPool: Graphics[] = []
  /**
   * Cada tipo tem cor, número de pontas e tamanho próprios. Ler a ameaça pela
   * silhueta é o que faz a variedade valer — se todos parecessem iguais, ter
   * quatro comportamentos seria só dificuldade escondida.
   */
  const enemyFor = (i: number, kind: string): Graphics => {
    let g = enemyPool[i]
    if (g === undefined) {
      g = new Graphics()
      enemyPool[i] = g
      enemyLayer.addChild(g)
    }
    const style = KIND_STYLE[kind] ?? KIND_STYLE["comum"]!
    const spec = tuning.enemy.kinds[kind]
    const half = (tuning.enemy.size * (spec?.sizeScale ?? 1)) / 2
    const pts = shapeFor(style.spikes).map((p) => p * half)
    g.clear().poly(pts).fill(style.color).stroke({ width: 1, color: 0xffffff, alpha: 0.25 })
    if (style.ring) g.circle(0, 0, half * 0.45).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 })
    return g
  }

  const cellLayer = new Graphics()
  world.addChildAt(cellLayer, 1)

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

  let seenIds = new Set<number>()
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

    const body = cur.player.invulnerable && cur.tick % 8 < 4 ? COLOR_HURT : dashing ? COLOR_CELL_DASH : COLOR_CELL
    player.circle(x, y, size / 2).fill(body)
    player.circle(x + 1, y - 1, size / 5).fill({ color: COLOR_NUCLEUS, alpha: 0.85 })
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
          burst(e.x, e.y, (KIND_STYLE[e.kind] ?? KIND_STYLE["comum"]!).color, 7, 2.6)
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

      const frozen = cur.frozen > 0
      // Congelado, o mundo não interpola — o quadro trava junto com a sim.
      const t = frozen ? 0 : alpha
      drawPlayer(cur, lerp(prev.player.x, cur.player.x, t), lerp(prev.player.y, cur.player.y, t))

      // --- organismo: o que você está defendendo
      cellLayer.clear()
      for (const c of cur.cells) {
        const frac = c.hp / tuning.cells.hp
        cellLayer
          .circle(c.x, c.y, tuning.cells.size / 2)
          .fill({ color: COLOR_CELL_ORG, alpha: 0.16 + 0.24 * frac })
          .stroke({ width: 2, color: COLOR_CELL_ORG, alpha: 0.5 + 0.5 * frac })
        for (let i = 0; i < c.hp; i++) {
          cellLayer
            .circle(c.x - (c.hp - 1) * 4 + i * 8, c.y + tuning.cells.size / 2 + 8, 2)
            .fill(COLOR_CELL_ORG)
        }
      }

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

      drawHud(cur)
      drawOverlay(cur)
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
