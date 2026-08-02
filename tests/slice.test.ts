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

/** Soma da infecção do campo. O organismo É o campo desde 01/08. */
const totalOf = (sim: Sim): number => {
  let sum = 0
  const f = sim.state().field
  for (let i = 0; i < f.length; i++) sum += f[i]!
  return sum
}

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

/**
 * Abre terreno em volta do centro — isto é, deixa a DOENÇA tomar aquele pedaço.
 *
 * Desde 02/08 o tecido resiste: tile são é tile lotado de hemácia e segura a
 * velocidade máxima. Velocidade cheia só existe onde o tecido já se foi, e essa
 * inversão é a mecânica, não um detalhe de fixture. Um bloco de 7x7 é 8,5% do
 * campo, bem abaixo do `loseFraction`, então abrir caminho aqui não encerra a run.
 */
const clearGround = (sim: Sim): void => {
  const f = mut(sim).field
  const c0 = Math.floor(tuning.field.cols / 2)
  const r0 = Math.floor(tuning.field.rows / 2)
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const c = c0 + dx
      const r = r0 + dy
      if (c < 0 || r < 0 || c >= tuning.field.cols || r >= tuning.field.rows) continue
      f[r * tuning.field.cols + c] = tuning.field.maxInfection
    }
  }
}

/** Leva a célula ao talo, em terreno aberto, e recentraliza sem frear. */
const toFullSpeed = (sim: Sim): void => {
  mut(sim).enemies = []
  mut(sim).player.x = tuning.arena.width / 2
  mut(sim).player.y = tuning.arena.height / 2
  clearGround(sim)
  let guard = 0
  while (sim.state().player.speed < 0.999) {
    sim.step(RIGHT)
    mut(sim).player.x = tuning.arena.width / 2
    mut(sim).player.y = tuning.arena.height / 2
    /*
     * Reabre o terreno a cada passo, e a razão é uma consequência que só
     * apareceu aqui: a célula CURA o chão onde está, e chão curado freia. Sem
     * reabrir, a própria cura fechava o caminho durante a aceleração e a
     * velocidade máxima nunca chegava. O jogo está certo; a fixture é que
     * precisa segurar a condição que ela diz estar testando.
     */
    clearGround(sim)
    if (++guard > 400) throw new Error("não chegou à velocidade máxima")
  }
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
      mut(sim).player.y = tuning.arena.height / 2
      /*
       * Terreno CONSTANTE, de propósito. Desde 02/08 o tecido freia, então o
       * relógio pode cair com a tecla apertada — atravessar tecido mais são é
       * desacelerar. Isso não é degrau, é o campo agindo, e testar as duas
       * coisas no mesmo teste não mediria nenhuma. Aqui se mede a continuidade
       * da conversão velocidade→relógio; o atrito tem teste próprio abaixo.
       */
      clearGround(sim)
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

describe("o tecido resiste", () => {
  /**
   * Acelera `ticks` presa no centro, com o campo travado no estado dado.
   *
   * Só um bloco central, e não o campo inteiro: `field.fill(max)` passa do
   * `loseFraction` e encerra a run, então a medida sairia zero e pareceria que
   * o atrito matou o jogo. O erro é fácil de cometer e silencioso, que é
   * exatamente por que ele fica escrito aqui.
   */
  const topSpeedIn = (infection: number, ticks = 200): number => {
    const sim = createSim(11, tuning)
    mut(sim).enemies = []
    const c0 = Math.floor(tuning.field.cols / 2)
    const r0 = Math.floor(tuning.field.rows / 2)
    const paint = (): void => {
      const f = mut(sim).field
      f.fill(0)
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const c = c0 + dx
          const r = r0 + dy
          if (c < 0 || r < 0 || c >= tuning.field.cols || r >= tuning.field.rows) continue
          f[r * tuning.field.cols + c] = infection
        }
      }
    }
    for (let i = 0; i < ticks; i++) {
      paint()
      mut(sim).player.x = tuning.arena.width / 2
      mut(sim).player.y = tuning.arena.height / 2
      sim.step(RIGHT)
    }
    return sim.state().player.speed
  }

  it("tecido são freia; tecido tomado libera", () => {
    const saudavel = topSpeedIn(0)
    const tomado = topSpeedIn(tuning.field.maxInfection)
    expect(tomado).toBeGreaterThan(saudavel)
    // A perda em tecido cheio é exatamente o número declarado no tuning.
    expect(saudavel).toBeCloseTo(tomado * (1 - tuning.field.crowdDrag), 2)
  })

  it("é gradiente, não interruptor", () => {
    const meio = topSpeedIn(Math.round(tuning.field.maxInfection / 2))
    expect(meio).toBeGreaterThan(topSpeedIn(0))
    expect(meio).toBeLessThan(topSpeedIn(tuning.field.maxInfection))
  })

  it("o relógio do MUNDO herda o freio", () => {
    const sim = createSim(12, tuning)
    mut(sim).enemies = []
    for (let i = 0; i < 200; i++) {
      mut(sim).field.fill(0)
      mut(sim).player.x = tuning.arena.width / 2
      mut(sim).player.y = tuning.arena.height / 2
      sim.step(RIGHT)
    }
    /*
     * A consequência inteira em uma asserção: em tecido 100% são a célula não
     * alcança o talo, então o MUNDO também não. Curar o campo compra tempo de
     * mundo lento; deixar apodrecer o acelera. É o custo que o H aceitou
     * nomeado em 02/08 ao escolher que o tecido resistisse.
     */
    expect(sim.state().worldScale).toBeLessThan(0.95)
  })
})

describe("o tecido: conter e retomar", () => {
  const teto = (): number =>
    tuning.field.cols * tuning.field.rows * tuning.field.maxInfection

  it("a fase abre com focos de infecção, e eles crescem por fase", () => {
    const sim = createSim(50, tuning)
    expect(sim.state().infection).toBeGreaterThan(0)
    const fase1 = sim.state().infection
    mut(sim).wave = 8
    mut(sim).infection = 0
    mut(sim).enemies = []
    // força o fim de fase para a 9 semear
    sim.step(NONE)
    expect(sim.state().wave).toBe(9)
    expect(sim.state().infection, "a fase 9 tem que abrir pior que a 1").toBeGreaterThan(fase1)
  })

  it("o patógeno infecta o tile em que está, em tempo de MUNDO", () => {
    /*
     * O tecido é zerado ABAIXO do limiar de spawn mas ACIMA do de vitória: com o
     * campo limpo e sem patógeno a fase termina e o `startWave` ressemeia, o que
     * na primeira versão deste teste apareceu como "400 de infecção do nada".
     * O defeito era do teste, não da sim.
     */
    const piso = 30
    const cena = (correndo: boolean): number => {
      const sim = createSim(51, tuning)
      mut(sim).field.fill(piso)
      const base = totalOf(sim)
      for (let i = 0; i < 180; i++) {
        // longe do jogador, para a cura não interferir na medição
        mut(sim).enemies = [virus(600, 40)]
        sim.step(correndo ? RIGHT : NONE)
        mut(sim).player.x = 40
        mut(sim).player.y = 320
      }
      return totalOf(sim) - base
    }
    const parada = cena(false)
    const rapida = cena(true)
    expect(rapida, "correndo, a infecção avança").toBeGreaterThan(parada * 3)
  })

  it("a cura é em tempo REAL e cai com a velocidade", () => {
    const cena = (correndo: boolean): number => {
      const sim = createSim(52, tuning)
      if (correndo) toFullSpeed(sim)
      mut(sim).enemies = []
      // Abaixo do limiar de derrota: cheio de propósito a run morria no
      // primeiro tick e o teste media um tick de cura em vez de sessenta.
      mut(sim).field.fill(Math.floor(tuning.field.maxInfection * 0.4))
      const base = totalOf(sim)
      /*
       * Janela CURTA de propósito. Com 60 ticks os dois casos zeravam os 13
       * tiles ao alcance e empatavam em 520 — a medição saturava e escondia a
       * diferença de taxa. Isso expôs uma propriedade real do desenho: parada, a
       * cura é funda mas satura rápido, porque o alcance é minúsculo. É a troca
       * profundidade-por-cobertura que o campo existe para criar.
       */
      for (let i = 0; i < 12; i++) {
        mut(sim).enemies = []
        sim.step(correndo ? RIGHT : NONE)
        // preso no mesmo ponto: a diferença medida é só a velocidade
        mut(sim).player.x = 320
        mut(sim).player.y = 180
      }
      return base - totalOf(sim)
    }
    const curouParada = cena(false)
    const curouCorrendo = cena(true)
    expect(curouParada, "parada cura fundo").toBeGreaterThan(0)
    expect(curouCorrendo, "a toda quase não cura").toBeLessThan(curouParada / 2)
  })

  it("o patógeno nasce DO TECIDO, não da borda — é o que faz a fase convergir", () => {
    // Tecido sujo, mas todo ABAIXO do limiar de parto: nada pode nascer, e a
    // fase também não termina. Com spawn de borda isto seria impossível, e era
    // por isso que a infecção nunca podia chegar a zero.
    const sim = createSim(53, tuning)
    mut(sim).enemies = []
    mut(sim).field.fill(tuning.field.spawnThreshold - 5)
    mut(sim).spawnTimer = 0
    advance(sim, 300, RIGHT)
    expect(sim.state().enemies.length, "campo abaixo do limiar não pare").toBe(0)

    // e um único tile acima do limiar volta a parir
    const vivo = createSim(53, tuning)
    mut(vivo).enemies = []
    mut(vivo).field.fill(tuning.field.spawnThreshold - 5)
    mut(vivo).field[0] = tuning.field.maxInfection
    mut(vivo).spawnTimer = 0
    advance(vivo, 300, RIGHT)
    expect(vivo.state().enemies.length, "tecido tomado pare").toBeGreaterThan(0)
  })

  it("contida e sem patógeno vivo, a fase acaba", () => {
    const sim = createSim(54, tuning)
    const antes = sim.state().wave
    mut(sim).field.fill(0)
    mut(sim).infection = 0
    mut(sim).enemies = []
    sim.step(NONE)
    expect(sim.state().wave).toBe(antes + 1)
  })

  it("o tecido tomado encerra a run mesmo com vidas sobrando", () => {
    const sim = createSim(55, tuning)
    expect(sim.state().lives).toBe(tuning.run.lives)
    mut(sim).field.fill(tuning.field.maxInfection)
    mut(sim).infection = teto()
    sim.step(NONE)
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().lostByTissue).toBe(true)
    expect(sim.state().lives, "morreu de infecção, não de toque").toBe(tuning.run.lives)
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
