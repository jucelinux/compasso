import { describe, expect, it } from "vitest"
import { DEAD_ZONE, stickBits } from "../src/input/touch.ts"
import { knownChars } from "../src/render/font.ts"

/*
 * O manche não dá para testar por captura — não tem pixel. O que dá para
 * travar é a única parte que decide alguma coisa: vetor do dedo → as quatro
 * booleanas. Um erro aqui não aparece como erro, aparece como "o jogo anda
 * torto no iPad", que é diagnóstico que custa uma sessão inteira.
 */
describe("manche de toque", () => {
  it("dentro da zona morta o jogador fica PARADO", () => {
    // Não é conforto: ficar parado é o que segura o mundo em `time.creep`.
    for (const [dx, dy] of [
      [0, 0],
      [DEAD_ZONE - 1, 0],
      [0, -(DEAD_ZONE - 1)],
      [10, 10],
    ] as const) {
      const b = stickBits(dx, dy)
      expect(b.up || b.down || b.left || b.right, `${dx},${dy}`).toBe(false)
    }
  })

  it("as quatro cardeais saem puras, sem vizinho grudado", () => {
    const r = 60
    expect(stickBits(r, 0)).toEqual({ right: true, down: false, left: false, up: false })
    expect(stickBits(-r, 0)).toEqual({ right: false, down: false, left: true, up: false })
    // y cresce para BAIXO na tela: positivo é `down`.
    expect(stickBits(0, r)).toEqual({ right: false, down: true, left: false, up: false })
    expect(stickBits(0, -r)).toEqual({ right: false, down: false, left: false, up: true })
  })

  it("as quatro diagonais acendem exatamente dois eixos", () => {
    const d = 45
    expect(stickBits(d, d)).toEqual({ right: true, down: true, left: false, up: false })
    expect(stickBits(-d, d)).toEqual({ right: false, down: true, left: true, up: false })
    expect(stickBits(-d, -d)).toEqual({ right: false, down: false, left: true, up: true })
    expect(stickBits(d, -d)).toEqual({ right: true, down: false, left: false, up: true })
  })

  it("nunca acende eixos OPOSTOS, em volta inteira", () => {
    // Um `left` com `right` no mesmo tick se cancela na sim e o jogador para
    // sozinho no meio do gesto. Volta completa, de grau em grau.
    for (let deg = 0; deg < 360; deg++) {
      const a = (deg * Math.PI) / 180
      const b = stickBits(Math.cos(a) * 50, Math.sin(a) * 50)
      expect(b.left && b.right, `${deg}°`).toBe(false)
      expect(b.up && b.down, `${deg}°`).toBe(false)
      const acesos = [b.up, b.down, b.left, b.right].filter(Boolean).length
      // Fora da zona morta há SEMPRE direção, e ela é uma das 8.
      expect(acesos, `${deg}°`).toBeGreaterThanOrEqual(1)
      expect(acesos, `${deg}°`).toBeLessThanOrEqual(2)
    }
  })

  it("as 8 direções são todas alcançáveis", () => {
    const vistas = new Set<string>()
    for (let deg = 0; deg < 360; deg++) {
      const a = (deg * Math.PI) / 180
      const b = stickBits(Math.cos(a) * 50, Math.sin(a) * 50)
      vistas.add(`${+b.up}${+b.down}${+b.left}${+b.right}`)
    }
    expect(vistas.size).toBe(8)
  })
})

/*
 * A trava contra o defeito de 02/08: "glifo inexistente descartado em
 * silêncio". A fonte é bitmap e desenha só o que tem assado — uma instrução
 * com uma letra faltando não quebra nada, apenas sai errada na tela, e nenhum
 * teste de lógica nota.
 */
describe("instruções de toque", () => {
  it("toda letra existe na fonte bitmap", () => {
    const conhecidos = new Set(knownChars())
    const linhas = [
      "TOQUE PRA COMEÇAR",
      "ARRASTE ESCOLHE · TOQUE CONFIRMA",
      "TOQUE PRA PRÓXIMA DOENÇA",
      "TOQUE PRA OUTRA",
    ]
    for (const linha of linhas) {
      for (const ch of linha) {
        expect(conhecidos.has(ch), `"${ch}" de "${linha}"`).toBe(true)
      }
    }
  })
})
