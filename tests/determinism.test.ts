import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import { loadReplay, loadTuning, projectRoot } from "../src/harness/loadTuning.ts"
import { runReplay } from "../src/harness/runReplay.ts"
import { replayInputs } from "../src/harness/replay.ts"
import { createSim } from "../src/sim/sim.ts"
import type { Tuning } from "../src/sim/types.ts"

/**
 * Se algum destes quebrar, pare tudo e conserte antes de qualquer outra coisa.
 */

const SMOKE = resolve(projectRoot, "replays", "smoke.json")
const BASELINE_HASH = "b92dd21c"

/**
 * Run real do humano, 7,6 min de input de verdade.
 *
 * ATENÇÃO: gravada ANTES das ondas. Sob as regras atuais fica muito tempo preso
 * na tela de escolha, que o input dele não conhecia. Vale como determinismo
 * sobre input humano real; não morre.
 */
const RUN_01 = resolve(projectRoot, "replays", "run-01.json")
const RUN_01_HASH = "8c1b9f72"

/**
 * Segunda run real: 5 min, 10 ondas, uma morte. Gravada antes da tecla de
 * reinício separada — o espaço que ela usa para recomeçar não recomeça mais.
 * Vale como determinismo sobre input humano longo. NENHUMA fixture cobre hoje
 * morte → reinício sob as regras atuais; só uma gravação nova resolve.
 */
const RUN_02 = resolve(projectRoot, "replays", "run-02.json")
const RUN_02_HASH = "d7a32e77"

/**
 * Terceira run real: 5,7 min de input humano, gravada quando os modificadores
 * ainda eram porcentagem.
 *
 * Com os patógenos reais este input voltou a morrer, na onda 6. Junto com a
 * run-02, é a cobertura de morte que existe hoje. Nenhuma fixture cobre
 * morte → reinício: todas são anteriores à tecla própria de recomeço.
 */
const RUN_03 = resolve(projectRoot, "replays", "run-03.json")
const RUN_03_HASH = "5efee052"

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

  it("input humano real: bate com o baseline", () => {
    const result = runReplay(loadReplay(RUN_01), tuning())
    expect(result.finalHash).toBe(RUN_01_HASH)
    expect(result.ticks).toBeGreaterThan(20000)
  })

  it("segunda run humana: bate com o baseline", () => {
    const result = runReplay(loadReplay(RUN_02), tuning())
    expect(result.finalHash).toBe(RUN_02_HASH)
    expect(result.ticks).toBeGreaterThan(17000)
  })

  it("terceira run humana: bate com o baseline", () => {
    const replay = loadReplay(RUN_03)
    const result = runReplay(replay, tuning())
    expect(result.finalHash).toBe(RUN_03_HASH)
    expect(result.ticks).toBeGreaterThan(19000)
  })

  it("run-02 e run-03 atravessam a morte — travado contra registro podre", () => {
    // Este teste existe porque os comentários deste arquivo já mentiram duas
    // vezes: a run-01 alegava cobrir morte depois das ondas, e a run-03 depois
    // dos modificadores-comportamento. Agora quem afirma é o teste.
    const reaches = (path: string): boolean => {
      const replay = loadReplay(path)
      const sim = createSim(replay.seed, tuning())
      for (const input of replayInputs(replay)) {
        sim.step(input)
        if (sim.state().phase === "dead") return true
      }
      return false
    }
    expect(reaches(RUN_02), "run-02 deveria atravessar a morte").toBe(true)
    // Voltou a morrer com os patógenos reais: o corona e a S. aureus repuseram
    // a dificuldade que os modificadores-comportamento tinham comido.
    expect(reaches(RUN_03), "run-03 deveria atravessar a morte").toBe(true)
    expect(reaches(SMOKE)).toBe(false)
    expect(reaches(RUN_01)).toBe(false)
  })

  it("hash evolui — não é constante", () => {
    const { hashes } = runReplay(smoke(), tuning())
    expect(new Set(hashes).size).toBeGreaterThan(100)
  })
})

describe("tuning.json", () => {
  it("muda o comportamento sem editar código", () => {
    const base = runReplay(smoke(), tuning())
    const faster: Tuning = { ...tuning(), dash: { ...tuning().dash, speed: 900 } }
    expect(runReplay(smoke(), faster).finalHash).not.toBe(base.finalHash)
  })

  it("divergência de tuningHash é aviso, não erro", () => {
    const other: Tuning = { ...tuning(), dash: { ...tuning().dash, speed: 900 } }
    const result = runReplay(smoke(), other)
    expect(result.tuningMatches).toBe(false)
    expect(result.ticks).toBe(smoke().inputs.length)
  })
})
