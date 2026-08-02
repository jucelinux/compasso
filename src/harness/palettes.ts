import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { drive } from "./drive.ts"
import { projectRoot } from "./loadTuning.ts"
import { PALETTE_VARIANTS } from "../render/palette.ts"

/**
 * Sonda de fronteira do eixo COR — `npm run palettes [seed]`.
 *
 * `TASTE-LOOP.md` §3.0: antes de otimizar um eixo, produzir de 2 a 4 amostras
 * baratas e descartáveis de idiomas DIFERENTES, e deixar o humano escolher. É o
 * passo que faltou por três rodadas em 01/08 e custou o projeto inteiro em
 * textura procedural enquanto pixel art estava disponível.
 *
 * Duas capturas por variante, e as duas importam por motivos opostos: parada
 * mostra a cor do organismo com o mundo quase congelado, a toda mostra se o
 * jogador e o rastro ainda são achaveis quando tudo se move.
 *
 * Sai em `shots/paleta-*`, que o git ignora. Amostra é insumo de decisão, não
 * artefato de projeto — quando ele escolher, o que fica é a linha no
 * `DECISIONS.md` e os valores novos em `palette.ts`.
 */

const seed = Number(process.argv[2] ?? 7)
const dir = resolve(projectRoot, "shots")
mkdirSync(dir, { recursive: true })

const nomes = Object.keys(PALETTE_VARIANTS)
console.log(`sondando ${nomes.length} paletas na seed ${seed}: ${nomes.join(", ")}`)

for (const nome of nomes) {
  const d = await drive(seed, { palette: nome })
  try {
    await d.shot(resolve(dir, `paleta-${nome}-1-parada.png`))
    // Mesma sequência de teclas para todas: se a amostra variar por outro motivo
    // que não a cor, a comparação não é de cor.
    await d.hold(["ArrowRight"], 700)
    await d.hold(["ArrowLeft"], 500)
    await d.page.keyboard.down("ArrowLeft")
    await d.page.waitForTimeout(400)
    await d.shot(resolve(dir, `paleta-${nome}-2-a-toda.png`))
    await d.page.keyboard.up("ArrowLeft")
    if (d.errors.length > 0) console.error(`ERROS em "${nome}":\n${d.errors.join("\n")}`)
    else console.log(`ok · ${nome}`)
  } finally {
    await d.close()
  }
}

console.log(`amostras em ${dir}`)
