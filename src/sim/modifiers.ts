import type { Tuning } from "./types.ts"

/**
 * A camada roguelite, na sua forma mínima: morreu, escolhe 1 de 3, joga de novo.
 *
 * Existe porque o gate é "taxa de segunda partida voluntária". Um slice sem isto
 * só mede se o dash é gostoso — que é o modo de falha declarado no `TASTE.md` §2
 * passando de aprovado.
 */
export interface Modifier {
  readonly id: number
  readonly name: string
  readonly blurb: string
}

export const MODIFIERS: readonly Modifier[] = [
  { id: 0, name: "PASSO LONGO", blurb: "dash dura mais" },
  { id: 1, name: "PASSO RÁPIDO", blurb: "dash mais veloz" },
  { id: 2, name: "FÔLEGO", blurb: "+1 vida" },
  { id: 3, name: "AR PARADO", blurb: "o mundo escorre menos" },
  { id: 4, name: "ESTEIRA", blurb: "corte mais largo" },
  { id: 5, name: "SILÊNCIO", blurb: "eles demoram mais a vir" },
]

/** Números da run depois dos modificadores. Nada aqui é constante mágica. */
export interface RunStats {
  dashDurationTicks: number
  dashSpeed: number
  killRadius: number
  creep: number
  spawnIntervalSeconds: number
  lives: number
}

export function applyModifiers(tuning: Tuning, owned: readonly number[]): RunStats {
  const n = (id: number): number => owned[id] ?? 0

  return {
    dashDurationTicks: Math.round(tuning.dash.durationTicks * (1 + 0.22 * n(0))),
    dashSpeed: tuning.dash.speed * (1 + 0.18 * n(1)),
    killRadius: tuning.dash.killRadius * (1 + 0.3 * n(4)),
    // Creep nunca chega a zero: a decisão de 31/07 é pressão constante, não puzzle.
    creep: Math.max(0.012, tuning.time.creep * (1 - 0.3 * n(3))),
    spawnIntervalSeconds: tuning.enemy.spawnIntervalSeconds * (1 + 0.25 * n(5)),
    lives: tuning.run.lives + n(2),
  }
}
