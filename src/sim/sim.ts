import { Packer } from "./hash.ts"
import { createRng } from "./rng.ts"
import type { Body, InputFrame, Sim, SimSnapshot, SimState, Tuning } from "./types.ts"

/**
 * CENA DESCARTÁVEL — HARNESS.md §5.
 *
 * Um quadrado que se move e colide com outro quadrado. Existe só para validar o
 * rig: determinismo, replay, hash, `tuning.json`. Apagar inteira quando o jogo
 * de verdade chegar. Não construir gameplay em cima disto.
 */

/** Oito direções unitárias, literais. Nada de `sin`/`cos` dentro da sim. */
const DIAG = 0.7071067811865476
const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [DIAG, -DIAG],
  [1, 0],
  [DIAG, DIAG],
  [0, 1],
  [-DIAG, DIAG],
  [-1, 0],
  [-DIAG, -DIAG],
]

function overlaps(a: Body, b: Body): boolean {
  const ah = a.size / 2
  const bh = b.size / 2
  return (
    a.x - ah < b.x + bh && a.x + ah > b.x - bh && a.y - ah < b.y + bh && a.y + ah > b.y - bh
  )
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function createSim(seed: number, tuning: Tuning): Sim {
  const rng = createRng(seed)
  const dt = 1 / tuning.sim.hz
  const { width, height } = tuning.arena
  const packer = new Packer(96)

  const spawn = (size: number): { x: number; y: number } => ({
    x: size / 2 + rng.nextFloat() * (width - size),
    y: size / 2 + rng.nextFloat() * (height - size),
  })

  const rollDirection = (speed: number): { vx: number; vy: number } => {
    const [dx, dy] = DIRS8[rng.nextInt(0, DIRS8.length)]!
    return { vx: dx * speed, vy: dy * speed }
  }

  const drifterSpawn = spawn(tuning.drifter.size)
  const drifterDir = rollDirection(tuning.drifter.speed)

  const s: SimState = {
    tick: 0,
    player: { x: width / 2, y: height / 2, vx: 0, vy: 0, size: tuning.player.size },
    drifter: {
      x: drifterSpawn.x,
      y: drifterSpawn.y,
      vx: drifterDir.vx,
      vy: drifterDir.vy,
      size: tuning.drifter.size,
    },
    collisions: 0,
    overlapping: false,
    prevAction: false,
    rngState: rng.state(),
  }

  const step = (input: InputFrame): void => {
    // --- jogador: direção a partir do input, normalizada na diagonal
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
    if (dx !== 0 && dy !== 0) {
      dx *= DIAG
      dy *= DIAG
    }
    s.player.vx = dx * tuning.player.speed
    s.player.vy = dy * tuning.player.speed
    s.player.x = clamp(
      s.player.x + s.player.vx * dt,
      s.player.size / 2,
      width - s.player.size / 2,
    )
    s.player.y = clamp(
      s.player.y + s.player.vy * dt,
      s.player.size / 2,
      height - s.player.size / 2,
    )

    // --- ação (borda de subida): reposiciona o drifter. Exercita a RNG.
    if (input.action && !s.prevAction) {
      const p = spawn(s.drifter.size)
      s.drifter.x = p.x
      s.drifter.y = p.y
    }
    s.prevAction = input.action

    // --- drifter: anda e quica nas paredes
    const half = s.drifter.size / 2
    s.drifter.x += s.drifter.vx * dt
    s.drifter.y += s.drifter.vy * dt
    if (s.drifter.x < half) {
      s.drifter.x = half
      s.drifter.vx = -s.drifter.vx
    } else if (s.drifter.x > width - half) {
      s.drifter.x = width - half
      s.drifter.vx = -s.drifter.vx
    }
    if (s.drifter.y < half) {
      s.drifter.y = half
      s.drifter.vy = -s.drifter.vy
    } else if (s.drifter.y > height - half) {
      s.drifter.y = height - half
      s.drifter.vy = -s.drifter.vy
    }

    // --- colisão: conta só na entrada, e re-sorteia a direção do drifter
    const hit = overlaps(s.player, s.drifter)
    if (hit && !s.overlapping) {
      s.collisions++
      const d = rollDirection(tuning.drifter.speed)
      s.drifter.vx = d.vx
      s.drifter.vy = d.vy
    }
    s.overlapping = hit

    s.rngState = rng.state()
    s.tick++
  }

  const snapshot = (): SimSnapshot => ({
    tick: s.tick,
    hash: packer
      .reset()
      .u32(s.tick)
      .f64(s.player.x)
      .f64(s.player.y)
      .f64(s.player.vx)
      .f64(s.player.vy)
      .f64(s.drifter.x)
      .f64(s.drifter.y)
      .f64(s.drifter.vx)
      .f64(s.drifter.vy)
      .u32(s.collisions)
      .u32(s.rngState)
      .bool(s.overlapping)
      .bool(s.prevAction)
      .digest(),
  })

  return {
    step,
    snapshot,
    serialize: () => structuredClone(s),
    state: () => s,
  }
}

/** Quantidade de entidades na cena. O runner escreve isto no `metrics.csv`. */
export const ENTITY_COUNT = 2
