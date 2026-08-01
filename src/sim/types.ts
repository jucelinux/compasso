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
  readonly action: boolean
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
    readonly speed: number
    readonly spawnIntervalSeconds: number
    readonly spawnPerWave: number
    /** Inimigos já em campo quando a onda abre — tabuleiro vazio vira espera. */
    readonly openingBase: number
    readonly openingPerWave: number
    readonly maxAlive: number
  }
  readonly pick: { readonly offerCount: number }
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

export interface Enemy {
  x: number
  y: number
  /** Tick em que nasceu — o render usa pra casar pares e escalar a entrada. */
  bornTick: number
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
  spawnTimer: number
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
