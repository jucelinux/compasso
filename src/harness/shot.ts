import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { drive, type Driver } from "./drive.ts"
import { projectRoot } from "./loadTuning.ts"

/**
 * Atravessa a tela em que o jogo está, seja ela qual for.
 *
 * Deixou de ser "aperte espaço" em 13/08: o cérebro virou navegável, e sair
 * dele exige ANDAR até a órbita dos patógenos. O aparelho passa a pilotar o
 * glóbulo, que é o mesmo que o jogador faz — qualquer atalho aqui faria o rig
 * medir um caminho que ninguém percorre.
 *
 * A órbita fica no centro-baixo da arena e o jogador nasce logo abaixo dela,
 * então segurar CIMA basta. Fica escrito porque a posição vem do `tuning.hub`,
 * e mudar o centro da órbita mexe nisto.
 */
async function atravessaTela(d: Driver, fase: () => Promise<string>): Promise<void> {
  const f = await fase()
  if (f === "hub") await d.hold(["ArrowUp"], 220)
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
    (await d.page.locator("#hud").textContent())?.match(/fase (\w+)/)?.[1] ?? "?"

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

  console.log(`capturas em ${dir}`)
  console.log(
    viuIntervalo
      ? "  respiro capturado em 4-intervalo.png"
      : "  SEM respiro nesta seed: o passeio não conteve nenhuma onda",
  )
  if (d.errors.length > 0) console.error(`ERROS NO BROWSER:\n${d.errors.join("\n")}`)
  else console.log("nenhum erro de browser")
} finally {
  await d.close()
}
