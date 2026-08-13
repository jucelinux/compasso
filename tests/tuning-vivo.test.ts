import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { projectRoot } from "../src/harness/loadTuning.ts"

/**
 * TODO NÚMERO DO TUNING TEM QUE SER LIDO POR ALGUÉM. 13/08.
 *
 * O caso: `field.sourceRate` passou onze dias no `tuning.json`, no `types.ts` e
 * no `tuning.anchors.json` sem ser lido por uma linha de `src/`. Ele foi
 * substituído em 02/08 pelo `poison` por espécie e ninguém o removeu — e a
 * entrada da âncora ainda afirmava que os dois "alimentam a mesma pia", o que o
 * fazia parecer vivo.
 *
 * O custo não é o byte morto. É que ele foi o primeiro candidato óbvio quando o
 * H pediu para baixar a pressão da doença: mexer nele daria ZERO efeito com
 * aparência de decisão tomada. É a mesma classe de defeito de 02/08 — trocar
 * `sourceRate` por `poison` achando que só mudava de lugar — e ela custou uma
 * sessão inteira de balanço naquele dia.
 *
 * Esta é a irmã do `montagem.test.ts`, que garante que toda folha assada em
 * `sprites.ts` seja referenciada por `atlas.ts`. Lá a pergunta é "isso chega na
 * tela?"; aqui é "isso chega na sim?". As duas são contra AUSÊNCIA, que o
 * `TASTE.md` §2b registra como o que o olhar não pega — captura não mostra o
 * que não foi desenhado, e teste verde não denuncia o número que ninguém leu.
 *
 * O que ela NÃO garante: que o número esteja certo, nem que o caminho lido seja
 * o que o nome sugere. Garante que existe pelo menos um leitor.
 */

const SRC = resolve(projectRoot, "src")

/**
 * `types.ts` fica DE FORA da varredura, e isto é a trava funcionando.
 *
 * A primeira versão incluía tudo em `src/` e aprovava o `sourceRate` — o caso
 * que ela existe para pegar. A declaração do campo no tipo casava com o nome, e
 * declarar não é ler: um número pode ter interface, documentação e âncora, e
 * mesmo assim não entrar em conta nenhuma. Foi exatamente essa a situação.
 *
 * A lição é a de 04/08 sobre o `npm run olho`: instrumento novo se verifica
 * contra um caso onde a resposta já é conhecida, antes de acreditar nele. Aqui
 * o caso conhecido era o `sourceRate`, e a primeira versão passou verde.
 */
const IGNORA = new Set([resolve(SRC, "sim", "types.ts")])

/**
 * COMENTÁRIO NÃO É LEITURA, e esta foi a segunda vez que a trava se enganou.
 *
 * Sem tirar os comentários, `spawnTable` passava por viva — a sim tem um
 * parágrafo explicando que ela MORREU em 02/08, e a menção do obituário casava
 * com o nome. Uma trava contra ausência que aceita prosa como prova aprova
 * exatamente o caso que ela persegue: número morto costuma vir acompanhado de
 * um comentário dizendo que morreu.
 *
 * Este arquivo já registrou a mesma lição uma vez, cinco parágrafos acima, com o
 * `types.ts`. Foram DOIS falsos negativos na mesma tarde, e nos dois a prova
 * falsa era texto sobre o número em vez de uso do número.
 */
const semComentarios = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1")

function todosOsFontes(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = resolve(dir, nome)
    if (statSync(p).isDirectory()) todosOsFontes(p, out)
    else if (nome.endsWith(".ts") && !IGNORA.has(p)) out.push(semComentarios(readFileSync(p, "utf8")))
  }
  return out
}

const FONTES = todosOsFontes(SRC).join("\n")

/**
 * Nomes que são DADO, não configuração — não se espera leitor por nome.
 *
 * As espécies são chaves de um mapa consultado por variável (`kindOf(e.kind)`),
 * e as fases são um array percorrido por índice. Cobrar leitor nominal delas
 * seria cobrar que a sim mencione "salmonela" em algum lugar, que é exatamente
 * o contrário do desenho de 02/08 — uma fase é UMA doença, e qual é vem do
 * tuning.
 */
/**
 * DORMENTE POR DECISÃO — não lido hoje, e isso está escrito em algum lugar.
 *
 * A diferença entre isto e número morto é só uma: alguém decidiu. Uma lista
 * assim vira lixeira se as entradas não vierem com o porquê e a data, então
 * cada uma tem os dois, e a próxima sessão pode cobrar.
 */
const DORMENTE = new Map<string, string>([
  [
    "buildSlots",
    "13/08: a tela de recompensa saiu e nada mais preenche o build. O mecanismo de " +
      "poderes ficou inteiro de propósito; o número fica junto porque ele foi MEDIDO " +
      "(a run de 353s do H) e apagá-lo perderia essa medição.",
  ],
  [
    "spawnTable",
    "02/08: a fase virou UMA doença e a tabela de mistura morreu. O comentário em " +
      "`types.ts` diz que ela fica porque os replays de 31/07 e 01/08 carregam o hash " +
      "do tuning inteiro. Esse motivo hoje é frágil — aqueles replays já divergem de " +
      "tuningHash e o teste trata isso como AVISO. Candidata a remoção, chamada do H.",
  ],
  ["fromWave", "campo da `spawnTable`, acima."],
  ["weights", "campo da `spawnTable`, acima."],
])

const DADO = new Set([
  "_",
  "influenza",
  "ecoli",
  "ecoli_filha",
  "estafilo",
  "salmonela",
  "corona",
  "real",
  "form",
  "palette",
  "disease",
])

function chaves(valor: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(valor)) {
    for (const v of valor) chaves(v, acc)
    return acc
  }
  if (typeof valor !== "object" || valor === null) return acc
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!DADO.has(k)) acc.add(k)
    chaves(v, acc)
  }
  return acc
}

const TUNING = JSON.parse(readFileSync(resolve(projectRoot, "tuning.json"), "utf8")) as unknown

describe("o tuning está vivo", () => {
  it("todo nome do tuning.json é lido por alguma linha de src/", () => {
    const mortos: string[] = []
    for (const chave of chaves(TUNING)) {
      if (DORMENTE.has(chave)) continue
      // Palavra inteira: `seeds` não pode ser dado por vivo por causa de
      // `seedsPerWave`, senão a trava aprova justamente o caso que ela caça.
      const re = new RegExp(`\\b${chave}\\b`)
      if (!re.test(FONTES)) mortos.push(chave)
    }
    expect(
      mortos,
      `números de tuning que NENHUMA linha de src/ lê. Ou some com eles, ou ligue-os ` +
        `— número morto no arquivo que governa o jogo é pior que número errado, porque ` +
        `mexer nele parece decisão e não faz nada. Foi assim com \`sourceRate\`, 02/08 a 13/08.`,
    ).toEqual([])
  })

  it("e todo caminho declarado nas ÂNCORAS aponta para um número vivo", () => {
    /*
     * A âncora do `sourceRate` era o que mais o fazia parecer vivo: um documento
     * explicando com cuidado a relação dele com o `poison`. Documentação sobre
     * peça morta é pior que ausência de documentação — ela convence.
     */
    const anchors = JSON.parse(
      readFileSync(resolve(projectRoot, "tuning.anchors.json"), "utf8"),
    ) as { ancoras: ReadonlyArray<{ valor: string; ancora: string }> }
    const mortos: string[] = []
    for (const a of anchors.ancoras) {
      for (const caminho of [a.valor, a.ancora]) {
        const folha = caminho.split(".").filter((p) => !/^\d+$/.test(p)).pop()
        if (folha === undefined || DADO.has(folha)) continue
        if (!new RegExp(`\\b${folha}\\b`).test(FONTES)) mortos.push(caminho)
      }
    }
    expect(mortos, "âncora que descreve um número que a sim não lê").toEqual([])
  })
})

describe("os dormentes estão declarados, não esquecidos", () => {
  it("todo nome na lista de dormentes ainda EXISTE no tuning.json", () => {
    /*
     * A lista de exceções é o lugar onde uma trava apodrece. Sem isto, um nome
     * removido do tuning continuaria dispensado aqui para sempre, e a próxima
     * chave a cair na mesma armadilha passaria escondida atrás dele.
     */
    const presentes = chaves(TUNING)
    const fantasmas = [...DORMENTE.keys()].filter((k) => !presentes.has(k))
    expect(fantasmas, "dormente que já não está no tuning — tire da lista").toEqual([])
  })

  it("e nenhum dormente voltou a ser lido sem sair da lista", () => {
    const vivos = [...DORMENTE.keys()].filter((k) => new RegExp(`\\b${k}\\b`).test(FONTES))
    expect(
      vivos,
      "isto voltou a ser lido por src/ — tire da lista de dormentes, senão ela vira " +
        "documentação errada sobre o que o jogo faz",
    ).toEqual([])
  })
})
