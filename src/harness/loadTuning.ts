import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Tuning } from "../sim/types.ts"
import { parseReplay, type Replay } from "./replay.ts"

/** Raiz do projeto, resolvida a partir deste arquivo. Independe do cwd. */
export const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

export function loadTuning(path = `${projectRoot}tuning.json`): Tuning {
  return JSON.parse(readFileSync(path, "utf8")) as Tuning
}

export function loadReplay(path: string): Replay {
  return parseReplay(JSON.parse(readFileSync(path, "utf8")))
}
