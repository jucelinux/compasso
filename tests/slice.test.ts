import { describe, expect, it } from "vitest"
import { loadTuning } from "../src/harness/loadTuning.ts"
import { createSim } from "../src/sim/sim.ts"
import { activeStats, POWERS, quotaFor, spawnIntervalFor } from "../src/sim/powers.ts"
import type { InputFrame, Sim, SimState } from "../src/sim/types.ts"

/**
 * As regras do core reescrito em 01/08, asseridas mecanicamente.
 *
 * O core anterior (dash discreto + creep binário) caiu no gate depois de três
 * leituras negativas. O que se mede aqui é o novo: a velocidade É o relógio, e
 * o contato engole ou machuca conforme ela.
 */

const tuning = loadTuning()

const IN = (o: Partial<InputFrame> = {}): InputFrame => ({
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  restart: false,
  ...o,
})
const NONE = IN()
const RIGHT = IN({ right: true })
const RESTART = IN({ restart: true })

const advance = (sim: Sim, ticks: number, input: InputFrame = NONE): void => {
  for (let i = 0; i < ticks; i++) sim.step(input)
}

const mut = (sim: Sim): SimState => sim.state() as SimState

let nextId = 100000
const id = (): number => nextId++
const virus = (x: number, y: number, kind = "influenza", tick = -1000) => ({
  id: id(),
  kind,
  x,
  y,
  hp: tuning.enemy.kinds[kind]!.hp,
  bornTick: tick,
})

/** Leva a célula ao talo, com o campo limpo, e recentraliza sem frear. */
const toFullSpeed = (sim: Sim): void => {
  mut(sim).enemies = []
  let guard = 0
  while (sim.state().player.speed < 0.99) {
    sim.step(RIGHT)
    mut(sim).player.x = tuning.arena.width / 2
    if (++guard > 400) throw new Error("não chegou à velocidade máxima")
  }
  mut(sim).player.y = tuning.arena.height / 2
}

describe("o relógio é a velocidade", () => {
  it("parada, o mundo escorre no mínimo; a toda, corre inteiro", () => {
    const sim = createSim(1, tuning)
    advance(sim, 60)
    expect(sim.state().worldScale).toBeCloseTo(tuning.time.creep, 5)

    toFullSpeed(sim)
    expect(sim.state().worldScale).toBeCloseTo(1, 2)
  })

  it("a escala é contínua — nada de degrau", () => {
    const sim = createSim(2, tuning)
    mut(sim).enemies = []
    const scales: number[] = []
    for (let i = 0; i < 30; i++) {
      sim.step(RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      scales.push(sim.state().worldScale)
    }
    // Cresce sem degrau enquanto acelera e satura no talo. O "soluço" que o
    // dash discreto produzia é exatamente o que este core existe para eliminar.
    for (let i = 1; i < 10; i++) expect(scales[i]!).toBeGreaterThan(scales[i - 1]!)
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]!).toBeGreaterThanOrEqual(scales[i - 1]! - 1e-9)
    }
    const saltos = scales.slice(1).map((v, i) => v - scales[i]!)
    expect(Math.max(...saltos)).toBeLessThan(0.12)
  })

  it("nunca chega a zero — pressão constante, decisão de 31/07", () => {
    const sim = createSim(3, tuning)
    const scales: number[] = []
    for (let i = 0; i < 600; i++) {
      sim.step(i % 90 < 30 ? RIGHT : NONE)
      scales.push(sim.state().worldScale)
    }
    expect(Math.min(...scales)).toBeGreaterThan(0)
    expect(Math.min(...scales)).toBeCloseTo(tuning.time.creep, 5)
  })

  it("patógeno anda em tempo de mundo; a célula, em tempo real", () => {
    const parada = createSim(4, tuning)
    mut(parada).enemies = [virus(600, 180)]
    advance(parada, 120)
    const andouParada = 600 - mut(parada).enemies[0]!.x

    const correndo = createSim(4, tuning)
    toFullSpeed(correndo)
    mut(correndo).enemies = [virus(600, 180)]
    for (let i = 0; i < 120; i++) {
      correndo.step(RIGHT)
      mut(correndo).player.x = tuning.arena.width / 2
    }
    const andouCorrendo = 600 - mut(correndo).enemies[0]!.x

    expect(andouCorrendo).toBeGreaterThan(andouParada * 4)
  })
})

describe("fagocitose por velocidade", () => {
  it("rápida engole; parada, apanha", () => {
    const parada = createSim(10, tuning)
    mut(parada).enemies = [virus(mut(parada).player.x, mut(parada).player.y)]
    parada.step(NONE)
    expect(parada.state().kills).toBe(0)
    expect(parada.state().lives).toBe(tuning.run.lives - 1)

    const rapida = createSim(10, tuning)
    toFullSpeed(rapida)
    mut(rapida).enemies = [virus(mut(rapida).player.x, mut(rapida).player.y)]
    rapida.step(RIGHT)
    expect(rapida.state().kills).toBe(1)
    expect(rapida.state().lives).toBe(tuning.run.lives)
  })

  it("cada patógeno exige a sua velocidade — senão é reskin", () => {
    const speeds = Object.values(tuning.enemy.kinds).map((v) => v.engulfSpeed)
    expect(new Set(speeds).size).toBeGreaterThan(3)
    expect(tuning.enemy.kinds["corona"]!.engulfSpeed).toBeGreaterThan(
      tuning.enemy.kinds["influenza"]!.engulfSpeed,
    )
  })

  it("velocidade que dá pra influenza não basta pro SARS-CoV-2", () => {
    const sim = createSim(11, tuning)
    mut(sim).enemies = []
    const alvo = tuning.enemy.kinds["influenza"]!.engulfSpeed + 0.05
    let guard = 0
    while (sim.state().player.speed < alvo) {
      sim.step(RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não acelerou")
    }
    expect(sim.state().player.speed).toBeLessThan(tuning.enemy.kinds["corona"]!.engulfSpeed)
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y, "corona")]
    sim.step(RIGHT)
    expect(sim.state().kills).toBe(0)
    expect(sim.state().lives).toBe(tuning.run.lives - 1)
  })

  it("apanhar te FREIA: o erro custa o relógio junto com a vida", () => {
    const sim = createSim(12, tuning)
    mut(sim).enemies = []
    // Rápida o bastante para influenza, lenta demais para o corona.
    let guard = 0
    while (sim.state().player.speed < 0.5) {
      sim.step(RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não acelerou")
    }
    const antes = sim.state().player.speed
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y, "corona")]
    sim.step(RIGHT)
    expect(sim.state().lives).toBe(tuning.run.lives - 1)
    expect(sim.state().player.speed).toBeLessThan(antes * 0.5)
  })
})

describe("i-frames caem ao engolir", () => {
  /** Apanha de propósito no corona, que exige 92% e portanto machuca a 50%. */
  const takeHit = (sim: Sim): void => {
    mut(sim).enemies = []
    let guard = 0
    while (sim.state().player.speed < 0.5) {
      sim.step(RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não acelerou")
    }
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y, "corona")]
    sim.step(RIGHT)
    mut(sim).enemies = []
    // o toque congela alguns ticks; passa por eles
    advance(sim, tuning.run.hitFreezeTicks + 1)
    if (!sim.state().player.invulnerable) throw new Error("não ficou invulnerável")
  }

  it("engolir por contato derruba a proteção", () => {
    const sim = createSim(21, tuning)
    takeHit(sim)
    let guard = 0
    while (sim.state().player.speed < 0.5) {
      sim.step(RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não reacelerou")
    }
    expect(sim.state().player.invulnerable).toBe(true)
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y)]
    sim.step(RIGHT)
    expect(sim.state().kills).toBeGreaterThan(0)
    expect(sim.state().player.invulnerable).toBe(false)
  })

  it("a proteção não expira sozinha — sem timer, decisão de 31/07", () => {
    const sim = createSim(22, tuning)
    takeHit(sim)
    // cinco segundos parada, sem engolir nada
    advance(sim, 300)
    expect(sim.state().player.invulnerable).toBe(true)
  })

  it("velocidade alta sozinha NÃO derruba mais a proteção", () => {
    // A regra antiga caía a 85% de velocidade, o que abria o buraco: bastava
    // ficar logo abaixo disso para comer cinco dos seis patógenos de graça.
    const sim = createSim(23, tuning)
    takeHit(sim)
    toFullSpeed(sim)
    expect(sim.state().player.speed).toBeGreaterThan(0.9)
    expect(sim.state().player.invulnerable).toBe(true)
  })

  it("abate passivo não conta: só o seu contato paga a conta", () => {
    const sim = createSim(24, tuning)
    takeHit(sim)
    // Macrófago mata sozinho, longe do corpo; a proteção tem que sobreviver.
    // O poder precisa estar ATIVO: sem ele a sim zera o array de macrófagos.
    const macrofago = POWERS.findIndex((p) => p.name === "MACRÓFAGO")
    mut(sim).active[macrofago] = 600
    advance(sim, 1)
    const m = sim.state().macrophages[0]!
    mut(sim).enemies = [virus(m.x, m.y)]
    const antes = sim.state().kills
    advance(sim, 2)
    expect(sim.state().kills, "o macrófago não matou").toBeGreaterThan(antes)
    expect(sim.state().player.invulnerable).toBe(true)
  })
})

describe("impulso é habilidade, não o verbo", () => {
  it("dispara na borda de subida e entra em recarga", () => {
    const sim = createSim(20, tuning)
    mut(sim).enemies = []
    advance(sim, 4, RIGHT)
    const antes = sim.state().player.speed

    sim.step(IN({ right: true, action: true }))
    expect(sim.state().player.speed).toBeGreaterThan(antes * 2)
    expect(sim.state().player.dashCooldown).toBeGreaterThan(0)
  })

  it("segurar a tecla não repete o impulso", () => {
    const sim = createSim(22, tuning)
    mut(sim).enemies = []
    advance(sim, 40, IN({ right: true, action: true }))
    expect(sim.state().player.dashCooldown).toBeGreaterThan(0)
  })
})

describe("poderes automáticos, temporários e aleatórios", () => {
  it("encostar na cápsula liga o poder por tempo", () => {
    const sim = createSim(30, tuning)
    const s = mut(sim)
    s.drops = [{ id: id(), power: 0, x: s.player.x, y: s.player.y, life: 100 }]
    sim.step(NONE)
    expect(sim.state().active[0]).toBe(tuning.drops.durationTicks)
    expect(sim.state().drops).toHaveLength(0)
  })

  it("o poder expira sozinho — nada é permanente", () => {
    const sim = createSim(31, tuning)
    mut(sim).active[0] = 5
    advance(sim, 6)
    expect(sim.state().active[0]).toBe(0)
    expect(activeStats(tuning, sim.state().active).trailTicks).toBe(0)
  })

  it("não existe tela de escolha: a fase de pick morreu junto", () => {
    const sim = createSim(32, tuning)
    const s = mut(sim)
    s.waveKills = s.quota
    s.enemies = []
    sim.step(NONE)
    expect(sim.state().phase).toBe("run")
    expect(sim.state().wave).toBe(2)
  })

  it("todo poder do sorteio faz alguma coisa", () => {
    const vazio = activeStats(
      tuning,
      POWERS.map(() => 0),
    )
    for (const pw of POWERS) {
      if (pw.id === 8 || pw.id === 9) continue // escudo e cura agem na hora
      const on = activeStats(
        tuning,
        POWERS.map((x) => (x.id === pw.id ? 100 : 0)),
      )
      expect(on, pw.name).not.toEqual(vazio)
    }
  })

  it("a cápsula some se ninguém pegar", () => {
    const sim = createSim(33, tuning)
    const s = mut(sim)
    s.player.x = 600
    s.player.y = 340
    s.drops = [{ id: id(), power: 1, x: 20, y: 20, life: 3 }]
    advance(sim, 5)
    expect(sim.state().drops).toHaveLength(0)
    expect(sim.state().active[1]).toBe(0)
  })
})

describe("progressão de onda", () => {
  it("a cota cresce em curva, não em soma", () => {
    const q = [1, 2, 5, 10].map((w) => quotaFor(tuning, w))
    // A queixa de 01/08 era que a cota parecia a mesma em todo nível.
    expect(q[3]! - q[2]!).toBeGreaterThan((q[1]! - q[0]!) * 2)
  })

  it("o spawn aperta pra sempre sem chegar a zero", () => {
    expect(spawnIntervalFor(tuning, 100)).toBeLessThan(spawnIntervalFor(tuning, 1))
    expect(spawnIntervalFor(tuning, 5000)).toBeGreaterThan(0)
  })

  it("a onda abre com patógenos em campo", () => {
    const sim = createSim(40, tuning)
    expect(sim.state().enemies.length).toBe(tuning.enemy.openingBase)
  })
})

describe("o organismo e o fim da run", () => {
  const reachCells = (sim: Sim): void => {
    let guard = 0
    while (sim.state().cells.length === 0) {
      const s = mut(sim)
      s.waveKills = s.quota
      s.enemies = []
      sim.step(NONE)
      if (++guard > 20) throw new Error("não chegou nas células")
    }
    mut(sim).player.x = tuning.arena.width / 2
    mut(sim).player.y = tuning.arena.height / 2
  }

  it("as células aparecem na onda marcada e só o invasor as come", () => {
    const sim = createSim(50, tuning)
    reachCells(sim)
    expect(sim.state().wave).toBeGreaterThanOrEqual(tuning.cells.fromWave)

    const cell = mut(sim).cells[0]!
    const hp = cell.hp
    mut(sim).enemies = [virus(cell.x, cell.y, "influenza")]
    sim.step(NONE)
    expect(sim.state().cells[0]!.hp, "influenza não come tecido").toBe(hp)

    mut(sim).enemies = [virus(cell.x, cell.y, "salmonela")]
    sim.step(NONE)
    expect(sim.state().cells[0]!.hp).toBe(hp - 1)
  })

  it("perder o organismo encerra a run mesmo com vidas sobrando", () => {
    const sim = createSim(51, tuning)
    reachCells(sim)

    let guard = 0
    while (sim.state().cells.length > 0 && sim.state().phase === "run") {
      const cell = mut(sim).cells[0]!
      mut(sim).enemies = [virus(cell.x, cell.y, "salmonela")]
      sim.step(NONE)
      if (++guard > 60) break
    }
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().lostByCells).toBe(true)
    expect(sim.state().lives).toBeGreaterThan(0)
  })
})

describe("o gate continua medível", () => {
  const die = (sim: Sim): void => {
    let guard = 0
    while (sim.state().phase === "run") {
      const s = mut(sim)
      s.player.vx = 0
      s.player.vy = 0
      s.player.invulnerable = false
      s.enemies = [virus(s.player.x, s.player.y, "corona")]
      sim.step(NONE)
      advance(sim, tuning.run.hitFreezeTicks + 1)
      if (++guard > 40) throw new Error("não morreu")
    }
  }

  it("morrer NÃO recomeça sozinho, e o impulso não vale como reinício", () => {
    const sim = createSim(60, tuning)
    die(sim)
    expect(sim.state().phase).toBe("dead")

    advance(sim, 900, IN({ action: true }))
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().runIndex).toBe(0)

    sim.step(RESTART)
    expect(sim.state().phase).toBe("run")
    expect(sim.state().runIndex).toBe(1)
    expect(sim.state().wave).toBe(1)
    expect(sim.state().active.every((n) => n === 0)).toBe(true)
  })
})
