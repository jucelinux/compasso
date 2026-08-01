import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { drive } from "./drive.ts"
import { projectRoot } from "./loadTuning.ts"

/**
 * Grava uma fixture do build ATUAL — `npm run rec [nome] [seed]`.
 *
 * Existe porque em 01/08 as quatro fixtures em `replays/` eram todas do
 * `gitSha 7c952a6`, anterior ao core contínuo: elas rodavam, mas não exercitavam
 * nada do jogo vigente. E nenhuma cobria morte → reinício, que é exatamente o
 * gesto que o gate mede.
 *
 * A run é sintética, não humana. Não substitui um replay do humano para julgar
 * ritmo; serve para o determinismo ter uma âncora no core atual.
 */

const label = process.argv[2] ?? "core-atual"
const seed = Number(process.argv[3] ?? 4242)

const d = await drive(seed)
try {
  // Anda em oito direções para exercitar as oito folhas de sprite e o parallax.
  const passo: ReadonlyArray<[string[], number]> = [
    [["ArrowRight"], 1400],
    [["ArrowRight", "ArrowDown"], 900],
    [["ArrowDown"], 1100],
    [["ArrowLeft", "ArrowDown"], 900],
    [["ArrowLeft"], 1400],
    [["ArrowLeft", "ArrowUp"], 900],
    [["ArrowUp"], 1100],
    [["ArrowRight", "ArrowUp"], 900],
  ]
  const fase = async (): Promise<string> =>
    (await d.page.locator("#hud").textContent())?.match(/fase (\w+)/)?.[1] ?? "?"

  await d.hold([" "], 120) // impulso, para a habilidade entrar na gravação
  // Parada longa: é onde o creep e o relógio duplo ficam visíveis. E é seguro,
  // porque parada o mundo anda a 5% — que é exatamente a tese do jogo.
  await d.page.waitForTimeout(2500)

  /*
   * Anda até morrer de verdade. A primeira versão deste script parava depois de
   * um número fixo de segundos e a gravação nunca morria: andar rápido é o que
   * faz o mundo andar, e ficar parado esperando a morte não funciona neste jogo.
   * Agora ele lê a fase no readout do HUD em vez de adivinhar por relógio.
   */
  let passos = 0
  const MAX = 8 * 30
  while (passos < MAX && (await fase()) === "run") {
    const [keys, ms] = passo[passos % passo.length]!
    await d.hold(keys, ms)
    passos++
  }
  const morreu = (await fase()) === "dead"
  console.log(`${morreu ? "morreu" : "NÃO morreu"} em ${passos} passos`)
  if (!morreu) throw new Error("a run não morreu — fixture sem morte não serve ao gate")

  // E reinicia — o gesto que nenhuma fixture cobria.
  await d.page.waitForTimeout(1200)
  await d.hold(["r"], 200)
  await d.hold(["ArrowRight"], 1500)

  const download = d.page.waitForEvent("download", { timeout: 15_000 })
  await d.page.keyboard.press("Shift+F9")
  const file = await download
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const json = Buffer.concat(chunks).toString("utf8")

  const out = resolve(projectRoot, "replays", `${label}.json`)
  writeFileSync(out, json)
  const parsed = JSON.parse(json) as { inputs: unknown[]; gitSha: string | null }
  console.log(`gravado ${out}`)
  console.log(`  ${parsed.inputs.length} ticks · gitSha ${parsed.gitSha ?? "—"}`)
  if (d.errors.length > 0) console.error(`ERROS NO BROWSER:\n${d.errors.join("\n")}`)
} finally {
  await d.close()
}
