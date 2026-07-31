import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import { loadReplay, loadTuning, projectRoot } from "../src/harness/loadTuning.ts"
import { runReplay } from "../src/harness/runReplay.ts"
import type { Tuning } from "../src/sim/types.ts"

/**
 * Se algum destes quebrar, pare tudo e conserte antes de qualquer outra coisa.
 */

const SMOKE = resolve(projectRoot, "replays", "smoke.json")
const BASELINE_HASH = "e65d236b"

const smoke = () => loadReplay(SMOKE)
const tuning = () => loadTuning()

describe("determinismo", () => {
  it("mesma seed + mesmos inputs = mesmo hash", () => {
    expect(runReplay(smoke(), tuning()).finalHash).toBe(
      runReplay(smoke(), tuning()).finalHash,
    )
  })

  it("bate com o baseline commitado", () => {
    // Mudar este valor é um ato consciente: significa que o comportamento mudou.
    expect(runReplay(smoke(), tuning()).finalHash).toBe(BASELINE_HASH)
  })

  it("não diverge em nenhum tick, não só no final", () => {
    const a = runReplay(smoke(), tuning()).hashes
    const b = runReplay(smoke(), tuning()).hashes
    const divergence = a.findIndex((h, i) => h !== b[i])
    expect(divergence, `divergiu no tick ${divergence}`).toBe(-1)
  })

  it("hash evolui — não é constante", () => {
    const { hashes } = runReplay(smoke(), tuning())
    expect(new Set(hashes).size).toBeGreaterThan(100)
  })
})

describe("tuning.json", () => {
  it("muda o comportamento sem editar código", () => {
    const base = runReplay(smoke(), tuning())
    const faster: Tuning = { ...tuning(), player: { ...tuning().player, speed: 240 } }
    expect(runReplay(smoke(), faster).finalHash).not.toBe(base.finalHash)
  })

  it("divergência de tuningHash é aviso, não erro", () => {
    const other: Tuning = { ...tuning(), player: { ...tuning().player, speed: 240 } }
    const result = runReplay(smoke(), other)
    expect(result.tuningMatches).toBe(false)
    expect(result.ticks).toBe(smoke().inputs.length)
  })
})
