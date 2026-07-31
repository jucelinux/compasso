/**
 * Gera `replays/smoke.json` — a fixture de regressão da cena descartável.
 *
 * O padrão de input é sintético e semeado, para que a fixture seja regenerável
 * byte a byte. Fixtures de verdade vêm do F9; esta existe pra ter um baseline
 * antes de existir jogo.
 */
import { writeFileSync } from "node:fs"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createRng } from "../sim/rng.ts"
import type { InputFrame } from "../sim/types.ts"
import { unpackInput } from "../input/frame.ts"
import { createReplay, stringifyReplay } from "./replay.ts"
import { loadTuning, projectRoot } from "./loadTuning.ts"

const SEED = 12345
const TICKS = 900 // 15s de tempo de mundo
const HOLD = 20 // ticks segurando cada direção
const ACTION_EVERY = 137

const tuning = loadTuning()
const rng = createRng(99)
const inputs: InputFrame[] = []

// 5 bits de direção; mantém 0..15 (sem o bit de ação) e liga a ação à parte.
let dir = 0
for (let tick = 0; tick < TICKS; tick++) {
  if (tick % HOLD === 0) dir = rng.nextInt(0, 16)
  const action = tick % ACTION_EVERY === 0 && tick > 0
  inputs.push(unpackInput(dir | (action ? 16 : 0)))
}

const replay = createReplay({ seed: SEED, tuning, label: "smoke", inputs })
mkdirSync(resolve(projectRoot, "replays"), { recursive: true })
const path = resolve(projectRoot, "replays", "smoke.json")
writeFileSync(path, stringifyReplay(replay) + "\n")
console.log(`escrito ${path} — ${inputs.length} ticks`)
