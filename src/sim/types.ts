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
  readonly time: { readonly creep: number }
  readonly player: { readonly size: number }
  readonly dash: {
    readonly durationTicks: number
    readonly recoveryTicks: number
    readonly speed: number
    readonly killRadius: number
  }
  readonly run: { readonly lives: number }
  readonly enemy: {
    readonly size: number
    readonly speed: number
    readonly spawnIntervalSeconds: number
    readonly spawnRampPerKill: number
    readonly minSpawnIntervalSeconds: number
    readonly maxAlive: number
  }
  readonly pick: { readonly offerCount: number }
  readonly harness: { readonly recordSeconds: number }
}

/** `run` = jogando. `pick` = morreu, escolhendo o modificador da próxima run. */
export type Phase = "run" | "pick"

export interface Enemy {
  x: number
  y: number
  /** Tick em que nasceu — só para o render escalonar a entrada. Entra no hash. */
  bornTick: number
}

export interface Player {
  x: number
  y: number
  /** Ticks restantes do dash atual. `0` = parado, e o mundo anda a creep. */
  dashTicks: number
  /** Ticks até poder dashar de novo. É a pausa que devolve o creep ao jogo. */
  recoverTicks: number
  dashDx: number
  dashDy: number
  /** Desde o impacto até o FIM do próximo dash — regra sem número, por decisão. */
  invulnerable: boolean
}

export interface SimState {
  tick: number
  phase: Phase
  /** Quantas runs já terminaram. O gate é sobre este número passar de 1. */
  runIndex: number
  lives: number
  kills: number
  bestKills: number
  player: Player
  enemies: Enemy[]
  spawnTimer: number
  /** Escala do tempo de mundo aplicada neste tick: 1 dashando, creep parado. */
  worldScale: number
  /** Quantos de cada modificador o jogador acumulou. Índice = id. */
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
