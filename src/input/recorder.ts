import type { InputFrame, Tuning } from "../sim/types.ts"
import { createReplay, stringifyReplay, type Replay } from "../harness/replay.ts"

/**
 * Recorder — F9 no build de dev.
 *
 * A janela é contada em TICKS, não em milissegundos de parede. Uma janela de
 * relógio não alinha em fronteira de tick e o dump escorrega.
 */
export interface Recorder {
  push(input: InputFrame): void
  /** Últimos `windowTicks` inputs. */
  dumpWindow(label: string): Replay
  /** Run inteira desde o tick 0 — este é o único que reproduz o que foi visto. */
  dumpAll(label: string): Replay
  readonly length: number
  readonly windowTicks: number
}

export function createRecorder(seed: number, tuning: Tuning): Recorder {
  const windowTicks = Math.round(tuning.harness.recordSeconds * tuning.sim.hz)
  const all: InputFrame[] = []

  const build = (label: string, inputs: readonly InputFrame[]): Replay =>
    createReplay({ seed, tuning, label, inputs })

  return {
    push: (input) => {
      all.push(input)
    },
    dumpWindow: (label) => build(label, all.slice(Math.max(0, all.length - windowTicks))),
    dumpAll: (label) => build(label, all),
    get length() {
      return all.length
    },
    windowTicks,
  }
}

/** Dispara o download do JSON no browser. */
export function downloadReplay(replay: Replay): void {
  const blob = new Blob([stringifyReplay(replay)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${replay.label}.json`
  // Âncora precisa estar no documento, e o revoke não pode acontecer no mesmo
  // tick do click — o browser ainda não começou a ler o blob e o download sai vazio.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
