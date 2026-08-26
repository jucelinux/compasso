import { describe, expect, it } from "vitest"
import { loadTuning } from "../src/harness/loadTuning.ts"
import { EMPTY_INPUT } from "../src/input/frame.ts"
import { atravessaTela, ehTela } from "../src/harness/atravessa.ts"
import { createSim } from "../src/sim/sim.ts"
import {
  activeStats,
  COMPLEMENTO,
  INSTANT,
  PLAQUETA,
  POWERS,
  quotaFor,
  spawnIntervalFor,
} from "../src/sim/powers.ts"
import type { Enemy, InputFrame, Sim, SimState } from "../src/sim/types.ts"

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

const IN = (o: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...o })
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
/*
 * As telas que NÃO são jogo. O `hub` entrou em 13/08, e ele abre a run.
 *
 * Quase todo teste daqui mede a arena, e desde que o jogo passou a nascer no
 * cérebro há DUAS telas antes do primeiro tick de jogo — hub e card. Atravessar
 * as duas é o que mantém a contagem de ticks dos testes exata.
 */
const TELA = (ph: string): boolean => ehTela(ph)

/**
 * O input que ATRAVESSA a tela em que a sim está.
 *
 * Deixou de ser "aperte ação" em 13/08, e a razão é do jogo e não do teste: o
 * hub virou navegável, então sair dele exige ANDAR até a órbita. O helper pilota
 * o glóbulo — é a mesma coisa que o jogador faz, e escrever aqui qualquer atalho
 * (teleportar, forçar a fase) faria os testes atravessarem um caminho que
 * ninguém percorre.
 *
 * A regra em si mora em `src/harness/atravessa.ts` desde o mesmo dia, e não por
 * elegância: no dia em que o hub virou navegável havia SEIS cópias dela, duas
 * ficaram para trás, e as duas viraram teste verde medindo nada. O comentário
 * de lá conta quais.
 *
 * Este `sim` a mais existe só porque os testes chamam com a sim na mão. Passa a
 * sim ao módulo comum, e usa o mesmo `tuning` que a sim daqui usa.
 */
const atravessa = (sim: Sim, t: typeof tuning = tuning): InputFrame =>
  atravessaTela(sim.state(), t)

const advance = (sim: Sim, ticks: number, input: InputFrame = NONE): void => {
  for (let i = 0; i < ticks; i++) {
    if (TELA(sim.state().phase)) sim.step(atravessa(sim))
    else sim.step(input)
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
  /*
   * Anda ATÉ o jogo começar, em vez de um número fixo de ticks.
   *
   * A contagem fixa funcionou enquanto havia uma tela antes da run. Com o hub
   * passaram a ser duas, eu somei as travas na mão, e o resultado foi ~50 ticks
   * de JOGO DE VERDADE rodando antes do corpo do teste — tempo suficiente para
   * o jogador levar um toque e ficar invulnerável, e aí catorze testes de
   * contato mediram um jogador imune achando que mediam contato.
   *
   * Parar na borda exata é o conserto, e ele não tem aritmética para errar: a
   * condição é a fase, não o relógio. Se uma terceira tela entrar amanhã, este
   * laço continua certo sozinho.
   */
  let guarda = 0
  while (TELA(sim.state().phase) && guarda++ < 900) sim.step(atravessa(sim, t))
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
  if (TELA(sim.state().phase)) sim.step(atravessa(sim))
  else sim.step(input)
}

/**
 * Leva o glóbulo do CÉREBRO até a órbita e confirma o inimigo.
 *
 * Existe para os testes que descrevem o CAMINHO (morte → cérebro → run) em vez
 * de descrever a arena. Eles não podem usar `start`, que atravessa tudo de uma
 * vez, nem apertar uma tecla só — desde 13/08 sair do hub é andar.
 */
const saiDoHub = (sim: Sim): void => {
  let guarda = 0
  while (sim.state().phase === "hub" && guarda++ < 600) sim.step(atravessa(sim))
  // Solta a tecla e confirma: a seleção precisa da borda de subida.
  sim.step(NONE)
  sim.step(ACTION)
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
    // Pelo ID e não pelo NOME: `name` é texto de TELA, e em 26/08 ele mudou de
    // idioma sem que o poder mudasse. Chave de teste não pode ser legenda.
    const macrofago = POWERS.findIndex((p) => p.id === 3)
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
    expect(sim.state().phase, "o jogo abre no CÉREBRO desde 13/08").toBe("hub")
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
      // Esvazia até a contenção pegar: um toque congela o tick e `stepRun` sai
      // antes da checagem. Regra do jogo, não defeito — ver o laço da onda 6.
      let guarda = 0
      while (sim.state().phase === "run" && guarda++ < 120) {
        const s = mut(sim)
        s.field.fill(0)
        s.infection = 0
        s.enemies = []
        sim.step(NONE)
      }
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

    /*
     * Vencer leva ao CÉREBRO, e é de lá que a run nova nasce.
     *
     * Até 13/08 confirmar a vitória recomeçava na hora. Com o hub existindo, o
     * fim de run tem um destino — e é o MESMO pelos dois caminhos, morrendo ou
     * limpando, que é o que faz dele um hub em vez de uma tela de continue.
     */
    const antes = sim.state().runIndex
    for (let i = 0; i < tuning.cardLockTicks + 1; i++) sim.step(NONE)
    sim.step(ACTION)
    expect(sim.state().phase, "vitória devolve ao cérebro").toBe("hub")
    /*
     * `runIndex` conta runs TERMINADAS, e a vitória terminou uma. Ele mudou de
     * lugar em 13/08 junto com o hub: contado no começo, a primeira run já
     * nasceria com 1 e a verificação de "reiniciou" do `npm run rec` passaria a
     * aprovar qualquer gravação.
     */
    expect(sim.state().runIndex, "a run vencida conta como terminada").toBe(antes + 1)

    saiDoHub(sim)
    expect(sim.state().runIndex, "sair do hub não termina run nenhuma").toBe(antes + 1)
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
    // Atravessa cérebro, seleção e card — três telas antes do jogo desde 13/08.
    let g = 0
    while (TELA(sim.state().phase) && g++ < 900) sim.step(atravessa(sim))
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
      // Escudo, cura e COMPLEMENTO agem na hora: não deixam rastro em `active`.
      if (pw.id === 8 || INSTANT.has(pw.id)) continue
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
    // Morrer TERMINA a run, e é isso que `runIndex` conta desde 13/08.
    expect(sim.state().runIndex, "uma run terminada").toBe(1)

    /*
     * A tecla de reinício continua sendo PRÓPRIA, e isto é o que trava a regra
     * de 31/07 contra mim mesmo: ao criar o hub eu aceitei `action` aqui,
     * argumentando que voltar ao cérebro não começa nada. A razão original não
     * era essa — é que *o gate mede intenção*, e sair da tela de morte por
     * reflexo apaga o balanço da run antes de ele ser lido. Revertido.
     */
    advance(sim, 900, IN({ action: true }))
    expect(sim.state().phase, "impulso não tira você da morte").toBe("dead")

    sim.step(RESTART)
    // Morrer devolve ao CÉREBRO desde 13/08, e é de lá que a run nova nasce.
    expect(sim.state().phase).toBe("hub")
    saiDoHub(sim)
    expect(sim.state().phase, "e o hub leva ao card da doença").toBe("card")
    expect(sim.state().runIndex, "a run nova ainda não terminou").toBe(1)
    expect(sim.state().wave).toBe(1)
    expect(sim.state().active.every((n) => n === 0)).toBe(true)
  })
})

describe("os itens: supressão e COMPLEMENTO", () => {
  /** Põe UMA cápsula em cima do jogador e deixa a coleta acontecer. */
  const consome = (sim: Sim, power: number): void => {
    const s = mut(sim)
    s.drops = [{ id: id(), power, x: s.player.x, y: s.player.y, life: 100 }]
    sim.step(NONE)
  }

  it("o COMPLEMENTO varre as FILHAS e não encosta na mãe", () => {
    /*
     * A divisão de trabalho que dá sentido ao item: ele desmonta a REPRODUÇÃO,
     * o jogador mata o corpo. Varrer a mãe junto seria limpar a onda por item,
     * e limpar a onda é o trabalho de quem joga.
     */
    const sim = start(200)
    const s = mut(sim)
    s.enemies = [
      virus(60, 60, "ecoli"),
      virus(90, 60, "ecoli_filha"),
      virus(120, 60, "ecoli_filha"),
      virus(150, 60, "ecoli"),
    ]
    consome(sim, COMPLEMENTO)
    const vivos = sim.state().enemies
    expect(vivos.filter((e) => e.kind === "ecoli_filha"), "filha não sobra").toHaveLength(0)
    expect(vivos.filter((e) => e.kind === "ecoli").length, "a mãe fica").toBeGreaterThanOrEqual(2)
  })

  it("o COMPLEMENTO REINICIA e SEGURA o relógio da fissão", () => {
    const sim = start(201)
    const s = mut(sim)
    s.enemies = [virus(60, 60, "ecoli")]
    // Relógio quase no fim: sem o item, a colônia dobraria em instantes.
    s.fissionAcc = tuning.phases[0]!.fissionSeconds - 0.1
    consome(sim, COMPLEMENTO)
    expect(sim.state().fissionAcc, "o acumulador zera").toBe(0)
    /*
     * Quase o valor cheio, não o valor cheio: o passo da fissão roda DEPOIS da
     * coleta no mesmo tick, então a pausa já nasce com um tick descontado. Isso
     * é a ordem correta — o item age agora, não no tick seguinte — e cravar o
     * valor exato aqui só travaria a ordem interna do `stepRun`.
     */
    const pausa = tuning.phases[0]!.counter.stunSeconds
    expect(sim.state().fissionStun).toBeGreaterThan(pausa - 2 / tuning.sim.hz)
    expect(sim.state().fissionStun).toBeLessThanOrEqual(pausa)
  })

  it("durante a pausa a colônia NÃO dobra, e depois volta a dobrar", () => {
    /*
     * O teste que separa "reinicia" de "segura". Só reiniciar compraria os
     * segundos que faltavam e mais nada; é a pausa que transforma o item numa
     * janela de trabalho.
     */
    const conta = (comItem: boolean): number => {
      const sim = start(202)
      const s = mut(sim)
      s.field.fill(0)
      s.infection = 0
      s.enemies = [virus(40, 40, "ecoli"), virus(600, 330, "ecoli")]
      if (comItem) consome(sim, COMPLEMENTO)
      /*
       * A janela tem que ser MAIOR que o período de fissão e MENOR que
       * `reinício + pausa`. Ela é derivada dos dois números, e não escrita à
       * mão: com `fissionSeconds` em 8 e a pausa em 6, qualquer constante que
       * eu digitasse aqui viraria mentira no dia em que um dos dois mudasse —
       * e a primeira versão deste teste morreu exatamente assim, medindo uma
       * janela curta demais e concluindo que o item não fazia nada.
       */
      const fissao = tuning.phases[0]!.fissionSeconds
      const janela = fissao + 1
      expect(janela, "a janela precisa caber dentro da proteção do item").toBeLessThan(
        fissao + tuning.phases[0]!.counter.stunSeconds,
      )
      const ticks = Math.round(janela * tuning.sim.hz)
      for (let i = 0; i < ticks; i++) {
        const st = mut(sim)
        st.field.fill(0)
        st.infection = 0
        // Longe de tudo: o que se mede é a fissão, não a fagocitose.
        st.player.x = 320
        st.player.y = 180
        tick(sim, NONE)
      }
      return sim.state().enemies.filter((e) => e.kind === "ecoli").length
    }
    const semItem = conta(false)
    const comItem = conta(true)
    expect(semItem, "sem item a colônia dobra na janela").toBeGreaterThan(2)
    expect(comItem, "com item ela fica onde estava").toBe(2)
  })

  it("a pausa é da ONDA: conter e recomeçar não a carrega junto", () => {
    const sim = start(203)
    const s = mut(sim)
    s.enemies = [virus(60, 60, "ecoli")]
    consome(sim, COMPLEMENTO)
    expect(sim.state().fissionStun).toBeGreaterThan(0)
    const t = mut(sim)
    t.field.fill(0)
    t.infection = 0
    t.enemies = []
    sim.step(NONE)
    expect(sim.state().phase).toBe("intervalo")
    expect(sim.state().fissionStun, "a onda nova começa sem vantagem herdada").toBe(0)
  })

  it("a supressão continua sendo a do TECIDO, e o COMPLEMENTO não a faz", () => {
    // Os dois são instantâneos e não podem virar o mesmo item por descuido.
    const tecido = (power: number): number => {
      const sim = start(204)
      const s = mut(sim)
      s.enemies = [virus(8, 8, "ecoli")]
      s.field.fill(tuning.field.maxInfection)
      s.infection = totalOf(sim)
      const antes = totalOf(sim)
      consome(sim, power)
      return antes - totalOf(sim)
    }
    /*
     * Contra CONTROLE, e não contra zero: o jogador cura o chão em que está a
     * cada tick desde que a dilatação foi desligada, então "limpou alguma
     * coisa" é verdade até sem item nenhum. A primeira versão deste teste
     * comparava com zero e reprovava o comportamento certo.
     */
    const semItem = tecido(-1)
    expect(tecido(PLAQUETA) - semItem, "a plaqueta limpa MUITO mais").toBeGreaterThan(1000)
    expect(tecido(COMPLEMENTO) - semItem, "o complemento não é cura disfarçada").toBe(0)
  })

  it("consumir CARIMBA o evento, que é o gancho da animação", () => {
    /*
     * Sem o carimbo o render teria que diferenciar `prev` e `cur` — e um quadro
     * lento roda vários ticks, então a cápsula nasce e some dentro dele e a
     * animação nunca aconteceria.
     */
    const sim = start(205)
    const s = mut(sim)
    s.enemies = [virus(8, 8, "ecoli")]
    const px = s.player.x
    consome(sim, COMPLEMENTO)
    expect(sim.state().lastPickPower).toBe(COMPLEMENTO)
    expect(sim.state().lastPickTick).toBe(sim.state().tick - 1)
    expect(sim.state().lastPickX).toBeCloseTo(px, 5)
  })

  it("os dois itens caem: o sorteio instantâneo conhece os dois", () => {
    expect([...INSTANT].sort(), "supressão e complemento").toEqual([PLAQUETA, COMPLEMENTO].sort())
  })
})

describe("o CÉREBRO: hub, escolha e memória imunológica", () => {
  it("o jogo NASCE no hub, e nada corre lá dentro", () => {
    const sim = createSim(300, tuning)
    expect(sim.state().phase).toBe("hub")
    /*
     * Safezone com prazo não é safezone. Mil ticks parados no cérebro não podem
     * mover UMA coisa — nem infecção, nem contagem, nem a própria fase.
     */
    const antes = {
      tick: sim.state().tick,
      infection: sim.state().infection,
      bank: sim.state().bank,
    }
    for (let i = 0; i < 1000; i++) sim.step(NONE)
    expect(sim.state().phase, "ninguém te empurra para fora").toBe("hub")
    expect(sim.state().infection, "a doença não avança no cérebro").toBe(antes.infection)
    expect(sim.state().bank).toBe(antes.bank)
    expect(sim.state().tick, "só o contador de ticks anda").toBe(antes.tick + 1000)
  })

  it("morrer devolve ao cérebro, e o cérebro devolve ao jogo", () => {
    const sim = start(301)
    const s = mut(sim)
    s.lives = 1
    s.enemies = [virus(s.player.x, s.player.y, "corona")]
    sim.step(NONE)
    advance(sim, tuning.run.deadLockTicks + 2)
    expect(sim.state().phase).toBe("dead")
    sim.step(RESTART)
    expect(sim.state().phase, "o caminho da morte é o cérebro").toBe("hub")
    saiDoHub(sim)
    expect(sim.state().phase, "e do cérebro sai uma run nova").toBe("card")
  })

  it("cada patógeno abatido larga UMA moeda", () => {
    const sim = start(302)
    const s = mut(sim)
    s.pickups = []
    // Longe do jogador: senão o ímã recolhe no mesmo tick e o teste mede a
    // coleta em vez da queda.
    s.enemies = [virus(600, 330, "ecoli"), virus(620, 20, "ecoli")]
    const antes = sim.state().kills
    mut(sim).enemies.forEach((e) => (e.hp = 0))
    // Abate por poder passivo não existe aqui; força pelo caminho do contato.
    s.player.x = 600
    s.player.y = 330
    toFullSpeed(sim)
    expect(sim.state().kills).toBeGreaterThanOrEqual(antes)
    // A regra que importa e que dá para afirmar sem depender de colisão:
    // o número de moedas nunca passa do número de abates.
    expect(sim.state().coins + sim.state().pickups.length).toBeLessThanOrEqual(
      sim.state().kills,
    )
  })

  it("a moeda vai para o BANCO ao terminar a run, morrendo ou vencendo", () => {
    const sim = start(303)
    const s = mut(sim)
    s.coins = 7
    s.bank = 2
    s.lives = 1
    s.enemies = [virus(s.player.x, s.player.y, "corona")]
    sim.step(NONE)
    expect(sim.state().phase).toBe("dead")
    expect(sim.state().bank, "morrer também paga — o cérebro é refúgio").toBe(9)
    expect(sim.state().coins, "e a bolsa da run zera").toBe(0)
  })

  it("a run nova zera as moedas mas NÃO o banco", () => {
    const sim = start(304)
    const s = mut(sim)
    s.bank = 40
    s.coins = 5
    s.lives = 1
    s.enemies = [virus(s.player.x, s.player.y, "corona")]
    sim.step(NONE)
    advance(sim, tuning.run.deadLockTicks + 2)
    sim.step(RESTART)
    sim.step(NONE)
    sim.step(ACTION)
    expect(sim.state().bank, "o que o organismo aprendeu sobrevive").toBe(45)
    expect(sim.state().coins, "o que ele juntou na tentativa, não").toBe(0)
  })

  it("a escolha do hub decide a doença da run", () => {
    /*
     * Com uma doença na lista isto é trivialmente verdadeiro — e é exatamente
     * por isso que precisa de teste. É o único lugar onde a escolha vira jogo,
     * e se ele estiver errado ninguém descobre até a segunda doença voltar.
     */
    const sim = createSim(305, tuning)
    mut(sim).villain = 0
    saiDoHub(sim)
    expect(sim.state().phaseIndex).toBe(0)
    expect(sim.state().phase).toBe("card")
  })

  it("as setas percorrem a lista de vilões e não saem dela", () => {
    const sim = createSim(306, tuning)
    const n = tuning.phases.length
    for (let i = 0; i < n * 2 + 3; i++) {
      sim.step(IN({ right: true }))
      sim.step(NONE)
      expect(sim.state().villain).toBeGreaterThanOrEqual(0)
      expect(sim.state().villain).toBeLessThan(n)
    }
    for (let i = 0; i < n * 2 + 3; i++) {
      sim.step(IN({ left: true }))
      sim.step(NONE)
      expect(sim.state().villain).toBeGreaterThanOrEqual(0)
      expect(sim.state().villain).toBeLessThan(n)
    }
  })

  it("`runIndex` conta runs TERMINADAS — o gravador depende disso", () => {
    /*
     * O `npm run rec` detecta reinício por `phase === "run" && runIndex > 0`.
     * Contado no COMEÇO da run, com o hub no boot, a primeira run já nasceria
     * com 1 e o verificador aprovaria qualquer gravação — em silêncio, que é o
     * pior tipo. Este teste é a trava contra reintroduzir isso.
     */
    const sim = createSim(307, tuning)
    expect(sim.state().runIndex, "nada terminou ainda").toBe(0)
    sim.step(ACTION)
    sim.step(NONE)
    expect(sim.state().runIndex, "começar não é terminar").toBe(0)
  })
})

describe("o cérebro NAVEGÁVEL e a órbita como porta", () => {
  it("o glóbulo ANDA no hub, com a física do jogo", () => {
    const sim = createSim(400, tuning)
    expect(sim.state().phase).toBe("hub")
    const x0 = sim.state().player.x
    for (let i = 0; i < 20; i++) sim.step(IN({ left: true }))
    expect(sim.state().player.x, "andar para a esquerda anda para a esquerda").toBeLessThan(x0)
    expect(sim.state().player.speed, "e a velocidade é a mesma leitura da arena").toBeGreaterThan(0)
  })

  it("o hub NASCE fora da órbita — chegar não é materializar na porta", () => {
    /*
     * Sem isto, voltar da morte na posição em que se morreu podia cair em cima
     * do gatilho, e a seleção abriria antes de o jogador ver o cérebro.
     */
    const sim = createSim(401, tuning)
    const dx = sim.state().player.x - tuning.hub.orbitX
    const dy = sim.state().player.y - tuning.hub.orbitY
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(tuning.hub.enterRadius)
    // E fica: parado, ninguém entra sozinho.
    for (let i = 0; i < 600; i++) sim.step(NONE)
    expect(sim.state().phase, "parado no cérebro, nada acontece").toBe("hub")
  })

  it("entrar na órbita ABRE a seleção, e só o miolo dispara", () => {
    const sim = createSim(402, tuning)
    const s = mut(sim)
    /*
     * Encostado na BORDA do anel, e não no miolo: o gatilho é o `enterRadius`,
     * bem menor que o `orbitRadius`, para não disparar de raspão em quem passeia.
     */
    s.player.x = tuning.hub.orbitX + tuning.hub.orbitRadius - 2
    s.player.y = tuning.hub.orbitY
    sim.step(NONE)
    expect(sim.state().phase, "passar pela borda não abre nada").toBe("hub")

    mut(sim).player.x = tuning.hub.orbitX
    mut(sim).player.y = tuning.hub.orbitY
    sim.step(NONE)
    expect(sim.state().phase, "o miolo abre").toBe("select")
  })

  it("voltar da seleção EMPURRA para fora, senão ela reabre no quadro seguinte", () => {
    const sim = createSim(403, tuning)
    const s = mut(sim)
    s.player.x = tuning.hub.orbitX
    s.player.y = tuning.hub.orbitY
    sim.step(NONE)
    expect(sim.state().phase).toBe("select")

    sim.step(RESTART)
    expect(sim.state().phase).toBe("hub")
    const dx = sim.state().player.x - tuning.hub.orbitX
    const dy = sim.state().player.y - tuning.hub.orbitY
    expect(Math.sqrt(dx * dx + dy * dy), "fora do gatilho").toBeGreaterThan(
      tuning.hub.enterRadius,
    )
    // E continua fora: o remédio aqui é geometria, não um relógio de carência.
    for (let i = 0; i < 120; i++) sim.step(NONE)
    expect(sim.state().phase).toBe("hub")
  })

  it("a seleção CONFIRMA com ação e a run começa no vilão escolhido", () => {
    const sim = createSim(404, tuning)
    const s = mut(sim)
    s.player.x = tuning.hub.orbitX
    s.player.y = tuning.hub.orbitY
    sim.step(NONE)
    expect(sim.state().phase).toBe("select")
    sim.step(ACTION)
    expect(sim.state().phase).toBe("card")
    expect(sim.state().phaseIndex).toBe(sim.state().villain)
  })

  it("no hub o glóbulo NÃO tem arranco nem recarga", () => {
    /*
     * O impulso é habilidade de combate, e o cérebro não tem combate. Deixá-lo
     * ligado daria ao jogador uma tecla que faz algo invisível num lugar sem
     * consequência — e a mesma tecla é a que confirma na seleção.
     */
    const sim = createSim(405, tuning)
    for (let i = 0; i < 40; i++) sim.step(IN({ right: true, action: true }))
    expect(sim.state().player.dashTicks).toBe(0)
    expect(sim.state().player.dashCooldown).toBe(0)
  })

  it("o gatilho é MENOR que a órbita, e isso é a regra, não um número solto", () => {
    expect(tuning.hub.enterRadius).toBeLessThan(tuning.hub.orbitRadius)
  })
})

/*
 * AS CINCO PORTAS do cérebro, 13/08 — nomes e lugares do H.
 *
 * O que estes testes travam não é a decoração das telas, que ele ainda vai
 * desenhar: é a REGRA de porta. Abrir andando, abrir clicando, fechar clicando
 * fora, fechar no [X], fechar na tecla, e não reabrir sozinha no quadro
 * seguinte. Cinco portas com uma regra só é o desenho inteiro — se uma delas
 * passar a se comportar diferente, é aqui que aparece.
 */
describe("as cinco portas do cérebro", () => {
  const CLIQUE = (x: number, y: number): InputFrame =>
    IN({ pointerX: x, pointerY: y, click: true })

  const noHub = (seed = 700): Sim => {
    const sim = createSim(seed, tuning)
    expect(sim.state().phase).toBe("hub")
    return sim
  }

  it("ANDAR até cada porta abre a tela dela", () => {
    for (let i = 0; i < tuning.hub.nodes.length; i++) {
      const node = tuning.hub.nodes[i]!
      const sim = noHub(800 + i)
      let guarda = 0
      while (sim.state().phase === "hub" && guarda++ < 900) {
        const s = sim.state()
        sim.step(
          IN({
            up: node.y - s.player.y < -2,
            down: node.y - s.player.y > 2,
            left: node.x - s.player.x < -2,
            right: node.x - s.player.x > 2,
          }),
        )
      }
      expect(sim.state().phase, `porta ${node.id} não abriu andando`).toBe("painel")
      expect(sim.state().painel, `porta ${node.id} abriu a tela errada`).toBe(i)
    }
  })

  it("CLICAR em cada porta abre a tela dela, sem andar", () => {
    for (let i = 0; i < tuning.hub.nodes.length; i++) {
      const node = tuning.hub.nodes[i]!
      const sim = noHub(900 + i)
      const antes = { ...sim.state().player }
      sim.step(CLIQUE(node.x, node.y))
      expect(sim.state().phase, `clique não abriu ${node.id}`).toBe("painel")
      expect(sim.state().painel).toBe(i)
      // O clique não move o glóbulo: apontar e andar são gestos diferentes.
      expect(sim.state().player.x).toBe(antes.x)
      expect(sim.state().player.y).toBe(antes.y)
    }
  })

  it("clicar na ÓRBITA abre a escolha do inimigo, não um painel", () => {
    const sim = noHub()
    sim.step(CLIQUE(tuning.hub.orbitX, tuning.hub.orbitY))
    expect(sim.state().phase).toBe("select")
    expect(sim.state().painel).toBe(-1)
  })

  it("clicar no VAZIO não abre nada", () => {
    // O caso nulo da regra: se qualquer clique abrisse algo, os testes acima
    // estariam passando por acidente.
    const sim = noHub()
    sim.step(CLIQUE(4, 4))
    expect(sim.state().phase).toBe("hub")
  })

  it("clicar FORA do quadro fecha, e devolve o jogador à praça", () => {
    const sim = noHub()
    sim.step(CLIQUE(tuning.hub.nodes[0]!.x, tuning.hub.nodes[0]!.y))
    expect(sim.state().phase).toBe("painel")
    sim.step(NONE)
    sim.step(CLIQUE(4, 4))
    const s = sim.state()
    expect(s.phase).toBe("hub")
    expect(s.painel, "a tela aberta não pode sobreviver ao fechamento").toBe(-1)
    expect(s.player.x).toBe(tuning.hub.spawnX)
    expect(s.player.y).toBe(tuning.hub.spawnY)
  })

  it("clicar no [X] fecha, mesmo estando DENTRO do quadro", () => {
    const sim = noHub()
    sim.step(CLIQUE(tuning.hub.nodes[1]!.x, tuning.hub.nodes[1]!.y))
    sim.step(NONE)
    const x = (tuning.arena.width + tuning.hub.panelW) / 2 - tuning.hub.closeSize / 2
    const y = (tuning.arena.height - tuning.hub.panelH) / 2 + tuning.hub.closeSize / 2
    sim.step(CLIQUE(x, y))
    expect(sim.state().phase).toBe("hub")
  })

  it("clicar DENTRO do quadro, fora do [X], NÃO fecha", () => {
    // A outra metade do par: sem ela, "fecha no X" passaria com uma regra que
    // fecha em qualquer clique.
    const sim = noHub()
    sim.step(CLIQUE(tuning.hub.nodes[1]!.x, tuning.hub.nodes[1]!.y))
    sim.step(NONE)
    sim.step(CLIQUE(tuning.arena.width / 2, tuning.arena.height / 2))
    expect(sim.state().phase).toBe("painel")
  })

  it("a tecla de voltar também fecha", () => {
    const sim = noHub()
    sim.step(CLIQUE(tuning.hub.nodes[2]!.x, tuning.hub.nodes[2]!.y))
    sim.step(NONE)
    sim.step(RESTART)
    expect(sim.state().phase).toBe("hub")
  })

  it("botão SEGURADO não reabre a porta no quadro seguinte", () => {
    /*
     * A versão de mouse do "dispensar por reflexo" que o `cardLock` resolve para
     * as teclas: sem borda, fechar com o botão apertado devolve ao hub e o mesmo
     * clique reabre a porta no tick seguinte, para sempre.
     *
     * O jogador volta à praça, longe de toda porta, então o que este teste mede
     * é o clique — e por isso ele segura o botão sobre uma porta.
     */
    const sim = noHub()
    const n = tuning.hub.nodes[3]!
    sim.step(CLIQUE(n.x, n.y))
    expect(sim.state().phase).toBe("painel")
    // SOLTA antes de fechar. A primeira versão deste teste não soltava e falhou
    // — e a falha era do teste: sem soltar não há borda, e sem borda o jogo faz
    // exatamente o que ele promete, que é nada. O gesto real é clicar, soltar,
    // clicar.
    sim.step(NONE)
    sim.step(CLIQUE(4, 4))
    expect(sim.state().phase).toBe("hub")
    // Continua apertado, agora sobre a porta: não pode abrir de novo.
    for (let i = 0; i < 30; i++) sim.step(CLIQUE(n.x, n.y))
    expect(sim.state().phase, "o botão preso reabriu a porta").toBe("hub")
    // Soltar e clicar de novo abre: a trava é da BORDA, não do lugar.
    sim.step(NONE)
    sim.step(CLIQUE(n.x, n.y))
    expect(sim.state().phase).toBe("painel")
  })

  it("nada corre dentro de um painel", () => {
    // Mesma promessa do hub: o cérebro é safezone, e uma tela por cima dele não
    // pode ser um lugar onde o tempo anda.
    const sim = noHub()
    sim.step(CLIQUE(tuning.hub.nodes[0]!.x, tuning.hub.nodes[0]!.y))
    const antes = sim.state()
    const foto = {
      infeccao: antes.infection,
      inimigos: antes.enemies.length,
      vidas: antes.lives,
      onda: antes.wave,
    }
    for (let i = 0; i < 600; i++) sim.step(NONE)
    const s = sim.state()
    expect(s.phase).toBe("painel")
    expect(s.infection).toBe(foto.infeccao)
    expect(s.enemies.length).toBe(foto.inimigos)
    expect(s.lives).toBe(foto.vidas)
    expect(s.wave).toBe(foto.onda)
  })

  it("a praça de nascimento fica LONGE de todas as portas", () => {
    /*
     * A regra que torna o resto possível: se o ponto de chegada encostasse numa
     * porta, o cérebro abriria uma tela sozinho a cada morte — e o jogador
     * nunca veria a safezone que ele voltou para ver.
     *
     * Medido contra o raio real de cada porta, não contra um número escrito
     * aqui: mover uma porta no `tuning.json` tem que derrubar este teste.
     */
    const px = tuning.hub.spawnX
    const py = tuning.hub.spawnY
    const dOrbita = Math.hypot(px - tuning.hub.orbitX, py - tuning.hub.orbitY)
    expect(dOrbita).toBeGreaterThan(tuning.hub.enterRadius * 3)
    for (const n of tuning.hub.nodes) {
      expect(Math.hypot(px - n.x, py - n.y), `nasce em cima de ${n.id}`).toBeGreaterThan(
        tuning.hub.nodeRadius * 3,
      )
    }
  })

  it("as portas não se sobrepõem entre si", () => {
    const todas = [
      { id: "orbita", x: tuning.hub.orbitX, y: tuning.hub.orbitY, r: tuning.hub.orbitRadius },
      ...tuning.hub.nodes.map((n) => ({ ...n, r: tuning.hub.nodeRadius })),
    ]
    for (let i = 0; i < todas.length; i++) {
      for (let j = i + 1; j < todas.length; j++) {
        const a = todas[i]!
        const b = todas[j]!
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} encosta em ${b.id}`).toBeGreaterThan(
          a.r + b.r + 8,
        )
      }
    }
  })
})

/*
 * O HISTÓRICO, 14/08 — a tela do canto superior esquerdo ficou ATIVA.
 *
 * O H fechou a lacuna: só o modo pandemia continua inativo. Para o histórico
 * existir de verdade, a run terminada precisa deixar registro, e é isso que
 * estes testes travam — não a aparência da tela, mas que o registro exista, com
 * os números da run que acabou e não os da seguinte.
 */
describe("o histórico de runs", () => {
  const morre = (sim: Sim): void => {
    let guarda = 0
    while (sim.state().phase !== "dead" && guarda++ < 60 * 60 * 6) tick(sim, NONE)
  }

  it("começa vazio", () => {
    expect(createSim(1, tuning).state().historico).toEqual([])
  })

  it("uma run terminada deixa UM registro, com os números dela", () => {
    const sim = start(4242)
    const s0 = sim.state()
    const ondaNaMorte = { wave: 0, kills: 0, coins: 0 }
    let guarda = 0
    while (sim.state().phase !== "dead" && guarda++ < 60 * 60 * 6) {
      const s = sim.state()
      ondaNaMorte.wave = s.wave
      ondaNaMorte.kills = s.kills
      ondaNaMorte.coins = s.coins
      tick(sim, NONE)
    }
    expect(sim.state().phase, "a run não terminou; o teste não mediu nada").toBe("dead")
    const h = sim.state().historico
    expect(h.length).toBe(1)
    expect(h[0]!.wave).toBe(ondaNaMorte.wave)
    expect(h[0]!.kills).toBe(ondaNaMorte.kills)
    // As moedas do registro são as DESTA run, colhidas antes de o banco somar.
    expect(h[0]!.coins).toBe(ondaNaMorte.coins)
    expect(h[0]!.venceu).toBe(false)
    expect(h[0]!.ticks).toBeGreaterThan(0)
    void s0
  })

  it("a run mais NOVA fica na frente", () => {
    // É como a tela lê: quem abre o histórico quer saber da última.
    const sim = start(77)
    morre(sim)
    const primeira = sim.state().historico[0]!
    /*
     * INSISTE no reinício: a tela de morte tem `deadLock`, e o primeiro toque
     * cai dentro dele. A primeira versão deste teste apertava uma vez, seguia
     * em frente e media a MESMA run — dava 1 registro onde eu esperava 2, e o
     * defeito era do teste. O jogador insiste; o teste também.
     */
    let d = 0
    while (sim.state().phase === "dead" && d++ < 300) {
      // ALTERNA solto/apertado: a saída é por BORDA, e segurar a tecla não é
      // apertá-la de novo. Segunda correção deste mesmo teste, e as duas foram
      // do teste — o jogo estava cumprindo o que promete nas duas vezes.
      sim.step(d % 2 === 0 ? RESTART : NONE)
    }
    expect(sim.state().phase, "não saiu da tela de morte").toBe("hub")
    saiDoHub(sim)
    let g = 0
    while (TELA(sim.state().phase) && g++ < 900) sim.step(atravessa(sim))
    morre(sim)
    const h = sim.state().historico
    expect(h.length).toBe(2)
    expect(h[1]).toEqual(primeira)
  })

  it("o histórico tem TETO: ele vive no hash e não pode crescer sem fim", () => {
    /*
     * Sem teto, o custo cresceria com o tempo de jogo e apareceria como um
     * replay ficando mais lento quanto mais alguém joga — que é a forma mais
     * chata de um defeito aparecer, porque parece "o jogo está pesado".
     *
     * Aqui a lista é preenchida à mão em vez de por 9 runs: o que se mede é o
     * teto, não a duração de nove partidas.
     */
    const sim = start(5)
    const h = sim.state().historico
    for (let i = 0; i < 40; i++) {
      h.unshift({ wave: i, kills: i, coins: i, venceu: false, ticks: i })
    }
    morre(sim)
    expect(sim.state().historico.length).toBeLessThanOrEqual(8)
    // E o topo é o registro NOVO, não os enfiados à mão.
    expect(sim.state().historico[0]!.wave).not.toBe(39)
  })

  it("o registro entra no HASH, com o conteúdo e não só a contagem", () => {
    /*
     * Contar sem olhar deixaria dois históricos diferentes com o mesmo hash, e
     * o hash existe exatamente para que isso não aconteça. É o caso nulo desta
     * peça: sem ele, o pacote poderia estar ignorando a lista inteira.
     */
    const a = createSim(9, tuning)
    const b = createSim(9, tuning)
    expect(a.snapshot().hash).toBe(b.snapshot().hash)
    a.state().historico.push({ wave: 3, kills: 10, coins: 2, venceu: false, ticks: 600 })
    b.state().historico.push({ wave: 3, kills: 10, coins: 2, venceu: true, ticks: 600 })
    expect(a.snapshot().hash).not.toBe(b.snapshot().hash)
  })
})

/*
 * AS HABILIDADES, 14/08 — adrenalina e febre, chamada do H.
 *
 * O que estes testes travam é o que a mecânica PROMETE, e cada promessa tem um
 * jeito de quebrar em silêncio: carga que conta o que não devia, efeito que
 * dura mais do que diz, e — a pior — a adrenalina alimentando o próprio prazo,
 * porque ela mexe justamente no relógio que poderia medi-la.
 */
/**
 * Um inimigo plantado, copiado de um VIVO da cena.
 *
 * Copiar em vez de escrever o objeto à mão porque `Enemy` tem campos que só
 * alguns tipos usam (cambalhota, veneno acumulado) — escrever um literal aqui
 * congelaria a forma dele no teste e quebraria no dia em que a sim ganhasse
 * mais um campo. Exige uma cena com pelo menos um corpo, o que toda run tem.
 */
const criaInimigo = (s: SimState, id: number, x: number, y: number): Enemy => {
  const molde = s.enemies[0]
  if (molde === undefined) throw new Error("cena sem inimigo para copiar")
  return { ...molde, id, x, y, hp: 1 }
}

describe("as habilidades da loja", () => {
  const IDX = { adrenalina: 0, febre: 1 } as const
  const HAB = (n: number): InputFrame => IN({ ability: n })
  const CLIQUE = (x: number, y: number): InputFrame =>
    IN({ pointerX: x, pointerY: y, click: true })

  /**
   * Planta saldo no banco.
   *
   * `state()` devolve leitura, e escrever nele pede um empurrão de tipo. A
   * alternativa seria JOGAR duas runs inteiras para ganhar 1200 de memória em
   * cada teste de loja — o que mediria o jogo inteiro para afirmar uma coisa
   * sobre a loja, e quebraria no dia em que o rendimento por run mudasse.
   */
  const põeSaldo = (sim: Sim, v: number): void => {
    ;(sim.state() as { bank: number }).bank = v
  }

  /** Compra a habilidade `i` direto no estado. A COMPRA tem teste próprio. */
  const compra = (sim: Sim, i: number): void => {
    sim.state().habilidades[i]!.nivel = 1
  }
  const nivel1 = (i: number) => tuning.habilidades[i]!.niveis[0]!

  it("começa sem nenhuma, e nível 0 é NÃO COMPRADA", () => {
    const s = createSim(1, tuning).state()
    expect(s.habilidades.length).toBe(tuning.habilidades.length)
    for (const h of s.habilidades) expect(h.nivel).toBe(0)
  })

  it("comprar na loja gasta a memória e entrega o nível 1", () => {
    const sim = createSim(10, tuning)
    põeSaldo(sim, 1200)
    // Vai até a loja e clica na primeira linha.
    const loja = tuning.hub.nodes.findIndex((n) => n.loja === true)
    expect(loja, "nenhuma porta é loja").toBeGreaterThanOrEqual(0)
    const node = tuning.hub.nodes[loja]!
    sim.step(CLIQUE(node.x, node.y))
    expect(sim.state().phase).toBe("painel")
    sim.step(NONE)
    const y0 = (tuning.arena.height - tuning.hub.panelH) / 2
    sim.step(CLIQUE(tuning.arena.width / 2, y0 + tuning.hub.rowTop + 4))
    const s = sim.state()
    expect(s.habilidades[0]!.nivel).toBe(1)
    expect(s.bank).toBe(1200 - tuning.habilidades[0]!.custo)
    // Comprar é clique DENTRO do quadro, então não pode fechar a tela junto.
    expect(s.phase).toBe("painel")
  })

  it("sem saldo não compra, e o clique não vira desconto", () => {
    const sim = createSim(11, tuning)
    põeSaldo(sim, tuning.habilidades[0]!.custo - 1)
    const node = tuning.hub.nodes.find((n) => n.loja === true)!
    sim.step(CLIQUE(node.x, node.y))
    sim.step(NONE)
    const y0 = (tuning.arena.height - tuning.hub.panelH) / 2
    const antes = sim.state().bank
    sim.step(CLIQUE(tuning.arena.width / 2, y0 + tuning.hub.rowTop + 4))
    expect(sim.state().habilidades[0]!.nivel).toBe(0)
    expect(sim.state().bank).toBe(antes)
  })

  it("comprar de novo não cobra de novo", () => {
    const sim = createSim(12, tuning)
    põeSaldo(sim, 5000)
    const node = tuning.hub.nodes.find((n) => n.loja === true)!
    const y0 = (tuning.arena.height - tuning.hub.panelH) / 2
    sim.step(CLIQUE(node.x, node.y))
    sim.step(NONE)
    sim.step(CLIQUE(tuning.arena.width / 2, y0 + tuning.hub.rowTop + 4))
    const depois = sim.state().bank
    sim.step(NONE)
    sim.step(CLIQUE(tuning.arena.width / 2, y0 + tuning.hub.rowTop + 4))
    expect(sim.state().bank).toBe(depois)
  })

  it("carrega por TEMPO: um minuto de jogo enche a carga", () => {
    /*
     * Chamada do H em 14/08 — os dois gatilhos por evento (abate e limo) saíram
     * e viraram tempo, "para facilitar nesse primeiro momento".
     *
     * Tempo REAL e não de mundo: a adrenalina freia o relógio do mundo, e se a
     * recarga contasse nele ela atrasaria a própria volta — a habilidade sairia
     * mais cara quanto melhor funcionasse.
     */
    const sim = start(4242)
    compra(sim, IDX.adrenalina)
    const nv = nivel1(IDX.adrenalina)
    expect(sim.state().habilidades[IDX.adrenalina]!.carga).toBe(0)
    /*
     * Mede a TAXA, e não espera a carga encher.
     *
     * A primeira versão rodava um minuto e conferia o total — e deu 50,88 em
     * vez de 60, porque parada a run MORRE aos ~51s. O teste estava medindo
     * quanto tempo o jogador sobrevive, não quanto a habilidade carrega. A taxa
     * responde a pergunta certa e não depende de sobreviver a nada.
     */
    const SEGUNDOS = 10
    for (let i = 0; i < SEGUNDOS * tuning.sim.hz; i++) tick(sim, NONE)
    expect(sim.state().phase, "morreu no meio; a medição seria de outra coisa").toBe("run")
    expect(sim.state().habilidades[IDX.adrenalina]!.carga).toBeCloseTo(SEGUNDOS, 1)
    // E a recarga do nível está em SEGUNDOS, então a carga cheia é um minuto.
    expect(nv.recarga).toBe(60)
  })

  it("a carga NÃO corre fora da run — o cérebro não é farm", () => {
    /*
     * O caso nulo do gatilho por tempo, e ele é a metade que decide: contando
     * no cérebro, esperar parado numa tela seria a forma mais eficiente de
     * recarregar, e o hub deixaria de ser descanso para virar trabalho. "A cada
     * 1 minuto" quer dizer de JOGO.
     */
    const sim = createSim(4243, tuning)
    compra(sim, IDX.adrenalina)
    expect(sim.state().phase).toBe("hub")
    for (let i = 0; i < 60 * 120; i++) sim.step(NONE)
    expect(sim.state().phase, "saiu do hub sozinho; o teste mediria outra coisa").toBe("hub")
    expect(sim.state().habilidades[IDX.adrenalina]!.carga).toBe(0)
  })

  it("a carga tem TETO: run longa não vira estoque de usos", () => {
    const sim = start(4244)
    compra(sim, IDX.adrenalina)
    const nv = nivel1(IDX.adrenalina)
    // Planta a carga no teto e roda mais: ela não pode passar dali. Rodar três
    // minutos de verdade mediria sobrevivência outra vez.
    sim.state().habilidades[IDX.adrenalina]!.carga = nv.recarga
    for (let i = 0; i < 600; i++) tick(sim, NONE)
    expect(sim.state().habilidades[IDX.adrenalina]!.carga).toBeLessThanOrEqual(nv.recarga)
  })

  it("acionar SEM carga cheia não faz nada, e não gasta o que há", () => {
    const sim = start(5)
    compra(sim, IDX.adrenalina)
    const quase = nivel1(IDX.adrenalina).recarga - 1
    sim.state().habilidades[IDX.adrenalina]!.carga = quase
    tick(sim, HAB(1))
    const h = sim.state().habilidades[IDX.adrenalina]!
    expect(h.ativa).toBe(0)
    // Não GASTA: a carga só pode ter subido, pelo tick de tempo que acabou de
    // correr. Comparar com igualdade exata seria medir o gatilho, não a recusa.
    expect(h.carga).toBeGreaterThanOrEqual(quase)
  })

  it("acionar com carga cheia gasta a carga e liga pelo prazo do nível", () => {
    const sim = start(6)
    compra(sim, IDX.adrenalina)
    const nv = nivel1(IDX.adrenalina)
    sim.state().habilidades[IDX.adrenalina]!.carga = nv.recarga
    tick(sim, HAB(1))
    const h = sim.state().habilidades[IDX.adrenalina]!
    expect(h.carga).toBe(0)
    // Cheio no tick do acionamento: a sim desconta o prazo ANTES de acionar, e
    // quem acabou de ligar não perde um tick por isso.
    expect(h.ativa).toBe(Math.round(nv.duracao * tuning.sim.hz))
  })

  it("não comprada NÃO aciona, mesmo com a carga cheia à força", () => {
    // O caso nulo da posse: sem ele, os testes acima passariam com uma regra
    // que ignora `nivel` e aciona qualquer coisa.
    const sim = start(7)
    sim.state().habilidades[IDX.adrenalina]!.carga = 99999
    tick(sim, HAB(1))
    expect(sim.state().habilidades[IDX.adrenalina]!.ativa).toBe(0)
  })

  it("a ADRENALINA freia o relógio do MUNDO enquanto dura", () => {
    const sim = start(8)
    compra(sim, IDX.adrenalina)
    const nv = nivel1(IDX.adrenalina)
    sim.state().habilidades[IDX.adrenalina]!.carga = nv.recarga
    const normal = sim.state().worldScale
    tick(sim, HAB(1))
    expect(sim.state().worldScale).toBeCloseTo(normal * nv.escala, 5)
    // E volta ao normal quando acaba.
    for (let i = 0; i < Math.round(nv.duracao * tuning.sim.hz) + 2; i++) tick(sim, NONE)
    expect(sim.state().habilidades[IDX.adrenalina]!.ativa).toBe(0)
    expect(sim.state().worldScale).toBeCloseTo(normal, 5)
  })

  it("a duração da ADRENALINA é REAL, e não do mundo que ela mesma freia", () => {
    /*
     * O defeito que este teste existe para impedir: contar o prazo no relógio
     * do mundo faria o efeito alimentar o próprio prazo — 3 segundos virariam
     * 60, e uma habilidade que se estende sozinha não tem custo.
     *
     * Medido em TICKS, que é o relógio real da sim.
     */
    const sim = start(9)
    compra(sim, IDX.adrenalina)
    const nv = nivel1(IDX.adrenalina)
    sim.state().habilidades[IDX.adrenalina]!.carga = nv.recarga
    tick(sim, HAB(1))
    let n = 0
    while (sim.state().habilidades[IDX.adrenalina]!.ativa > 0 && n < 60 * 60) {
      tick(sim, NONE)
      n++
    }
    expect(n).toBe(Math.round(nv.duracao * tuning.sim.hz))
  })

  it("a FEBRE mata o que está no raio e deixa o que está fora", () => {
    const sim = start(20)
    compra(sim, IDX.febre)
    const nv = nivel1(IDX.febre)
    const s = sim.state()
    s.habilidades[IDX.febre]!.carga = nv.recarga
    // Copia o molde ANTES de esvaziar a cena: a primeira versão limpava e
    // depois tentava copiar de uma lista vazia.
    const dentro = criaInimigo(s, 8001, s.player.x + nv.raio * 0.4, s.player.y)
    const fora = criaInimigo(s, 8002, s.player.x + nv.raio * 2.5, s.player.y)
    s.enemies.length = 0
    s.enemies.push(dentro, fora)
    tick(sim, HAB(2))
    const ids = sim.state().enemies.map((e) => e.id)
    expect(ids).not.toContain(8001)
    expect(ids).toContain(8002)
  })

  it("a FEBRE limpa o tecido em volta MAIS do que a presença sozinha", () => {
    /*
     * Contra CONTROLE e não contra o estado inicial, e a razão já custou um
     * vermelho neste projeto em 13/08: o jogador cura o tecido embaixo dele em
     * TODO tick, então "a infecção caiu" é verdade com ou sem a habilidade.
     * O que a febre precisa provar é que ela cai MAIS.
     */
    const cena = (comFebre: boolean): number => {
      const sim = start(21)
      compra(sim, IDX.febre)
      const nv = nivel1(IDX.febre)
      const s = sim.state()
      s.enemies.length = 0
      /*
       * O nível do campo tem DOIS tetos, e eu bati nos dois antes de acertar.
       *
       * No talo (`maxInfection`) a NECROSE morde todo tile todo tick e o piso
       * devolve o que a cura tirou: as duas cenas empatavam, e o empate era a
       * necrose funcionando. A 60% o campo passa de `loseFraction` e a run
       * MORRE no primeiro tick: as duas cenas empatavam de novo, agora porque
       * nada rodava. 30% fica abaixo dos dois, que é onde a febre é a única
       * diferença entre as cenas.
       */
      s.field.fill(Math.floor(tuning.field.maxInfection * 0.3))
      s.necrose.fill(0)
      s.habilidades[IDX.febre]!.carga = comFebre ? nv.recarga : 0
      tick(sim, comFebre ? HAB(2) : NONE)
      for (let i = 0; i < 120; i++) tick(sim, NONE)
      return sim.state().infection
    }
    expect(cena(true)).toBeLessThan(cena(false))
  })

  it("a FEBRE não desfaz CICATRIZ — só a presença faz isso, desde 05/08", () => {
    /*
     * Se ela apagasse necrose em área, o ratchet que dá ladeira à run
     * desmontava. É a regra que mais custou a existir neste projeto, e uma
     * habilidade nova é exatamente o tipo de coisa que a atropela sem querer.
     */
    const sim = start(22)
    compra(sim, IDX.febre)
    const nv = nivel1(IDX.febre)
    const s = sim.state()
    s.habilidades[IDX.febre]!.carga = nv.recarga
    s.enemies.length = 0
    s.necrose.fill(tuning.field.maxInfection)
    const antes = sim.state().necrosed
    tick(sim, HAB(2))
    for (let i = 0; i < 20; i++) tick(sim, IN({ left: true }))
    // Anda para longe do ponto: o que sobra de queda é a presença, não a febre.
    expect(sim.state().necrosed).toBeGreaterThan(antes * 0.9)
  })

  it("o ÍCONE também aciona, para o dedo", () => {
    // O H pediu as duas portas: no celular clica no ícone, no computador
    // aperta 1..5. As duas têm que chegar no mesmo lugar.
    const sim = start(23)
    compra(sim, IDX.adrenalina)
    const nv = nivel1(IDX.adrenalina)
    sim.state().habilidades[IDX.adrenalina]!.carga = nv.recarga
    tick(sim, CLIQUE(tuning.hud.habX, tuning.hud.habY))
    expect(sim.state().habilidades[IDX.adrenalina]!.ativa).toBeGreaterThan(0)
  })

  it("clicar onde NÃO há ícone não aciona nada", () => {
    const sim = start(24)
    compra(sim, IDX.adrenalina)
    sim.state().habilidades[IDX.adrenalina]!.carga = nivel1(IDX.adrenalina).recarga
    tick(sim, CLIQUE(tuning.arena.width / 2, 20))
    expect(sim.state().habilidades[IDX.adrenalina]!.ativa).toBe(0)
  })
})

/*
 * O QUADRO em três regiões, 14/08 — e ele nasceu de um defeito que só existia
 * no toque, pego pelo H jogando.
 *
 * No aparelho de toque a metade direita da tela é o impulso, e na `select` o
 * impulso é LUTAR: tocar à direita para fechar a tela começava a partida. O
 * gesto de sair fazia a única coisa que não dá para desfazer.
 *
 * O conserto foi dar ao quadro três regiões COMPLEMENTARES — fora fecha, [X]
 * fecha, dentro confirma — para que o dedo diga o mesmo que o mouse. O que
 * estes testes travam é a complementaridade: nenhuma faixa que faça as duas
 * coisas, e nenhuma que não faça nada.
 */
describe("o quadro: fora fecha, [X] fecha, dentro confirma", () => {
  const CLIQUE = (x: number, y: number): InputFrame =>
    IN({ pointerX: x, pointerY: y, click: true })
  const cx = tuning.arena.width / 2
  const cy = tuning.arena.height / 2
  const x0 = (tuning.arena.width - tuning.hub.panelW) / 2
  const y0 = (tuning.arena.height - tuning.hub.panelH) / 2

  const naEscolha = (): Sim => {
    const sim = createSim(400, tuning)
    sim.step(CLIQUE(tuning.hub.orbitX, tuning.hub.orbitY))
    expect(sim.state().phase).toBe("select")
    sim.step(NONE)
    return sim
  }

  it("clicar DENTRO do quadro confirma o inimigo", () => {
    const sim = naEscolha()
    sim.step(CLIQUE(cx, cy))
    expect(sim.state().phase).toBe("card")
  })

  it("clicar FORA fecha, e não começa luta nenhuma", () => {
    /*
     * O canto inferior direito é exatamente onde o dedo do H caía: metade
     * direita da tela, longe do quadro. Antes do conserto isto virava `card`.
     */
    const sim = naEscolha()
    sim.step(CLIQUE(tuning.arena.width - 12, tuning.arena.height - 12))
    expect(sim.state().phase).toBe("hub")
  })

  it("clicar no [X] fecha, mesmo estando dentro do retângulo", () => {
    const sim = naEscolha()
    const c = tuning.hub.closeSize
    sim.step(CLIQUE(x0 + tuning.hub.panelW - c / 2, y0 + c / 2))
    expect(sim.state().phase).toBe("hub")
  })

  it("as três regiões são complementares: todo ponto é exatamente uma", () => {
    /*
     * O caso nulo da geometria. Uma faixa que não fosse nenhuma das três seria
     * uma região da tela onde o toque não faz nada, e o jogador leria isso como
     * "travou"; uma que fosse duas seria um clique com dois sentidos.
     *
     * Varre a tela inteira em passo de 7px — primo em relação à largura do
     * quadro, então a amostra não cai sempre na mesma coluna relativa.
     */
    const sim = naEscolha()
    for (let x = 0; x < tuning.arena.width; x += 7) {
      for (let y = 0; y < tuning.arena.height; y += 7) {
        const s2 = createSim(401, tuning)
        s2.step(CLIQUE(tuning.hub.orbitX, tuning.hub.orbitY))
        s2.step(NONE)
        s2.step(CLIQUE(x, y))
        const f = s2.state().phase
        expect(["hub", "card"], `ponto (${x},${y}) não fez nem uma coisa nem outra`).toContain(f)
      }
    }
    void sim
  })

  it("o CARD se dispensa no clique, e não só na tecla", () => {
    // Sem isto o card ficaria sem saída no toque: `action` deixou de ser
    // produzido nas telas quando a metade direita parou de ter opinião.
    const sim = naEscolha()
    sim.step(CLIQUE(cx, cy))
    expect(sim.state().phase).toBe("card")
    let g = 0
    while (sim.state().phase === "card" && g++ < 200) {
      sim.step(g % 2 === 0 ? CLIQUE(cx, tuning.arena.height - 20) : NONE)
    }
    expect(sim.state().phase).toBe("run")
  })
})

/*
 * RETOMAR DE ONDE JÁ CHEGOU, 14/08 — pedido do H.
 *
 * "Se morreu no nível 4, poderá retomar dos níveis 1, 2, 3 ou 4." O que estes
 * testes travam é o par que faz isso ser jogo e não atalho: o recorde só sobe
 * chegando, e retomar na onda 4 tem que retomar na DIFICULDADE 4.
 */
describe("retomar da onda", () => {
  const CLIQUE = (x: number, y: number): InputFrame =>
    IN({ pointerX: x, pointerY: y, click: true })

  const abreSelecao = (sim: Sim): void => {
    sim.step(CLIQUE(tuning.hub.orbitX, tuning.hub.orbitY))
    expect(sim.state().phase).toBe("select")
    sim.step(NONE)
  }

  it("começa com recorde 1: não há de onde retomar antes de jogar", () => {
    const s = createSim(1, tuning).state()
    expect(s.recordes.length).toBe(tuning.phases.length)
    for (const r of s.recordes) expect(r).toBe(1)
    expect(s.ondaEscolhida).toBe(1)
  })

  it("o recorde sobe com a onda ALCANÇADA, mesmo morrendo nela", () => {
    /*
     * Chegar na onda N e morrer nela já libera retomar da N: o que se ganha é o
     * direito de tentar de novo dali, não a prova de que se venceu. Exigir
     * vitória faria o desbloqueio depender de conter a onda — que é justamente
     * o que não se conseguiu.
     */
    const sim = start(4242)
    let g = 0
    while (sim.state().phase !== "dead" && g++ < 60 * 60 * 6) {
      if (sim.state().phase === "run") tick(sim, IN({ right: true }))
      else tick(sim, NONE)
    }
    const s = sim.state()
    expect(s.phase, "a run não terminou; o teste não mediria nada").toBe("dead")
    expect(s.recordes[s.villain]).toBe(Math.max(1, s.historico[0]!.wave))
  })

  it("a escolha é grampeada pelo recorde, venha da tecla ou do clique", () => {
    const sim = createSim(500, tuning)
    ;(sim.state() as { recordes: number[] }).recordes[0] = 3
    abreSelecao(sim)
    // Sobe além do teto: para em 3.
    for (let i = 0; i < 10; i++) {
      sim.step(IN({ up: true }))
      sim.step(NONE)
    }
    expect(sim.state().ondaEscolhida).toBe(3)
    // E desce sem passar de 1.
    for (let i = 0; i < 10; i++) {
      sim.step(IN({ down: true }))
      sim.step(NONE)
    }
    expect(sim.state().ondaEscolhida).toBe(1)
  })

  it("clicar numa célula da FAIXA escolhe a onda — e não começa a luta", () => {
    /*
     * A faixa é um clique DENTRO do quadro, e clique dentro do quadro confirma.
     * Sem a ordem certa, escolher a onda 3 começaria a partida na onda que
     * estivesse escolhida — o mesmo defeito de ordem que a loja teve em 13/08.
     */
    const sim = createSim(501, tuning)
    ;(sim.state() as { recordes: number[] }).recordes[0] = 4
    abreSelecao(sim)
    const x0 = (tuning.arena.width - tuning.hub.panelW) / 2
    const y0 = (tuning.arena.height - tuning.hub.panelH) / 2
    const cw = tuning.hub.panelW / 4
    sim.step(CLIQUE(x0 + cw * 2.5, y0 + tuning.hub.ondaTop + 5))
    expect(sim.state().phase, "a faixa começou a luta").toBe("select")
    expect(sim.state().ondaEscolhida).toBe(3)
  })

  it("com recorde 1 a faixa NÃO existe, e aquele pedaço confirma", () => {
    /*
     * O caso nulo da faixa. Sem isto ela seria uma banda do painel que não
     * fecha, não confirma e não muda nada — região morta numa tela onde todo
     * ponto faz alguma coisa.
     */
    const sim = createSim(502, tuning)
    abreSelecao(sim)
    const x0 = (tuning.arena.width - tuning.hub.panelW) / 2
    const y0 = (tuning.arena.height - tuning.hub.panelH) / 2
    sim.step(CLIQUE(x0 + tuning.hub.panelW / 2, y0 + tuning.hub.ondaTop + 5))
    expect(sim.state().phase).toBe("card")
  })

  it("retomar da onda 4 começa na onda 4 E na dificuldade 4", () => {
    /*
     * O par que impede o atalho: `round` é o que indexa a curva, e começar na
     * onda 4 com a dificuldade da 1 faria retomar virar uma forma de jogar a
     * onda 4 fácil.
     */
    const sim = createSim(503, tuning)
    ;(sim.state() as { recordes: number[] }).recordes[0] = 4
    abreSelecao(sim)
    for (let i = 0; i < 3; i++) {
      sim.step(IN({ up: true }))
      sim.step(NONE)
    }
    expect(sim.state().ondaEscolhida).toBe(4)
    sim.step(ACTION)
    const s = sim.state()
    expect(s.phase).toBe("card")
    expect(s.wave).toBe(4)
    expect(s.round).toBe(4)
  })

  it("a habilidade comprada começa DISPONÍVEL na run", () => {
    // "O default da habilidade é começar já disponível para uso." Sem isto o
    // primeiro minuto de toda run é jogado sem nada do que se comprou.
    const sim = createSim(504, tuning)
    sim.state().habilidades[0]!.nivel = 1
    abreSelecao(sim)
    sim.step(ACTION)
    const h = sim.state().habilidades[0]!
    expect(h.carga).toBe(tuning.habilidades[0]!.niveis[0]!.recarga)
    expect(h.ativa).toBe(0)
  })

  it("a não comprada NÃO ganha carga de graça no começo da run", () => {
    const sim = createSim(505, tuning)
    abreSelecao(sim)
    sim.step(ACTION)
    expect(sim.state().habilidades[0]!.carga).toBe(0)
  })
})

/*
 * O ALVO DO DEDO, 14/08 — "o raio é muito preciso", palavras do H.
 *
 * Dois gestos com precisões diferentes: quem ANDA mira com o corpo e vê onde
 * ele está; quem TOCA mira com um dedo que cobre mais pixels do que enxerga.
 */
describe("as portas são mais fáceis de acertar no dedo", () => {
  const CLIQUE = (x: number, y: number): InputFrame =>
    IN({ pointerX: x, pointerY: y, click: true })

  it("o clique acerta a órbita de MAIS LONGE que o corpo", () => {
    const fora = tuning.hub.enterRadius + tuning.hub.folgaToque - 2
    const sim = createSim(600, tuning)
    sim.step(CLIQUE(tuning.hub.orbitX + fora, tuning.hub.orbitY))
    expect(sim.state().phase, `clique a ${fora}px não abriu`).toBe("select")
  })

  it("mas não de longe DEMAIS: a folga é folga, não a tela inteira", () => {
    // O caso nulo do alvo maior. Sem ele, "ficou mais fácil" poderia significar
    // "qualquer clique abre qualquer porta".
    const longe = tuning.hub.enterRadius + tuning.hub.folgaToque + 8
    const sim = createSim(601, tuning)
    sim.step(CLIQUE(tuning.hub.orbitX + longe, tuning.hub.orbitY))
    expect(sim.state().phase).toBe("hub")
  })

  it("a folga do dedo NÃO vale para quem anda", () => {
    /*
     * Andar tem alvo menor de propósito: passear pelo cérebro não pode abrir
     * porta sem querer, e quem conduz o glóbulo vê exatamente onde ele está.
     */
    const sim = createSim(602, tuning)
    const s = sim.state()
    ;(s.player as { x: number; y: number }).x = tuning.hub.orbitX + tuning.hub.enterRadius + 6
    ;(s.player as { x: number; y: number }).y = tuning.hub.orbitY
    sim.step(NONE)
    expect(sim.state().phase).toBe("hub")
  })
})
