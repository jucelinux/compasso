import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { drive } from "./drive.ts"
import { loadTuning, projectRoot } from "./loadTuning.ts"
import { parseReplay, replayInputs } from "./replay.ts"
import { runReplay } from "./runReplay.ts"
import { createSim } from "../sim/sim.ts"

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

  /*
   * Testemunhas de hash, colhidas do HUD DURANTE a gravação.
   *
   * Elas existem porque esta fixture nasce num BROWSER e vira baseline para um
   * teste que roda em NODE, e nada verificava que os dois concordam. Não é
   * paranoia de tipo: a sim é cheia de decisões tomadas por causa disso — sem
   * `sin`/`cos`, sem `Math.pow`, direção guardada como vetor — e o comentário
   * em `types.ts` registra que essa regra já pegou um erro real em 02/08.
   *
   * O HUD imprime tick E hash no mesmo texto, então o par não tem corrida:
   * seja qual for o quadro em que a leitura caiu, o tick daquele hash é o que
   * está escrito ao lado dele.
   */
  const testemunhas = new Map<number, string>()
  const testemunha = async (): Promise<void> => {
    const hud = await d.page.locator("#hud").textContent()
    const m = hud?.match(/tick (\d+) · fase \w+ · ([0-9a-f]+)/)
    if (m !== null && m !== undefined) testemunhas.set(Number(m[1]), m[2]!)
  }

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
    if (passos % 4 === 0) await testemunha()
  }
  const morreu = (await fase()) === "dead"
  console.log(`${morreu ? "morreu" : "NÃO morreu"} em ${passos} passos`)
  if (!morreu) throw new Error("a run não morreu — fixture sem morte não serve ao gate")

  // As duas transições que esta fixture existe para cobrir ganham testemunha
  // própria: são exatamente onde um erro de estado apareceria.
  await testemunha()

  /*
   * E reinicia — o gesto que nenhuma fixture cobria.
   *
   * O `R` sozinho não bastava mais e foi exatamente isso que passou batido no
   * pivô das FASES: reiniciar agora cai no CARD da doença, não direto no jogo.
   * A gravação de 02/08 ia de `dead` para `run` num gesto só; a de hoje precisa
   * dispensar o card, e o card tem trava (`cardLockTicks`) contra dispensa por
   * reflexo. Sem isto a fixture ficava parada em `card` para sempre e o teste
   * "atravessa morte E reinício" não tinha como passar.
   */
  await d.page.waitForTimeout(1200)
  await d.hold(["r"], 200)
  await testemunha()

  let tentativas = 0
  while ((await fase()) !== "run" && tentativas < 20) {
    await d.hold([" "], 150)
    await d.page.waitForTimeout(200)
    tentativas++
  }
  if ((await fase()) !== "run") {
    throw new Error(`não voltou para o jogo depois do reinício — parou em "${await fase()}"`)
  }
  await testemunha()
  await d.hold(["ArrowRight"], 1500)
  await testemunha()

  const download = d.page.waitForEvent("download", { timeout: 15_000 })
  await d.page.keyboard.press("Shift+F9")
  const file = await download
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const json = Buffer.concat(chunks).toString("utf8")

  const out = resolve(projectRoot, "replays", `${label}.json`)
  writeFileSync(out, json)
  const replay = parseReplay(JSON.parse(json))
  console.log(`gravado ${out}`)
  console.log(`  ${replay.inputs.length} ticks · gitSha ${replay.gitSha ?? "—"}`)
  if (d.errors.length > 0) console.error(`ERROS NO BROWSER:\n${d.errors.join("\n")}`)

  /*
   * O BROWSER e o NODE têm que dar o mesmo hash. Se não derem, a fixture não
   * serve para nada — o baseline seria uma verdade só do Node, e o rig inteiro
   * assume que os dois concordam.
   */
  /*
   * O recusador. A fixture tem que cobrir, EM NODE, exatamente o que o teste
   * dela afirma — morte e reinício — e quem verifica isso é quem grava.
   *
   * Ler a fase no HUD durante a captura não substitui isto: o HUD é o browser
   * falando de si mesmo, e o teste roda em Node a partir do log de input. Foi
   * essa distância que deixou passar uma fixture que morria mas nunca voltava
   * ao jogo.
   */
  const sim = createSim(replay.seed, loadTuning())
  let morreuEmNode = false
  let reiniciouEmNode = false
  for (const input of replayInputs(replay)) {
    sim.step(input)
    const s = sim.state()
    if (s.phase === "dead") morreuEmNode = true
    if (morreuEmNode && s.phase === "run" && s.runIndex > 0) reiniciouEmNode = true
  }
  if (!morreuEmNode || !reiniciouEmNode) {
    throw new Error(
      `a fixture não cobre o que promete quando roda em NODE: ` +
        `morre ${morreuEmNode}, reinicia ${reiniciouEmNode}. ` +
        `Ela alimenta o teste "atravessa morte E reinício" e passaria vermelha.`,
    )
  }

  const { hashes, finalHash } = runReplay(replay, loadTuning())
  const divergentes: string[] = []
  for (const [tick, hashNoBrowser] of [...testemunhas].sort((a, b) => a[0] - b[0])) {
    // O HUD imprime o tick DEPOIS do passo; `hashes[i]` é o hash depois do
    // passo `i + 1`. Testemunha colhida no card (tick 0) não tem par.
    const hashNoNode = hashes[tick - 1]
    if (hashNoNode === undefined) continue
    if (hashNoNode !== hashNoBrowser) {
      divergentes.push(`  tick ${tick}: browser ${hashNoBrowser} · node ${hashNoNode}`)
    }
  }
  if (divergentes.length > 0) {
    throw new Error(
      `browser e node DIVERGEM — a fixture não é reproduzível fora do browser:\n` +
        divergentes.join("\n"),
    )
  }
  console.log(
    `  browser e node batem em ${testemunhas.size} testemunhas · hash final ${finalHash}`,
  )
} finally {
  await d.close()
}
