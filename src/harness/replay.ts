import { hashString } from "../sim/hash.ts"
import type { InputFrame, Tuning } from "../sim/types.ts"
import { decodeInput, encodeInput } from "../input/frame.ts"

export const REPLAY_VERSION = 1

export interface Replay {
  readonly version: number
  readonly seed: number
  readonly tuningHash: string
  /** `null` quando não há repositório. Um replay sem procedência ainda replaya. */
  readonly gitSha: string | null
  readonly label: string
  readonly inputs: readonly string[]
}

/** Hash do `tuning.json`. Divergência é aviso, não erro — comparar é o objetivo. */
export function tuningHash(tuning: Tuning): string {
  return hashString(canonical(tuning))
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
}

export function createReplay(args: {
  seed: number
  tuning: Tuning
  label: string
  inputs: readonly InputFrame[]
  gitSha?: string | null
}): Replay {
  return {
    version: REPLAY_VERSION,
    seed: args.seed,
    tuningHash: tuningHash(args.tuning),
    gitSha: args.gitSha ?? null,
    label: args.label,
    inputs: args.inputs.map(encodeInput),
  }
}

/** Valida a forma vinda do disco ou do download do F9. Lança com motivo claro. */
export function parseReplay(raw: unknown): Replay {
  if (raw === null || typeof raw !== "object") throw new Error("replay não é um objeto")
  const r = raw as Record<string, unknown>

  if (r["version"] !== REPLAY_VERSION) {
    throw new Error(`versão de replay não suportada: ${String(r["version"])}`)
  }
  if (typeof r["seed"] !== "number" || !Number.isInteger(r["seed"])) {
    throw new Error("replay.seed precisa ser inteiro")
  }
  if (typeof r["tuningHash"] !== "string") throw new Error("replay.tuningHash ausente")
  if (typeof r["label"] !== "string") throw new Error("replay.label ausente")
  if (!Array.isArray(r["inputs"]) || r["inputs"].some((i) => typeof i !== "string")) {
    throw new Error("replay.inputs precisa ser array de strings")
  }
  const gitSha = r["gitSha"]
  if (gitSha !== null && gitSha !== undefined && typeof gitSha !== "string") {
    throw new Error("replay.gitSha precisa ser string ou null")
  }

  return {
    version: REPLAY_VERSION,
    seed: r["seed"],
    tuningHash: r["tuningHash"],
    gitSha: typeof gitSha === "string" ? gitSha : null,
    label: r["label"],
    inputs: r["inputs"] as string[],
  }
}

export function replayInputs(replay: Replay): InputFrame[] {
  return replay.inputs.map(decodeInput)
}

/** Uma linha por input — legível no diff, e ainda pequeno. */
export function stringifyReplay(replay: Replay): string {
  return JSON.stringify(replay, null, 2).replace(
    /"inputs": \[[^\]]*\]/,
    () => `"inputs": [${replay.inputs.map((i) => `"${i}"`).join(", ")}]`,
  )
}
