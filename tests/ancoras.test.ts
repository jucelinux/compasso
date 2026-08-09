import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { projectRoot } from "../src/harness/loadTuning.ts"

/**
 * ÂNCORAS — a regra "número novo nasce ancorado" virada em trava. 08/08.
 *
 * O caso está no `tuning.anchors.json`. O resumo: `auraFocusHeal` = 9.0 foi
 * escolhido sem referência e saiu 27x mais fraco que ficar parado, e a mecânica
 * inteira ficou imperceptível por isso. A regra que teria impedido já existia,
 * em prosa, no `TASTE.md` §2a — e prosa não reprova nada.
 *
 * O que esta trava garante NÃO é que o número esteja certo. É que ele esteja
 * DECLARADO em relação a outro, e que mexer nele obrigue a dizer a nova relação.
 */

interface Ancora {
  readonly valor: string
  readonly ancora: string
  readonly fracao: number
  readonly porque: ReadonlyArray<string>
}

const json = (p: string): unknown =>
  JSON.parse(readFileSync(resolve(projectRoot, p), "utf8")) as unknown

const TUNING = json("tuning.json") as Record<string, unknown>
const ANCORAS = (json("tuning.anchors.json") as { ancoras: Ancora[] }).ancoras

/** Lê `a.b.c` dentro do tuning; devolve `undefined` se o caminho não existir. */
function at(path: string): number | undefined {
  let cur: unknown = TUNING
  for (const key of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === "number" ? cur : undefined
}

/*
 * Tolerância relativa. Não é zero de propósito: a fração é escrita à mão num
 * JSON e 9/245 não tem representação exata curta. Larga o bastante para não
 * brigar com arredondamento, apertada o bastante para reprovar qualquer mudança
 * de verdade — a menor que já importou aqui foi de 4x.
 */
const TOL = 1e-6

describe("âncoras do tuning", () => {
  it("todo caminho declarado existe no tuning.json", () => {
    // Âncora apontando para caminho morto é a trava se auto-aprovando: `at()`
    // devolveria undefined e a comparação nunca aconteceria.
    for (const a of ANCORAS) {
      expect(at(a.valor), `valor inexistente: ${a.valor}`).toBeTypeOf("number")
      expect(at(a.ancora), `âncora inexistente: ${a.ancora}`).toBeTypeOf("number")
    }
  })

  it("cada valor ancorado é a fração declarada da sua âncora", () => {
    for (const a of ANCORAS) {
      const valor = at(a.valor)!
      const ancora = at(a.ancora)!
      const esperado = ancora * a.fracao
      expect(
        Math.abs(valor - esperado) / Math.max(1e-9, Math.abs(esperado)),
        `${a.valor} = ${valor}, mas ${a.fracao} × ${a.ancora} (${ancora}) = ${esperado}. ` +
          `Mudou o número? Então diga a nova fração em tuning.anchors.json.`,
      ).toBeLessThan(TOL)
    }
  })

  it("toda âncora explica por quê, e não em uma linha vazia", () => {
    // O valor da lista é o porquê. Sem ele isto vira uma tabela de razões
    // aritméticas que ninguém sabe reabrir — que é o estado de que ela nasceu.
    for (const a of ANCORAS) {
      expect(a.porque.length, `${a.valor} sem justificativa`).toBeGreaterThan(0)
      expect(a.porque.join(" ").length, `${a.valor} com justificativa vazia`).toBeGreaterThan(40)
    }
  })

  it("o caso nulo: a trava reprova uma fração errada", () => {
    /*
     * `TASTE-LOOP.md` §2: instrumento novo passa pelo caso nulo antes de ser
     * acreditado. Sem isto, um `at()` quebrado devolvendo undefined para tudo
     * faria este arquivo passar verde sem comparar nada — e a lição do `olho.ts`
     * em 04/08 é que o instrumento erra na direção de APROVAR.
     */
    const a = ANCORAS[0]!
    const valor = at(a.valor)!
    const ancora = at(a.ancora)!
    const fracaoErrada = a.fracao * 2
    const esperado = ancora * fracaoErrada
    const desvio = Math.abs(valor - esperado) / Math.abs(esperado)
    expect(desvio, "dobrar a fração passaria despercebido").toBeGreaterThan(TOL)
  })

  it("a lista não está vazia", () => {
    expect(ANCORAS.length).toBeGreaterThan(0)
  })
})
