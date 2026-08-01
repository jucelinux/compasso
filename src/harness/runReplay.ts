import { createSim } from "../sim/sim.ts"
import type { Tuning } from "../sim/types.ts"
import { replayInputs, tuningHash, type Replay } from "./replay.ts"

export interface MetricRow {
  tick: number
  /** Tempo de parede gasto no `step`. Medido AQUI, nunca dentro da sim. */
  simMs: number
  entityCount: number
}

export interface ReplayResult {
  label: string
  ticks: number
  finalHash: string
  /** Hash a cada tick. Serve pra achar o tick exato onde duas runs divergem. */
  hashes: string[]
  metrics: MetricRow[]
  tuningMatches: boolean
}

export function runReplay(replay: Replay, tuning: Tuning): ReplayResult {
  const sim = createSim(replay.seed, tuning)
  const inputs = replayInputs(replay)
  const hashes: string[] = []
  const metrics: MetricRow[] = []

  for (const input of inputs) {
    const t0 = performance.now()
    sim.step(input)
    const simMs = performance.now() - t0
    const snap = sim.snapshot()
    hashes.push(snap.hash)
    metrics.push({ tick: snap.tick, simMs, entityCount: sim.state().enemies.length + 1 })
  }

  return {
    label: replay.label,
    ticks: inputs.length,
    finalHash: sim.snapshot().hash,
    hashes,
    metrics,
    tuningMatches: replay.tuningHash === tuningHash(tuning),
  }
}

export function metricsCsv(metrics: readonly MetricRow[]): string {
  const lines = ["tick,simMs,entityCount"]
  for (const m of metrics) lines.push(`${m.tick},${m.simMs.toFixed(4)},${m.entityCount}`)
  return lines.join("\n") + "\n"
}
