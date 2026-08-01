import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { drive } from "./drive.ts"
import { projectRoot } from "./loadTuning.ts"

/**
 * Capturas do build atual — `npm run shot [seed]`.
 *
 * Três estados que dizem coisas diferentes e que nenhum teste alcança:
 * parada (o corpo respirando, o relógio no mínimo, o fundo ainda vivo pela
 * ciclagem de paleta), a toda (a gota esticada e o borrão), e a tela de morte.
 *
 * Sai em `shots/`, que é ignorado pelo git: captura é ferramenta de leitura, não
 * artefato de projeto.
 */

const seed = Number(process.argv[2] ?? 7)
const dir = resolve(projectRoot, "shots")
mkdirSync(dir, { recursive: true })

const d = await drive(seed)
try {
  await d.shot(resolve(dir, "1-parada.png"))

  await d.hold(["ArrowRight"], 700)
  await d.hold(["ArrowLeft"], 500)
  await d.page.keyboard.down("ArrowLeft")
  await d.page.waitForTimeout(400)
  await d.shot(resolve(dir, "2-a-toda.png"))
  await d.page.keyboard.up("ArrowLeft")

  /*
   * Para chegar à tela de morte é preciso ANDAR.
   *
   * A primeira versão ficava 30s parada, supondo que devagar machuca. Machuca —
   * mas parada o mundo anda a 5%, então quase nada chega até você, e depois do
   * primeiro toque os i-frames não caem porque cair exige engolir. A captura
   * saía com o nome "morte" mostrando uma run viva. Artefato com nome mentiroso
   * é pior que artefato nenhum.
   */
  const passo: ReadonlyArray<[string[], number]> = [
    [["ArrowRight"], 1200],
    [["ArrowDown"], 1000],
    [["ArrowLeft"], 1200],
    [["ArrowUp"], 1000],
  ]
  const fase = async (): Promise<string> =>
    (await d.page.locator("#hud").textContent())?.match(/fase (\w+)/)?.[1] ?? "?"

  let n = 0
  while (n < 4 * 40 && (await fase()) === "run") {
    const [keys, ms] = passo[n % passo.length]!
    await d.hold(keys, ms)
    n++
  }
  if ((await fase()) !== "dead") throw new Error("não morreu — a captura de morte mentiria")
  await d.page.waitForTimeout(600)
  await d.shot(resolve(dir, "3-morte.png"))

  console.log(`capturas em ${dir}`)
  if (d.errors.length > 0) console.error(`ERROS NO BROWSER:\n${d.errors.join("\n")}`)
  else console.log("nenhum erro de browser")
} finally {
  await d.close()
}
