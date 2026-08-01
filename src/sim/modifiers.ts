import type { Tuning } from "./types.ts"

/**
 * A camada roguelite: limpou a onda, escolhe 1 de 3. Morreu, perde tudo.
 *
 * O arco vive dentro da run — decisão de 31/07. O custo é conhecido: o carrinho
 * entre runs era o que produzia a segunda partida, então o gate precisa ser
 * remedido depois disto.
 */
export interface Modifier {
  readonly id: number
  readonly name: string
  readonly blurb: string
}

export const MODIFIERS: readonly Modifier[] = [
  { id: 0, name: "PASSO LONGO", blurb: "dash dura mais" },
  { id: 1, name: "PASSO RÁPIDO", blurb: "dash mais veloz" },
  { id: 2, name: "FÔLEGO", blurb: "+1 vida, agora" },
  { id: 3, name: "AR PARADO", blurb: "o mundo escorre menos" },
  { id: 4, name: "ESTEIRA", blurb: "corte mais largo" },
  { id: 5, name: "SILÊNCIO", blurb: "eles demoram mais a vir" },
  { id: 6, name: "REFLEXO", blurb: "levanta mais rápido" },
  { id: 7, name: "CORTE LARGO", blurb: "abre o leque do golpe" },
  { id: 8, name: "MEMBRANA", blurb: "absorve um toque por onda" },
  { id: 9, name: "REPARO", blurb: "regenera o organismo" },
]

/** O modificador de vida é o único que mexe num contador, não numa curva. */
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
  /** Cosseno mínimo do arco de corte. Menor = leque mais largo. */
  killArc: number
  shields: number
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

  return {
    dashDurationTicks: Math.round(tuning.dash.durationTicks * (1 + 0.22 * n(0))),
    dashSpeed: tuning.dash.speed * (1 + 0.18 * n(1)),
    killRadius: tuning.dash.killRadius * (1 + 0.3 * n(4)),
    lives: tuning.run.lives + n(MOD_EXTRA_LIFE),
    creepBase: tuning.time.creep * (1 - 0.3 * n(3)),
    recoveryBase: tuning.dash.recoveryTicks - n(6),
    spawnBase: tuning.enemy.spawnIntervalSeconds * (1 + 0.25 * n(5)),
    // Nunca abaixo de -1: aí o leque viraria a aura que a decisão de 31/07 tirou.
    killArc: Math.max(-0.9, tuning.dash.killArc - 0.35 * n(7)),
    shields: n(MOD_SHIELD),
  }
}

/**
 * A curva de tensão. "Te dei tempo pra entender seu movimento, mas seja rápido."
 *
 * `creep` sobe sem limite: por volta da onda 20 o mundo parado já anda a quase
 * meia velocidade, e ficar parado deixa de ser descanso. É esse eixo que carrega
 * a dificuldade depois que a recuperação encosta no piso de 1 tick — o único
 * piso que existe, e existe porque 0 faria os dashes se emendarem e a dilatação
 * sumir.
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
