import { Application, Container, Graphics, Text, TextStyle } from "pixi.js"
import { MODIFIERS } from "../sim/modifiers.ts"
import type { SimState, Tuning } from "../sim/types.ts"

/**
 * Render. Só primitivas: quadrado, losango, linha, cor sólida — decisão de
 * 31/07, restrição vira identidade.
 *
 * A sim anda em passos fixos de 1/60 de tempo de mundo; aqui só interpolamos
 * entre o estado anterior e o atual. Nada de lógica dependendo do relógio.
 */
export interface Renderer {
  draw(prev: SimState, cur: SimState, alpha: number): void
  destroy(): void
}

const COLOR_BG = 0x0b0b0f
const COLOR_ARENA = 0x15151d
const COLOR_PLAYER = 0xf2f2f7
const COLOR_PLAYER_DASH = 0x6ee7ff
const COLOR_PLAYER_HURT = 0xff4d6d
const COLOR_ENEMY = 0xff5a3c
const COLOR_DIM = 0x4a4a5a

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Losango: um quadrado girado. Continua sendo primitiva. */
function diamond(g: Graphics, size: number, color: number): void {
  const h = size / 2
  g.clear().poly([0, -h, h, 0, 0, h, -h, 0]).fill(color)
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
  app.ticker.stop() // o laço é nosso; o Pixi desenha quando mandamos
  mount.appendChild(app.canvas)

  const floor = new Graphics()
  floor.rect(0, 0, tuning.arena.width, tuning.arena.height).fill(COLOR_ARENA)

  const enemyLayer = new Container()
  const player = new Graphics()
  const hud = new Container()
  const pickLayer = new Container()
  app.stage.addChild(floor, enemyLayer, player, hud, pickLayer)

  // --- HUD: vidas como quadradinhos, kills como número
  const hudStyle = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: COLOR_DIM })
  const killsText = new Text({ text: "", style: hudStyle })
  killsText.position.set(10, 8)
  const lives = new Graphics()
  hud.addChild(lives, killsText)

  // --- barra de tempo de mundo: a leitura mais direta da regra do jogo
  const clockBar = new Graphics()
  hud.addChild(clockBar)

  // --- tela de escolha
  const pickBg = new Graphics()
  const pickTitle = new Text({
    text: "",
    style: new TextStyle({ fontFamily: "monospace", fontSize: 15, fill: COLOR_PLAYER }),
  })
  pickLayer.addChild(pickBg, pickTitle)
  const cards = MODIFIERS.map(() => {
    const box = new Graphics()
    const name = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: COLOR_PLAYER }),
    })
    const blurb = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: COLOR_DIM }),
    })
    const group = new Container()
    group.addChild(box, name, blurb)
    group.visible = false
    pickLayer.addChild(group)
    return { group, box, name, blurb }
  })

  const enemyPool: Graphics[] = []
  const enemyFor = (i: number): Graphics => {
    let g = enemyPool[i]
    if (g === undefined) {
      g = new Graphics()
      diamond(g, tuning.enemy.size, COLOR_ENEMY)
      enemyPool[i] = g
      enemyLayer.addChild(g)
    }
    return g
  }

  const drawPlayer = (cur: SimState, x: number, y: number): void => {
    const dashing = cur.player.dashTicks > 0
    const color = cur.player.invulnerable
      ? COLOR_PLAYER_HURT
      : dashing
        ? COLOR_PLAYER_DASH
        : COLOR_PLAYER
    const size = tuning.player.size
    player.clear()
    // Rastro do dash: uma linha atrás, não um sprite.
    if (dashing) {
      player
        .moveTo(x - cur.player.dashDx * 26, y - cur.player.dashDy * 26)
        .lineTo(x, y)
        .stroke({ width: 3, color: COLOR_PLAYER_DASH, alpha: 0.5 })
    }
    player.rect(x - size / 2, y - size / 2, size, size).fill(color)
    // Piscada dos i-frames: contorno, sem alterar a silhueta.
    if (cur.player.invulnerable && cur.tick % 12 < 6) {
      player
        .rect(x - size / 2 - 3, y - size / 2 - 3, size + 6, size + 6)
        .stroke({ width: 1, color: COLOR_PLAYER_HURT, alpha: 0.8 })
    }
  }

  const drawHud = (cur: SimState): void => {
    lives.clear()
    for (let i = 0; i < Math.max(0, cur.lives); i++) {
      lives.rect(tuning.arena.width - 16 - i * 12, 10, 8, 8).fill(COLOR_PLAYER)
    }
    killsText.text = `${cur.kills}${cur.bestKills > 0 ? `  melhor ${cur.bestKills}` : ""}`

    // Largura proporcional à velocidade do mundo agora: creep é quase nada.
    clockBar.clear()
    const w = (tuning.arena.width - 20) * cur.worldScale
    clockBar.rect(10, tuning.arena.height - 8, w, 3).fill(COLOR_PLAYER_DASH)
  }

  const drawPick = (cur: SimState): void => {
    const on = cur.phase === "pick"
    pickLayer.visible = on
    if (!on) return

    pickBg
      .clear()
      .rect(0, 0, tuning.arena.width, tuning.arena.height)
      .fill({ color: COLOR_BG, alpha: 0.88 })
    pickTitle.text = `caiu com ${cur.kills}.  ←/→ escolhe, espaço confirma`
    pickTitle.position.set(
      (tuning.arena.width - pickTitle.width) / 2,
      tuning.arena.height / 2 - 92,
    )

    const cardW = 168
    const cardH = 96
    const gap = 14
    const total = cur.offer.length * cardW + (cur.offer.length - 1) * gap
    let x = (tuning.arena.width - total) / 2
    const y = tuning.arena.height / 2 - cardH / 2

    for (const [i, card] of cards.entries()) {
      const id = cur.offer[i]
      card.group.visible = id !== undefined
      if (id === undefined) continue
      const mod = MODIFIERS[id]!
      const selected = i === cur.cursor
      card.box
        .clear()
        .rect(0, 0, cardW, cardH)
        .fill({ color: COLOR_ARENA, alpha: 1 })
        .stroke({ width: selected ? 2 : 1, color: selected ? COLOR_PLAYER_DASH : COLOR_DIM })
      card.name.text = mod.name
      card.blurb.text = mod.blurb
      const owned = cur.owned[mod.id] ?? 0
      if (owned > 0) card.name.text = `${mod.name} ×${owned + 1}`
      card.name.position.set(14, 22)
      card.blurb.position.set(14, 46)
      card.group.position.set(x, y)
      x += cardW + gap
    }
  }

  return {
    draw(prev, cur, alpha) {
      drawPlayer(cur, lerp(prev.player.x, cur.player.x, alpha), lerp(prev.player.y, cur.player.y, alpha))

      for (let i = 0; i < cur.enemies.length; i++) {
        const e = cur.enemies[i]!
        const g = enemyFor(i)
        // Inimigos entram e saem da lista; casar por índice interpolaria entre
        // dois inimigos diferentes. Só interpola quando o par bate pelo bornTick.
        const p = prev.enemies[i]
        const same = p !== undefined && p.bornTick === e.bornTick
        g.visible = true
        g.position.set(
          same ? lerp(p.x, e.x, alpha) : e.x,
          same ? lerp(p.y, e.y, alpha) : e.y,
        )
        // Nasce pequeno: 10 ticks de escala, o suficiente pra não aparecer do nada.
        const age = Math.min(1, (cur.tick - e.bornTick) / 10)
        g.scale.set(0.3 + 0.7 * age)
      }
      for (let i = cur.enemies.length; i < enemyPool.length; i++) {
        enemyPool[i]!.visible = false
      }

      drawHud(cur)
      drawPick(cur)
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
