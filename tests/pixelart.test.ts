import { describe, expect, it } from "vitest"
import tuningJson from "../tuning.json"
import type { Tuning } from "../src/sim/types.ts"
import { PALETTE, cycledPalette } from "../src/render/palette.ts"
import { bayer, makeBuf, outline, toRGBA, type Buf } from "../src/render/pixelbuf.ts"
import { BODY_H, GLYPH_W, glyphBuf, knownChars, rawRows } from "../src/render/font.ts"
import {
  PLAYER_DIRS,
  PLAYER_PHASES,
  PLAYER_TIERS,
  organSheet,
  pathogenSheet,
  playerSheet,
  type Sheet,
} from "../src/render/sprites.ts"
import { layerBuf, plasmaBuf } from "../src/render/backdrop.ts"

const tuning = tuningJson as Tuning

/**
 * A arte roda sob teste porque o pipeline inteiro é DOM-free: tudo é matriz de
 * índice de paleta, e só a conversão final toca canvas. Isso troca "confio que
 * ficou certo" por afirmação verificável — que é a diferença entre acabamento e
 * primor técnico.
 */

const nonEmpty = (b: Buf): number => b.d.reduce((n, v) => n + (v === 0 ? 0 : 1), 0)
const distinct = (b: Buf): Set<number> => new Set(b.d)

const allSheets = (): ReadonlyArray<readonly [string, Sheet]> => [
  ["player", playerSheet(tuning.player.size)],
  ["organ", organSheet(tuning.cells.size, tuning.cells.hp)],
  ...Object.entries(tuning.enemy.kinds).map(
    ([kind, spec]) =>
      [kind, pathogenSheet(spec.form, tuning.enemy.size * spec.sizeScale)] as const,
  ),
]

describe("paleta travada", () => {
  it("todo pixel de todo sprite cai num índice existente da paleta", () => {
    for (const [name, sheet] of allSheets()) {
      for (const f of sheet.frames) {
        for (const idx of distinct(f)) {
          expect(PALETTE[idx], `${name} usou índice ${idx}`).toBeTypeOf("number")
        }
      }
    }
  })

  it("nenhum corpo passa do orçamento de tons — degradê tem que ser dither, não cor nova", () => {
    /*
     * Orçamento por sprite, não geral. O jogador carrega DUAS rampas de propósito
     * (corpo e ciano de velocidade) mais a do núcleo — é o único que tem direito,
     * porque é nele que a velocidade precisa ser lida. Todo o resto vive com uma
     * rampa e o contorno. Se um patógeno estourar 10 tons, alguém voltou a pintar
     * em cor contínua em vez de ditherizar.
     */
    for (const [name, sheet] of allSheets()) {
      const teto = name === "player" ? 14 : 10
      for (const f of sheet.frames) {
        const used = distinct(f)
        used.delete(0)
        expect(used.size, `${name} usou ${used.size} tons`).toBeLessThanOrEqual(teto)
      }
    }
  })

  it("o fundo cabe na mesma paleta", () => {
    for (const b of [
      plasmaBuf(64, 64),
      layerBuf(96, 96, "hemacias", 7),
      layerBuf(96, 96, "fibrina", 11),
      layerBuf(96, 96, "detritos", 13),
    ]) {
      for (const idx of distinct(b)) expect(PALETTE[idx]).toBeTypeOf("number")
    }
  })

  it("toRGBA recusa índice fora da paleta em vez de inventar cor", () => {
    const b = makeBuf(2, 2)
    b.d[0] = 250
    expect(() => toRGBA(b, PALETTE)).toThrow(/fora da paleta/)
  })

  it("a ciclagem de paleta permuta o plasma e não mexe no resto", () => {
    const p = cycledPalette(1)
    expect(p.length).toBe(PALETTE.length)
    expect(p[4]).toBe(PALETTE[5])
    expect(p[7]).toBe(PALETTE[4])
    // fora do anel do plasma, nada muda
    expect(p[16]).toBe(PALETTE[16])
    expect(cycledPalette(0)).toEqual([...PALETTE])
  })
})

describe("quadros de animação", () => {
  it("o jogador tem escalão × direção × fase, e nenhum quadro é igual ao vizinho", () => {
    const sh = playerSheet(tuning.player.size)
    expect(sh.tiers).toBe(PLAYER_TIERS)
    expect(sh.dirs).toBe(PLAYER_DIRS)
    expect(sh.phases).toBe(PLAYER_PHASES)
    expect(sh.frames.length).toBe(PLAYER_TIERS * PLAYER_DIRS * PLAYER_PHASES)

    // Se duas fases seguidas forem idênticas, não existe animação — existe uma
    // imagem parada assada N vezes. É exatamente o defeito de antes de 01/08.
    for (let t = 0; t < sh.tiers; t++) {
      for (let d = 0; d < sh.dirs; d++) {
        for (let p = 0; p < sh.phases; p++) {
          const a = sh.frames[(t * sh.dirs + d) * sh.phases + p]!
          const b = sh.frames[(t * sh.dirs + d) * sh.phases + ((p + 1) % sh.phases)]!
          expect(a.d).not.toEqual(b.d)
        }
      }
    }
  })

  it("cada direção do jogador desenha uma silhueta própria", () => {
    const sh = playerSheet(tuning.player.size)
    // no escalão 3 a deformação é máxima: oito direções, oito formas distintas
    const seen = new Set<string>()
    for (let d = 0; d < sh.dirs; d++) {
      seen.add(sh.frames[(3 * sh.dirs + d) * sh.phases]!.d.join(","))
    }
    expect(seen.size).toBe(sh.dirs)
  })

  it("todo patógeno do tuning tem folha animada e não sai vazio", () => {
    for (const [kind, spec] of Object.entries(tuning.enemy.kinds)) {
      const sh = pathogenSheet(spec.form, tuning.enemy.size * spec.sizeScale)
      expect(sh.dirs, kind).toBe(8)
      expect(sh.phases, kind).toBeGreaterThan(1)
      for (const f of sh.frames) expect(nonEmpty(f), kind).toBeGreaterThan(10)
    }
  })

  it("nenhuma fase é cópia de outra fase do mesmo ciclo", () => {
    /*
     * Comparar só quadros VIZINHOS não basta, e isso não é hipótese: a onda do
     * flagelo completava dois ciclos em seis fases, então 0 era igual a 3, 1 a 4
     * e 2 a 5. Metade dos quadros era cópia e a animação tinha metade da
     * suavidade que o número prometia. O respiro da célula do organismo tinha o
     * mesmo defeito. Aqui a comparação é de todos contra todos.
     */
    for (const [name, sheet] of allSheets()) {
      for (let t = 0; t < sheet.tiers; t++) {
        for (let d = 0; d < sheet.dirs; d++) {
          const seen = new Map<string, number>()
          for (let p = 0; p < sheet.phases; p++) {
            const key = sheet.frames[(t * sheet.dirs + d) * sheet.phases + p]!.d.join(",")
            const antes = seen.get(key)
            expect(antes, `${name}: fase ${p} é cópia da fase ${antes}`).toBeUndefined()
            seen.set(key, p)
          }
        }
      }
    }
  })

  it("o sprite cabe na própria moldura — nada encosta na borda", () => {
    for (const [name, sheet] of allSheets()) {
      for (const f of sheet.frames) {
        for (let x = 0; x < f.w; x++) {
          expect(f.d[x], `${name} vazou em cima`).toBe(0)
          expect(f.d[(f.h - 1) * f.w + x], `${name} vazou embaixo`).toBe(0)
        }
        for (let y = 0; y < f.h; y++) {
          expect(f.d[y * f.w], `${name} vazou à esquerda`).toBe(0)
          expect(f.d[y * f.w + f.w - 1], `${name} vazou à direita`).toBe(0)
        }
      }
    }
  })

  it("a silhueta redonda cabe na hitbox que a sim usa", () => {
    /*
     * O render não pode desenhar um bicho maior do que ele é. A colisão da sim é
     * um círculo de `enemy.size * sizeScale`; se o sprite estoura isso, o jogador
     * julga distância pelo que vê e erra — e neste jogo encostar é engolir ou
     * apanhar, então o erro custa vida.
     *
     * Influenza e corona estouravam em 40% e 50% quando isto foi escrito.
     * Bacilo e flagelado ficam de fora: bastão é comprido por definição, e
     * flagelo é apêndice de 1px, não corpo.
     */
    for (const [kind, spec] of Object.entries(tuning.enemy.kinds)) {
      if (spec.form === "bacilo" || spec.form === "flagelado") continue
      const nominal = tuning.enemy.size * spec.sizeScale
      const sh = pathogenSheet(spec.form, nominal)
      for (const f of sh.frames) {
        let x0 = f.w
        let x1 = -1
        let y0 = f.h
        let y1 = -1
        for (let y = 0; y < f.h; y++) {
          for (let x = 0; x < f.w; x++) {
            if (f.d[y * f.w + x] === 0) continue
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
        // +2 é o contorno de 1px de cada lado, que é leitura, não corpo.
        const largura = Math.max(x1 - x0 + 1, y1 - y0 + 1)
        expect(largura, `${kind} desenha ${largura}px para hitbox de ${nominal}px`).toBeLessThanOrEqual(
          Math.ceil(nominal) + 2,
        )
      }
    }
  })

  it("a célula do organismo tem um estado por ponto de vida", () => {
    const sh = organSheet(tuning.cells.size, tuning.cells.hp)
    expect(sh.tiers).toBe(tuning.cells.hp)
    expect(sh.frames[0]!.d).not.toEqual(sh.frames[sh.phases]!.d)
  })

  it("assar duas vezes dá exatamente a mesma arte", () => {
    // Sem isto, um `Math.random` esquecido faria o sprite mudar entre sessões e
    // nenhuma comparação de captura teria valor.
    const a = playerSheet(tuning.player.size)
    const b = playerSheet(tuning.player.size)
    for (let i = 0; i < a.frames.length; i++) expect(a.frames[i]!.d).toEqual(b.frames[i]!.d)
  })
})

describe("desenho de pixel", () => {
  it("o contorno fecha em volta do corpo e não invade o corpo", () => {
    const b = makeBuf(9, 9)
    b.d[4 * 9 + 4] = 20
    outline(b, 1)
    expect(b.d[4 * 9 + 4]).toBe(20)
    expect(b.d[3 * 9 + 4]).toBe(1)
    expect(b.d[4 * 9 + 3]).toBe(1)
    expect(b.d[3 * 9 + 3]).toBe(0) // diagonal não, senão o contorno engorda
  })

  it("o dither de Bayer distribui, em vez de cortar em bloco", () => {
    const counts = new Map<number, number>()
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = bayer(x, y)
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(16)
  })
})

describe("fonte bitmap", () => {
  it("toda matriz tem 7 linhas de 5 colunas", () => {
    for (const rows of rawRows()) {
      expect(rows.length).toBe(BODY_H)
      for (const r of rows) expect(r.length).toBe(GLYPH_W)
    }
  })

  it("desenha todo caractere que o HUD usa, acento incluído", () => {
    const usado = "ONDA MELHOR PATÓGENOS SEQUÊNCIA INFECÇÃO ORGANISMO CAIU VENCEU R PRA OUTRA 0123456789×·/"
    for (const ch of usado) {
      expect(glyphBuf(ch, 3), `sem glifo para "${ch}"`).not.toBeNull()
    }
  })

  it("caractere desconhecido devolve null em vez de quebrar o render", () => {
    expect(glyphBuf("€", 3)).toBeNull()
  })

  it("acentuada difere da base, e a cedilha desce abaixo do corpo", () => {
    expect(glyphBuf("Ó", 3)!.d).not.toEqual(glyphBuf("O", 3)!.d)
    const c = glyphBuf("Ç", 3)!
    const abaixo = c.d.slice((2 + BODY_H) * GLYPH_W)
    expect(abaixo.some((v) => v !== 0)).toBe(true)
  })

  it("todo glifo conhecido cabe na célula", () => {
    for (const ch of knownChars()) {
      const b = glyphBuf(ch, 3)
      expect(b, ch).not.toBeNull()
      expect(b!.w).toBe(GLYPH_W)
    }
  })
})
