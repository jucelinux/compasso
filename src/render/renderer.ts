import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js"
import { activeStats, POWERS } from "../sim/powers.ts"
import type { SimState, Tuning } from "../sim/types.ts"
import {
  bloodLayer,
  organCellTexture,
  pathogenTexture,
  playerTexture,
  type LayerKind,
} from "./textures.ts"

/**
 * Render. A restrição "só primitivas" foi reaberta pelo humano em 31/07: corpos
 * são texturas geradas em código, em `textures.ts`. Efeito segue primitiva, que
 * é onde primitiva ganha: nítida e barata em movimento.
 *
 * Nada aqui decide nada. Regra mora na sim.
 */
export interface Renderer {
  draw(prev: SimState, cur: SimState, alpha: number): void
  destroy(): void
}

const COLOR_BG = 0x14070b
const COLOR_PLASMA = 0x2a0d14
const COLOR_CELL = 0xf4f7ff
const COLOR_FAST = 0x7fe9ff
const COLOR_NUCLEUS = 0x9fb4d8
const COLOR_HURT = 0xff3b5c
const COLOR_CELL_ORG = 0x6ec2ff
const COLOR_DIM = 0x7a4450
const COLOR_SHIELD = 0x8affc8

const KIND_COLOR: Readonly<Record<string, number>> = {
  influenza: 0xff6a3d,
  ecoli: 0xffd23d,
  ecoli_filha: 0xffe58a,
  estafilo: 0x9d6bff,
  salmonela: 0x3dff9e,
  corona: 0xff3b8c,
}

const TIERS = [0xffffff, 0xffe58a, 0xffb03d, 0xff6a3d, 0xff3b8c]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: number
  size: number
}

interface Pop {
  x: number
  y: number
  life: number
  text: string
  size: number
  color: number
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
  const hud = new Container()
  const overlay = new Container()
  app.stage.addChild(world, hud, overlay)

  const LAYERS: ReadonlyArray<{ kind: LayerKind; speed: number; alpha: number; bob: number }> = [
    { kind: "hemacias", speed: 18, alpha: 0.85, bob: 3 },
    { kind: "fibrina", speed: 52, alpha: 0.7, bob: 7 },
    { kind: "detritos", speed: 124, alpha: 0.9, bob: 13 },
  ]
  const base = new Graphics()
  base.rect(0, 0, tuning.arena.width, tuning.arena.height).fill(COLOR_PLASMA)
  const drift: Array<{ sprite: Sprite; speed: number; bob: number; slot: number }> = []
  LAYERS.forEach((layer, li) => {
    const tex = bloodLayer(tuning.arena.width, tuning.arena.height, layer.kind, li * 91 + 7)
    for (let copy = 0; copy < 2; copy++) {
      const sp = new Sprite(tex)
      sp.alpha = layer.alpha
      drift.push({ sprite: sp, speed: layer.speed, bob: layer.bob, slot: copy })
    }
  })
  let driftX = 0

  const organLayer = new Container()
  const cellLayer = new Graphics()
  const powers = new Graphics()
  const enemyLayer = new Container()
  const player = new Graphics()
  const playerSprite = new Sprite(playerTexture(tuning.player.size, COLOR_CELL, COLOR_NUCLEUS))
  playerSprite.anchor.set(0.5)
  const fx = new Graphics()
  const popLayer = new Container()

  world.addChild(base)
  for (const d of drift) world.addChild(d.sprite)
  world.addChild(organLayer, cellLayer, powers, enemyLayer, player, playerSprite, fx, popLayer)

  const mono = (size: number, fill: number): TextStyle =>
    new TextStyle({ fontFamily: "monospace", fontSize: size, fill })

  const waveText = new Text({ text: "", style: mono(13, COLOR_CELL) })
  waveText.position.set(10, 8)
  const hudBars = new Graphics()
  const buildText = new Text({ text: "", style: mono(10, COLOR_DIM) })
  buildText.position.set(10, 42)
  hud.addChild(hudBars, waveText, buildText)

  const overlayBg = new Graphics()
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
  overlay.addChild(overlayBg, deadText)

  const organTex = organCellTexture(tuning.cells.size, COLOR_CELL_ORG)
  const organPool: Sprite[] = []

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

  const enemyPool: Sprite[] = []
  const enemyKindAt: string[] = []
  const enemyFor = (i: number, kind: string): Sprite => {
    let g = enemyPool[i]
    if (g === undefined) {
      g = new Sprite()
      g.anchor.set(0.5)
      enemyPool[i] = g
      enemyLayer.addChild(g)
    }
    if (enemyKindAt[i] === kind) return g
    enemyKindAt[i] = kind
    g.texture = texFor(kind)
    return g
  }

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
        color,
        size: 2 + (i % 3),
      })
    }
  }

  let pops: Pop[] = []
  const popPool: Text[] = []
  const heading = new Map<number, number>()
  let seenIds = new Set<number>()
  let prevLives = -1
  let prevCellsLost = 0
  let prevCombo = 0
  let prevWave = 1
  let flash = 0
  let shake = 0
  const tailX: number[] = []
  const tailY: number[] = []

  const drawPlayer = (cur: SimState, x: number, y: number): void => {
    player.clear()
    const sp = Math.min(1.4, cur.player.speed)
    const vlen = Math.sqrt(cur.player.vx * cur.player.vx + cur.player.vy * cur.player.vy) || 1

    /*
     * Borrão de velocidade. É a leitura mais direta do novo relógio: correr é
     * literalmente ocupar mais tela. Substituiu o rastro discreto do dash, que
     * só existia durante 9 ticks e sumia.
     */
    tailX.unshift(x)
    tailY.unshift(y)
    if (tailX.length > 14) {
      tailX.length = 14
      tailY.length = 14
    }
    const tailLen = Math.round(sp * 12)
    for (let i = 1; i < Math.min(tailLen, tailX.length); i++) {
      const a = (1 - i / tailLen) * 0.32 * sp
      player.circle(tailX[i]!, tailY[i]!, (tuning.player.size / 2) * (1 - i / tailLen)).fill({
        color: COLOR_FAST,
        alpha: a,
      })
    }

    // Anel do limiar: quanto mais forte, mais coisa a sua velocidade engole.
    if (sp > 0.05) {
      player
        .circle(x, y, tuning.player.size / 2 + 6 + sp * 5)
        .stroke({ width: 1 + sp * 2, color: COLOR_FAST, alpha: 0.15 + sp * 0.45 })
    }
    if (cur.shields > 0) {
      player
        .circle(x, y, tuning.player.size / 2 + 5)
        .stroke({ width: 2, color: COLOR_SHIELD, alpha: 0.9 })
    }

    playerSprite.position.set(x, y)
    playerSprite.tint = cur.player.invulnerable && cur.tick % 8 < 4 ? COLOR_HURT : 0xffffff

    // Deformação pela VELOCIDADE, não por estado discreto: estica na marcha e
    // achata no eixo perpendicular, como corpo mole de verdade.
    const stress = Math.min(1, cur.enemies.length / 40)
    const breath = Math.sin(cur.tick * (0.05 + stress * 0.14)) * (0.03 + stress * 0.045)
    playerSprite.scale.set(1 + sp * 0.3 + breath, 1 - sp * 0.18 - breath)
    playerSprite.rotation =
      sp > 0.05 ? Math.atan2(cur.player.vy / vlen, cur.player.vx / vlen) : 0
  }

  const drawPowers = (cur: SimState): void => {
    powers.clear()
    const st = activeStats(tuning, cur.active)

    if (st.interferonRadius > 0) {
      powers
        .circle(cur.player.x, cur.player.y, st.interferonRadius)
        .fill({ color: 0x8fd8ff, alpha: 0.045 })
        .stroke({ width: 1, color: 0x8fd8ff, alpha: 0.18 })
    }
    for (const tr of cur.trails) {
      const a = tr.life / Math.max(1, st.trailTicks)
      powers.circle(tr.x, tr.y, st.trailRadius * (0.55 + 0.45 * a)).fill({
        color: 0x7fe9ff,
        alpha: 0.05 + 0.2 * a,
      })
    }
    for (const cl of cur.clouds) {
      const a = cl.life / Math.max(1, st.cloudTicks)
      powers.circle(cl.x, cl.y, tuning.powers.cloudRadius * (0.6 + 0.4 * a)).fill({
        color: 0xffe58a,
        alpha: 0.05 + 0.16 * a,
      })
    }
    for (const sh of cur.shocks) {
      const a = sh.life / tuning.powers.shockLifeTicks
      powers
        .circle(sh.x, sh.y, sh.radius * (1.05 - a * 0.55))
        .stroke({ width: 2 + 5 * a, color: COLOR_SHIELD, alpha: a * 0.85 })
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
      powers
        .circle(
          cur.player.x + o.ox * tuning.powers.orbitRadius,
          cur.player.y + o.oy * tuning.powers.orbitRadius,
          tuning.powers.orbitKillRadius,
        )
        .fill({ color: COLOR_SHIELD, alpha: 0.75 })
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 })
    }
    for (const d of cur.drops) {
      const pw = POWERS[d.power]!
      const pulse = 1 + Math.sin(cur.tick * 0.18 + d.id) * 0.16
      const fading = d.life < 90 && cur.tick % 8 < 4 ? 0.35 : 1
      powers
        .circle(d.x, d.y, 7 * pulse)
        .fill({ color: pw.color, alpha: 0.9 * fading })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.55 * fading })
      powers.circle(d.x, d.y, 12 * pulse).stroke({ width: 1, color: pw.color, alpha: 0.3 * fading })
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
    for (let i = 0; i < cur.cells.length; i++) {
      hudBars
        .circle(14 + i * 13, 14, 4)
        .fill({ color: COLOR_CELL_ORG, alpha: cur.cells[i]!.hp / tuning.cells.hp })
        .stroke({ width: 1, color: COLOR_CELL_ORG })
    }
    hudBars.rect(10, 28, ((tuning.arena.width - 20) * cur.waveKills) / cur.quota, 3).fill(0xff6a3d)

    // O relógio: a barra É a sua velocidade. Substituiu o creep binário.
    hudBars
      .rect(10, tuning.arena.height - 8, tuning.arena.width - 20, 3)
      .fill({ color: 0xffffff, alpha: 0.08 })
    hudBars
      .rect(10, tuning.arena.height - 8, (tuning.arena.width - 20) * Math.min(1, cur.worldScale), 3)
      .fill(COLOR_FAST)

    const cdFrac =
      cur.player.dashCooldown > 0 ? 1 - cur.player.dashCooldown / tuning.dash.cooldownTicks : 1
    hudBars.rect(tuning.arena.width / 2 - 24, tuning.arena.height - 16, 48 * cdFrac, 3).fill({
      color: COLOR_FAST,
      alpha: cdFrac >= 1 ? 1 : 0.5,
    })

    if (cur.combo > 1) {
      const tier = Math.min(4, Math.floor((cur.combo - 1) / 3))
      hudBars
        .rect(
          tuning.arena.width / 2 - 30,
          42,
          (60 * cur.comboTicks) / tuning.powers.comboWindowTicks,
          3,
        )
        .fill(TIERS[tier]!)
    }

    buildText.text = cur.active
      .map((ticks, i) => (ticks > 0 ? `${POWERS[i]!.name} ${Math.ceil(ticks / 60)}s` : null))
      .filter(Boolean)
      .join("  ·  ")
  }

  const drawOverlay = (cur: SimState): void => {
    const on = cur.phase === "dead"
    overlay.visible = on
    if (!on) return
    overlayBg
      .clear()
      .rect(0, 0, tuning.arena.width, tuning.arena.height)
      .fill({ color: COLOR_BG, alpha: 0.9 })
    deadText.text =
      (cur.lostByCells ? "O ORGANISMO CAIU\n\n" : "A INFECÇÃO VENCEU\n\n") +
      `onda ${cur.wave} · ${cur.kills} patógenos\n` +
      (cur.comboBest > 1 ? `melhor sequência: ${cur.comboBest}×\n` : "") +
      "\nR ou ENTER pra outra"
    deadText.position.set(
      (tuning.arena.width - deadText.width) / 2,
      (tuning.arena.height - deadText.height) / 2,
    )
  }

  return {
    draw(prev, cur, alpha) {
      const frozen = cur.frozen > 0
      const t = frozen ? 0 : alpha

      const live = new Set(cur.enemies.map((e) => e.id))
      for (const e of prev.enemies) {
        if (!live.has(e.id) && seenIds.has(e.id)) {
          burst(e.x, e.y, KIND_COLOR[e.kind] ?? 0xff6a3d, 7, 2.6)
        }
      }
      seenIds = live
      if (heading.size > 400) {
        for (const key of heading.keys()) if (!live.has(key)) heading.delete(key)
      }

      if (cur.cellsLost > prevCellsLost) {
        const gone = prev.cells.find((c) => !cur.cells.some((k) => k.id === c.id))
        if (gone) burst(gone.x, gone.y, COLOR_CELL_ORG, 22, 3.4)
        flash = 1
        shake = 9
      }
      prevCellsLost = cur.cellsLost

      if (prevLives >= 0 && cur.lives < prevLives) {
        flash = 1
        shake = 7
        burst(cur.player.x, cur.player.y, COLOR_HURT, 16, 4)
      }
      prevLives = cur.lives

      if (cur.combo > prevCombo && cur.lastKillTick >= cur.tick - 2) {
        const c = cur.combo
        const tier = Math.min(4, Math.floor((c - 1) / 3))
        pops.push({
          x: cur.lastKillX,
          y: cur.lastKillY,
          life: 1,
          text: c > 1 ? `${c}×` : "+1",
          size: 11 + tier * 5,
          color: TIERS[tier]!,
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

      // Parallax na velocidade do MUNDO: parada, a corrente quase não escorre.
      if (cur.phase === "run" && !frozen) driftX -= cur.worldScale / 60
      for (const d of drift) {
        const span = tuning.arena.width
        let x = ((driftX * d.speed) % span) + d.slot * span
        while (x > 0) x -= span
        while (x < -span) x += span
        d.sprite.position.set(x, Math.sin(driftX * 0.4 + d.speed) * d.bob)
      }

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
        sprite.scale.set(1 + Math.sin(cur.tick * 0.04 + i) * 0.04)
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

        // Orientação pela direção de marcha. Cacho e esfera rodam solto porque
        // não têm frente; bacilo e flagelado apontam pra onde vão.
        const form = tuning.enemy.kinds[e.kind]?.form ?? "esfera"
        if (form === "cacho" || form === "esfera" || form === "coroa") {
          g.rotation = e.id * 0.7 + cur.tick * 0.008
        } else if (p !== undefined) {
          const vx = e.x - p.x
          const vy = e.y - p.y
          if (vx * vx + vy * vy > 0.0004) {
            const want = Math.atan2(vy, vx)
            let delta = want - (heading.get(e.id) ?? want)
            while (delta > Math.PI) delta -= Math.PI * 2
            while (delta < -Math.PI) delta += Math.PI * 2
            heading.set(e.id, (heading.get(e.id) ?? want) + delta * 0.25)
          }
          const h = heading.get(e.id)
          if (h !== undefined) g.rotation = h + Math.sin(cur.tick * 0.25 + e.id) * 0.12
        }
      }
      for (let i = cur.enemies.length; i < enemyPool.length; i++) enemyPool[i]!.visible = false

      drawPlayer(cur, lerp(prev.player.x, cur.player.x, t), lerp(prev.player.y, cur.player.y, t))
      drawPowers(cur)

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

      const nextPops: Pop[] = []
      for (const q of pops) {
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

      drawHud(cur)
      drawOverlay(cur)
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
