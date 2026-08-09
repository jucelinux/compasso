import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { projectRoot } from "../src/harness/loadTuning.ts"

/**
 * TRAVAS DE MONTAGEM — contra AUSÊNCIA, 08/08.
 *
 * Olhar pega o que está ERRADO; não pega o que está AUSENTE. Está no
 * `TASTE.md` §2b com dois casos: o `frontSprite`, uma camada inteira assada e
 * atualizada 60x por segundo que nunca foi posta em cena — e a captura a
 * aprovou, porque coisa que não aparece não deixa rastro numa imagem; e o
 * `organSheet`, seis quadros de 58x58 exportados e nunca assados por ninguém,
 * achado pelo `npm run olho` em 04/08 e ainda vivo hoje.
 *
 * Contra ausência a verificação não é olhar, é CONTAR: reler a lista de
 * montagem e travar que o que é produzido chega ao destino.
 *
 * ── O QUE ESTA TRAVA NÃO PEGA, dito antes de alguém confiar nela ──
 *
 * Ela cobre a primeira costura: produtor em `sprites.ts` → montagem em
 * `atlas.ts`. Pega o `organSheet`. **NÃO pega o `frontSprite`**, porque aquele
 * ERA referenciado — ele existia, era atualizado, e só não entrava na cena. Para
 * essa classe é preciso ler a SAÍDA, decodificando o PNG da captura, e isso é
 * peça própria, ainda não construída (`BACKLOG.md`).
 *
 * Instrumento que promete mais do que cobre é o defeito do `olho.ts` de 04/08
 * outra vez, então o limite fica escrito aqui e não numa mensagem de commit.
 */

const src = (p: string): string => readFileSync(resolve(projectRoot, p), "utf8")

const SPRITES = src("src/render/sprites.ts")
const ATLAS = src("src/render/atlas.ts")

/** Nome de toda função exportada por `sprites.ts` que produz pixel. */
function produtores(): string[] {
  const nomes: string[] = []
  for (const m of SPRITES.matchAll(/^export function (\w+)\s*\(/gm)) {
    const nome = m[1]!
    // `sheetIndex` é aritmética de índice, não produz buffer nenhum.
    if (nome === "sheetIndex") continue
    nomes.push(nome)
  }
  return nomes.sort()
}

/**
 * Produtores que existem de propósito sem entrar no atlas.
 *
 * A lista tem que ficar VAZIA ou justificada linha a linha. Ela é a válvula que
 * impede a trava de virar mentira conveniente: acrescentar um nome aqui é uma
 * decisão declarada, não um silêncio.
 */
const NAO_MONTADOS: ReadonlyArray<readonly [string, string]> = [
  // Vazia desde 08/08. O `organSheet` esteve aqui por algumas horas e foi APAGADO:
  // desenhava a célula discreta com trincas por dano, e a decisão de 01/08
  // aposentou o organismo discreto. Dispensa é para o que fica de propósito, não
  // para o que ninguém teve coragem de apagar — o git guarda o desenho.
]

describe("montagem: o que é assado chega ao atlas", () => {
  it("todo produtor de `sprites.ts` é referenciado por `atlas.ts`", () => {
    const dispensados = new Set(NAO_MONTADOS.map(([nome]) => nome))
    const ausentes = produtores().filter(
      (nome) => !dispensados.has(nome) && !new RegExp(`\\b${nome}\\b`).test(ATLAS),
    )
    expect(
      ausentes,
      "assado por ninguém: ou monte, ou apague, ou declare em NAO_MONTADOS com o motivo",
    ).toEqual([])
  })

  it("a lista de dispensa não guarda nome que já voltou a ser montado", () => {
    // Dispensa que virou mentira é pior que dispensa nenhuma: ela ensina a
    // ignorar a lista.
    const zumbis = NAO_MONTADOS.filter(([nome]) => new RegExp(`\\b${nome}\\b`).test(ATLAS))
    expect(zumbis.map(([n]) => n), "está montado e ainda consta como dispensado").toEqual([])
  })

  it("o caso nulo: a trava reprova um produtor inventado", () => {
    /*
     * Instrumento novo passa pelo caso nulo antes de ser acreditado
     * (`TASTE-LOOP.md` §2). O `olho.ts` nasceu com três defeitos que faziam ele
     * APROVAR o que existia para denunciar, e nenhum foi pego por leitura.
     *
     * Aqui a pergunta é: se um produtor NÃO estivesse no atlas, esta trava
     * acusaria? Sem isto, uma regex quebrada passa verde para sempre.
     */
    const inventado = "folhaQueNinguemAssa"
    expect(new RegExp(`\\b${inventado}\\b`).test(ATLAS)).toBe(false)

    const comInventado = [...produtores(), inventado]
    const ausentes = comInventado.filter((nome) => !new RegExp(`\\b${nome}\\b`).test(ATLAS))
    expect(ausentes, "a trava não acusaria um produtor ausente").toContain(inventado)
  })

  it("a extração de produtores não voltou vazia — a regex ainda casa", () => {
    // Segundo caso nulo, e o mais barato: uma trava que não encontra NADA para
    // conferir passa verde sem conferir coisa nenhuma. Já aconteceu neste
    // projeto com uma medição que media o fundo.
    expect(produtores().length).toBeGreaterThan(8)
    expect(produtores()).toContain("playerSheet")
  })
})
