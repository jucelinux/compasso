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
  readonly player: { readonly size: number; readonly speed: number }
  readonly drifter: { readonly size: number; readonly speed: number }
  readonly harness: { readonly recordSeconds: number }
}

export interface Body {
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

/**
 * Cena descartável de validação (HARNESS.md §5): um quadrado que se move e colide
 * com outro quadrado. Apagar quando o jogo de verdade chegar.
 */
export interface SimState {
  tick: number
  player: Body
  drifter: Body
  collisions: number
  overlapping: boolean
  prevAction: boolean
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
