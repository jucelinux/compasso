import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { drive, type Driver } from "./drive.ts"
import { loadTuning, projectRoot } from "./loadTuning.ts"
import { parseReplay, replayInputs } from "./replay.ts"
import { runReplay } from "./runReplay.ts"
import { createSim } from "../sim/sim.ts"

/** A porta vem do `tuning.json`: a posição dela é dado, não constante do rig. */
const HUB = loadTuning().hub

/**
 * Atravessa a tela em que o jogo está, seja ela qual for.
 *
 * Deixou de ser "aperte espaço" em 13/08, duas vezes no mesmo dia. Primeiro o
 * cérebro virou navegável e sair dele passou a ser ANDAR até a órbita; segurar
 * CIMA bastava, porque havia uma porta só e o jogador nascia logo abaixo dela.
 * Depois as portas viraram CINCO, espalhadas pelos cantos e pelo centro, e o
 * nascimento virou uma praça longe de todas — e aí segurar CIMA não leva a
 * lugar nenhum.
 *
 * Agora ele CLICA na porta. Este rig só enxerga a FASE, pelo texto do HUD, e
 * nunca soube onde o glóbulo está; clicar é o outro gesto que o próprio jogador
 * tem, então o aparelho continua pilotando um caminho que alguém percorre — e
 * de quebra a gravação passa a exercitar o ponteiro pelo cano inteiro.
 *
 * `painel` sai pela tecla de voltar. Ele nunca deveria abrir aqui, mas o clique
 * erra quando a porta muda de lugar, e rig preso numa tela que ele não sabe que
 * abriu é a forma mais silenciosa de o aparelho parar de medir.
 */
async function atravessaTela(d: Driver, fase: () => Promise<string>): Promise<void> {
  const f = await fase()
  if (f === "hub") await d.clicaArena(HUB.orbitX, HUB.orbitY)
  else if (f === "painel") await d.hold(["KeyR"], 120)
  else await d.hold([" "], 150)
}

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
  /*
   * O passeio, com PARADAS — e as paradas entraram em 05/08 por necessidade,
   * não por capricho.
   *
   * Com a necrose, tecido cicatrizado deixa de parir patógeno. O passeio antigo
   * nunca parava, então ele varria a arena, deixava tudo saturar e cicatrizar,
   * a reprodução morria junto e a run virava imortal: o gravador estourou os
   * 240 passos sem morrer em duas seeds diferentes.
   *
   * Parar não é só o conserto — é o que faz a fixture EXERCITAR o core. Uma
   * âncora do jogo cujo tema é "matar exige velocidade, curar exige presença"
   * que só contivesse velocidade ancoraria metade do jogo.
   */
  const passo: ReadonlyArray<[string[], number]> = [
    [["ArrowRight"], 1400],
    [["ArrowRight", "ArrowDown"], 900],
    [[], 1500],
    [["ArrowDown"], 1100],
    [["ArrowLeft", "ArrowDown"], 900],
    [["ArrowLeft"], 1400],
    [[], 1500],
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
  const MAX = 10 * 30
  /*
   * O laço para SÓ na morte — e a versão anterior parava em qualquer fase que
   * não fosse `run`, o que virou defeito no mesmo dia em que a necrose entrou.
   *
   * Com cicatriz, tecido morto deixa de parir, então o passeio passou a CONTER
   * ondas em vez de só sobreviver a elas. Contida a onda, o jogo vai para o
   * card de recompensa, `fase()` deixa de ser "run", o laço saía inteiro e o
   * gravador reclamava que a run não morreu — quando na verdade ela estava
   * ganhando. Sintoma que aponta para o lugar errado é o pior tipo.
   *
   * É o mesmo defeito que o reinício já tinha, na outra ponta do laço: card é
   * estado normal do jogo agora, e todo laço que dirige o jogo precisa saber
   * dispensá-lo.
   *
   * Em 13/08 a recompensa virou `intervalo`, e nele o espaço não faz NADA — a
   * contagem não se pula. O laço continua correto por acidente feliz: ele
   * espera, relê a fase, e a onda entra sozinha em 3 segundos. Fica escrito
   * porque "aperta espaço até sair da tela" deixou de ser a razão de funcionar,
   * e quem mexer aqui depois merece saber disso.
   */
  let atual = await fase()
  while (passos < MAX && atual !== "dead") {
    if (atual !== "run") {
      await atravessaTela(d, fase)
      await d.page.waitForTimeout(200)
      atual = await fase()
      continue
    }
    const [keys, ms] = passo[passos % passo.length]!
    await d.hold(keys, ms)
    passos++
    if (passos % 4 === 0) await testemunha()
    atual = await fase()
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
  while ((await fase()) !== "run" && tentativas < 40) {
    await atravessaTela(d, fase)
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
    /*
     * A mensagem nomeia a causa MAIS PROVÁVEL, e ela não é a sim.
     *
     * Em 13/08 esta verificação acusou 5 de 5 testemunhas divergentes e eu
     * gastei a tarde caçando um defeito de determinismo que não existia: eu
     * tinha editado `src/main.ts` com o gravador rodando, e o HMR do Vite
     * trocou o módulo no meio da run. A página passou a rodar um código, o
     * Node replicou outro, e o sintoma apontava para o lugar errado — que é
     * exatamente o tipo de defeito que o comentário do laço lá em cima já
     * chama de pior.
     *
     * O aparelho não pode influenciar o jogo (`drive.ts`), e um servidor de
     * desenvolvimento que troca módulo no meio da medição influencia. Enquanto
     * o gravador rodar contra o `vite dev`, a regra é: árvore parada.
     */
    throw new Error(
      `browser e node DIVERGEM — a fixture não é reproduzível fora do browser:\n` +
        divergentes.join("\n") +
        `\n\nANTES de procurar defeito na sim: alguém editou algo em \`src/\` ou no ` +
        `\`tuning.json\` enquanto isto gravava? O HMR do Vite troca o módulo na página ` +
        `no meio da run e produz exatamente este sintoma. Pare a árvore e regrave.`,
    )
  }
  console.log(
    `  browser e node batem em ${testemunhas.size} testemunhas · hash final ${finalHash}`,
  )
} finally {
  await d.close()
}
