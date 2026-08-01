/**
 * Contratos da sim. Este arquivo — e tudo em `src/sim/` — não importa nada de
 * `pixi.js`, do DOM ou de `node:*`. A sim roda headless, sob teste, sem canvas.
 */

/** Estado dos controles em um tick. Um por passo de sim, sempre. */
export interface InputFrame {
  readonly up: boolean
  readonly down: boolean
  readonly left: boolean
  readonly right: boolean
  /** Confirma escolha de modificador. */
  readonly action: boolean
  /**
   * Recomeça depois de morrer. Tecla PRÓPRIA de propósito: com `action` aqui, o
   * reinício virava reflexo de quem passou a run inteira confirmando escolha —
   * e o gate do projeto mede intenção, não reflexo.
   */
  readonly restart: boolean
}

export interface SimSnapshot {
  readonly tick: number
  readonly hash: string
}

export interface Tuning {
  readonly sim: { readonly hz: number }
  readonly arena: { readonly width: number; readonly height: number }
  readonly time: { readonly creep: number; readonly creepPerWave: number }
  readonly player: { readonly size: number }
  readonly dash: {
    readonly durationTicks: number
    readonly recoveryTicks: number
    readonly recoveryPerWave: number
    readonly minRecoveryTicks: number
    readonly speed: number
    readonly killRadius: number
    /**
     * Cosseno mínimo entre a direção do dash e a do inimigo para o corte valer.
     * `0.15` ≈ meia-volta pra frente. **`-1` devolve a aura omnidirecional** —
     * é o botão de veto desta regra, e custa só este número.
     */
    readonly killArc: number
  }
  readonly wave: { readonly baseQuota: number; readonly quotaGrowth: number }
  readonly run: { readonly lives: number }
  readonly enemy: {
    readonly size: number
    readonly spawnIntervalSeconds: number
    readonly spawnPerWave: number
    /** Inimigos já em campo quando a onda abre — tabuleiro vazio vira espera. */
    readonly openingBase: number
    readonly openingPerWave: number
    readonly maxAlive: number
    /** Distância perpendicular em que os estilhaços nascem. */
    readonly splitOffset: number
    /** Ticks em que um vírus recém-nascido não machuca. */
    readonly spawnGraceTicks: number
    readonly kinds: Readonly<Record<string, KindSpec>>
    /** Composição por onda. A run muda porque a AMEAÇA muda, não a carta. */
    readonly spawnTable: ReadonlyArray<{
      readonly fromWave: number
      readonly weights: Readonly<Record<string, number>>
    }>
  }
  readonly cells: {
    readonly count: number
    readonly fromWave: number
    readonly size: number
    readonly hp: number
  }
  /**
   * Números dos modificadores-comportamento. `orbitCos`/`orbitSin` são a matriz
   * de rotação por tick pré-calculada: a sim não pode chamar `sin`/`cos`, que
   * não são bit-a-bit entre engines.
   */
  readonly powers: {
    readonly trailTicks: number
    readonly trailRadius: number
    readonly shockEvery: number
    readonly shockRadius: number
    readonly shockLifeTicks: number
    readonly backRadius: number
    readonly orbitRadius: number
    readonly orbitCos: number
    readonly orbitSin: number
    readonly orbitKillRadius: number
  }
  readonly pick: { readonly offerCount: number }
  readonly feel: {
    readonly hitFreezeTicks: number
    readonly waveFreezeTicks: number
    /** Ticks de tela de morte que ignoram input. Reflexo não conta como intenção. */
    readonly deadLockTicks: number
  }
  readonly harness: { readonly recordSeconds: number }
}

/**
 * `run` = jogando. `pick` = limpou a onda, escolhendo. `dead` = acabou, esperando
 * uma tecla.
 *
 * `dead` NÃO recomeça sozinho de propósito: o gate do projeto é taxa de segunda
 * partida voluntária, e reinício automático torna essa métrica não-medível.
 */
export type Phase = "run" | "pick" | "dead"

/** O que um vírus persegue. `cell` ignora o jogador e vai atrás do organismo. */
export type Hunts = "player" | "cell"

export interface KindSpec {
  readonly speed: number
  readonly hp: number
  readonly sizeScale: number
  /** Quantos estilhaços nascem quando ele morre. */
  readonly splits: number
  readonly hunts: Hunts
}

export interface Enemy {
  /**
   * Identidade estável. O render pareia quadro a quadro por isto — `bornTick`
   * não serve, porque a abertura da onda nasce vários no mesmo tick e a
   * interpolação acabava misturando inimigos diferentes.
   */
  id: number
  kind: string
  x: number
  y: number
  hp: number
  bornTick: number
}

/** Ponto de rastro largado pelo dash. Corta enquanto vive. */
export interface Trail {
  id: number
  x: number
  y: number
  life: number
}

/** Onda de choque do PULSO. Já matou quando nasceu; o que resta é o anel. */
export interface Shock {
  id: number
  x: number
  y: number
  radius: number
  life: number
}

/** Anticorpo em órbita. Guardado como vetor unitário, girado por matriz fixa. */
export interface Orbiter {
  ox: number
  oy: number
}

/** Célula do organismo. Não se move, não ataca, e perdê-las encerra a run. */
export interface Cell {
  id: number
  x: number
  y: number
  hp: number
}

export interface Player {
  x: number
  y: number
  /** Ticks restantes do dash atual. `0` = parado, e o mundo anda a creep. */
  dashTicks: number
  /** Ticks até poder dashar de novo. É a folga que encolhe a cada onda. */
  recoverTicks: number
  dashDx: number
  dashDy: number
  /** Desde o impacto até o FIM do próximo dash — regra sem número, por decisão. */
  invulnerable: boolean
  /**
   * Levou o toque no meio de um dash: o fim DESTE dash não conta, o do próximo
   * é que conta. Sem isso, apanhar dashando daria i-frames de dois ticks.
   */
  invulnSkipCurrent: boolean
}

export interface SimState {
  tick: number
  phase: Phase
  /** Quantas runs foram INICIADAS além da primeira. É o numerador do gate. */
  runIndex: number
  /** Onda atual, base 1. A folga encolhe em função dela e nunca satura. */
  wave: number
  /** Kills nesta onda, contra a cota. */
  waveKills: number
  quota: number
  lives: number
  kills: number
  bestKills: number
  bestWave: number
  player: Player
  enemies: Enemy[]
  trails: Trail[]
  shocks: Shock[]
  orbiters: Orbiter[]
  /** Dashes ainda encadeáveis antes da recuperação obrigatória. */
  dashCharges: number
  /** Mortes acumuladas desde o último pulso. */
  killsSincePulse: number
  cells: Cell[]
  /** Células perdidas nesta run. Só pra tela de morte dizer como você perdeu. */
  cellsLost: number
  /** `true` quando a run acabou por perder o organismo, não as vidas. */
  lostByCells: boolean
  spawnTimer: number
  /** Ticks de congelamento no impacto. Nada se move; a escala do tempo não muda. */
  frozen: number
  /** Toques que a MEMBRANA absorve nesta onda. */
  shields: number
  /** Ticks restantes de trava da tela de morte. */
  deadLock: number
  /** Escala do tempo de mundo aplicada neste tick: 1 dashando, creep parado. */
  worldScale: number
  /** Quantos de cada modificador o jogador acumulou NESTA run. Índice = id. */
  owned: number[]
  /** Ids oferecidos na tela de escolha. */
  offer: number[]
  cursor: number
  /** Bits do input do tick anterior — de onde saem todas as bordas de subida. */
  prevBits: number
  rngState: number
}

export interface Sim {
  /** Avança exatamente 1/60 de tempo de mundo. */
  step(input: InputFrame): void
  snapshot(): SimSnapshot
  /** Estado completo, para debug. */
  serialize(): unknown
  /** Leitura ao vivo para o render interpolar. Não é parte do hash. */
  state(): Readonly<SimState>
}
