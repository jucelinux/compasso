/**
 * Runner headless — `npm run replay <arquivo>`.
 *
 * Roda a sim em Node sem renderer. Imprime o hash final e escreve
 * `out/<label>/metrics.csv`.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadReplay, loadTuning, projectRoot } from "./loadTuning.ts"
import { metricsCsv, runReplay } from "./runReplay.ts"

const file = process.argv[2]
if (file === undefined) {
  console.error("uso: npm run replay <arquivo.json>")
  process.exit(1)
}

const replay = loadReplay(resolve(process.cwd(), file))
const tuning = loadTuning()
const result = runReplay(replay, tuning)

if (!result.tuningMatches) {
  console.warn(
    `aviso: tuningHash do replay (${replay.tuningHash}) difere do tuning.json atual — ` +
      `é exatamente assim que se compara variantes`,
  )
}

const outDir = resolve(projectRoot, "out", result.label)
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, "metrics.csv"), metricsCsv(result.metrics))

const total = result.metrics.reduce((sum, m) => sum + m.simMs, 0)
console.log(`label      ${result.label}`)
console.log(`seed       ${replay.seed}`)
console.log(`ticks      ${result.ticks}`)
console.log(`sim total  ${total.toFixed(2)}ms  (${(total / result.ticks).toFixed(4)}ms/tick)`)
console.log(`metrics    out/${result.label}/metrics.csv`)
console.log(`hash       ${result.finalHash}`)
