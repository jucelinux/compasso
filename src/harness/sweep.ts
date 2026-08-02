import { playRun, type Policy } from "./bot.ts"
import { loadTuning } from "./loadTuning.ts"
import type { Tuning } from "../sim/types.ts"

/**
 * Varredura de parâmetro — `npm run sweep <caminho.no.tuning> <v1> <v2> ...`
 *
 * Existe por causa de um achado do próprio método, em 01/08: o gargalo real
 * daquela sessão foi afinar `tuning.json` à mão contra o bot, muitos turnos de
 * chutar-rodar-ler-chutar. `TASTE-LOOP-LEARNING.md` P7 nomeou a correção — isso
 * é problema do degrau 2 da escada, não de frota de agentes: o tuning é dado, o
 * bot é headless e determinístico, então N configurações ranqueadas por métrica
 * resolvem mais barato e mais confiável do que qualquer julgamento meu.
 *
 * Uso:
 *   npm run sweep field.crowdDrag 0 0.1 0.15 0.2 0.3
 */

const [path, ...raw] = process.argv.slice(2)
if (path === undefined || raw.length === 0) {
  console.error("uso: npm run sweep <caminho.no.tuning> <valor> [valor...]")
  process.exit(1)
}
const valores = raw.map(Number)
if (valores.some(Number.isNaN)) {
  console.error("todos os valores precisam ser números")
  process.exit(1)
}

/** Copia o tuning trocando UM caminho pontilhado. Sem mutar o original. */
function withValue(tuning: Tuning, dotted: string, value: number): Tuning {
  const parts = dotted.split(".")
  const clone = structuredClone(tuning) as unknown as Record<string, unknown>
  let node = clone
  for (const key of parts.slice(0, -1)) {
    const next = node[key]
    if (typeof next !== "object" || next === null) throw new Error(`caminho inválido: ${dotted}`)
    node = next as Record<string, unknown>
  }
  const leaf = parts[parts.length - 1]!
  if (!(leaf in node)) throw new Error(`caminho inválido: ${dotted}`)
  node[leaf] = value
  return clone as unknown as Tuning
}

const base = loadTuning()
const seeds = [1234, 7, 99, 2024, 31337]
const MAX = 60 * 60 * 6
// As três que dizem coisas diferentes: correr sempre, alternar, e só curar.
const POLICIES: ReadonlyArray<Policy> = ["agressiva", "ritmo", "curandeira"]

console.log(`varrendo ${path} em ${valores.join(", ")} · ${seeds.length} seeds × ${POLICIES.length} políticas\n`)
console.log(
  `${"valor".padEnd(8)}${"política".padEnd(12)}${"run".padEnd(8)}${"mortes".padEnd(8)}` +
    `${"perigo".padEnd(9)}${"fases".padEnd(7)}infecção méd`,
)

for (const valor of valores) {
  const tuning = withValue(base, path, valor)
  for (const policy of POLICIES) {
    const lengths: number[] = []
    let perigo = 0
    let fases = 0
    let inf = 0
    for (const seed of seeds) {
      const r = playRun(seed, tuning, MAX, policy)
      if (r.diedAtSeconds !== null) lengths.push(r.diedAtSeconds)
      perigo += r.folga.perigo
      fases += r.folga.fases
      inf += r.folga.infMedia
    }
    const media =
      lengths.length > 0
        ? `${(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(0)}s`
        : ">6min"
    console.log(
      `${String(valor).padEnd(8)}${policy.padEnd(12)}${media.padEnd(8)}` +
        `${`${lengths.length}/${seeds.length}`.padEnd(8)}` +
        `${`${(perigo / seeds.length).toFixed(1)}s`.padEnd(9)}` +
        `${(fases / seeds.length).toFixed(1).padEnd(7)}` +
        `${((inf / seeds.length) * 100).toFixed(0)}%`,
    )
  }
}
