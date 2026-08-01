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
  /** Impulso: habilidade com recarga, não mais o verbo central. */
  readonly action: boolean
  /**
   * Recomeça depois de morrer. Tecla PRÓPRIA de propósito: com `action` aqui, o
   * reinício virava reflexo, e o gate mede intenção.
   */
  readonly restart: boolean
}

export interface SimSnapshot {
  readonly tick: number
  readonly hash: string
}

export type Hunts = "player" | "cell"

export interface KindSpec {
  readonly speed: number
  readonly hp: number
  readonly sizeScale: number
  /** Quantas células-filha nascem quando ele morre (fissão binária). */
  readonly splits: number
  readonly hunts: Hunts
  /** Nome real do patógeno. Só o render usa. */
  readonly real: string
  /** Morfologia real, que decide o desenho. */
  readonly form: string
  /**
   * Fração da velocidade máxima necessária para engolir este patógeno.
   * Abaixo dela, encostar machuca em vez de matar. É o que amarra ataque,
   * relógio e risco no mesmo número.
   */
  readonly engulfSpeed: number
}

export interface Tuning {
  readonly sim: { readonly hz: number }
  readonly arena: { readonly width: number; readonly height: number }
  readonly time: {
    /** Escala do tempo com a célula parada. Nunca zero, por decisão de 31/07. */
    readonly creep: number
    /**
     * Mistura entre reta e curva na conversão velocidade→tempo. `0` = só a
     * curva `t·√t` (começo do gesto barato), `1` = linear puro.
     *
     * Não é expoente livre de propósito: `Math.pow` não é bit-a-bit entre
     * engines, e o rig inteiro depende de Node e browser darem o mesmo hash.
     * `√` é seguro; expoente arbitrário não.
     */
    readonly linearMix: number
  }
  readonly player: {
    readonly size: number
    readonly maxSpeed: number
    readonly accel: number
    readonly drag: number
  }
  readonly dash: {
    readonly durationTicks: number
    readonly cooldownTicks: number
    readonly speedMultiplier: number
  }
  readonly wave: {
    readonly baseQuota: number
    readonly quotaGrowth: number
    /** Termo quadrático: é ele que faz a onda 10 custar visivelmente mais. */
    readonly quotaAccel: number
  }
  readonly run: {
    readonly lives: number
    readonly hitFreezeTicks: number
    readonly deadLockTicks: number
  }
  readonly enemy: {
    readonly size: number
    readonly spawnIntervalSeconds: number
    readonly spawnPerWave: number
    readonly openingBase: number
    readonly openingPerWave: number
    readonly maxAlive: number
    readonly splitOffset: number
    readonly spawnGraceTicks: number
    readonly kinds: Readonly<Record<string, KindSpec>>
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
  readonly drops: {
    readonly chance: number
    readonly lifeTicks: number
    readonly magnetRadius: number
    readonly magnetSpeed: number
    readonly durationTicks: number
    readonly maxOnField: number
  }
  readonly powers: {
    readonly comboWindowTicks: number
    readonly trailTicks: number
    readonly trailRadius: number
    readonly shockEvery: number
    readonly shockRadius: number
    readonly shockLifeTicks: number
    readonly orbitRadius: number
    readonly orbitCos: number
    readonly orbitSin: number
    readonly orbitKillRadius: number
    readonly interferonRadius: number
    readonly interferonSlow: number
    readonly macrophageSpeed: number
    readonly macrophageRadius: number
    readonly cloudTicks: number
    readonly cloudRadius: number
    readonly surgeSpeed: number
    readonly shieldHits: number
  }
  readonly harness: { readonly recordSeconds: number }
}

/** Só duas fases: a tela de escolha morreu junto com o powerup escolhido. */
export type Phase = "run" | "dead"

export interface Enemy {
  id: number
  kind: string
  x: number
  y: number
  hp: number
  bornTick: number
}

export interface Cell {
  id: number
  x: number
  y: number
  hp: number
}

/** Cápsula largada por um patógeno. Encostar liga o poder. */
export interface Drop {
  id: number
  power: number
  x: number
  y: number
  life: number
}

export interface Trail {
  id: number
  x: number
  y: number
  life: number
}

export interface Shock {
  id: number
  x: number
  y: number
  radius: number
  life: number
}

export interface Orbiter {
  ox: number
  oy: number
}

export interface Macrophage {
  id: number
  x: number
  y: number
}

export interface Cloud {
  id: number
  x: number
  y: number
  life: number
}

export interface Player {
  x: number
  y: number
  /** Velocidade contínua. É a arma, o relógio e o risco no mesmo vetor. */
  vx: number
  vy: number
  /** `|v| / maxSpeed`, entre 0 e 1 (passa de 1 durante o impulso). */
  speed: number
  dashTicks: number
  dashCooldown: number
  /** Cai no primeiro patógeno engolido por CONTATO. Sem timer, por decisão de 31/07. */
  invulnerable: boolean
}

export interface SimState {
  tick: number
  phase: Phase
  runIndex: number
  wave: number
  waveKills: number
  quota: number
  lives: number
  shields: number
  kills: number
  bestKills: number
  bestWave: number
  player: Player
  enemies: Enemy[]
  cells: Cell[]
  cellsLost: number
  lostByCells: boolean
  drops: Drop[]
  /** Ticks restantes de cada poder. Índice = id do poder. */
  active: number[]
  trails: Trail[]
  shocks: Shock[]
  orbiters: Orbiter[]
  macrophages: Macrophage[]
  clouds: Cloud[]
  killsSincePulse: number
  spawnTimer: number
  frozen: number
  deadLock: number
  combo: number
  comboTicks: number
  comboBest: number
  lastKillX: number
  lastKillY: number
  lastKillTick: number
  /** Escala do tempo de mundo neste tick. Derivada direto da sua velocidade. */
  worldScale: number
  prevBits: number
  rngState: number
}

export interface Sim {
  /** Avança exatamente 1/60 de tempo de mundo. */
  step(input: InputFrame): void
  snapshot(): SimSnapshot
  serialize(): unknown
  state(): Readonly<SimState>
}
