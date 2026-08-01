import { describe, expect, it } from "vitest"
import { loadTuning } from "../src/harness/loadTuning.ts"
import { createSim } from "../src/sim/sim.ts"
import {
  applyModifiers,
  MODIFIERS,
  MOD_EXTRA_LIFE,
  MOD_REPAIR,
  waveStats,
} from "../src/sim/modifiers.ts"
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
  restart: false,
  ...o,
})
const NONE = IN()
const RIGHT = IN({ right: true })
const SPACE = IN({ action: true })
const RESTART = IN({ restart: true })

const advance = (sim: Sim, ticks: number, input: InputFrame = NONE): void => {
  for (let i = 0; i < ticks; i++) sim.step(input)
}

/** Ids sintéticos altos: não colidem com os que a sim gera. */
let nextId = 100000
const id = (): number => nextId++
/** Vírus comum sintético: o tipo padrão, 1 de vida. */
const virus = (x: number, y: number, tick = -1000, kind = "comum") => ({
  id: id(),
  kind,
  x,
  y,
  hp: tuning.enemy.kinds[kind]!.hp,
  bornTick: tick,
})

/** `state()` devolve o objeto vivo — é a costura que deixa o teste montar cenas. */
const mut = (sim: Sim): SimState => sim.state() as SimState

/** Em cima do jogador: serve pra APANHAR, nunca pra cortar. */
const putEnemyOnPlayer = (sim: Sim, count = 1): void => {
  const s = mut(sim)
  s.enemies = Array.from({ length: count }, () => virus(s.player.x, s.player.y))
}

/**
 * À frente de um dash para a direita. Precisa estar adiante o bastante para
 * continuar na frente depois do primeiro tick de deslocamento — com o corte
 * direcional, quem está colado no jogador acaba ATRÁS e vira um toque.
 */
const putEnemyAhead = (sim: Sim, count = 1): void => {
  const s = mut(sim)
  s.enemies = Array.from({ length: count }, () => virus(s.player.x + 20, s.player.y))
}

/**
 * Espera o dash e a recuperação terminarem, sem tocar em nada.
 * Sai se a run acabar: fora da fase `run` os contadores não andam, e sem esta
 * guarda o teste trava para sempre em vez de falhar.
 */
const untilReady = (sim: Sim): void => {
  let guard = 0
  while (
    sim.state().phase === "run" &&
    (sim.state().player.dashTicks > 0 || sim.state().player.recoverTicks > 0)
  ) {
    sim.step(NONE)
    if (++guard > 600) throw new Error("untilReady não convergiu")
  }
}

/** Um dash completo mais a recuperação: volta ao estado de poder dashar. */
const fullDash = (sim: Sim): void => {
  mut(sim).enemies = []
  sim.step(RIGHT)
  untilReady(sim)
}

/**
 * Enche a cota de uma vez: um dash corta tudo que estiver no mesmo ponto.
 * Solta a tecla no fim — quem limpou a onda dashando ainda está segurando a
 * direção, e o cursor da escolha só anda em borda de subida.
 */
const clearWave = (sim: Sim): void => {
  untilReady(sim)
  if (sim.state().phase !== "run") return
  const s = mut(sim)
  putEnemyAhead(sim, s.quota - s.waveKills)
  sim.step(RIGHT)
  sim.step(NONE)
}

/** Leva a run até a morte, respeitando os i-frames entre os toques. */
const die = (sim: Sim): void => {
  while (sim.state().phase === "run") {
    putEnemyOnPlayer(sim)
    sim.step(NONE)
    if (sim.state().phase === "run") fullDash(sim)
  }
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
    const run = applyModifiers(tuning, maxed)
    expect(waveStats(tuning, run, 1).creep).toBeGreaterThan(0)
  })

  it("inimigos praticamente congelam com o jogador parado", () => {
    const sim = createSim(3, tuning)
    const s = mut(sim)
    s.enemies = [virus(40, 40)]
    const before = { x: s.enemies[0]!.x, y: s.enemies[0]!.y }
    advance(sim, 60) // um segundo real parado
    const moved = Math.abs(s.enemies[0]!.x - before.x) + Math.abs(s.enemies[0]!.y - before.y)
    expect(moved).toBeLessThan(tuning.enemy.kinds["comum"]!.speed * 0.1)
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
    putEnemyAhead(dashando)
    dashando.step(RIGHT)
    expect(dashando.state().kills).toBe(1)
  })

  it("corta pra onde vai; quem está atrás sobrevive e cobra", () => {
    const sim = createSim(30, tuning)
    const s = mut(sim)
    const d = tuning.dash.killRadius * 0.6
    // Um à frente do dash (direita), um exatamente atrás.
    s.enemies = [
      virus(s.player.x + d, s.player.y, 0),
      virus(s.player.x - d, s.player.y, 0),
    ]
    sim.step(RIGHT)
    expect(sim.state().kills).toBe(1)
    expect(sim.state().enemies).toHaveLength(1)
    expect(sim.state().enemies[0]!.x).toBeLessThan(sim.state().player.x)
  })

  it("apanhar no meio do dash: os i-frames valem até o fim do PRÓXIMO", () => {
    const sim = createSim(31, tuning)
    putEnemyOnPlayer(sim)
    // Dasha pra longe do inimigo: ele fica atrás, não morre, e encosta.
    mut(sim).enemies = [virus(sim.state().player.x - 4, sim.state().player.y)]
    sim.step(RIGHT)
    expect(sim.state().player.invulnerable).toBe(true)
    expect(sim.state().player.invulnSkipCurrent).toBe(true)

    // O dash em curso termina — e NÃO derruba os i-frames.
    while (sim.state().player.dashTicks > 0) sim.step(RIGHT)
    expect(sim.state().player.invulnerable).toBe(true)

    // O próximo é que derruba.
    untilReady(sim)
    mut(sim).enemies = []
    while (sim.state().player.dashTicks !== 0 || sim.state().player.recoverTicks === 0) {
      sim.step(RIGHT)
    }
    expect(sim.state().player.invulnerable).toBe(false)
  })

  it("o corte respeita o killRadius", () => {
    const sim = createSim(7, tuning)
    const s = mut(sim)
    s.enemies = [virus(s.player.x, s.player.y - tuning.dash.killRadius * 3, 0)]
    sim.step(RIGHT)
    expect(sim.state().kills).toBe(0)
    expect(sim.state().enemies).toHaveLength(1)
  })
})

describe("vidas e i-frames", () => {
  it("três toques encerram a run", () => {
    const sim = createSim(8, tuning)
    expect(sim.state().lives).toBe(tuning.run.lives)
    die(sim)
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().lives).toBeLessThanOrEqual(0)
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

describe("ondas — cota de kills, nunca temporizador", () => {
  it("parado, a onda não anda: não dá pra esperar a fase passar", () => {
    const sim = createSim(20, tuning)
    const before = sim.state().wave
    advance(sim, 3600) // um minuto real inteiro sem tocar em nada
    expect(sim.state().wave).toBe(before)
    expect(sim.state().waveKills).toBe(0)
  })

  it("bater a cota abre a escolha", () => {
    const sim = createSim(21, tuning)
    expect(sim.state().quota).toBe(tuning.wave.baseQuota)
    clearWave(sim)
    expect(sim.state().phase).toBe("pick")
    expect(sim.state().offer).toHaveLength(tuning.pick.offerCount)
    expect(new Set(sim.state().offer).size).toBe(tuning.pick.offerCount)
  })

  it("confirmar avança a onda e reabre o tabuleiro", () => {
    const sim = createSim(22, tuning)
    clearWave(sim)
    sim.step(SPACE)
    expect(sim.state().phase).toBe("run")
    expect(sim.state().wave).toBe(2)
    expect(sim.state().waveKills).toBe(0)
    expect(sim.state().quota).toBe(tuning.wave.baseQuota + tuning.wave.quotaGrowth)
  })

  it("a onda abre com inimigos em campo — tabuleiro vazio vira espera", () => {
    const sim = createSim(29, tuning)
    expect(sim.state().enemies.length).toBe(tuning.enemy.openingBase)

    clearWave(sim)
    sim.step(SPACE)
    expect(sim.state().enemies.length).toBe(
      tuning.enemy.openingBase + tuning.enemy.openingPerWave,
    )
  })

  it("a folga encolhe onda a onda", () => {
    const run = applyModifiers(tuning, [])
    const w1 = waveStats(tuning, run, 1)
    const w6 = waveStats(tuning, run, 6)
    expect(w6.creep).toBeGreaterThan(w1.creep)
    expect(w6.recoveryTicks).toBeLessThan(w1.recoveryTicks)
    expect(w6.spawnIntervalSeconds).toBeLessThan(w1.spawnIntervalSeconds)
    expect(w6.quota).toBeGreaterThan(w1.quota)
  })

  it("sem teto: o creep continua subindo onde a versão anterior saturava", () => {
    const run = applyModifiers(tuning, [])
    const creeps = [10, 30, 60, 120, 400].map((w) => waveStats(tuning, run, w).creep)
    for (let i = 1; i < creeps.length; i++) {
      expect(creeps[i]!).toBeGreaterThan(creeps[i - 1]!)
    }
    // Lá na frente, ficar parado deixa de ser descanso.
    expect(waveStats(tuning, run, 25).creep).toBeGreaterThan(0.5)
  })

  it("spawn aperta pra sempre sem nunca chegar a zero", () => {
    const run = applyModifiers(tuning, [])
    const a = waveStats(tuning, run, 100).spawnIntervalSeconds
    const b = waveStats(tuning, run, 1000).spawnIntervalSeconds
    expect(b).toBeLessThan(a)
    expect(b).toBeGreaterThan(0)
  })

  it("a recuperação tem piso de 1 tick — zero emendaria os dashes e mataria a dilatação", () => {
    const run = applyModifiers(tuning, [])
    for (const w of [50, 500, 5000]) {
      expect(waveStats(tuning, run, w).recoveryTicks).toBe(tuning.dash.minRecoveryTicks)
      expect(waveStats(tuning, run, w).recoveryTicks).toBeGreaterThan(0)
    }
  })
})

describe("camada roguelite — arco dentro da run", () => {
  it("←/→ move o cursor, espaço confirma", () => {
    const sim = createSim(23, tuning)
    clearWave(sim)
    const chosen = sim.state().offer[1]!

    sim.step(RIGHT)
    expect(sim.state().cursor).toBe(1)
    sim.step(SPACE)
    expect(sim.state().owned[chosen]).toBe(1)
  })

  it("segurar a tecla não escolhe sozinho — só borda de subida", () => {
    const sim = createSim(24, tuning)
    clearWave(sim)
    const start = sim.state().cursor
    advance(sim, 20, RIGHT)
    expect(sim.state().phase).toBe("pick")
    expect(sim.state().cursor).toBe((start + 1) % tuning.pick.offerCount)
  })

  it("FÔLEGO entra na hora, não só no próximo cálculo", () => {
    const sim = createSim(25, tuning)
    clearWave(sim)
    const lives = sim.state().lives
    mut(sim).offer = [MOD_EXTRA_LIFE]
    mut(sim).cursor = 0
    sim.step(SPACE)
    expect(sim.state().lives).toBe(lives + 1)
  })

  it("morrer perde os modificadores e volta pra onda 1", () => {
    const sim = createSim(26, tuning)
    clearWave(sim)
    sim.step(SPACE)
    clearWave(sim)
    sim.step(SPACE)
    expect(sim.state().wave).toBe(3)
    expect(sim.state().owned.reduce((a, b) => a + b, 0)).toBe(2)

    die(sim)
    advance(sim, tuning.feel.deadLockTicks + 1)
    sim.step(RESTART) // reinício voluntário, tecla própria
    expect(sim.state().wave).toBe(1)
    expect(sim.state().owned.every((n) => n === 0)).toBe(true)
    expect(sim.state().lives).toBe(tuning.run.lives)
    expect(sim.state().kills).toBe(0)
  })

  it("todo modificador ou muda uma curva, ou tem efeito direto declarado", () => {
    // REPARO age no organismo no instante da escolha, não numa estatística.
    // Qualquer outro que não mude número é modificador que não faz nada.
    const efeitoDireto = new Set([MOD_REPAIR])
    const base = applyModifiers(tuning, [])
    for (const mod of MODIFIERS) {
      if (efeitoDireto.has(mod.id)) continue
      const owned = MODIFIERS.map((m) => (m.id === mod.id ? 1 : 0))
      expect(applyModifiers(tuning, owned), mod.name).not.toEqual(base)
    }
  })

  it("REPARO cura o organismo na hora da escolha", () => {
    const sim = createSim(40, tuning)
    mut(sim).wave = tuning.cells.fromWave - 1
    clearWave(sim)
    sim.step(SPACE)
    expect(sim.state().cells.length).toBe(tuning.cells.count)

    mut(sim).cells[0]!.hp = 1
    clearWave(sim)
    mut(sim).offer = [MOD_REPAIR]
    mut(sim).cursor = 0
    sim.step(SPACE)
    expect(sim.state().cells.every((c) => c.hp === tuning.cells.hp)).toBe(true)
  })
})

describe("o gate continua medível", () => {
  it("morrer NÃO recomeça sozinho — a segunda partida tem que ser um ato", () => {
    const sim = createSim(27, tuning)
    die(sim)
    expect(sim.state().phase).toBe("dead")

    // Espaço é a tecla que ele apertou a cada 20s durante a run inteira:
    // aqui ela não pode valer, senão o gate mede reflexo em vez de vontade.
    advance(sim, 1800, SPACE)
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().runIndex).toBe(0)

    sim.step(RESTART)
    expect(sim.state().phase).toBe("run")
    expect(sim.state().runIndex).toBe(1) // é isto que o gate conta
  })

  it("o melhor resultado sobrevive à morte — é o que puxa pra próxima", () => {
    const sim = createSim(28, tuning)
    clearWave(sim)
    sim.step(SPACE)
    const reached = sim.state().wave
    die(sim)
    advance(sim, tuning.feel.deadLockTicks + 1)
    sim.step(RESTART)
    expect(sim.state().bestWave).toBeGreaterThanOrEqual(reached)
    expect(sim.state().bestKills).toBeGreaterThan(0)
  })
})

describe("tipos de vírus — a ameaça muda, não a carta", () => {
  const spawnAhead = (sim: Sim, kind: string): void => {
    const s = mut(sim)
    s.enemies = [virus(s.player.x + 20, s.player.y, s.tick - 100, kind)]
  }

  it("blindado precisa de dois cortes", () => {
    const sim = createSim(50, tuning)
    spawnAhead(sim, "blindado")
    sim.step(RIGHT)
    expect(sim.state().kills).toBe(0)
    expect(sim.state().enemies).toHaveLength(1)
    expect(sim.state().enemies[0]!.hp).toBe(1)

    const ferido = mut(sim).enemies[0]!
    mut(sim).enemies = []
    untilReady(sim)
    ferido.x = sim.state().player.x + 20
    ferido.y = sim.state().player.y
    mut(sim).enemies = [ferido]
    sim.step(RIGHT)
    expect(sim.state().kills).toBe(1)
  })

  it("divisor vira dois estilhaços, e eles nascem fora do alcance de toque", () => {
    const sim = createSim(51, tuning)
    spawnAhead(sim, "divisor")
    sim.step(RIGHT)

    const s = sim.state()
    expect(s.kills).toBe(1)
    expect(s.enemies).toHaveLength(2)
    expect(s.enemies.every((e) => e.kind === "estilhaco")).toBe(true)

    // O bug que isto trava: nascer dentro da hitbox matava sem resposta possível.
    const toque = tuning.player.size / 2 + (tuning.enemy.size * 0.6) / 2
    for (const e of s.enemies) {
      const d = Math.sqrt((e.x - s.player.x) ** 2 + (e.y - s.player.y) ** 2)
      expect(d, "estilhaço nasceu em cima do jogador").toBeGreaterThan(toque)
    }
  })

  it("estilhaço não corta o jogador enquanto é recém-nascido", () => {
    const sim = createSim(52, tuning)
    const s = mut(sim)
    s.enemies = [virus(s.player.x, s.player.y, s.tick, "estilhaco")]
    sim.step(NONE)
    expect(sim.state().lives).toBe(tuning.run.lives)

    advance(sim, tuning.enemy.spawnGraceTicks + 1)
    mut(sim).enemies = [virus(sim.state().player.x, sim.state().player.y, 0, "estilhaco")]
    sim.step(NONE)
    expect(sim.state().lives).toBe(tuning.run.lives - 1)
  })

  it("a composição da onda muda conforme a tabela", () => {
    const kindsAtWave = (w: number): Set<string> => {
      const sim = createSim(53, tuning)
      const seen = new Set<string>()
      for (let i = 0; i < 25 && sim.state().phase !== "dead"; i++) {
        // Entra na onda w: o SPACE incrementa, então parte-se de w-1.
        mut(sim).wave = w - 1
        clearWave(sim)
        sim.step(SPACE)
        expect(sim.state().wave).toBe(w)
        for (const e of sim.state().enemies) seen.add(e.kind)
      }
      return seen
    }
    expect(kindsAtWave(1)).toEqual(new Set(["comum"]))
    expect(kindsAtWave(4).size).toBeGreaterThan(2)
  })
})

describe("o organismo — segunda forma de perder, sem segundo verbo", () => {
  const reachCells = (sim: Sim): void => {
    let guard = 0
    while (
      sim.state().phase === "run" &&
      sim.state().cells.length === 0 &&
      sim.state().wave < tuning.cells.fromWave + 2
    ) {
      clearWave(sim)
      sim.step(SPACE)
      if (++guard > 20) throw new Error("não chegou nas células")
    }
  }

  it("as células só aparecem a partir da onda marcada", () => {
    const sim = createSim(60, tuning)
    expect(sim.state().cells).toHaveLength(0)
    reachCells(sim)
    expect(sim.state().wave).toBeGreaterThanOrEqual(tuning.cells.fromWave)
    expect(sim.state().cells).toHaveLength(tuning.cells.count)
  })

  it("invasor ignora o jogador e vai atrás da célula", () => {
    const sim = createSim(61, tuning)
    reachCells(sim)
    const s = mut(sim)
    const cell = s.cells[0]!
    // Nasce longe da célula e do lado oposto ao jogador.
    s.enemies = [virus(cell.x + 120, cell.y, 0, "invasor")]
    const before = Math.abs(s.enemies[0]!.x - cell.x)
    advance(sim, 600, RIGHT) // jogador dashando pro outro lado
    const after = Math.abs(
      (sim.state().enemies.find((e) => e.kind === "invasor")?.x ?? cell.x) - cell.x,
    )
    expect(after, "invasor deveria ter se aproximado da célula").toBeLessThan(before)
  })

  it("encostar na célula tira vida dela e mata o vírus", () => {
    const sim = createSim(62, tuning)
    reachCells(sim)
    const s = mut(sim)
    const cell = s.cells[0]!
    const hp = cell.hp
    s.enemies = [virus(cell.x, cell.y, 0, "invasor")]
    sim.step(NONE)
    expect(sim.state().cells[0]!.hp).toBe(hp - 1)
    expect(sim.state().enemies.some((e) => e.kind === "invasor")).toBe(false)
  })

  it("perder o organismo inteiro encerra a run mesmo com vidas sobrando", () => {
    const sim = createSim(63, tuning)
    reachCells(sim)
    expect(sim.state().lives).toBeGreaterThan(0)

    while (sim.state().cells.length > 0 && sim.state().phase === "run") {
      const s = mut(sim)
      const cell = s.cells[0]!
      s.enemies = [virus(cell.x, cell.y, 0, "invasor")]
      sim.step(NONE)
    }
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().lostByCells).toBe(true)
    expect(sim.state().lives).toBeGreaterThan(0)
  })

  it("o organismo volta inteiro na run seguinte", () => {
    const sim = createSim(64, tuning)
    reachCells(sim)
    while (sim.state().phase === "run") {
      const s = mut(sim)
      const cell = s.cells[0]
      if (cell === undefined) break
      s.enemies = [virus(cell.x, cell.y, 0, "invasor")]
      sim.step(NONE)
    }
    advance(sim, tuning.feel.deadLockTicks + 1)
    sim.step(RESTART)
    expect(sim.state().wave).toBe(1)
    expect(sim.state().cellsLost).toBe(0)
    expect(sim.state().lostByCells).toBe(false)
  })
})
