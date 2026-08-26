import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { drive, type Driver } from "./drive.ts"
import { loadTuning, projectRoot } from "./loadTuning.ts"

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
  const fase = async (): Promise<string> =>
    (await d.page.locator("#hud").textContent())?.match(/phase (\w+)/)?.[1] ?? "?"

  /*
   * DISPENSA O CARD antes de qualquer captura — e isto é conserto, não passo
   * novo.
   *
   * A run abre na apresentação da doença desde 02/08, e nada aqui a dispensava:
   * as setas não dispensam card. As duas primeiras capturas vinham mostrando a
   * MESMA tela de identidade, com os nomes "parada" e "a toda" mentindo sobre o
   * conteúdo — exatamente o defeito que o comentário da captura de morte, logo
   * abaixo, existe para não deixar acontecer. Passou dez dias porque ninguém
   * comparou o arquivo com o nome dele.
   *
   * Achado em 13/08, olhando as capturas do respiro: o pano de fundo escuro que
   * eu tomei por "HUD apagado" era o VÉU do card, e o véu não deveria estar ali.
   */
  /*
   * O CÉREBRO e a ESCOLHA, capturados antes de sair deles.
   *
   * O jogo nasce no cérebro desde 13/08, e até esta linha o único olho do
   * projeto atravessava a porta de entrada sem olhar para ela. Tudo o que só
   * existe ali — a multidão de neurônios, o chão acinzentado, os sinais
   * percorrendo as sinapses, a órbita dos patógenos — não tinha nenhuma forma
   * de ser lido, e trabalho visual sem captura é trabalho sem verificação.
   *
   * A do cérebro espera meio segundo: os sinais percorrem as sinapses, e o
   * primeiro quadro pega todos eles ainda no ponto de partida.
   */
  await d.page.waitForTimeout(500)
  await d.shot(resolve(dir, "0-cerebro.png"))

  /*
   * As QUATRO PORTAS novas, uma captura cada — 13/08.
   *
   * Elas são telas inteiras que nenhum teste alcança e que nada mais mostra.
   * Sem isto, a única prova de que abrem seria o `phase` no HUD, e `phase` não
   * diz se o painel saiu legível, se o [X] está no canto ou se o texto coube.
   *
   * Abrir por CLIQUE de propósito: é o gesto novo do dia, e capturar por ele
   * prova o caminho inteiro — evento do browser, coordenada de arena, borda na
   * sim, tela na tela. Fecha pelo [X], que é o outro caminho novo, para que os
   * dois estejam cobertos por olho e não só por teste.
   */
  for (const n of HUB.nodes) {
    await d.clicaArena(n.x, n.y)
    await d.page.waitForTimeout(220)
    if ((await fase()) !== "painel") throw new Error(`porta "${n.id}" não abriu no clique`)
    await d.shot(resolve(dir, `0c-${n.id}.png`))
    // O [X] fica no canto superior direito do quadro centrado.
    const px = (640 + HUB.panelW) / 2 - HUB.closeSize / 2
    const py = (360 - HUB.panelH) / 2 + HUB.closeSize / 2
    await d.clicaArena(px, py)
    await d.page.waitForTimeout(220)
    if ((await fase()) !== "hub") throw new Error(`porta "${n.id}" não fechou no [X]`)
  }

  let tentativas = 0
  let viuSelecao = false
  while ((await fase()) !== "run" && tentativas < 40) {
    if (!viuSelecao && (await fase()) === "select") {
      viuSelecao = true
      await d.shot(resolve(dir, "0b-selecao.png"))
    }
    await atravessaTela(d, fase)
    tentativas++
  }
  if ((await fase()) !== "run") throw new Error("não saiu do card — as capturas mentiriam")
  // Freia até parar de verdade: `1-parada` promete a célula em repouso, e o
  // arranque do card ainda escorre por alguns quadros.
  await d.page.waitForTimeout(900)
  await d.shot(resolve(dir, "1-parada.png"))

  /*
   * A CÂMERA LENTA não é capturada aqui, e a ausência é decisão.
   *
   * Ver a moldura exige a adrenalina COMPRADA, e comprar exige 500 de memória —
   * que este passeio não junta. Apertar "1" sem ter a habilidade não faz nada, e
   * a captura sairia com o nome `camera-lenta` mostrando uma run comum: o
   * artefato de nome mentiroso que este arquivo existe para não produzir.
   *
   * Ela foi conferida OLHANDO em 14/08, com uma concessão temporária no estado
   * inicial da sim, capturada e revertida no mesmo passo — o mesmo caminho que
   * o HUD das habilidades usou em 13/08. Quando o banco atravessar sessões, ou
   * quando houver um jeito honesto de plantar a compra, isto vira captura fixa.
   */
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

  /*
   * O laço tolera o INTERVALO, e aproveita para capturá-lo.
   *
   * Até 13/08 ele saía em qualquer fase que não fosse `run` e o `throw` logo
   * abaixo acusava "não morreu" — o mesmo defeito que o gravador teve quando a
   * necrose fez o passeio começar a CONTER ondas: sintoma apontando para o
   * lugar errado. Aqui a diferença é que sair cedo faz a captura de morte
   * mentir, e captura com nome mentiroso é o que este arquivo existe para não
   * produzir.
   *
   * A captura do respiro é BEST-EFFORT de propósito: ela só existe se o passeio
   * contiver uma onda, e conter depende da seed. Prometer uma tela que pode não
   * acontecer seria a mesma mentira ao contrário — então o script diz quando
   * não conseguiu, em vez de falhar ou de calar.
   */
  let n = 0
  let viuIntervalo = false
  let f = await fase()
  while (n < 4 * 40 && f !== "dead") {
    if (f === "intervalo") {
      if (!viuIntervalo) {
        viuIntervalo = true
        await d.shot(resolve(dir, "4-intervalo.png"))
      }
      await d.page.waitForTimeout(250)
      f = await fase()
      continue
    }
    if (f !== "run") {
      // `card` e `closed` pedem tecla, o `hub` pede ANDAR. Sem isto o laço gira
      // até o teto e a captura de morte mente dizendo que a run não morreu.
      await atravessaTela(d, fase)
      f = await fase()
      continue
    }
    const [keys, ms] = passo[n % passo.length]!
    await d.hold(keys, ms)
    n++
    f = await fase()
  }
  if (f !== "dead") throw new Error(`não morreu (parou em "${f}") — a captura de morte mentiria`)
  await d.page.waitForTimeout(600)
  await d.shot(resolve(dir, "3-morte.png"))

  /*
   * O HISTÓRICO CHEIO, e ele só existe aqui.
   *
   * A captura das quatro portas acontece antes de qualquer run, então a tela
   * sai com "nenhuma run ainda" — que é um estado real e vale ser visto, mas
   * não é o arranjo que precisa ser conferido. A lista de runs tem outro
   * arranjo (linhas iguais, sem destaque), e o único jeito de vê-la é morrer
   * primeiro. É o que este bloco faz, e é por isso que ele vem depois da morte.
   */
  let volta = 0
  while ((await fase()) === "dead" && volta++ < 40) await d.hold(["KeyR"], 120)
  if ((await fase()) === "hub") {
    const h = HUB.nodes.find((n) => n.id === "historico")
    if (h !== undefined) {
      await d.clicaArena(h.x, h.y)
      await d.page.waitForTimeout(220)
      if ((await fase()) === "painel") await d.shot(resolve(dir, "5-historico-cheio.png"))
    }
  }

  /*
   * A FAIXA DE RETOMADA, e ela também só existe DEPOIS de morrer.
   *
   * Ela aparece quando o recorde passa de 1, e o recorde só sobe alcançando uma
   * onda — então na primeira visita à seleção não há o que capturar. Mesma razão
   * do histórico cheio, logo acima: conferir uma fileira de escolhas com uma
   * escolha só é conferir nada.
   */
  let viuRetomar = false
  // Fecha o painel do histórico, que ficou aberto no bloco acima.
  if ((await fase()) === "painel") await d.hold(["KeyR"], 120)
  if ((await fase()) === "hub") {
    await d.clicaArena(HUB.orbitX, HUB.orbitY)
    await d.page.waitForTimeout(220)
    if ((await fase()) === "select") {
      await d.shot(resolve(dir, "9-retomar.png"))
      viuRetomar = true
    }
  }

  console.log(`capturas em ${dir}`)
  console.log(
    viuIntervalo
      ? "  respiro capturado em 4-intervalo.png"
      : "  SEM respiro nesta seed: o passeio não conteve nenhuma onda",
  )
  /*
   * A faixa de retomada é BEST-EFFORT pela mesma razão do respiro: ela só
   * aparece com o recorde acima de 1, e o recorde só sobe alcançando a onda 2.
   * Este passeio morre na onda 1 na maioria das seeds — e prometer uma tela que
   * pode não acontecer é a mentira ao contrário.
   */
  console.log(
    viuRetomar
      ? "  seleção capturada em 9-retomar.png"
      : "  SEM faixa de retomada: o passeio não passou da onda 1",
  )
  if (d.errors.length > 0) console.error(`ERROS NO BROWSER:\n${d.errors.join("\n")}`)
  else console.log("nenhum erro de browser")
} finally {
  await d.close()
}
