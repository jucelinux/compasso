import { Application, Graphics } from "pixi.js"
import type { SimState, Tuning } from "../sim/types.ts"

/**
 * Render. Só primitivas: retângulo, linha, cor sólida.
 *
 * A sim anda em passos fixos de 1/60 de tempo de mundo; o render interpola entre
 * o estado anterior e o atual com `alpha`. Nunca lê o relógio pra decidir lógica.
 */
export interface Renderer {
  draw(prev: SimState, cur: SimState, alpha: number): void
  destroy(): void
}

const COLOR_ARENA = 0x14141c
const COLOR_PLAYER = 0xe8e8f0
const COLOR_DRIFTER = 0xff5a3c

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export async function createRenderer(mount: HTMLElement, tuning: Tuning): Promise<Renderer> {
  const app = new Application()
  await app.init({
    width: tuning.arena.width,
    height: tuning.arena.height,
    background: COLOR_ARENA,
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })
  app.ticker.stop() // o loop é nosso; o Pixi só desenha quando mandamos
  mount.appendChild(app.canvas)

  const player = new Graphics()
  const drifter = new Graphics()
  app.stage.addChild(player, drifter)

  const paint = (g: Graphics, size: number, color: number) => {
    g.clear().rect(-size / 2, -size / 2, size, size).fill(color)
  }
  paint(player, tuning.player.size, COLOR_PLAYER)
  paint(drifter, tuning.drifter.size, COLOR_DRIFTER)

  return {
    draw(prev, cur, alpha) {
      player.position.set(
        lerp(prev.player.x, cur.player.x, alpha),
        lerp(prev.player.y, cur.player.y, alpha),
      )
      // Teleporte e quique quebram a interpolação: um salto grande é um corte,
      // não um movimento.
      const jumped =
        Math.abs(cur.drifter.x - prev.drifter.x) > cur.drifter.size ||
        Math.abs(cur.drifter.y - prev.drifter.y) > cur.drifter.size
      drifter.position.set(
        jumped ? cur.drifter.x : lerp(prev.drifter.x, cur.drifter.x, alpha),
        jumped ? cur.drifter.y : lerp(prev.drifter.y, cur.drifter.y, alpha),
      )
      app.render()
    },
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
