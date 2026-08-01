import { describe, expect, it } from "vitest"
import { loadTuning } from "../src/harness/loadTuning.ts"
import { createSim } from "../src/sim/sim.ts"
import { applyModifiers, MODIFIERS } from "../src/sim/modifiers.ts"
import type { InputFrame, Sim, SimState } from "../src/sim/types.ts"

/**
 * As regras decididas em 31/07, asseridas mecanicamente. Cada uma destas é uma
 * pergunta que o Jucelinux não precisa mais responder.
 */

const tuning = loadTuning()

const IN = (o: Partial<InputFrame> = {}): InputFrame => ({
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  ...o,
})
const NONE = IN()
const RIGHT = IN({ right: true })
const SPACE = IN({ action: true })

const advance = (sim: Sim, ticks: number, input: InputFrame = NONE): void => {
  for (let i = 0; i < ticks; i++) sim.step(input)
}

/** `state()` devolve o objeto vivo — é a costura que deixa o teste montar cenas. */
const mut = (sim: Sim): SimState => sim.state() as SimState

const putEnemyOnPlayer = (sim: Sim): void => {
  const s = mut(sim)
  s.enemies = [{ x: s.player.x, y: s.player.y, bornTick: s.tick }]
}

/** Um dash completo mais a recuperação: volta ao estado de poder dashar. */
const fullDash = (sim: Sim): void => {
  const s = mut(sim)
  s.enemies = []
  advance(sim, tuning.dash.durationTicks + tuning.dash.recoveryTicks, RIGHT)
}

describe("dilatação — o tempo só anda quando você anda", () => {
  it("parado, o mundo escorre a creep; dashando, anda cheio", () => {
    const sim = createSim(1, tuning)
    advance(sim, 5)
    expect(sim.state().worldScale).toBe(tuning.time.creep)

    sim.step(RIGHT)
    expect(sim.state().worldScale).toBe(1)
  })

  it("nunca chega a zero — a decisão foi pressão constante, não puzzle", () => {
    const sim = createSim(2, tuning)
    const scales: number[] = []
    for (let i = 0; i < 600; i++) {
      sim.step(i % 40 < 10 ? RIGHT : NONE)
      scales.push(sim.state().worldScale)
    }
    expect(Math.min(...scales)).toBeGreaterThan(0)
  })

  it("nem com o modificador de creep empilhado até o teto", () => {
    const maxed = MODIFIERS.map((m) => (m.id === 3 ? 99 : 0))
    expect(applyModifiers(tuning, maxed).creep).toBeGreaterThan(0)
  })

  it("inimigos praticamente congelam com o jogador parado", () => {
    const sim = createSim(3, tuning)
    advance(sim, 120, RIGHT) // gera inimigos com tempo de mundo
    const s = mut(sim)
    s.enemies = [{ x: 40, y: 40, bornTick: s.tick }]
    const before = { x: s.enemies[0]!.x, y: s.enemies[0]!.y }
    advance(sim, 60) // um segundo real parado
    const moved = Math.abs(s.enemies[0]!.x - before.x) + Math.abs(s.enemies[0]!.y - before.y)
    expect(moved).toBeLessThan(tuning.enemy.speed * 0.1)
  })
})

describe("dash — um verbo, oito direções", () => {
  it("as oito direções são unitárias; nada fora da grade", () => {
    const combos: Array<Partial<InputFrame>> = [
      { up: true },
      { down: true },
      { left: true },
      { right: true },
      { up: true, left: true },
      { up: true, right: true },
      { down: true, left: true },
      { down: true, right: true },
    ]
    for (const combo of combos) {
      const sim = createSim(4, tuning)
      sim.step(IN(combo))
      const { dashDx, dashDy } = sim.state().player
      expect(Math.sqrt(dashDx * dashDx + dashDy * dashDy)).toBeCloseTo(1, 10)
    }
  })

  it("não dá pra dashar durante a recuperação — é ela que devolve o creep", () => {
    const sim = createSim(5, tuning)
    advance(sim, tuning.dash.durationTicks, RIGHT)
    expect(sim.state().player.dashTicks).toBe(0)
    expect(sim.state().player.recoverTicks).toBeGreaterThan(0)

    sim.step(RIGHT)
    expect(sim.state().player.dashTicks).toBe(0) // segurou, mas não saiu
    expect(sim.state().worldScale).toBe(tuning.time.creep)
  })

  it("mover é atacar: dash corta, parado não", () => {
    const parado = createSim(6, tuning)
    putEnemyOnPlayer(parado)
    parado.step(NONE)
    expect(parado.state().kills).toBe(0)

    const dashando = createSim(6, tuning)
    putEnemyOnPlayer(dashando)
    dashando.step(RIGHT)
    expect(dashando.state().kills).toBe(1)
  })

  it("o corte respeita o killRadius", () => {
    const sim = createSim(7, tuning)
    const s = mut(sim)
    s.enemies = [{ x: s.player.x, y: s.player.y - tuning.dash.killRadius * 3, bornTick: 0 }]
    sim.step(RIGHT)
    expect(sim.state().kills).toBe(0)
    expect(sim.state().enemies).toHaveLength(1)
  })
})

describe("vidas e i-frames", () => {
  it("três toques encerram a run", () => {
    const sim = createSim(8, tuning)
    expect(sim.state().lives).toBe(tuning.run.lives)

    for (let hit = 1; hit <= tuning.run.lives; hit++) {
      putEnemyOnPlayer(sim)
      sim.step(NONE)
      expect(sim.state().lives).toBe(tuning.run.lives - hit)
      if (hit < tuning.run.lives) fullDash(sim)
    }
    expect(sim.state().phase).toBe("pick")
    expect(sim.state().runIndex).toBe(1)
  })

  it("invulnerável do impacto até o FIM do próximo dash, não por timer", () => {
    const sim = createSim(9, tuning)
    putEnemyOnPlayer(sim)
    sim.step(NONE)
    expect(sim.state().player.invulnerable).toBe(true)

    // Muito tempo parado não cura: a regra não tem número.
    advance(sim, 600)
    expect(sim.state().player.invulnerable).toBe(true)

    mut(sim).enemies = []
    advance(sim, tuning.dash.durationTicks - 1, RIGHT)
    expect(sim.state().player.invulnerable).toBe(true) // ainda no ar

    sim.step(RIGHT)
    expect(sim.state().player.dashTicks).toBe(0)
    expect(sim.state().player.invulnerable).toBe(false) // caiu no pouso
  })

  it("invulnerável não perde vida", () => {
    const sim = createSim(10, tuning)
    putEnemyOnPlayer(sim)
    sim.step(NONE)
    const lives = sim.state().lives

    for (let i = 0; i < 30; i++) {
      putEnemyOnPlayer(sim)
      sim.step(NONE)
    }
    expect(sim.state().lives).toBe(lives)
  })
})

describe("camada roguelite", () => {
  const toPick = (sim: Sim): void => {
    for (let hit = 0; hit < tuning.run.lives; hit++) {
      putEnemyOnPlayer(sim)
      sim.step(NONE)
      if (sim.state().phase === "run") fullDash(sim)
    }
  }

  it("morreu → oferece 3 distintos", () => {
    const sim = createSim(11, tuning)
    toPick(sim)
    expect(sim.state().phase).toBe("pick")
    expect(sim.state().offer).toHaveLength(tuning.pick.offerCount)
    expect(new Set(sim.state().offer).size).toBe(tuning.pick.offerCount)
  })

  it("←/→ move o cursor, espaço confirma e a run recomeça na hora", () => {
    const sim = createSim(12, tuning)
    toPick(sim)
    const chosen = sim.state().offer[1]!

    sim.step(RIGHT) // borda de subida move o cursor
    expect(sim.state().cursor).toBe(1)
    sim.step(SPACE)

    expect(sim.state().owned[chosen]).toBe(1)
    expect(sim.state().phase).toBe("run")
    expect(sim.state().kills).toBe(0)
    expect(sim.state().enemies).toHaveLength(0)
  })

  it("FÔLEGO devolve a run com uma vida a mais", () => {
    const sim = createSim(13, tuning)
    toPick(sim)
    // Escolhe direto no estado: qual card sorteou é irrelevante para a regra.
    mut(sim).offer = [2]
    mut(sim).cursor = 0
    sim.step(SPACE)
    expect(sim.state().lives).toBe(tuning.run.lives + 1)
  })

  it("segurar a tecla não escolhe sozinho — só borda de subida", () => {
    const sim = createSim(14, tuning)
    toPick(sim)
    const start = sim.state().cursor
    advance(sim, 20, RIGHT)
    expect(sim.state().cursor).toBe((start + 1) % tuning.pick.offerCount)
  })

  it("todo modificador do pool é aplicável e muda algum número", () => {
    const base = applyModifiers(tuning, [])
    for (const mod of MODIFIERS) {
      const owned = MODIFIERS.map((m) => (m.id === mod.id ? 1 : 0))
      expect(applyModifiers(tuning, owned), mod.name).not.toEqual(base)
    }
  })
})
