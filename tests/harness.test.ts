import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { loadTuning, projectRoot } from "../src/harness/loadTuning.ts"
import { createReplay, parseReplay, stringifyReplay } from "../src/harness/replay.ts"
import { runReplay } from "../src/harness/runReplay.ts"
import { createRecorder } from "../src/input/recorder.ts"
import { decodeInput, encodeInput, packInput, unpackInput } from "../src/input/frame.ts"
import { createRng } from "../src/sim/rng.ts"
import type { InputFrame } from "../src/sim/types.ts"

const tuning = loadTuning()

describe("codec de input", () => {
  it("faz round-trip nas 64 combinações", () => {
    for (let bits = 0; bits < 64; bits++) {
      expect(packInput(unpackInput(bits))).toBe(bits)
      expect(packInput(decodeInput(encodeInput(unpackInput(bits))))).toBe(bits)
    }
  })

  it("rejeita input fora de faixa", () => {
    expect(() => decodeInput("64")).toThrow()
    expect(() => decodeInput("abc")).toThrow()
    expect(() => decodeInput("-1")).toThrow()
  })
})

describe("recorder → runner", () => {
  const frames = (n: number, offset = 0): InputFrame[] =>
    Array.from({ length: n }, (_, i) => unpackInput((i + offset) % 64))

  it("o dump do F9 passa pelo mesmo parser que o runner headless", () => {
    const recorder = createRecorder(777, tuning)
    for (const f of frames(120)) recorder.push(f)

    // Exatamente o caminho do browser: dump → stringify → download → disco → parse.
    const onDisk = stringifyReplay(recorder.dumpAll("f9-teste"))
    const parsed = parseReplay(JSON.parse(onDisk))

    expect(parsed.seed).toBe(777)
    expect(parsed.inputs).toHaveLength(120)
    expect(runReplay(parsed, tuning).ticks).toBe(120)
  })

  it("a janela é contada em ticks, não em relógio", () => {
    const recorder = createRecorder(1, tuning)
    expect(recorder.windowTicks).toBe(tuning.harness.recordSeconds * tuning.sim.hz)

    for (const f of frames(recorder.windowTicks + 500)) recorder.push(f)
    expect(recorder.dumpWindow("w").inputs).toHaveLength(recorder.windowTicks)
    expect(recorder.dumpAll("a").inputs).toHaveLength(recorder.windowTicks + 500)
  })

  it("dumpAll reproduz o estado observado; dumpWindow de uma run longa, não", () => {
    const recorder = createRecorder(4242, tuning)
    const input = frames(recorder.windowTicks + 60, 3)
    for (const f of input) recorder.push(f)

    const live = runReplay(createReplay({ seed: 4242, tuning, label: "l", inputs: input }), tuning)
    expect(runReplay(recorder.dumpAll("a"), tuning).finalHash).toBe(live.finalHash)
    expect(runReplay(recorder.dumpWindow("w"), tuning).finalHash).not.toBe(live.finalHash)
  })
})

describe("replay", () => {
  it("rejeita formas inválidas com motivo", () => {
    expect(() => parseReplay(null)).toThrow(/objeto/)
    expect(() => parseReplay({ version: 99 })).toThrow(/versão/)
    expect(() => parseReplay({ version: 1, seed: 1.5 })).toThrow(/seed/)
    expect(() => parseReplay({ version: 1, seed: 1, tuningHash: "x", label: "l" })).toThrow(
      /inputs/,
    )
  })

  it("gitSha ausente vira null — replay sem procedência ainda roda", () => {
    const r = parseReplay(
      JSON.parse(stringifyReplay(createReplay({ seed: 1, tuning, label: "l", inputs: [] }))),
    )
    expect(r.gitSha).toBeNull()
  })
})

describe("rng", () => {
  it("mesma seed, mesma sequência", () => {
    const a = createRng(7)
    const b = createRng(7)
    expect(Array.from({ length: 50 }, () => a.nextU32())).toEqual(
      Array.from({ length: 50 }, () => b.nextU32()),
    )
  })

  it("sequências longas de seeds diferentes não colidem", () => {
    const one = createRng(1)
    const two = createRng(2)
    const seqA = Array.from({ length: 1000 }, () => one.nextU32())
    const seqB = Array.from({ length: 1000 }, () => two.nextU32())
    expect(seqA).not.toEqual(seqB)
    expect(new Set(seqA).size).toBeGreaterThan(990)
  })

  it("nextFloat fica em [0,1) e nextInt na faixa", () => {
    const rng = createRng(31337)
    for (let i = 0; i < 5000; i++) {
      const f = rng.nextFloat()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      const n = rng.nextInt(0, 8)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(8)
    }
  })
})

describe("fronteira da sim", () => {
  // Comentários fora: os próprios avisos citam o que é proibido.
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

  const simFiles = readdirSync(resolve(projectRoot, "src/sim")).map((f) =>
    stripComments(readFileSync(resolve(projectRoot, "src/sim", f), "utf8")),
  )

  it("não usa Math.random", () => {
    for (const source of simFiles) expect(source).not.toMatch(/Math\.random/)
  })

  it("não usa relógio de parede", () => {
    for (const source of simFiles) {
      expect(source).not.toMatch(/performance\.now|Date\.now|new Date/)
    }
  })

  it("não importa renderer nem DOM nem node", () => {
    for (const source of simFiles) {
      expect(source).not.toMatch(/from ["'](pixi\.js|node:)/)
      expect(source).not.toMatch(/\bdocument\.|\bwindow\./)
    }
  })

  it("não usa transcendentais — sin/cos/pow não são bit-a-bit entre engines", () => {
    for (const source of simFiles) {
      expect(source).not.toMatch(/Math\.(sin|cos|tan|pow|exp|log|atan2|hypot)\b/)
    }
  })
})
