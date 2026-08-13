import { Packer } from "./hash.ts"
import {
  activeStats,
  COMPLEMENTO,
  INSTANT,
  PLAQUETA,
  POWERS,
  quotaFor,
  spawnIntervalFor,
} from "./powers.ts"
import {
  crowdAt,
  fieldSpec,
  healAround,
  healNecroseAround,
  applyNecroseFloor,
  liveInfection,
  necroseStep,
  totalNecrose,
  healthiestTile,
  frontierTile,
  infectAt,
  makeField,
  spreadStep,
  tileAt,
  tileCenterX,
  tileCenterY,
  totalInfection,
} from "./field.ts"
import { createRng } from "./rng.ts"
import type {
  Enemy,
  InputFrame,
  KindSpec,
  PhaseSpec,
  Pulse,
  Sim,
  SimSnapshot,
  SimState,
  Tuning,
  WaveStep,
} from "./types.ts"

/**
 * COMPASSO — o tempo só anda quando você anda.
 *
 * REESCRITO em 01/08. O dash discreto era o core e caiu no gate, três leituras
 * negativas seguidas: o humano descreveu como "soluços", e arranco discreto não
 * vira fluidez com polimento — é o desenho.
 *
 * O core agora é contínuo: **a sua velocidade É a escala do tempo do mundo**.
 * Parada, a célula deixa o mundo a 5%; a toda, a 100%. Pela primeira vez a frase
 * do projeto é literalmente verdadeira, e não só durante rajadas de 9 ticks.
 *
 * Ataque é fagocitose por velocidade: encostar rápido engole, encostar devagar
 * machuca, e cada patógeno exige a sua velocidade. Isso amarra ataque, relógio e
 * risco no mesmo número — acelerar para matar é escolher acelerar o inimigo.
 *
 * O jogador anda em TEMPO REAL; todo o resto anda em TEMPO DE MUNDO. É essa
 * assimetria que faz a dilatação existir.
 */

const DIAG = 0.7071067811865476

const BIT_UP = 1
const BIT_DOWN = 2
const BIT_LEFT = 4
const BIT_RIGHT = 8
const BIT_ACTION = 16
const BIT_RESTART = 32

function bitsOf(input: InputFrame): number {
  return (
    (input.up ? BIT_UP : 0) |
    (input.down ? BIT_DOWN : 0) |
    (input.left ? BIT_LEFT : 0) |
    (input.right ? BIT_RIGHT : 0) |
    (input.action ? BIT_ACTION : 0) |
    (input.restart ? BIT_RESTART : 0)
  )
}

/** Oito direções de entrada. A velocidade resultante é contínua. */
function direction(bits: number): { dx: number; dy: number } | null {
  let dx = (bits & BIT_RIGHT ? 1 : 0) - (bits & BIT_LEFT ? 1 : 0)
  let dy = (bits & BIT_DOWN ? 1 : 0) - (bits & BIT_UP ? 1 : 0)
  if (dx === 0 && dy === 0) return null
  if (dx !== 0 && dy !== 0) {
    dx *= DIAG
    dy *= DIAG
  }
  return { dx, dy }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

const KIND_SHARD = "ecoli_filha"

/**
 * A DILATAÇÃO, atrás do toggle `time.dilation` — DESLIGADA desde 13/08.
 *
 * Com ela ligada, o mundo anda na sua velocidade: parada, a célula deixa o
 * mundo em `time.creep`; a toda, em 1. Desligada, o mundo anda em tempo real
 * e ponto — `1`, não `creep`, porque o que o H desligou foi o relógio LENTO,
 * não o relógio.
 *
 * A fórmula fica inteira e sob teste. Ela é a tese do projeto e a única linha
 * que o portão mede; guardá-la atrás de um booleano é o que permite ligá-la de
 * volta contra um jogo mais maduro em vez de reescrevê-la de memória — e
 * `TASTE-LOOP.md` já cobrou caro por prosa sobre restrição morta.
 *
 * `t·√t` no lugar de `t^1.5` continua valendo quando ligada: só multiplicação
 * e raiz, que são exatas entre engines. `Math.pow` não é, e o rig inteiro
 * depende de Node e browser darem o mesmo hash.
 */
function worldScaleFor(tuning: Tuning, sp: number): number {
  if (!tuning.time.dilation) return 1
  const t01 = Math.min(1, sp / tuning.player.maxSpeed)
  const eased = t01 * Math.sqrt(t01)
  const mix = tuning.time.linearMix
  return tuning.time.creep + (1 - tuning.time.creep) * (mix * t01 + (1 - mix) * eased)
}

export function createSim(seed: number, tuning: Tuning): Sim {
  const rng = createRng(seed)
  const dt = 1 / tuning.sim.hz
  const { width, height } = tuning.arena
  const packer = new Packer(8192)
  const FIELD = fieldSpec(width, height, tuning.field.cols, tuning.field.rows)
  const MAXINF = tuning.field.maxInfection
  const LOSE = Math.round(FIELD.cols * FIELD.rows * MAXINF * tuning.field.loseFraction)
  const WIN = Math.round(FIELD.cols * FIELD.rows * MAXINF * tuning.field.winFraction)
  const scratch = new Int16Array(FIELD.cols * FIELD.rows)

  let nextId = 0
  const kindOf = (name: string): KindSpec => tuning.enemy.kinds[name]!
  const sizeOf = (e: Enemy): number => tuning.enemy.size * kindOf(e.kind).sizeScale

  const s: SimState = {
    tick: 0,
    phase: "run",
    runIndex: 0,
    wave: 1,
    phaseIndex: 0,
    round: 1,
    waveKills: 0,
    quota: quotaFor(tuning, 1),
    lives: tuning.run.lives,
    shields: 0,
    kills: 0,
    score: 0,
    bestMult: 1,
    bestKills: 0,
    bestWave: 1,
    player: {
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      speed: 0,
      dashTicks: 0,
      dashCooldown: 0,
      invulnerable: false,
    },
    enemies: [],
    field: makeField(FIELD),
    necrose: makeField(FIELD),
    infection: 0,
    necrosed: 0,
    necroseTimer: 0,
    spreadTimer: 0,
    infectAcc: 0,
    healAcc: 0,
    lostByTissue: false,
    drops: [],
    active: POWERS.map(() => 0),
    owned: POWERS.map(() => 0),
    buildOrder: [],
    offer: [],
    pick: 0,
    trails: [],
    shocks: [],
    orbiters: [],
    macrophages: [],
    clouds: [],
    pulses: [],
    pulseAcc: 0,
    killsSincePulse: 0,
    spawnTimer: spawnIntervalFor(tuning, 1),
    frozen: 0,
    deadLock: 0,
    cardLock: 0,
    countdown: 0,
    auraTicks: 0,
    instantAcc: 0,
    fissionAcc: 0,
    fissionStun: 0,
    lastPickTick: -1000,
    lastPickPower: -1,
    lastPickX: 0,
    lastPickY: 0,
    combo: 0,
    comboTicks: 0,
    comboBest: 0,
    lastKillX: 0,
    lastKillY: 0,
    lastKillTick: -1,
    // Estado inicial da célula parada: com a dilatação ligada é o `creep`, e
    // sem ela é 1. Deixar `creep` cravado aqui faria o primeiro tick da run
    // rodar a 5% com o toggle desligado — um quadro de mundo lento num jogo que
    // não tem mundo lento, e o tipo de resto que ninguém acha depois.
    worldScale: worldScaleFor(tuning, 0),
    prevBits: 0,
    rngState: rng.state(),
  }

  /**
   * A fase é UMA doença. Passar do fim da lista repete a última.
   *
   * A `spawnTable` que misturava 3-5 tipos por onda morreu em 02/08: com
   * mistura, cada patógeno se sustentava no conjunto e nenhum precisava ser
   * interessante sozinho. A queixa era "não tem memória nem identidade, é mais
   * um vai na direção dele que você mata".
   */
  const phaseSpec = (): PhaseSpec => {
    const list = tuning.phases
    return list[Math.min(s.phaseIndex, list.length - 1)]!
  }

  const rollKind = (): string => phaseSpec().disease

  /**
   * O DEGRAU da onda corrente. `undefined` = a fase não tem curva, e valem as
   * fórmulas por onda de antes.
   *
   * Indexado por `round` — a onda DENTRO da doença — e não pelo `wave` global,
   * porque a curva descreve a doença e não a run. Com uma doença só os dois são
   * iguais hoje, e é justamente por isso que escolher errado aqui passaria em
   * silêncio até o dia em que a segunda doença voltasse.
   *
   * O caso nulo não é decoração: é como se mede se a curva fez alguma coisa. Foi
   * assim que a necrose provou não ter mexido no baseline (`necroseAmount: 0`,
   * 05/08), e é o único jeito de a próxima sessão conferir esta sem confiar em
   * mim.
   */
  const degrau = (): WaveStep | undefined => {
    const curva = phaseSpec().curva
    if (curva.length === 0) return undefined
    return curva[Math.min(s.round - 1, curva.length - 1)]
  }


  /**
   * Vetor unitário aleatório SEM trigonometria.
   *
   * Sorteia dentro do quadrado, rejeita fora do círculo, normaliza com `sqrt`.
   * Rejeitar é o que mantém a distribuição uniforme em ângulo; normalizar o
   * quadrado direto concentraria nas diagonais. `sqrt` é exata entre engines,
   * `sin`/`cos` não são — e existe teste travando isso.
   */
  const randomUnit = (): { dx: number; dy: number } => {
    for (let i = 0; i < 16; i++) {
      const x = rng.nextFloat() * 2 - 1
      const y = rng.nextFloat() * 2 - 1
      const q = x * x + y * y
      if (q > 1 || q < 0.0001) continue
      const len = Math.sqrt(q)
      return { dx: x / len, dy: y / len }
    }
    return { dx: 1, dy: 0 }
  }

  const pushEnemy = (kind: string, x: number, y: number): void => {
    if (s.enemies.length >= tuning.enemy.maxAlive) return
    const half = (tuning.enemy.size * kindOf(kind).sizeScale) / 2
    s.enemies.push({
      id: nextId++,
      kind,
      x: clamp(x, half, width - half),
      y: clamp(y, half, height - half),
      hp: kindOf(kind).hp,
      bornTick: s.tick,
      ...randomUnit(),
      tumble: tumbleFor(kind),
      poisonAcc: 0,
    })
  }

  /**
   * Quanto tempo a bactéria corre reto antes de sortear outra direção.
   *
   * Faixa, não valor fixo: cambalhota sincronizada faria a colônia inteira
   * virar junto, e isso lê como cardume, não como bactéria.
   */
  const tumbleFor = (kind: string): number => {
    const own = kindOf(kind).tumbleSeconds
    const base = own > 0 ? own : tuning.enemy.tumbleSeconds
    return base * (0.5 + rng.nextFloat())
  }

  /**
   * O patógeno nasce DO TECIDO INFECTADO, não da borda da tela.
   *
   * Esta é a peça que faz a fase convergir. Com spawn de borda em intervalo
   * fixo, a infecção nunca podia chegar a zero — a sonda de 01/08 mostrou cinco
   * seeds e zero fases limpas, porque a condição de vitória era inalcançável por
   * construção.
   *
   * Nascendo do tecido, o sistema vira realimentação nos DOIS sentidos: matar
   * fonte reduz infecção, que reduz spawn, que reduz infecção. Deixar crescer faz
   * o contrário. O trabalho do jogador é inverter o sinal — e isso É a curva de
   * tensão, porque a mesma alavanca acelera os dois lados.
   */
  const spawnFromTissue = (): boolean => {
    /*
     * TECIDO MORTO NÃO PARE. Só a infecção VIVA — `field` menos a cicatriz —
     * conta para parir patógeno.
     *
     * Sem esta linha o ratchet vira espiral: a cicatriz é permanente, então
     * ela seria criadouro eterno e nenhuma fase fecharia. Com ela, deixar uma
     * região cicatrizar PARA a reprodução ali, ao preço de perder o chão. Isso
     * não é atenuação da punição — é a decisão que a rodada existe para criar.
     */
    let candidatos = 0
    for (let i = 0; i < s.field.length; i++) {
      if (liveInfection(s.field, s.necrose, i) >= tuning.field.spawnThreshold) candidatos++
    }
    if (candidatos === 0) return false
    let pick = rng.nextInt(0, candidatos)
    for (let i = 0; i < s.field.length; i++) {
      if (liveInfection(s.field, s.necrose, i) < tuning.field.spawnThreshold) continue
      if (pick-- > 0) continue
      pushEnemy(rollKind(), tileCenterX(FIELD, i), tileCenterY(FIELD, i))
      return true
    }
    return false
  }

  /** Semeia os focos iniciais da doença, longe do centro onde a célula nasce. */
  const seedInfection = (): void => {
    s.field.fill(0)
    /*
     * A cicatriz zera com a onda, e isso é decisão de desenho.
     *
     * A necrose é o ratchet DENTRO da fase — é ela que transforma o ponto fixo
     * em ladeira. Persistir entre ondas a tornaria dívida composta, e como o
     * piso conta para a contenção (`winFraction`), bastariam duas ondas ruins
     * para a fase virar matematicamente inatingível. Ratchet que não pode ser
     * pago não é tensão, é sentença.
     */
    s.necrose.fill(0)
    s.necrosed = 0
    // A doença escala por fase: mais focos iniciais e fonte mais forte. Sem
    // isto a fase 20 é idêntica à fase 1, que é a queixa de 01/08 com outra
    // roupa ("a quantidade de kills era a mesma de acordo com o nível").
    const passo = degrau()
    const focos =
      passo === undefined
        ? tuning.field.seeds + Math.floor((s.wave - 1) * tuning.field.seedsPerWave)
        : Math.max(1, Math.round(tuning.field.seeds * passo.focos))
    for (let i = 0; i < focos; i++) {
      const col = rng.nextInt(0, FIELD.cols)
      const row = rng.nextInt(0, FIELD.rows)
      infectAt(s.field, row * FIELD.cols + col, MAXINF, MAXINF)
    }
    s.infection = totalInfection(s.field)
  }

  /*
   * `rollOffer` saiu em 13/08, junto com a tela de recompensa.
   *
   * Ela sorteava três poderes distintos para o jogador escolher ao conter uma
   * onda. O que morreu foi o FORMATO onda → upgrade, não o poder: `POWERS`,
   * `activeStats`, `owned`/`active` e o caminho da cápsula continuam inteiros e
   * sob teste, esperando outra porta. Está em `git show 0663754` se voltar.
   */

  /**
   * MONTA a onda. Não decide qual tela aparece — quem chama decide.
   *
   * A separação entrou em 13/08 e é o que permite a contagem mostrar o tabuleiro
   * de verdade: o `intervalo` monta a onda ANTES de contar, então os 3 segundos
   * são tempo de LER focos e corpos já em cena, e não uma tela preta com um
   * número. Enquanto isto também trocava a fase, montar cedo era impossível.
   */
  const startWave = (): void => {
    s.fissionAcc = 0
    // A pausa é da ONDA, não da run: carregá-la para a onda seguinte daria uma
    // vantagem que o jogador não pediu e não veria de onde veio.
    s.fissionStun = 0
    s.waveKills = 0
    s.quota = quotaFor(tuning, s.wave)
    s.enemies = []
    s.spawnTimer = spawnIntervalFor(tuning, s.wave)
    s.frozen = 0
    if (s.wave > s.bestWave) s.bestWave = s.wave

    seedInfection()
    s.spreadTimer = 0

    const passo = degrau()
    const opening =
      passo === undefined
        ? tuning.enemy.openingBase + (s.wave - 1) * tuning.enemy.openingPerWave
        : Math.max(1, Math.round(tuning.enemy.openingBase * passo.abertura))
    for (let i = 0; i < opening; i++) spawnFromTissue()
  }

  /**
   * Monta a próxima onda e entra no RESPIRO com a contagem correndo.
   *
   * O intervalo não pede nada e não oferece nada, e isso é a decisão, não uma
   * simplificação: o formato onda → upgrade caiu em 13/08 porque a escolha entre
   * ondas não estava fazendo o trabalho dela. O que paga a onda contida agora é
   * a onda seguinte ser pior.
   */
  const startInterval = (): void => {
    startWave()
    s.phase = "intervalo"
    s.countdown = Math.max(1, Math.round(tuning.run.intervalSeconds * tuning.sim.hz))
  }

  const startRun = (): void => {
    s.wave = 1
    s.phaseIndex = 0
    s.round = 1
    s.kills = 0
    s.score = 0
    s.bestMult = 1
    s.field.fill(0)
    s.necrose.fill(0)
    s.infection = 0
    s.necrosed = 0
    s.spreadTimer = 0
    s.necroseTimer = 0
    s.infectAcc = 0
    s.healAcc = 0
    s.pulses = []
    s.pulseAcc = 0
    s.lostByTissue = false
    s.lives = tuning.run.lives
    s.shields = 0
    s.drops = []
    s.active = POWERS.map(() => 0)
    s.owned = POWERS.map(() => 0)
    s.buildOrder = []
    s.trails = []
    s.shocks = []
    s.orbiters = []
    s.macrophages = []
    s.clouds = []
    s.killsSincePulse = 0
    s.combo = 0
    s.comboBest = 0
    s.player.x = width / 2
    s.player.y = height / 2
    s.player.vx = 0
    s.player.vy = 0
    s.player.speed = 0
    s.player.dashTicks = 0
    s.player.dashCooldown = 0
    s.player.invulnerable = false
    s.countdown = 0
    startWave()
    /*
     * A run abre no CARD, e ele é a única tela que ainda pede uma tecla.
     *
     * Ele apresenta a doença — nome real, forma, o bicho — e por isso não pode
     * ter prazo: apresentação com contagem é apresentação que ninguém leu. As
     * ondas seguintes é que entram pela contagem, porque lá não há nada de novo
     * para apresentar, só um tabuleiro para ler.
     */
    s.phase = "card"
    s.cardLock = tuning.cardLockTicks
  }

  const endRun = (byTissue: boolean): void => {
    if (s.kills > s.bestKills) s.bestKills = s.kills
    s.lostByTissue = byTissue
    s.phase = "dead"
    s.deadLock = tuning.run.deadLockTicks
    s.frozen = 0
  }

  /** Liga um poder. Instantâneos agem na hora e não ficam ativos. */
  const grant = (power: number): void => {
    if (power === PLAQUETA) {
      for (let i = 0; i < s.field.length; i++) {
        const v = s.field[i]! - tuning.field.plaquetaHeal
        s.field[i] = v < 0 ? 0 : v
      }
      s.infection = totalInfection(s.field)
      return
    }
    if (power === COMPLEMENTO) {
      /*
       * Ataca a REPRODUÇÃO da doença, e o que ele faz é decidido pela FASE.
       *
       * Contra a E. coli: varre as filhas e devolve o relógio da fissão ao
       * começo, com uma pausa por cima. As duas metades são necessárias —
       * varrer sem pausar deixa a colônia repor em segundos, e pausar sem
       * varrer deixa em cena tudo que já nasceu.
       *
       * Nada aqui menciona "ecoli": a fase diz o que varrer e por quanto
       * tempo. Quando o segundo patógeno voltar, ele traz o `counter` dele e
       * este código não muda.
       */
      const c = phaseSpec().counter
      if (c.purge !== "") s.enemies = s.enemies.filter((e) => e.kind !== c.purge)
      s.fissionStun = c.stunSeconds
      s.fissionAcc = 0
      return
    }
    if (power === 8) {
      s.shields += tuning.powers.shieldHits
      return
    }
    s.active[power] = Math.max(s.active[power] ?? 0, tuning.drops.durationTicks)
  }

  const stepRun = (bits: number): void => {
    const p = s.player

    if (s.frozen > 0) {
      s.frozen--
      return
    }

    // --- poderes ativos envelhecem em tempo real: são o seu gesto, não o mundo
    for (let i = 0; i < s.active.length; i++) {
      if ((s.active[i] ?? 0) > 0) s.active[i] = (s.active[i] ?? 0) - 1
    }
    const st = activeStats(tuning, s.active, s.owned)

    // --- impulso: agora é habilidade com recarga, não o verbo
    if (p.dashCooldown > 0) p.dashCooldown--
    const dir = direction(bits)
    /*
     * UM BOTÃO, DOIS VERBOS, decididos pelo CONTEXTO.
     *
     * Em movimento é arranco: alcance, e foi assim que o H achou a função do
     * impulso sozinho (caçar as filhas, que têm passeio previsível).
     *
     * Parado é AURA: cura acelerada em volta, com invulnerabilidade pelo prazo
     * dela. É a resposta para "o que se faz no tempo devagar" — até 02/08 parar
     * só tinha preço e nenhum verbo.
     *
     * A recarga é a mesma para os dois, e é ela que impede o retorno do limbo
     * de 31/07: parar continua caro FORA da janela da aura, então a quimiotaxia
     * não perde a função de ensinar.
     */
    if ((bits & ~s.prevBits & BIT_ACTION) !== 0 && p.dashCooldown === 0) {
      if (p.speed < tuning.dash.auraBelowSpeed) {
        s.auraTicks = tuning.dash.auraTicks
        p.dashCooldown = tuning.dash.cooldownTicks
        /*
         * PLANTA um foco. Cheio, o mais antigo cede o lugar.
         *
         * A aura deixou de multiplicar a SUA cura de propósito: multiplicar a
         * presença deixaria o vínculo intacto — você continuaria preso ao
         * lugar, só que curando mais rápido. Plantar é o que desfaz o empate,
         * porque o trabalho passa a acontecer sem você.
         */
        if (s.pulses.length >= tuning.dash.auraFociMax) s.pulses.shift()
        s.pulses.push({
          id: nextId++,
          x: p.x,
          y: p.y,
          life: tuning.dash.auraFocusTicks,
        })
      } else if (dir !== null) {
        p.dashTicks = tuning.dash.durationTicks
        p.dashCooldown = tuning.dash.cooldownTicks
        p.vx = dir.dx * tuning.player.maxSpeed * tuning.dash.speedMultiplier
        p.vy = dir.dy * tuning.player.maxSpeed * tuning.dash.speedMultiplier
      }
    }
    if (s.auraTicks > 0) s.auraTicks--

    /*
     * --- O TECIDO RESISTE.
     *
     * Escolha do H em 02/08, contra a alternativa puramente visual. Hemácia é
     * corpo, e atravessar corpo custa: onde o tecido está são, a sua velocidade
     * máxima cai; onde a doença já tomou, o caminho está limpo.
     *
     * A consequência é grande e foi aceita com o custo nomeado: **a doença
     * limpa o caminho.** Como velocidade é o relógio do mundo, curar passa a
     * custar mobilidade e deixar apodrecer passa a comprá-la. É a primeira vez
     * que o campo empurra de volta em vez de só ser pintado.
     *
     * Efeito colateral que cai bem: cinco dos seis `engulfSpeed` estão abaixo de
     * 0.78, e em tecido são o teto passa a ficar perto disso. O contato volta a
     * ser decisão, que é a reprovação medida de 01/08 — 0,1s de perigo numa run
     * de 127s. Não foi projetado para isso; é o mesmo número resolvendo dois.
     */
    const crowd = crowdAt(FIELD, s.field, tuning.field.maxInfection, p.x, p.y)
    const crowdCap = 1 - tuning.field.crowdDrag * crowd

    // --- movimento contínuo: aceleração e arrasto, sem passo discreto
    const maxSpeed = tuning.player.maxSpeed * st.speedMultiplier * crowdCap
    if (p.dashTicks > 0) {
      p.dashTicks--
    } else if (dir !== null) {
      p.vx += dir.dx * tuning.player.accel * dt
      p.vy += dir.dy * tuning.player.accel * dt
    } else {
      const sp0 = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (sp0 > 0.001) {
        const drop = Math.min(sp0, tuning.player.drag * dt)
        p.vx -= (p.vx / sp0) * drop
        p.vy -= (p.vy / sp0) * drop
      } else {
        p.vx = 0
        p.vy = 0
      }
    }

    let sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    const cap = p.dashTicks > 0 ? maxSpeed * tuning.dash.speedMultiplier : maxSpeed
    if (sp > cap) {
      p.vx = (p.vx / sp) * cap
      p.vy = (p.vy / sp) * cap
      sp = cap
    }
    p.speed = sp / tuning.player.maxSpeed

    // O jogador anda em tempo REAL. É essa assimetria que cria a dilatação.
    const half = tuning.player.size / 2
    const nx = p.x + p.vx * dt
    const ny = p.y + p.vy * dt
    if (nx < half || nx > width - half) p.vx = -p.vx * 0.4
    if (ny < half || ny > height - half) p.vy = -p.vy * 0.4
    p.x = clamp(nx, half, width - half)
    p.y = clamp(ny, half, height - half)

    // --- O RELÓGIO. A escala do tempo é a sua velocidade, e nada mais.
    s.worldScale = worldScaleFor(tuning, sp)
    const world = dt * s.worldScale

    // --- combo, rastro e cápsulas envelhecem em tempo real
    if (s.comboTicks > 0) {
      s.comboTicks--
      if (s.comboTicks === 0) s.combo = 0
    }
    if (st.trailTicks > 0) s.trails.push({ id: nextId++, x: p.x, y: p.y, life: st.trailTicks })
    for (const tr of s.trails) tr.life--
    s.trails = s.trails.filter((tr) => tr.life > 0)
    for (const sh of s.shocks) sh.life--
    s.shocks = s.shocks.filter((sh) => sh.life > 0)
    for (const cl of s.clouds) cl.life--
    s.clouds = s.clouds.filter((cl) => cl.life > 0)
    for (const d of s.drops) d.life--
    s.drops = s.drops.filter((d) => d.life > 0)

    // --- anticorpos e macrófagos acompanham os poderes ligados
    while (s.orbiters.length < st.orbiters) {
      const c = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ][s.orbiters.length % 4]!
      s.orbiters.push({ ox: c[0]!, oy: c[1]! })
    }
    if (s.orbiters.length > st.orbiters) s.orbiters.length = st.orbiters
    while (s.macrophages.length < st.macrophages) {
      s.macrophages.push({ id: nextId++, x: width / 2, y: height / 4 })
    }
    if (s.macrophages.length > st.macrophages) s.macrophages.length = st.macrophages

    const { orbitCos, orbitSin } = tuning.powers
    for (const o of s.orbiters) {
      const ox = o.ox * orbitCos - o.oy * orbitSin
      const oy = o.ox * orbitSin + o.oy * orbitCos
      const len = Math.sqrt(ox * ox + oy * oy) || 1
      o.ox = ox / len
      o.oy = oy / len
    }
    for (const m of s.macrophages) {
      let bx = p.x
      let by = p.y
      let bd = Infinity
      for (const e of s.enemies) {
        const d = (e.x - m.x) * (e.x - m.x) + (e.y - m.y) * (e.y - m.y)
        if (d < bd) {
          bd = d
          bx = e.x
          by = e.y
        }
      }
      const mx = bx - m.x
      const my = by - m.y
      const md = Math.sqrt(mx * mx + my * my)
      if (md > 0.5) {
        m.x = clamp(m.x + (mx / md) * tuning.powers.macrophageSpeed * world, 8, width - 8)
        m.y = clamp(m.y + (my / md) * tuning.powers.macrophageSpeed * world, 8, height - 8)
      }
    }

    /*
     * --- patógenos: em tempo de MUNDO, exceto quem tem `timeImmunity`.
     *
     * Este laço é o que ENSINA a dilatação. Com um relógio único, parar
     * congelava a cena inteira e o jogador não tinha contra o que comparar —
     * o primeiro jogador externo passou 83s sem sacar o core (02/08). A filha
     * da E. coli anda em tempo real: você para, o mundo trava, e UMA COISA
     * continua vindo. Isso não se explica, se vê.
     *
     * De quebra mata o limbo: parado deixou de ser seguro para sempre, e sem
     * inventar timer nenhum.
     */
    for (const e of s.enemies) {
      const spec = kindOf(e.kind)
      // Mistura entre o relógio do mundo e o real, por espécie.
      const clock = world + (dt - world) * spec.timeImmunity
      let tx = p.x
      let ty = p.y
      if (spec.hunts === "cell") {
        // Vai atrás do tecido mais SADIO: ele quer terreno novo, não você.
        const target = healthiestTile(s.field, MAXINF)
        tx = tileCenterX(FIELD, target)
        ty = tileCenterY(FIELD, target)
      } else if (spec.hunts === "tumble") {
        /*
         * CORRIDA E CAMBALHOTA — a locomoção real da E. coli.
         *
         * Ela nada reto por alguns segundos, sorteia direção nova, e repete.
         * Não persegue você e não persegue objetivo nenhum: o espalhamento da
         * doença é CONSEQUÊNCIA do passeio, não intenção. Foi essa a correção
         * do H em 02/08 — o `colony` que eu tinha escrito dava um objetivo à
         * bactéria, e ela ficava parada saturando a borda mais próxima.
         *
         * O relógio da cambalhota é o do MUNDO, como o resto dela.
         */
        e.tumble -= clock
        if (e.tumble <= 0) {
          /*
           * QUIMIOTAXIA: com você devagar, a cambalhota deixa de ser sorteio e
           * passa a apontar para você. É o mesmo mecanismo — o que muda é o
           * viés, exatamente como a bactéria real sobe um gradiente.
           *
           * Existe porque na run de 02/08 o H atravessou a fase inteira sem
           * nunca parar, e o core do projeto não se manifestou uma vez. Parar
           * era grátis; agora custa, e o custo é o próprio bicho pequeno que já
           * anda no tempo parado.
           */
          const u = randomUnit()
          let nx = u.dx
          let ny = u.dy
          const raio = spec.chemotaxis
          if (raio > 0 && p.speed < spec.chemoBelowSpeed) {
            const gx = p.x - e.x
            const gy = p.y - e.y
            const g = Math.sqrt(gx * gx + gy * gy)
            if (g > 0.0001 && g <= raio) {
              /*
               * O gradiente ENVIESA o sorteio; não o substitui.
               *
               * Apontar direto para o jogador produzia perseguição em linha
               * reta — que é o que o H viu e reclamou, e também é biologia
               * errada: a bactéria não sabe onde você está, ela só cambalhota
               * menos quando a direção estava dando certo. Somar o gradiente ao
               * sorteio e renormalizar dá caminho torto que converge, que é o
               * que quimiotaxia parece de verdade.
               */
              const w = tuning.enemy.chemoBias
              nx += (gx / g) * w
              ny += (gy / g) * w
              const len = Math.sqrt(nx * nx + ny * ny)
              if (len > 0.0001) {
                nx /= len
                ny /= len
              }
            }
          }
          e.dx = nx
          e.dy = ny
          e.tumble = tumbleFor(e.kind)
        }
        tx = e.x + e.dx * 64
        ty = e.y + e.dy * 64
      } else if (spec.hunts === "colony") {
        /*
         * Bactéria NÃO caça leucócito — quem caça é você.
         *
         * Ela vai à borda da colônia mais próxima e engrossa até saturar. O
         * jogo da fase deixa de ser desviar e passa a ser CONTER: o perigo não
         * vem dela ir atrás de você, vem de ela vencer o campo enquanto você
         * corre atrás dela. Encostar ainda machuca se você estiver devagar —
         * a regra de contato não muda —, mas agora é você quem escolhe o
         * encontro.
         *
         * Sem fronteira (campo limpo, ou tudo no talo) ela fica onde está:
         * parar é o comportamento certo de quem já saturou o que tinha.
         */
        const target = frontierTile(s.field, FIELD, e.x, e.y, MAXINF)
        if (target < 0) {
          tx = e.x
          ty = e.y
        } else {
          tx = tileCenterX(FIELD, target)
          ty = tileCenterY(FIELD, target)
        }
      }
      const ex = tx - e.x
      const ey = ty - e.y
      const dist = Math.sqrt(ex * ex + ey * ey)
      if (dist > 0.0001) {
        let speed = spec.speed
        if (st.interferonRadius > 0) {
          const px2 = p.x - e.x
          const py2 = p.y - e.y
          if (Math.sqrt(px2 * px2 + py2 * py2) <= st.interferonRadius) speed *= st.interferonSlow
        }
        const eh = sizeOf(e) / 2
        e.x = clamp(e.x + (ex / dist) * speed * clock, eh, width - eh)
        e.y = clamp(e.y + (ey / dist) * speed * clock, eh, height - eh)
        // Bateu na parede: cambalhota na hora. Sem isto ela fica raspando a
        // borda até o relógio virar, e raspar borda não lê como nadar.
        if (e.x <= eh || e.x >= width - eh || e.y <= eh || e.y >= height - eh) {
          e.tumble = 0
        }
      }

    }

    /*
     * O intervalo de spawn escala com a INFECÇÃO, não com o relógio da onda.
     * Campo limpo não produz patógeno nenhum; campo tomado produz sem parar.
     */
    /*
     * Cápsula INSTANTÂNEA no relógio do mundo.
     *
     * A ajuda chega porque o tempo passou, não porque você farmou — foi o
     * sorteio por abate que criou o laço que premiava ficar parado (02/08).
     */
    const cada = tuning.drops.instantEverySeconds
    if (cada > 0) {
      // Mesmo piso da doença: a ajuda não pode congelar junto com o mundo,
      // senão ela some justamente quando você está parado apanhando.
      s.instantAcc += Math.max(tuning.field.idleProgress, s.worldScale) * dt
      if (s.instantAcc >= cada) {
        s.instantAcc -= cada
        if (s.drops.length < tuning.drops.maxOnField) {
          const quais = [...INSTANT]
          const qual = quais[rng.nextInt(0, quais.length)]
          if (qual !== undefined) {
            s.drops.push({
              id: nextId++,
              power: qual,
              x: rng.nextInt(24, width - 24),
              y: rng.nextInt(24, height - 24),
              life: tuning.drops.lifeTicks,
            })
          }
        }
      }
    }

    s.spawnTimer -= world
    if (s.spawnTimer <= 0) {
      spawnFromTissue()
      const frac = Math.min(1, s.infection / (FIELD.cols * FIELD.rows * MAXINF))
      const base = spawnIntervalFor(tuning, s.wave)
      s.spawnTimer += base + (tuning.field.spawnCalmSeconds - base) * (1 - Math.min(1, frac * 4))
    }

    // --- cápsulas: atraídas de perto, coletadas por contato
    for (const d of s.drops) {
      const gx = p.x - d.x
      const gy = p.y - d.y
      const gd = Math.sqrt(gx * gx + gy * gy)
      if (gd < tuning.drops.magnetRadius && gd > 0.5) {
        d.x += (gx / gd) * tuning.drops.magnetSpeed * dt
        d.y += (gy / gd) * tuning.drops.magnetSpeed * dt
      }
    }
    const keptDrops = []
    for (const d of s.drops) {
      const gx = p.x - d.x
      const gy = p.y - d.y
      if (Math.sqrt(gx * gx + gy * gy) <= half + 8) {
        // Carimba ANTES de conceder: o `grant` do COMPLEMENTO varre inimigos, e
        // o render precisa do ponto para desenhar de onde a varredura partiu.
        s.lastPickTick = s.tick
        s.lastPickPower = d.power
        s.lastPickX = d.x
        s.lastPickY = d.y
        grant(d.power)
      } else keptDrops.push(d)
    }
    s.drops = keptDrops

    const spawned: Array<{ kind: string; x: number; y: number }> = []

    const killed = (e: Enemy): void => {
      /*
       * FAGOCITOSE LIMPA. O glóbulo branco não só mata: ele remove.
       *
       * Sem isto o verbo único do jogo jogava contra o jogador — abate gera
       * filha, filha envenena, e matar acelerava a doença. Com a limpeza, usar
       * o verbo passa a ser o que contém, que é o mínimo que se espera dele.
       */
      const limpa = tuning.field.engulfCleans
      if (limpa > 0) {
        const i = tileAt(FIELD, e.x, e.y)
        s.field[i] = Math.max(0, s.field[i]! - limpa)
      }
      s.kills++
      s.waveKills++
      s.combo++
      // Multiplicador por SEQUÊNCIA: 1× até 3 seguidos, depois um degrau a
      // cada 3. É o mesmo escalão que o render já usa para colorir o combo, e
      // reaproveitá-lo garante que o número na tela e a cor contem a mesma
      // história.
      const mult = 1 + Math.floor(s.combo / 3)
      if (mult > s.bestMult) s.bestMult = mult
      s.score += tuning.powers.scorePerKill * mult
      s.comboTicks = tuning.powers.comboWindowTicks
      if (s.combo > s.comboBest) s.comboBest = s.combo
      s.lastKillX = e.x
      s.lastKillY = e.y
      s.lastKillTick = s.tick

      const spec = kindOf(e.kind)
      for (let i = 0; i < spec.splits; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const off = tuning.enemy.splitOffset * side
        const vlen = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1
        spawned.push({
          kind: KIND_SHARD,
          x: e.x - (p.vy / vlen) * off,
          y: e.y + (p.vx / vlen) * off,
        })
      }
      if (st.cloudTicks > 0) s.clouds.push({ id: nextId++, x: e.x, y: e.y, life: st.cloudTicks })
      if (st.shockEvery > 0) {
        s.killsSincePulse++
        if (s.killsSincePulse >= st.shockEvery) {
          s.killsSincePulse = 0
          s.shocks.push({
            id: nextId++,
            x: p.x,
            y: p.y,
            radius: st.shockRadius,
            life: tuning.powers.shockLifeTicks,
          })
        }
      }
      /*
       * SORTEIO POR ABATE, morto em 02/08 (`drops.chance` = 0).
       *
       * O F9 do H mostrou o laço: ele ficou parado de propósito, a fissão
       * multiplicou os bacilos, e quando voltou a atacar emendou 475 abates
       * numa fase só — que viraram enxurrada de poder. O sistema PREMIAVA
       * ficar parado, que é o oposto do jogo. A escolha agora mora no card.
       *
       * O código fica porque `chance` é número de tuning e pode voltar por
       * fase, se alguma doença quiser largar cápsula como identidade.
       */
      if (s.drops.length < tuning.drops.maxOnField && rng.nextFloat() < tuning.drops.chance) {
        s.drops.push({
          id: nextId++,
          power: rng.nextInt(0, POWERS.length),
          x: e.x,
          y: e.y,
          life: tuning.drops.lifeTicks,
        })
      }
    }

    /*
     * --- O TECIDO
     *
     * Três relógios diferentes de propósito, e a briga entre eles é o jogo:
     * a fonte e o alastramento andam em tempo de MUNDO, a cura anda em tempo
     * REAL e cai com a sua velocidade. Correr até o outro lado apaga um foco e
     * acende três atrás; ficar parado limpa fundo e não cobre chão nenhum.
     */
    /*
     * A doença tem RELÓGIO PRÓPRIO, com piso.
     *
     * Antes ela andava só em tempo de mundo, e parado o mundo corre a 5% — então
     * ficar parado era quase de graça, e o humano apontou: "precisa me punir
     * quando fico parado, e também quando fico só me movimentando". Doença
     * progride quer você se mexa ou não; é o patógeno que anda no seu relógio,
     * não a infecção. Com piso, nenhum dos dois extremos é jogável e o ótimo
     * passa a ser oscilar.
     */
    /*
     * O quanto a doença envenena o tecido é número DELA, não do jogo.
     *
     * Isto é "a bactéria come a célula", e sai daqui inteiro: as hemácias são
     * corpos de RENDER e já necrosam seguindo a infecção do tile, então
     * envenenar desenha a célula morrendo sem a sim conhecer célula nenhuma.
     * E é a versão biologicamente correta — E. coli é extracelular, adere e
     * envenena por toxina; quem invade a célula e a converte em fábrica é
     * VÍRUS, e isso fica guardado para a fase de um.
     *
     * Com UMA doença por fase, isto é number de fase e não de bicho — a
     * primeira economia que o formato de fases pagou sozinho.
     */
    const escala = degrau()?.fonte ?? 1 + (s.wave - 1) * tuning.field.sourcePerWave
    const passo = Math.max(tuning.field.idleProgress, s.worldScale) * dt
    /*
     * Cada corpo envenena na taxa DELE, e não na da fase.
     *
     * Era global até 02/08, e isso quebrava o jogo: matar uma mãe produzia
     * duas filhas que passavam a envenenar na taxa cheia da mãe, então ABATER
     * ACELERAVA a doença. O F9 do H mostrou o resultado — 229 abates em 43,8s,
     * três vidas intactas, e o tecido caiu mesmo assim.
     */
    for (const e of s.enemies) {
      e.poisonAcc += kindOf(e.kind).poison * escala * passo
      if (e.poisonAcc >= 1) {
        const n = Math.floor(e.poisonAcc)
        e.poisonAcc -= n
        infectAt(s.field, tileAt(FIELD, e.x, e.y), n, MAXINF)
      }
    }

    // O mesmo piso da fonte. Sem ele o ALASTRAMENTO congelava com o jogador
    // parado, e ficar parado continuava sendo refúgio mesmo com a fonte no piso
    // — é o alastramento que toma terreno, não a fonte.
    s.spreadTimer += passo * phaseSpec().tissueSpread
    if (phaseSpec().tissueSpread > 0 && s.spreadTimer >= tuning.field.spreadSeconds) {
      s.spreadTimer -= tuning.field.spreadSeconds
      spreadStep(
        s.field,
        scratch,
        FIELD,
        tuning.field.spreadThreshold,
        tuning.field.spreadAmount,
        MAXINF,
      )
    }

    /*
     * CICATRIZAÇÃO, com relógio PRÓPRIO — e este erro merece ficar escrito.
     *
     * A primeira versão pendurou a necrose no passo de alastramento, por ser a
     * mesma constante. Mas o alastramento é travado por `tissueSpread`, e a
     * fase 1 — E. coli — tem `tissueSpread: 0.0` de propósito: a E. coli
     * ENGROSSA o que já tomou em vez de avançar. Ou seja, eu desliguei a
     * cicatriz exatamente na fase cuja doença mais cicatriza, e a medição
     * saiu com 0% em todas as seeds e em todas as políticas.
     *
     * Que tenha saído ZERO redondo é sorte: um número plausível teria virado
     * balanceamento. A cadência continua sendo `spreadSeconds`, que é o que
     * mantém o número ancorado; o que sai é a trava que não era dela.
     */
    s.necroseTimer += passo
    if (s.necroseTimer >= tuning.field.spreadSeconds) {
      s.necroseTimer -= tuning.field.spreadSeconds
      necroseStep(s.field, s.necrose, tuning.field.necroseAmount, MAXINF)
    }

    /*
     * FISSÃO BINÁRIA — a colônia DOBRA sozinha, no relógio do mundo.
     *
     * Não confundir com o `splits` da espécie, que divide quando ela MORRE.
     * São opostos de propósito e não brigam: `splits` pune abate apressado,
     * esta pune DEMORA. É esta que dá meta à fase — "atrasar é catastrófico" —
     * e é ela que o jogador lê sem texto: você vê dois focos onde havia um.
     *
     * A E. coli real dobra em ~20 minutos. Comprimir isso é ESCALA, e a regra
     * de fidelidade de 02/08 permite; o que ela proíbe é o jogo AFIRMAR um
     * número que não é verdade.
     */
    // A curva aperta o relógio da colônia, e é a alavanca principal dela: das
    // cinco, é a única que muda o quanto a onda PIORA enquanto você decide.
    const fission = phaseSpec().fissionSeconds * (degrau()?.fissao ?? 1)
    /*
     * A PAUSA do COMPLEMENTO, e ela come o passo ANTES do acumulador.
     *
     * Descontar do relógio em vez de zerar todo tick é o que faz a pausa ter
     * fim previsível: o jogador vê o item, sabe que comprou uma janela, e a
     * janela fecha sozinha. Zerar `fissionAcc` a cada tick daria o mesmo efeito
     * e nenhuma forma — seria uma pausa sem borda.
     */
    if (s.fissionStun > 0) s.fissionStun = Math.max(0, s.fissionStun - passo)
    if (fission > 0 && s.fissionStun <= 0) {
      s.fissionAcc += passo
      if (s.fissionAcc >= fission) {
        s.fissionAcc -= fission
        /*
         * A BACTÉRIA se divide — uma vira duas, ali, na sua frente.
         *
         * Até 02/08 isto dobrava FOCOS DE CAMPO, o que é abstrato: a infecção
         * aparecia em outro lugar e ninguém ligava uma coisa à outra. Dividir o
         * corpo é o que o desenho sempre pediu — "você VÊ o foco dobrar" — e é
         * o que faz o efeito dominó ser legível: duas viram quatro, quatro
         * viram oito, e cada uma continua envenenando por onde passa.
         *
         * Só divide quem é da doença da fase. Filha não divide: senão a
         * progressão é exponencial em cima de exponencial e nenhuma fase é
         * jogável.
         */
        const mães = s.enemies.filter((e) => e.kind === phaseSpec().disease)
        // Logístico, não exponencial: acima do teto o meio está esgotado.
        const teto = Math.round(phaseSpec().fissionCap * (degrau()?.teto ?? 1))
        if (mães.length >= teto) {
          s.fissionAcc = 0
        } else
        for (const m of mães) {
          if (s.enemies.length >= tuning.enemy.maxAlive) break
          const u = randomUnit()
          const off = tuning.enemy.splitOffset
          pushEnemy(m.kind, m.x + u.dx * off, m.y + u.dy * off)
        }
      }
    }

    /*
     * Os FOCOS plantados curam em tempo REAL, onde foram deixados.
     *
     * Independentes da sua velocidade e da sua posição — é exatamente isso que
     * os torna a resposta ao ponto fixo. Plantar em tecido tomado rende;
     * plantar em chão limpo é desperdício, e é aí que mora a decisão.
     */
    if (s.pulses.length > 0) {
      s.pulseAcc += tuning.dash.auraFocusHeal * s.pulses.length * dt
      if (s.pulseAcc >= 1) {
        const n = Math.floor(s.pulseAcc)
        s.pulseAcc -= n
        for (const pu of s.pulses) {
          healAround(s.field, FIELD, pu.x, pu.y, tuning.dash.auraFocusRadius, n)
          /*
           * O foco é PRESENÇA PLANTADA, então vale a mesma regra: ele morde a
           * cicatriz na mesma fração. É isto — e não o número dele — que
           * responde ao "foco irrelevante" medido em 02/08: com necrose,
           * plantar é a única forma de trabalhar num lugar onde você não está,
           * e o teto de 2 vira triagem. O `auraFocusHeal` continua 9.0 de
           * propósito: o H disse que traria a ideia dele para esse número, e
           * afinar antes de ouvi-lo seria decidir no lugar dele.
           */
          healNecroseAround(
            s.necrose,
            FIELD,
            pu.x,
            pu.y,
            tuning.dash.auraFocusRadius,
            Math.floor(n * tuning.field.necroseHealFraction),
          )
        }
        applyNecroseFloor(s.field, s.necrose)
        s.infection = totalInfection(s.field)
      }
      const vivos: Pulse[] = []
      for (const pu of s.pulses) {
        pu.life--
        if (pu.life > 0) vivos.push(pu)
      }
      s.pulses = vivos
    }

    /*
     * LIMPAR O LIMO, e com a dilatação desligada isso acontece ANDANDO.
     *
     * A penalidade de velocidade existe para o mundo em que parar COMPRA tempo
     * lento: lá, curar rápido seria ganhar os dois lados da troca. Com o relógio
     * em tempo real não há troca nenhuma, e cobrar imobilidade vira preço sem
     * contrapartida — o H foi direto ao ponto: combater a manifestação no tick
     * normal, sem precisar ficar parado.
     *
     * O valor sem penalidade é o `healRate` cru, e isso é escolha de âncora, não
     * preguiça: é literalmente o trabalho que a célula parada já fazia, agora
     * feito em movimento. Número novo aqui seria chute com cara de decisão, que
     * é o defeito que o `tuning.anchors.json` existe para travar.
     *
     * O gesto vira o verbo do jogo em vez de contrariá-lo: mover É atacar, e
     * agora atacar alcança o tecido, não só o corpo em cima dele.
     */
    const healRate = tuning.time.dilation
      ? tuning.field.healRate * Math.max(0, 1 - p.speed * tuning.field.healSpeedPenalty)
      : tuning.field.healRate
    s.healAcc += healRate * dt
    if (s.healAcc >= 1) {
      const n = Math.floor(s.healAcc)
      s.healAcc -= n
      healAround(s.field, FIELD, p.x, p.y, tuning.field.healRadius, n)
      // A CICATRIZ cede ao mesmo gesto, mais devagar. É o único trabalho do
      // jogo que a velocidade não faz — e por isso é o que faz parar ter razão
      // de existir, que a medição de 05/08 mostrou que não tinha.
      healNecroseAround(
        s.necrose,
        FIELD,
        p.x,
        p.y,
        tuning.field.healRadius,
        Math.floor(n * tuning.field.necroseHealFraction),
      )
    }

    /*
     * O PISO, aplicado depois de TUDO que cura neste tick — fagocitose, foco,
     * aura, plaqueta, cura do jogador. Num lugar só de propósito: espalhar a
     * regra pelos cinco pontos que curam é exatamente como um deles ficaria de
     * fora, e o defeito apareceria como "a cicatriz às vezes some".
     */
    applyNecroseFloor(s.field, s.necrose)
    s.infection = totalInfection(s.field)
    s.necrosed = totalNecrose(s.necrose)

    // --- resolução: fagocitose por velocidade
    let hit = false
    /*
     * Abate POR CONTATO neste tick — o seu gesto, não o de um poder passivo.
     * É o que derruba os i-frames, mais abaixo. Acumulado durante o laço e
     * aplicado depois dele de propósito: se derrubasse no meio, o patógeno
     * seguinte da lista poderia acertar você no mesmo tick, e a ordem do array
     * viraria regra de jogo.
     */
    let contactKill = false
    const survivors: Enemy[] = []
    for (const e of s.enemies) {
      const eh = sizeOf(e) / 2
      const ex = e.x - p.x
      const ey = e.y - p.y
      const dist = Math.sqrt(ex * ex + ey * ey)
      const newborn = s.tick - e.bornTick < tuning.enemy.spawnGraceTicks

      let eaten = false
      for (const o of s.orbiters) {
        const gx = p.x + o.ox * tuning.powers.orbitRadius - e.x
        const gy = p.y + o.oy * tuning.powers.orbitRadius - e.y
        if (Math.sqrt(gx * gx + gy * gy) <= tuning.powers.orbitKillRadius + eh) {
          eaten = true
          break
        }
      }
      if (!eaten) {
        for (const m of s.macrophages) {
          const gx = m.x - e.x
          const gy = m.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= tuning.powers.macrophageRadius + eh) {
            eaten = true
            break
          }
        }
      }
      if (!eaten) {
        for (const tr of s.trails) {
          const gx = tr.x - e.x
          const gy = tr.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= st.trailRadius + eh) {
            eaten = true
            break
          }
        }
      }
      if (!eaten) {
        for (const cl of s.clouds) {
          const gx = cl.x - e.x
          const gy = cl.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= tuning.powers.cloudRadius + eh) {
            eaten = true
            break
          }
        }
      }

      /*
       * O contato. Rápido o bastante, você engole; devagar, você apanha.
       * A velocidade exigida é por patógeno: influenza cede a 28% da sua
       * velocidade máxima, S. aureus só a 70%, SARS-CoV-2 quase no talo.
       */
      if (!eaten && dist <= half + eh) {
        if (st.enzyme || p.speed >= kindOf(e.kind).engulfSpeed) {
          eaten = true
          contactKill = true
        } else if (!newborn && !p.invulnerable && s.auraTicks === 0 && !hit) {
          /*
           * A AURA protege, e SÓ pelo prazo dela.
           *
           * É estado com fim, não condição — o limbo de 31/07 nasceu de uma
           * proteção sem prazo, e a lição foi que invulnerabilidade sem relógio
           * vira refúgio. Aqui a janela é curta e paga recarga.
           */
          hit = true
          continue
        }
      }

      if (eaten) {
        e.hp--
        if (e.hp <= 0) {
          killed(e)
          continue
        }
        survivors.push(e)
        continue
      }

      survivors.push(e)
    }
    s.enemies = survivors
    for (const sp2 of spawned) pushEnemy(sp2.kind, sp2.x, sp2.y)

    // --- pulso mata no tick em que nasce
    const fresh = s.shocks.filter((sh) => sh.life === tuning.powers.shockLifeTicks)
    if (fresh.length > 0) {
      const left: Enemy[] = []
      for (const e of s.enemies) {
        let popped = false
        for (const sh of fresh) {
          const gx = sh.x - e.x
          const gy = sh.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= sh.radius) {
            popped = true
            break
          }
        }
        if (popped) {
          e.hp--
          if (e.hp <= 0) {
            killed(e)
            continue
          }
        }
        left.push(e)
      }
      s.enemies = left
    }

    if (hit) {
      p.invulnerable = true
      s.frozen = tuning.run.hitFreezeTicks
      // Apanhar te FREIA: o custo do erro é perder o relógio junto com a vida.
      p.vx *= 0.15
      p.vy *= 0.15
      p.speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) / tuning.player.maxSpeed
      if (s.shields > 0) {
        s.shields--
      } else {
        s.lives--
        if (s.lives <= 0) {
          endRun(false)
          return
        }
      }
    } else if (p.invulnerable && contactKill) {
      /*
       * Os i-frames caem no primeiro patógeno que você engole. Regra sem número,
       * como as outras duas que o humano aprovou.
       *
       * A regra anterior era "cai ao atingir 85% da velocidade", e tinha um
       * buraco: como nada limitava o tempo, dava para tomar um toque, ficar logo
       * abaixo de 0.85 e comer cinco dos seis patógenos com risco zero e sem
       * prazo — a fagocitose só olha `engulfSpeed`, e cinco deles cedem abaixo
       * de 0.85. Medido com o bot `exploradora` em 01/08: o buraco existia mas
       * quase não era alcançável na prática. Fechado mesmo assim, porque
       * invulnerabilidade sem fim é regra torta esperando um jogador melhor.
       *
       * Só abate por CONTATO conta. Nuvem, órbita e macrófago são o abate
       * passivo, que já tem teto próprio declarado em 31/07.
       */
      p.invulnerable = false
    }

    if (s.infection >= LOSE) {
      endRun(true)
      return
    }

    /*
     * A fase acaba CONTIDA, não esterilizada: infecção abaixo do limiar E nenhum
     * patógeno vivo. Exigir zero absoluto transformava o fim de fase numa
     * varredura de 576 tiles atrás dos últimos sujos — a sonda mediu 10 minutos
     * por fase. Conter e depois caçar os últimos é o fim divertido; varrer não é.
     */
    if (s.infection <= WIN && s.enemies.length === 0) {
      /*
       * Última onda da doença FECHA a fase; as outras caem no RESPIRO.
       *
       * A distinção nasceu de uma chamada do H em 02/08 — "quando finalizo a
       * última onda não deveria selecionar powerup, a fase foi concluída" — e
       * sobreviveu à morte da recompensa em 13/08 com o mesmo desenho e outro
       * motivo: o que a onda contida entrega agora é a onda seguinte, e na
       * última não há onda seguinte para entregar.
       */
      if (s.round >= phaseSpec().waves) {
        /*
         * A ÚLTIMA onda fecha a DOENÇA — e hoje, com uma doença só, fecha a run.
         *
         * Fim de verdade, não teto: `TASTE.md` §1 recusa número que satura, e o
         * que satura aqui é a LISTA de doenças, não a dificuldade. Quando a
         * segunda doença voltar, este ramo volta a avançar `phaseIndex` e o
         * fechamento vira o que já era em 02/08 — o balanço de uma fase.
         */
        s.phase = "closed"
        s.cardLock = tuning.cardLockTicks
        return
      }
      s.wave++
      s.round++
      startInterval()
    }
  }

  const stepDead = (bits: number): void => {
    if (s.deadLock > 0) {
      s.deadLock--
      return
    }
    if ((bits & ~s.prevBits & BIT_RESTART) !== 0) {
      s.runIndex++
      startRun()
    }
  }

  /**
   * O card fica parado até alguém dispensar.
   *
   * A trava é a lição de 31/07 outra vez: sem ela, a tecla que o jogador já
   * estava segurando quando a fase virou dispensaria o card no mesmo quadro, e
   * ninguém leria nome nenhum. Vale ainda mais aqui do que na morte, porque a
   * transição de fase chega no meio do gesto.
   */
  const stepCard = (bits: number): void => {
    if (s.cardLock > 0) {
      s.cardLock--
      return
    }
    if (((bits & ~s.prevBits) & (BIT_ACTION | BIT_RESTART)) !== 0) s.phase = "run"
  }

  /**
   * O FECHAMENTO: a doença inteira contida. Hoje é o fim da run pelo lado bom.
   *
   * Confirmar recomeça, e não avança nada — com uma doença na lista não há
   * próxima. O `runIndex` sobe porque isto É uma run nova, e o gate conta por
   * ele; contar como continuação faria a vitória sumir do registro.
   */
  const stepClosed = (bits: number): void => {
    if (s.cardLock > 0) {
      s.cardLock--
      return
    }
    if (((bits & ~s.prevBits) & (BIT_ACTION | BIT_RESTART)) !== 0) {
      s.runIndex++
      startRun()
    }
  }

  /**
   * O RESPIRO entre ondas: 3 segundos reais, e nada para apertar.
   *
   * A onda já está montada atrás da contagem — focos semeados, corpos em cena, o
   * relógio da colônia parado. É a única janela do jogo em que dá para OLHAR o
   * tabuleiro sem que ele piore, e é para isso que ela existe. Sem ela, conter
   * uma onda e cair na seguinte no mesmo quadro fazia as duas virarem uma só.
   *
   * Nenhuma tecla adianta a contagem, de propósito: se pular fosse possível,
   * pular viraria o certo a fazer, e o respiro só teria custo para quem parou
   * para ler. Não é trava contra reflexo (isso é o `cardLock`) — é a garantia de
   * que os 3 segundos são de graça.
   */
  const stepIntervalo = (): void => {
    s.countdown--
    if (s.countdown > 0) return
    s.countdown = 0
    s.phase = "run"
    /*
     * A CARÊNCIA de nascimento é renovada aqui, e este é um defeito que eu
     * mesmo criei ao montar a onda antes da contagem.
     *
     * `spawnGraceTicks` existe para que um corpo recém-aparecido não acerte
     * você antes de dar para reagir. Ela conta em `s.tick`, e `s.tick` corre
     * durante os 3 segundos — então a carência queimava inteira com o jogador
     * congelado, e um corpo semeado em cima dele acertava no primeiro quadro em
     * que o controle voltava. Zero aviso e zero reação: exatamente o que a regra
     * existe para impedir. Renovar aqui devolve a carência ao instante em que o
     * jogo de fato começa, que é o que ela sempre quis dizer.
     */
    for (const e of s.enemies) e.bornTick = s.tick
  }

  const step = (input: InputFrame): void => {
    const bits = bitsOf(input)
    if (s.phase === "run") stepRun(bits)
    else if (s.phase === "card") stepCard(bits)
    else if (s.phase === "intervalo") stepIntervalo()
    else if (s.phase === "closed") stepClosed(bits)
    else stepDead(bits)
    s.prevBits = bits
    s.rngState = rng.state()
    s.tick++
  }

  const snapshot = (): SimSnapshot => {
    packer
      .reset()
      .u32(s.tick)
      .u8(
        s.phase === "run"
          ? 0
          : s.phase === "card"
            ? 1
            : s.phase === "intervalo"
              ? 3
              : s.phase === "closed"
                ? 4
                : 2,
      )
      .u32(s.runIndex)
      .u32(s.wave)
      .u32(s.waveKills)
      .u32(s.quota)
      .u32(s.lives < 0 ? 0 : s.lives)
      .u32(s.shields)
      .u32(s.kills).u32(s.score).u32(s.bestMult)
      .u32(s.bestKills)
      .u32(s.bestWave)
      .f64(s.player.x)
      .f64(s.player.y)
      .f64(s.player.vx)
      .f64(s.player.vy)
      .u32(s.player.dashTicks)
      .u32(s.player.dashCooldown)
      .bool(s.player.invulnerable)
      .f64(s.spawnTimer)
      .f64(s.worldScale)
      .u32(s.frozen)
      .u32(s.deadLock)
      .u32(s.cardLock).u32(s.countdown).f64(s.fissionStun).u32(s.auraTicks).f64(s.instantAcc).u32(s.pick).u32(s.phaseIndex).u32(s.round)
      .f64(s.fissionAcc)
      .u32(s.infection)
      .u32(s.necrosed)
      .f64(s.spreadTimer)
      .f64(s.necroseTimer)
      .f64(s.infectAcc)
      .f64(s.healAcc)
      .bool(s.lostByTissue)
      .u32(s.combo)
      .u32(s.comboTicks)
      .u32(s.enemies.length)

      .u32(s.drops.length)
      .u32(s.trails.length)
      .u32(s.shocks.length)
      .u32(s.clouds.length)
      .u32(s.orbiters.length)
      .u32(s.macrophages.length)
      .u32(s.killsSincePulse)
      .u8(s.prevBits)
      .u32(s.rngState)
    for (const e of s.enemies) {
      packer.u32(e.id).f64(e.x).f64(e.y).u32(e.hp).u32(e.bornTick).f64(e.dx).f64(e.dy).f64(e.tumble).f64(e.poisonAcc)
      for (let i = 0; i < e.kind.length; i++) packer.u8(e.kind.charCodeAt(i))
    }
    for (let i = 0; i < s.field.length; i++) packer.u8(s.field[i]!)
    for (let i = 0; i < s.necrose.length; i++) packer.u8(s.necrose[i]!)
    for (const d of s.drops) packer.u32(d.id).u32(d.power).f64(d.x).f64(d.y).u32(d.life)
    for (const n of s.active) packer.u32(n)
    for (const n of s.owned) packer.u32(n)
    for (const n of s.buildOrder) packer.u32(n)
    for (const n of s.offer) packer.u32(n)
    for (const tr of s.trails) packer.f64(tr.x).f64(tr.y).u32(tr.life)
    for (const sh of s.shocks) packer.f64(sh.x).f64(sh.y).u32(sh.life)
    for (const cl of s.clouds) packer.f64(cl.x).f64(cl.y).u32(cl.life)
    for (const pu of s.pulses) packer.f64(pu.x).f64(pu.y).u32(pu.life)
    for (const o of s.orbiters) packer.f64(o.ox).f64(o.oy)
    for (const m of s.macrophages) packer.f64(m.x).f64(m.y)

    return { tick: s.tick, hash: packer.digest() }
  }

  /*
   * O boot abre no CARD, e isso é do `startRun` — não do `startWave`.
   *
   * Desde 13/08 montar a onda e escolher a tela são coisas separadas, e o boot
   * precisa das duas. Chamar só `startWave` deixava a run começar em `run`, com
   * a apresentação da doença nunca aparecendo: um estado inicial errado que
   * nenhum teste de regra pegaria, porque todos eles dispensam o card antes de
   * medir qualquer coisa.
   */
  startWave()
  s.phase = "card"
  s.cardLock = tuning.cardLockTicks

  return {
    step,
    snapshot,
    serialize: () => structuredClone(s),
    state: () => s,
  }
}
