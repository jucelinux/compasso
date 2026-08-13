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

/**
 * O tuning com a DILATAÇÃO LIGADA, para os testes que medem justamente ela.
 *
 * O H desligou o relógio lento em 13/08 e pediu que ele NÃO saísse do código.
 * Toggle sem cobertura é código morto com aparência de vivo — em três semanas
 * ninguém saberia se a fórmula ainda funciona, e ligá-la de volta viraria
 * arqueologia em vez de trocar um booleano. Então tudo que descreve a
 * dilatação passa a rodar contra este objeto, e continua verde com o jogo
 * andando em tempo real.
 *
 * É o mesmo instrumento do caso nulo da curva, apontado para o outro lado: lá
 * se mede o que a curva faz desligando-a, aqui se mede o que o relógio faz
 * ligando-o.
 */
const LENTO = { ...tuning, time: { ...tuning.time, dilation: true } }

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

const ACTION = IN({ action: true })

/**
 * Avança N ticks, ATRAVESSANDO card se um aparecer.
 *
 * Desde 02/08 toda fase abre parada numa apresentação, e vários testes daqui
 * esvaziam `enemies` para isolar uma peça — o que satisfaz a condição de
 * contenção sem querer e joga a fase seguinte na tela. Sem atravessar, o resto
 * do teste mediria um jogo congelado.
 *
 * Cada dispensa custa os ticks que custa de verdade: a trava conta para baixo
 * com NONE e a borda de subida gasta um tick. A contagem continua exata.
 *
 * O `intervalo` de 13/08 não aceita tecla — ele corre sozinho. Passar NONE nele
 * é o certo, e é por isso que a lista de telas e a condição de dispensa
 * deixaram de ser a mesma coisa.
 */
const TELA = (ph: string): boolean => ph === "card" || ph === "intervalo" || ph === "closed"

const advance = (sim: Sim, ticks: number, input: InputFrame = NONE): void => {
  for (let i = 0; i < ticks; i++) {
    const ph = sim.state().phase
    if (TELA(ph)) {
      sim.step(ph !== "intervalo" && sim.state().cardLock === 0 ? ACTION : NONE)
    } else sim.step(input)
  }
}

/**
 * Cria a sim e DISPENSA O CARD, que é onde toda fase abre desde 02/08.
 *
 * Quase todo teste aqui mede a fase rodando, não a apresentação dela — sem
 * isto, `advance` só faria a trava do card contar para baixo e a asserção
 * mediria uma fase que nunca começou.
 */
const start = (seed: number, t: typeof tuning = tuning): Sim => {
  const sim = createSim(seed, t)
  advance(sim, tuning.cardLockTicks + 1)
  sim.step(ACTION)
  // Solta a tecla: senão o próximo `action` do teste não tem borda de subida
  // e o impulso não dispara. Custou um teste verde-falso para aparecer.
  sim.step(NONE)
  /*
   * O `owned.fill(0)` que morava aqui saiu em 13/08 junto com a recompensa.
   *
   * Ele existia porque a tela de escolha concedia um poder ao conter uma onda, e
   * começar com MEMBRANA ou ENZIMA no bolso mudava o resultado dos testes de
   * contato e de relógio — dois viraram vermelho por isso em 02/08. Sem tela de
   * escolha nada mais preenche `owned`, e a linha virou no-op.
   */
  return sim
}

/**
 * Um tick que atravessa card, para os testes que rodam laço próprio.
 *
 * Mesma razão do `advance`: isolar uma peça costuma esvaziar `enemies`, e isso
 * satisfaz a contenção sem querer. Quem quer VER o card usa `sim.step` cru.
 */
const tick = (sim: Sim, input: InputFrame = NONE): void => {
  const ph = sim.state().phase
  if (TELA(ph)) {
    sim.step(ph !== "intervalo" && sim.state().cardLock === 0 ? ACTION : NONE)
  } else sim.step(input)
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
  dx: 1,
  dy: 0,
  tumble: 1,
  poisonAcc: 0,
})

/**
 * Estaciona UM patógeno no canto, longe de tudo.
 *
 * Substitui `enemies = []` nos testes que querem "ninguém atrapalhando". Campo
 * sem inimigo nenhum satisfaz a contenção na hora, e desde 02/08 isso joga a
 * fase seguinte na tela — o teste passaria a medir um card. Um bicho parado no
 * canto mantém a fase viva sem chegar perto do que está sendo medido.
 */
const park = (sim: Sim): void => {
  mut(sim).enemies = [virus(8, 8)]
}

/**
 * Garante fase RODANDO: atravessa a tela que estiver na frente.
 *
 * A folga tem que caber na MAIOR delas, e desde 13/08 a maior é o `intervalo` —
 * 3 segundos, 180 ticks, contra os 45 do `cardLock`. Dimensionar pelo card
 * deixaria o teste medindo uma contagem em vez do jogo.
 */
const resume = (sim: Sim): void => {
  if (TELA(sim.state().phase)) {
    advance(sim, Math.round(tuning.run.intervalSeconds * tuning.sim.hz) + tuning.cardLockTicks + 4)
  }
}

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
  park(sim)
  mut(sim).player.x = tuning.arena.width / 2
  mut(sim).player.y = tuning.arena.height / 2
  clearGround(sim)
  let guard = 0
  while (sim.state().player.speed < 0.999) {
    tick(sim, RIGHT)
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
    const sim = start(1, LENTO)
    advance(sim, 60)
    expect(sim.state().worldScale).toBeCloseTo(tuning.time.creep, 5)

    toFullSpeed(sim)
    expect(sim.state().worldScale).toBeCloseTo(1, 2)
  })

  it("a escala é contínua — nada de degrau", () => {
    const sim = start(2, LENTO)
    park(sim)
    const scales: number[] = []
    for (let i = 0; i < 30; i++) {
      tick(sim, RIGHT)
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
    const sim = start(3, LENTO)
    const scales: number[] = []
    for (let i = 0; i < 600; i++) {
      tick(sim, i % 90 < 30 ? RIGHT : NONE)
      scales.push(sim.state().worldScale)
    }
    expect(Math.min(...scales)).toBeGreaterThan(0)
    expect(Math.min(...scales)).toBeCloseTo(tuning.time.creep, 5)
  })

  it("patógeno anda em tempo de mundo; a célula, em tempo real", () => {
    const parada = start(4, LENTO)
    mut(parada).enemies = [virus(600, 180)]
    advance(parada, 120)
    const andouParada = 600 - mut(parada).enemies[0]!.x

    const correndo = start(4)
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
    const parada = start(10)
    mut(parada).enemies = [virus(mut(parada).player.x, mut(parada).player.y)]
    parada.step(NONE)
    expect(parada.state().kills).toBe(0)
    expect(parada.state().lives).toBe(tuning.run.lives - 1)

    const rapida = start(10)
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
    const sim = start(11)
    park(sim)
    const alvo = tuning.enemy.kinds["influenza"]!.engulfSpeed + 0.05
    let guard = 0
    while (sim.state().player.speed < alvo) {
      tick(sim, RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não acelerou")
    }
    expect(sim.state().player.speed).toBeLessThan(tuning.enemy.kinds["corona"]!.engulfSpeed)
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y, "corona")]
    tick(sim, RIGHT)
    expect(sim.state().kills).toBe(0)
    expect(sim.state().lives).toBe(tuning.run.lives - 1)
  })

  it("apanhar te FREIA: o erro custa o relógio junto com a vida", () => {
    const sim = start(12)
    park(sim)
    // Rápida o bastante para influenza, lenta demais para o corona.
    let guard = 0
    while (sim.state().player.speed < 0.5) {
      tick(sim, RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não acelerou")
    }
    const antes = sim.state().player.speed
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y, "corona")]
    tick(sim, RIGHT)
    expect(sim.state().lives).toBe(tuning.run.lives - 1)
    expect(sim.state().player.speed).toBeLessThan(antes * 0.5)
  })
})

describe("i-frames caem ao engolir", () => {
  /** Apanha de propósito no corona, que exige 92% e portanto machuca a 50%. */
  const takeHit = (sim: Sim): void => {
    park(sim)
    let guard = 0
    while (sim.state().player.speed < 0.5) {
      tick(sim, RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não acelerou")
    }
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y, "corona")]
    tick(sim, RIGHT)
    park(sim)
    // o toque congela alguns ticks; passa por eles
    advance(sim, tuning.run.hitFreezeTicks + 1)
    // Matar a corona pode ter CONTIDO a fase e aberto a apresentação seguinte.
    resume(sim)
    if (!sim.state().player.invulnerable) throw new Error("não ficou invulnerável")
  }

  it("engolir por contato derruba a proteção", () => {
    const sim = start(21)
    takeHit(sim)
    let guard = 0
    while (sim.state().player.speed < 0.5) {
      tick(sim, RIGHT)
      mut(sim).player.x = tuning.arena.width / 2
      if (++guard > 400) throw new Error("não reacelerou")
    }
    expect(sim.state().player.invulnerable).toBe(true)
    mut(sim).enemies = [virus(mut(sim).player.x, mut(sim).player.y)]
    tick(sim, RIGHT)
    expect(sim.state().kills).toBeGreaterThan(0)
    expect(sim.state().player.invulnerable).toBe(false)
  })

  it("a proteção não expira sozinha — sem timer, decisão de 31/07", () => {
    const sim = start(22)
    takeHit(sim)
    // cinco segundos parada, sem engolir nada
    advance(sim, 300)
    expect(sim.state().player.invulnerable).toBe(true)
  })

  it("velocidade alta sozinha NÃO derruba mais a proteção", () => {
    // A regra antiga caía a 85% de velocidade, o que abria o buraco: bastava
    // ficar logo abaixo disso para comer cinco dos seis patógenos de graça.
    const sim = start(23)
    takeHit(sim)
    toFullSpeed(sim)
    expect(sim.state().player.speed).toBeGreaterThan(0.9)
    expect(sim.state().player.invulnerable).toBe(true)
  })

  it("abate passivo não conta: só o seu contato paga a conta", () => {
    const sim = start(24)
    takeHit(sim)
    // Macrófago mata sozinho, longe do corpo; a proteção tem que sobreviver.
    // O poder precisa estar ATIVO: sem ele a sim zera o array de macrófagos.
    const macrofago = POWERS.findIndex((p) => p.name === "MACRÓFAGO")
    mut(sim).active[macrofago] = 600
    park(sim)
    advance(sim, 1)
    expect(sim.state().phase, "o macrófago só anda com a fase rodando").toBe("run")
    const m = sim.state().macrophages[0]!
    mut(sim).enemies = [virus(m.x, m.y)]
    const antes = sim.state().kills
    advance(sim, 2)
    expect(sim.state().kills, "o macrófago não matou").toBeGreaterThan(antes)
    expect(sim.state().player.invulnerable).toBe(true)
  })
})

describe("o impulso tem DOIS verbos, decididos pelo contexto", () => {
  it("PARADO, o espaço vira aura: cura acelerada e proteção com prazo", () => {
    const sim = start(41)
    park(sim)
    const s = mut(sim)
    s.player.vx = 0
    s.player.vy = 0
    s.player.speed = 0
    expect(sim.state().auraTicks).toBe(0)

    sim.step(ACTION)
    expect(sim.state().auraTicks, "parado dispara a aura").toBeGreaterThan(0)
    expect(sim.state().player.dashTicks, "e NÃO o arranco").toBe(0)
    expect(sim.state().player.dashCooldown, "a aura paga a mesma recarga").toBeGreaterThan(0)
  })

  it("a aura PLANTA um foco, e ele cura SEM você por perto", () => {
    const sim = start(44)
    park(sim)
    const s = mut(sim)
    s.player.vx = 0
    s.player.vy = 0
    s.player.speed = 0
    // Suja SÓ a região do foco: campo inteiro no talo estoura o limiar de
    // derrota e a run morre antes de a cura acontecer.
    const c0 = Math.floor(tuning.field.cols / 2)
    const r0 = Math.floor(tuning.field.rows / 2)
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = c0 + dx
        const r = r0 + dy
        if (c < 0 || c >= tuning.field.cols || r < 0 || r >= tuning.field.rows) continue
        s.field[r * tuning.field.cols + c] = tuning.field.maxInfection
      }
    }
    s.infection = totalOf(sim)

    sim.step(ACTION)
    expect(sim.state().pulses.length, "plantou").toBe(1)
    const foco = { ...sim.state().pulses[0]! }

    // Leva o jogador para LONGE: a cura tem que continuar mesmo assim, senão
    // o vínculo de presença não foi quebrado e a mudança é só estética.
    mut(sim).player.x = tuning.arena.width - 20
    mut(sim).player.y = tuning.arena.height - 20

    // Passo CRU, e a fase precisa continuar rodando: se ela contiver no meio,
    // o campo é ressemeado e a comparação mede outra onda.
    const naRegiao = (): number => {
      const f = sim.state().field
      let n = 0
      const c0 = Math.floor(tuning.field.cols / 2)
      const r0 = Math.floor(tuning.field.rows / 2)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const c = c0 + dx
          const r = r0 + dy
          if (c < 0 || c >= tuning.field.cols || r < 0 || r >= tuning.field.rows) continue
          n += f[r * tuning.field.cols + c]!
        }
      }
      return n
    }
    const antes = naRegiao()
    for (let i = 0; i < 120; i++) {
      park(sim)
      sim.step(NONE)
    }
    expect(sim.state().phase, "a fase não pode ter virado no meio").toBe("run")
    expect(naRegiao(), "o foco trabalha sozinho, longe do jogador").toBeLessThan(antes)
    expect(foco.x, "e não segue o jogador").toBeLessThan(tuning.arena.width - 20)
  })

  it("os focos têm TETO: plantar é escolha, não hábito", () => {
    const sim = start(45)
    park(sim)
    for (let n = 0; n < tuning.dash.auraFociMax + 2; n++) {
      const s = mut(sim)
      s.player.vx = 0
      s.player.vy = 0
      s.player.speed = 0
      s.player.dashCooldown = 0
      sim.step(ACTION)
      sim.step(NONE)
    }
    expect(sim.state().pulses.length).toBe(tuning.dash.auraFociMax)
  })

  it("a proteção da aura ACABA — o limbo de 31/07 não volta por esta porta", () => {
    const sim = start(42)
    park(sim)
    const s = mut(sim)
    s.player.vx = 0
    s.player.vy = 0
    s.player.speed = 0
    sim.step(ACTION)
    const janela = sim.state().auraTicks
    expect(janela).toBeGreaterThan(0)
    advance(sim, janela + 2)
    expect(sim.state().auraTicks, "acabou, e sem depender de nada externo").toBe(0)
  })

  it("EM MOVIMENTO o mesmo espaço continua sendo arranco", () => {
    const sim = start(43)
    park(sim)
    advance(sim, 10, RIGHT)
    expect(sim.state().phase).toBe("run")
    expect(
      sim.state().player.speed,
      "o teste só vale se ele estiver mesmo em movimento",
    ).toBeGreaterThan(tuning.dash.auraBelowSpeed)
    sim.step(IN({ right: true, action: true }))
    expect(sim.state().player.dashTicks).toBeGreaterThan(0)
    expect(sim.state().auraTicks, "em movimento não vira aura").toBe(0)
  })
})

describe("impulso é habilidade, não o verbo", () => {
  it("dispara na borda de subida e entra em recarga", () => {
    const sim = start(20)
    park(sim)
    advance(sim, 4, RIGHT)
    // Garante jogo rodando: daqui pra frente o `action` é o impulso sendo
    // medido, e não pode ser gasto dispensando uma apresentação.
    expect(sim.state().phase).toBe("run")
    const antes = sim.state().player.speed

    sim.step(IN({ right: true, action: true }))
    expect(sim.state().player.speed).toBeGreaterThan(antes * 2)
    expect(sim.state().player.dashCooldown).toBeGreaterThan(0)
  })

  it("segurar a tecla não repete o impulso", () => {
    const sim = start(22)
    park(sim)
    advance(sim, 40, IN({ right: true, action: true }))
    expect(sim.state().player.dashCooldown).toBeGreaterThan(0)
  })
})

describe("poderes automáticos, temporários e aleatórios", () => {
  it("encostar na cápsula liga o poder por tempo", () => {
    const sim = start(30)
    const s = mut(sim)
    s.drops = [{ id: id(), power: 0, x: s.player.x, y: s.player.y, life: 100 }]
    sim.step(NONE)
    expect(sim.state().active[0]).toBe(tuning.drops.durationTicks)
    expect(sim.state().drops).toHaveLength(0)
  })

  it("o poder expira sozinho — nada é permanente", () => {
    const sim = start(31)
    mut(sim).active[0] = 5
    advance(sim, 6)
    expect(sim.state().active[0]).toBe(0)
    expect(activeStats(tuning, sim.state().active).trailTicks).toBe(0)
  })

  it("a run inteira acontece SEM poder: o formato onda → upgrade morreu", () => {
    const sim = createSim(77, tuning)
    expect(sim.state().phase).toBe("card")
    expect(sim.state().offer.length, "o card de identidade não oferece nada").toBe(0)
    expect(sim.state().owned.reduce((n, v) => n + v, 0)).toBe(0)
  })

  /*
   * O DESDOBRAMENTO da decisão de 13/08, travado por teste.
   *
   * Sem tela de recompensa e com `drops.chance` em 0, não existe mais caminho
   * para `owned` — a camada roguelite ficou dormente. Isso é consequência
   * ACEITA e não descuido, e é exatamente o tipo de coisa que uma sessão futura
   * "consertaria" por parecer bug. Se voltar poder por outra porta, este teste
   * cai, e cair é o aviso de que a decisão está sendo revista de propósito.
   */
  it("conter uma onda NÃO paga poder: o que paga é a onda seguinte apertar", () => {
    const sim = start(77)
    const s = mut(sim)
    s.field.fill(0)
    s.infection = 0
    s.enemies = []
    sim.step(NONE)
    expect(sim.state().phase, "contida cai no respiro, não num menu").toBe("intervalo")
    expect(sim.state().offer.length, "nada é oferecido").toBe(0)
    expect(sim.state().round, "a onda seguinte já está montada atrás da contagem").toBe(2)

    advance(sim, Math.round(tuning.run.intervalSeconds * tuning.sim.hz) + 1)
    expect(sim.state().phase, "a contagem solta a onda sozinha").toBe("run")
    expect(
      sim.state().owned.reduce((n, v) => n + v, 0),
      "a run atravessa a onda inteira sem ganhar poder",
    ).toBe(0)
  })

  it("a contagem dura os 3 segundos e NENHUMA tecla a adianta", () => {
    const sim = start(78)
    const s = mut(sim)
    s.field.fill(0)
    s.infection = 0
    s.enemies = []
    sim.step(NONE)
    expect(sim.state().phase).toBe("intervalo")
    const total = Math.round(tuning.run.intervalSeconds * tuning.sim.hz)

    /*
     * Marteladas de ACTION o tempo todo. Se qualquer tecla adiantasse, pular
     * viraria o certo a fazer e o respiro só teria custo para quem parou para
     * ler — que é a razão de a contagem não aceitar input nenhum.
     */
    for (let i = 0; i < total - 1; i++) {
      sim.step(i % 2 === 0 ? ACTION : NONE)
      expect(sim.state().phase, `tick ${i}: a contagem não pula`).toBe("intervalo")
    }
    sim.step(ACTION)
    expect(sim.state().phase, "no fim dos 3 segundos ela solta").toBe("run")
  })

  it("o dígito da contagem faz 3, 2, 1 — e nunca mostra 0", () => {
    /*
     * O que o jogador LÊ, e não o que o contador guarda.
     *
     * A tela imprime `Math.ceil(countdown / hz)`, e este teste existe porque a
     * captura não conseguiu conferir isso: cada `shot()` custa mais de um
     * segundo, então dois quadros seguidos caem em respiros DIFERENTES e os
     * dois mostram "3". A composição da tela foi conferida olhando; a contagem
     * é aritmética, e aritmética se confere aqui.
     *
     * Os dois erros que ele trava são de fronteira: um "3" que dura um quadro
     * (se arredondasse para baixo) e um "0" pendurado no fim (se o piso fosse
     * 0 em vez de 1). Os dois passariam por revisão de código.
     */
    const sim = start(80)
    const s = mut(sim)
    s.field.fill(0)
    s.infection = 0
    s.enemies = []
    sim.step(NONE)
    expect(sim.state().phase).toBe("intervalo")

    const lidos: number[] = []
    while (sim.state().phase === "intervalo") {
      const d = Math.max(1, Math.ceil(sim.state().countdown / tuning.sim.hz))
      if (lidos[lidos.length - 1] !== d) lidos.push(d)
      sim.step(NONE)
    }
    expect(lidos, "três dígitos, em ordem, sem zero").toEqual([3, 2, 1])
  })

  it("o respiro é REAL: parado ou a toda, a contagem dura o mesmo", () => {
    /*
     * O único relógio do jogo que a velocidade não toca. Se dependesse de
     * `worldScale`, ficar parado congelaria a contagem — e refúgio por parar é
     * o modo de falha que este projeto já corrigiu duas vezes (o piso do
     * `idleProgress` e o relógio próprio da necrose).
     */
    const ticksAte = (input: InputFrame): number => {
      const sim = start(79)
      const s = mut(sim)
      s.field.fill(0)
      s.infection = 0
      s.enemies = []
      sim.step(NONE)
      expect(sim.state().phase).toBe("intervalo")
      let n = 0
      while (sim.state().phase === "intervalo" && n < 600) {
        sim.step(input)
        n++
      }
      return n
    }
    expect(ticksAte(NONE)).toBe(ticksAte(IN({ right: true })))
  })

  it("abate NÃO larga mais cápsula: o laço que premiava ficar parado morreu", () => {
    // 02/08: parado -> fissão multiplica -> 475 abates -> enxurrada de poder.
    expect(tuning.drops.chance).toBe(0)
  })

  it("o card apresenta UMA vez; as outras nove ondas entram pela contagem", () => {
    const sim = start(90)
    const total = tuning.phases[0]!.waves
    const intervalo = Math.round(tuning.run.intervalSeconds * tuning.sim.hz)
    expect(total, "a progressão da E. coli é de 10 ondas desde 13/08").toBe(10)

    for (let n = 0; n < total; n++) {
      /*
       * Esvazia a cada tick até a contenção pegar, em vez de um passo só.
       *
       * Um TOQUE congela o tick (`hitFreezeTicks`) e `stepRun` sai antes da
       * checagem de contenção — regra do jogo desde 01/08, não defeito. Da onda
       * 6 em diante a abertura põe corpos suficientes para que um caia em cima
       * do jogador no primeiro quadro de jogo, e o passo único media a sorte da
       * seed em vez da transição.
       */
      let guarda = 0
      while (sim.state().phase === "run" && guarda++ < 120) {
        const s = mut(sim)
        s.field.fill(0)
        s.infection = 0
        s.enemies = []
        sim.step(NONE)
      }
      const ultima = n === total - 1
      expect(sim.state().phase, `onda ${n + 1}`).toBe(ultima ? "closed" : "intervalo")
      if (ultima) break
      // Nenhum card no meio: a doença é a mesma e não há nada a reapresentar.
      advance(sim, intervalo + 1)
      expect(sim.state().phase, `onda ${n + 2} entra direto`).toBe("run")
      expect(sim.state().round).toBe(n + 2)
    }
    expect(sim.state().phaseIndex, "uma doença só na lista").toBe(0)
  })

  it("limpar as 10 ondas FECHA a run, e confirmar recomeça do zero", () => {
    /*
     * A única tela do jogo que diz que você ganhou — até 13/08 só existia
     * perder. Confirmar não avança para doença nenhuma porque não há próxima:
     * `phases` tem uma entrada. Quando a segunda voltar, este teste cai, e é
     * assim que se descobre que o ramo precisa voltar a avançar `phaseIndex`.
     */
    const sim = start(91)
    mut(sim).round = tuning.phases[0]!.waves
    const s = mut(sim)
    s.field.fill(0)
    s.infection = 0
    s.enemies = []
    sim.step(NONE)
    expect(sim.state().phase).toBe("closed")

    const antes = sim.state().runIndex
    for (let i = 0; i < tuning.cardLockTicks + 1; i++) sim.step(NONE)
    sim.step(ACTION)
    expect(sim.state().runIndex, "vitória conta como run encerrada").toBe(antes + 1)
    expect(sim.state().round, "recomeça da onda 1").toBe(1)
    expect(sim.state().lives).toBe(tuning.run.lives)
    expect(sim.state().phase, "a doença se reapresenta").toBe("card")
  })

  it("a curva de 10 degraus só APERTA: nenhum degrau afrouxa o anterior", () => {
    /*
     * A trava contra o defeito mais provável de uma curva escrita à mão: um
     * degrau digitado fora de ordem. `TASTE.md` §1 recusa teto, e teto aqui
     * seria qualquer par onde o de baixo não é pior que o de cima.
     *
     * `fissao` é o único que desce, porque é SEGUNDOS até dobrar — menos tempo
     * é mais pressão. Os outros quatro sobem.
     */
    const curva = tuning.phases[0]!.curva
    expect(curva.length, "um degrau por onda").toBe(tuning.phases[0]!.waves)
    expect(curva[0], "a onda 1 É o tuning já medido, sem multiplicador").toEqual({
      fissao: 1.0,
      teto: 1.0,
      focos: 1.0,
      abertura: 1.0,
      fonte: 1.0,
    })
    for (let i = 1; i < curva.length; i++) {
      const a = curva[i - 1]!
      const b = curva[i]!
      expect(b.fissao, `onda ${i + 1}: a colônia não dobra mais devagar`).toBeLessThanOrEqual(a.fissao)
      expect(b.teto, `onda ${i + 1}: o teto não cai`).toBeGreaterThanOrEqual(a.teto)
      expect(b.focos, `onda ${i + 1}: os focos não caem`).toBeGreaterThanOrEqual(a.focos)
      expect(b.abertura, `onda ${i + 1}: a abertura não cai`).toBeGreaterThanOrEqual(a.abertura)
      expect(b.fonte, `onda ${i + 1}: a fonte não cai`).toBeGreaterThanOrEqual(a.fonte)
    }
    const ultimo = curva[curva.length - 1]!
    expect(ultimo.fissao, "a onda 10 aperta de verdade, não por decimal").toBeLessThan(0.6)
  })

  it("o degrau CHEGA na sim: a onda 10 abre pior que a 1", () => {
    /*
     * Curva declarada em JSON que ninguém lê é curva que não existe — e é a
     * classe de defeito que o `TASTE.md` §2b registra como a minha (o
     * `frontSprite`, atualizado 60x por segundo e nunca posto em cena).
     */
    const abre = (round: number): { inf: number; corpos: number } => {
      const sim = start(92)
      const s = mut(sim)
      s.round = round
      s.wave = round
      s.field.fill(0)
      s.infection = 0
      s.enemies = []
      // Contém: a sim monta a onda `round + 1` atrás da contagem.
      sim.step(NONE)
      return { inf: sim.state().infection, corpos: sim.state().enemies.length }
    }
    const cedo = abre(1)
    const tarde = abre(9)
    expect(tarde.inf, "a onda 10 semeia mais infecção").toBeGreaterThan(cedo.inf)
    expect(tarde.corpos, "e abre com mais corpos em cena").toBeGreaterThan(cedo.corpos)
  })

  it("caso NULO: sem curva, valem as fórmulas por onda de antes", () => {
    /*
     * É como se mede se a curva fez alguma coisa, e foi assim que a necrose
     * provou não ter mexido no baseline (`necroseAmount: 0`, 05/08). Sem isto,
     * a próxima sessão teria que confiar em mim.
     */
    const semCurva = {
      ...tuning,
      phases: tuning.phases.map((p) => ({ ...p, curva: [] })),
    } as typeof tuning
    const sim = createSim(93, semCurva)
    advance(sim, tuning.cardLockTicks + 2)
    expect(sim.state().phase).toBe("run")
    // `seeds` + floor((wave-1) * seedsPerWave) com wave 1 = `seeds` puro, que é
    // o mesmo que o degrau 1 produz. As duas vias coincidem na onda 1 DE
    // PROPÓSITO: é o que torna a comparação legível degrau a degrau.
    expect(sim.state().enemies.length).toBe(tuning.enemy.openingBase)
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
    const sim = start(33)
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
    const sim = start(40)
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
    const sim = start(11)
    park(sim)
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
      tick(sim, RIGHT)
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
    // Com DILATAÇÃO: sem ela o relógio é 1 e não há freio para herdar. O que
    // este teste descreve é a consequência do relógio lento, não do tecido.
    const sim = start(12, LENTO)
    park(sim)
    for (let i = 0; i < 200; i++) {
      mut(sim).field.fill(0)
      mut(sim).player.x = tuning.arena.width / 2
      mut(sim).player.y = tuning.arena.height / 2
      tick(sim, RIGHT)
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
    const sim = start(50)
    expect(sim.state().infection).toBeGreaterThan(0)
    const fase1 = sim.state().infection
    mut(sim).wave = 8
    mut(sim).infection = 0
    mut(sim).enemies = []
    // força o fim de fase; a recompensa vem antes, e só depois a 9 semeia
    sim.step(NONE)
    advance(sim, tuning.cardLockTicks + 2)
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
      const sim = start(51)
      mut(sim).field.fill(piso)
      const base = totalOf(sim)
      for (let i = 0; i < 180; i++) {
        // longe do jogador, para a cura não interferir na medição
        mut(sim).enemies = [virus(600, 40)]
        tick(sim, correndo ? RIGHT : NONE)
        mut(sim).player.x = 40
        mut(sim).player.y = 320
      }
      return totalOf(sim) - base
    }
    const parada = cena(false)
    const rapida = cena(true)
    expect(rapida, "correndo, a infecção avança").toBeGreaterThan(parada * 3)
  })

  /**
   * A MESMA cena, medida nos dois mundos — e o veredito se inverte de propósito.
   *
   * Com o relógio lento, curar exige ficar: parar compra tempo de mundo devagar,
   * e curar rápido seria ganhar os dois lados da troca. Sem o relógio lento não
   * há troca, e cobrar imobilidade vira preço que não paga nada — o H pediu
   * combater a manifestação no tick normal, andando.
   *
   * Os dois testes usam a mesma função de cena de propósito: é a única forma de
   * a diferença medida ser o TOGGLE e não o roteiro.
   */
  const curouEm = (t: typeof tuning, correndo: boolean): number => {
    const sim = start(52, t)
    if (correndo) toFullSpeed(sim)
    park(sim)
    // Abaixo do limiar de derrota: cheio de propósito a run morria no primeiro
    // tick e o teste media um tick de cura em vez de doze.
    mut(sim).field.fill(Math.floor(tuning.field.maxInfection * 0.4))
    const base = totalOf(sim)
    /*
     * Janela CURTA de propósito. Com 60 ticks os dois casos zeravam os 13 tiles
     * ao alcance e empatavam em 520 — a medição saturava e escondia a diferença
     * de taxa. Isso expôs uma propriedade real do desenho: parada, a cura é
     * funda mas satura rápido, porque o alcance é minúsculo.
     */
    for (let i = 0; i < 12; i++) {
      park(sim)
      tick(sim, correndo ? RIGHT : NONE)
      // preso no mesmo ponto: a diferença medida é só a velocidade
      mut(sim).player.x = 320
      mut(sim).player.y = 180
    }
    return base - totalOf(sim)
  }

  it("SEM dilatação: limpar o limo NÃO pede que você pare — chamada do H, 13/08", () => {
    const parada = curouEm(tuning, false)
    const correndo = curouEm(tuning, true)
    expect(parada, "parada ainda limpa").toBeGreaterThan(0)
    /*
     * A toda limpa o MESMO que parada. Não "quase o mesmo": sem a penalidade a
     * taxa é o `healRate` cru nos dois casos, e qualquer diferença aqui seria
     * outra coisa agindo — o que é justamente o que vale travar.
     */
    expect(correndo, "andando limpa igual").toBe(parada)
  })

  it("COM dilatação: a cura é em tempo REAL e cai com a velocidade", () => {
    const curouParada = curouEm(LENTO, false)
    const curouCorrendo = curouEm(LENTO, true)
    expect(curouParada, "parada cura fundo").toBeGreaterThan(0)
    expect(curouCorrendo, "a toda quase não cura").toBeLessThan(curouParada / 2)
  })

  it("o toggle desligado crava o relógio em 1, e nada de creep sobra", () => {
    const sim = start(53)
    // Parada: o mundo NÃO desacelera.
    advance(sim, 60)
    expect(sim.state().worldScale).toBe(1)
    // E a toda também não acelera, porque já estava no talo.
    toFullSpeed(sim)
    expect(sim.state().worldScale).toBe(1)
  })

  it("morto-por-enquanto: a fórmula da dilatação continua inteira atrás do toggle", () => {
    /*
     * A trava que impede o toggle de virar código morto silencioso. O H pediu
     * para DESLIGAR sem remover; sem esta asserção, a fórmula poderia apodrecer
     * por meses e só a tentativa de religá-la descobriria.
     */
    const lento = start(54, LENTO)
    advance(lento, 60)
    expect(lento.state().worldScale).toBeCloseTo(tuning.time.creep, 5)
    expect(tuning.time.dilation, "e o jogo de hoje roda com ela DESLIGADA").toBe(false)
  })

  it("o patógeno nasce DO TECIDO, não da borda — é o que faz a fase convergir", () => {
    // Tecido sujo, mas todo ABAIXO do limiar de parto: nada pode nascer, e a
    // fase também não termina. Com spawn de borda isto seria impossível, e era
    // por isso que a infecção nunca podia chegar a zero.
    const sim = start(53)
    mut(sim).enemies = []
    mut(sim).field.fill(tuning.field.spawnThreshold - 5)
    mut(sim).spawnTimer = 0
    advance(sim, 300, RIGHT)
    expect(sim.state().enemies.length, "campo abaixo do limiar não pare").toBe(0)

    // e um único tile acima do limiar volta a parir
    const vivo = start(53)
    mut(vivo).enemies = []
    mut(vivo).field.fill(tuning.field.spawnThreshold - 5)
    mut(vivo).field[0] = tuning.field.maxInfection
    mut(vivo).spawnTimer = 0
    advance(vivo, 300, RIGHT)
    expect(vivo.state().enemies.length, "tecido tomado pare").toBeGreaterThan(0)
  })

  it("contida e sem patógeno vivo, a fase acaba", () => {
    const sim = start(54)
    const antes = sim.state().wave
    mut(sim).field.fill(0)
    mut(sim).infection = 0
    mut(sim).enemies = []
    sim.step(NONE)
    /*
     * Contida cai no RESPIRO, e a onda já virou — a contagem corre por cima de
     * um tabuleiro montado.
     *
     * Até 13/08 a onda só virava quando você confirmava o poder, e por isso
     * `wave` era medido DEPOIS de atravessar a tela. Agora a ordem é o
     * contrário, e a asserção mudou de lugar junto: virar a onda deixou de ser
     * consequência de um gesto seu.
     */
    expect(sim.state().phase).toBe("intervalo")
    expect(sim.state().wave, "a onda vira ao conter, não ao confirmar").toBe(antes + 1)
    advance(sim, Math.round(tuning.run.intervalSeconds * tuning.sim.hz) + 1)
    expect(sim.state().phase).toBe("run")
  })

  it("o tecido tomado encerra a run mesmo com vidas sobrando", () => {
    const sim = start(55)
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
    // Enquanto não morre: se a fase virar (o campo foi contido no meio do
    // caminho), dispensa o card e segue matando.
    while (sim.state().phase !== "dead") {
      if (sim.state().phase === "card") {
        advance(sim, tuning.cardLockTicks + 1)
        sim.step(IN({ action: true }))
        continue
      }
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
    const sim = start(60)
    die(sim)
    expect(sim.state().phase).toBe("dead")

    advance(sim, 900, IN({ action: true }))
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().runIndex).toBe(0)

    sim.step(RESTART)
    // A run nova abre no CARD desde 02/08, não direto no jogo.
    expect(sim.state().phase).toBe("card")
    expect(sim.state().runIndex).toBe(1)
    expect(sim.state().wave).toBe(1)
    expect(sim.state().active.every((n) => n === 0)).toBe(true)
  })
})
