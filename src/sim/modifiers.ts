import type { Tuning } from "./types.ts"

/**
 * A camada roguelite: limpou a onda, escolhe 1 de 3. Morreu, perde tudo.
 *
 * RECONSTRUÍDA em 31/07. A versão anterior era porcentagem em cima de um verbo
 * só, e o humano estava certo ao dizer que não sentia nada: sete dos dez
 * modificadores mexiam um número abaixo do limiar de percepção — PASSO LONGO
 * dava +33ms de dash, REFLEXO tirava 16ms de recuperação.
 *
 * A regra agora é: **todo modificador ou põe algo novo na tela, ou não entra.**
 * É o critério do bar do Vampire Survivors, escrito no `TASTE.md`.
 */
export interface Modifier {
  readonly id: number
  readonly name: string
  readonly blurb: string
}

export const MODIFIERS: readonly Modifier[] = [
  { id: 0, name: "CITOCINA", blurb: "seu rastro queima quem passa" },
  { id: 1, name: "FEBRE", blurb: "a cada 8 abates, o corpo ferve" },
  { id: 2, name: "MEDULA", blurb: "+1 vida, agora" },
  { id: 3, name: "PSEUDÓPODE", blurb: "engole também pelas costas" },
  { id: 4, name: "FAGOSSOMO", blurb: "boca muito mais larga" },
  { id: 5, name: "ANTICORPO", blurb: "um corpo orbita e corta sozinho" },
  { id: 6, name: "MITOCÔNDRIA", blurb: "dois impulsos antes de repousar" },
  { id: 7, name: "OPSONIZAÇÃO", blurb: "marca um arco maior de alvos" },
  { id: 8, name: "MEMBRANA", blurb: "absorve um toque por onda" },
  { id: 9, name: "PLAQUETA", blurb: "regenera o tecido" },
  { id: 10, name: "INTERFERON", blurb: "o que chega perto emperra" },
  { id: 11, name: "MACRÓFAGO", blurb: "um aliado caça sozinho" },
  { id: 12, name: "HISTAMINA", blurb: "quem morre deixa nuvem que mata" },
]

/** Os únicos que agem num contador em vez de numa regra contínua. */
export const MOD_EXTRA_LIFE = 2
export const MOD_SHIELD = 8
export const MOD_REPAIR = 9

/** Números que os modificadores fixam para a run inteira. */
export interface RunStats {
  dashDurationTicks: number
  dashSpeed: number
  killRadius: number
  lives: number
  creepBase: number
  recoveryBase: number
  spawnBase: number
  killArc: number
  shields: number
  /** Ticks que um ponto de rastro corta depois de largado. `0` = sem rastro. */
  trailTicks: number
  trailRadius: number
  /** Mortes necessárias para soltar um pulso. `0` = sem pulso. */
  shockEvery: number
  shockRadius: number
  /** Raio do corte às costas, ignorando o leque. `0` = sem retaguarda. */
  backRadius: number
  /** Corpos em órbita que cortam sozinhos. */
  orbiters: number
  /** Dashes encadeáveis antes da recuperação. `1` é o normal. */
  dashCharges: number
  /** Raio em que patógenos ficam lentos. `0` = sem interferon. */
  interferonRadius: number
  interferonSlow: number
  /** Aliados que caçam sozinhos. */
  macrophages: number
  /** Ticks da nuvem deixada por quem morre. `0` = sem histamina. */
  cloudTicks: number
}

/** Números que a onda aperta. Nenhum destes tem teto — foi o pedido. */
export interface WaveStats {
  creep: number
  recoveryTicks: number
  spawnIntervalSeconds: number
  quota: number
}

export function applyModifiers(tuning: Tuning, owned: readonly number[]): RunStats {
  const n = (id: number): number => owned[id] ?? 0
  const p = tuning.powers

  return {
    dashDurationTicks: tuning.dash.durationTicks,
    dashSpeed: tuning.dash.speed,
    // Esteira agora vale ser vista: +50% por carta, contra +30% da versão morta.
    killRadius: tuning.dash.killRadius * (1 + 0.5 * n(4)),
    lives: tuning.run.lives + n(MOD_EXTRA_LIFE),
    creepBase: tuning.time.creep,
    recoveryBase: tuning.dash.recoveryTicks,
    spawnBase: tuning.enemy.spawnIntervalSeconds,
    // Nunca abaixo de -0.9: aí o leque viraria a aura que a decisão de 31/07 tirou.
    killArc: Math.max(-0.9, tuning.dash.killArc - 0.45 * n(7)),
    shields: n(MOD_SHIELD),
    trailTicks: n(0) > 0 ? p.trailTicks * n(0) : 0,
    trailRadius: p.trailRadius,
    shockEvery: n(1) > 0 ? Math.max(2, p.shockEvery - (n(1) - 1) * 2) : 0,
    shockRadius: p.shockRadius * (1 + 0.35 * (n(1) - 1)),
    backRadius: n(3) > 0 ? p.backRadius * n(3) : 0,
    orbiters: n(5),
    dashCharges: 1 + n(6),
    interferonRadius: n(10) > 0 ? p.interferonRadius * (1 + 0.3 * (n(10) - 1)) : 0,
    interferonSlow: Math.max(0.1, p.interferonSlow - 0.12 * (n(10) - 1)),
    macrophages: n(11),
    cloudTicks: n(12) > 0 ? p.cloudTicks * n(12) : 0,
  }
}

/**
 * A curva de tensão. "Te dei tempo pra entender seu movimento, mas seja rápido."
 *
 * `creep` sobe sem limite: lá na frente o mundo parado já anda a quase meia
 * velocidade, e ficar parado deixa de ser descanso. A recuperação tem piso de 1
 * tick — o único piso que existe, e existe porque 0 emendaria os dashes e a
 * dilatação sumiria.
 */
export function waveStats(tuning: Tuning, run: RunStats, wave: number): WaveStats {
  const step = Math.max(0, wave - 1)

  return {
    // Nunca zero: a decisão de 31/07 é pressão constante, não puzzle.
    creep: Math.max(0.012, run.creepBase + step * tuning.time.creepPerWave),
    recoveryTicks: Math.max(
      tuning.dash.minRecoveryTicks,
      Math.round(run.recoveryBase - step * tuning.dash.recoveryPerWave),
    ),
    // Divisão, não subtração: aperta pra sempre sem nunca chegar a zero.
    spawnIntervalSeconds: run.spawnBase / (1 + step * tuning.enemy.spawnPerWave),
    quota: tuning.wave.baseQuota + step * tuning.wave.quotaGrowth,
  }
}
