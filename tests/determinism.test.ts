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
const BASELINE_HASH = "b8f8c33d"

/**
 * Run real do humano, 7,6 min de input de verdade, do core do dash (`7c952a6`).
 *
 * A tela de escolha que este input atravessava não existe mais desde 01/08.
 * Vale hoje só como determinismo sobre input humano longo e real — não como
 * leitura de ritmo, e não como cobertura de morte.
 */
const RUN_01 = resolve(projectRoot, "replays", "run-01.json")
const RUN_01_HASH = "2511f194"

/**
 * Segunda run real: 5 min, 10 ondas, uma morte. Gravada antes da tecla de
 * reinício separada — o espaço que ela usa para recomeçar não recomeça mais.
 * Vale como determinismo sobre input humano longo.
 */
const RUN_02 = resolve(projectRoot, "replays", "run-02.json")
const RUN_02_HASH = "9a6a64d8"

/**
 * Terceira run real: 5,7 min de input humano, gravada quando os modificadores
 * ainda eram porcentagem.
 *
 * Com os patógenos reais este input voltou a morrer, na onda 6.
 */
const RUN_03 = resolve(projectRoot, "replays", "run-03.json")
const RUN_03_HASH = "e8ccf977"

/**
 * Primeira fixture do core contínuo, gravada por `npm run rec` em 01/08 no
 * `gitSha 669ee03`. Sintética, não humana: serve de âncora de determinismo, não
 * para julgar ritmo. É a ÚNICA que atravessa morte → reinício, que é o gesto que
 * o gate mede — as quatro anteriores são todas do `7c952a6`, anterior ao pivô.
 */
const CORE_ATUAL = resolve(projectRoot, "replays", "core-atual.json")
const CORE_ATUAL_HASH = "ecbe2b79"

const smoke = () => loadReplay(SMOKE)
const tuning = () => loadTuning()

/*
 * Os quatro baselines foram REBASEADOS em 01/08, ato consciente: os i-frames
 * passaram a cair no primeiro abate por contato em vez de ao atingir 85% da
 * velocidade, e o campo morto `invulnSkipCurrent` saiu do hash junto.
 */
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

  it("as fixtures antigas morrem cedo no core novo — travado contra registro podre", () => {
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
    /*
     * Estes quatro replays são de cores ANTIGOS (`7c952a6`). No core contínuo
     * aquele input não sabe pilotar: fica devagar, e devagar agora machuca — as
     * três runs humanas morrem cedo por isso, não por serem boas fixtures de
     * morte. Continuam valendo como determinismo sobre input real.
     *
     * A cobertura do core atual vem do `core-atual.json`, testado logo abaixo.
     * O que ainda falta é um replay do HUMANO no core novo; isso nenhum script
     * grava.
     */
    expect(reaches(SMOKE), "smoke não morre: input sintético mal se move").toBe(false)
    expect(reaches(RUN_01)).toBe(true)
    expect(reaches(RUN_02)).toBe(true)
    expect(reaches(RUN_03)).toBe(true)
  })

  it("a fixture do core atual bate com o baseline", () => {
    const result = runReplay(loadReplay(CORE_ATUAL), tuning())
    expect(result.finalHash).toBe(CORE_ATUAL_HASH)
  })

  it("a fixture do core atual atravessa morte E reinício", () => {
    // Era o buraco declarado no BACKLOG desde 31/07: nenhuma fixture reiniciava,
    // e reiniciar é exatamente o que o gate mede.
    const replay = loadReplay(CORE_ATUAL)
    const sim = createSim(replay.seed, tuning())
    let morreu = false
    let reiniciou = false
    for (const input of replayInputs(replay)) {
      sim.step(input)
      const s = sim.state()
      if (s.phase === "dead") morreu = true
      if (morreu && s.phase === "run" && s.runIndex > 0) reiniciou = true
    }
    expect(morreu, "não morreu").toBe(true)
    expect(reiniciou, "não reiniciou").toBe(true)
    expect(sim.state().runIndex).toBeGreaterThan(0)
  })

  it("hash evolui — não é constante", () => {
    const { hashes } = runReplay(smoke(), tuning())
    expect(new Set(hashes).size).toBeGreaterThan(100)
  })
})

describe("tuning.json", () => {
  it("muda o comportamento sem editar código", () => {
    const base = runReplay(smoke(), tuning())
    const faster: Tuning = { ...tuning(), dash: { ...tuning().dash, speedMultiplier: 4 } }
    expect(runReplay(smoke(), faster).finalHash).not.toBe(base.finalHash)
  })

  it("divergência de tuningHash é aviso, não erro", () => {
    const other: Tuning = { ...tuning(), dash: { ...tuning().dash, speedMultiplier: 4 } }
    const result = runReplay(smoke(), other)
    expect(result.tuningMatches).toBe(false)
    expect(result.ticks).toBe(smoke().inputs.length)
  })
})
