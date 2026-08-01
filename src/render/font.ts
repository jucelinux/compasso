import { makeBuf, plot, type Buf } from "./pixelbuf.ts"

/**
 * Fonte bitmap 5x7.
 *
 * Existe porque `Text` do Pixi rasteriza uma webfont com antialias, e uma única
 * legenda borrada desmancha a leitura de pixel do resto da tela. Aqui cada letra
 * é uma matriz — cai exatamente na grade, em qualquer escala inteira.
 *
 * Acento não é glifo próprio: é uma sobreposição de 2 linhas colada em cima da
 * letra base. Onze acentuadas saem de três marcas, em vez de onze desenhos.
 * A célula final tem 11 linhas: 2 de acento, 7 de corpo, 2 de cedilha.
 *
 * O HUD é todo em caixa alta de propósito — além de ser o costume do console,
 * poupa 26 glifos que não acrescentariam leitura nenhuma.
 */

export const GLYPH_W = 5
export const BODY_H = 7
export const CELL_H = 11
/** Onde o corpo começa dentro da célula. Acento ocupa as duas linhas de cima. */
export const BASE_Y = 2

type Rows = readonly [string, string, string, string, string, string, string]

const G: Readonly<Record<string, Rows>> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "####.", "#...#", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "####.", "#....", "#....", "#....", "#####"],
  F: ["#####", "#....", "####.", "#....", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#..##", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#####", "#...#", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#...#", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "#...#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  "·": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
}

/** Marcas de acento: 2 linhas, coladas acima do corpo. */
const ACCENT: Readonly<Record<string, readonly [string, string]>> = {
  acute: ["...#.", "..#.."],
  circ: ["..#..", ".#.#."],
  tilde: [".##.#", "#..##"],
}
/** Cedilha: 2 linhas, coladas abaixo do corpo. */
const CEDILLA: readonly [string, string] = ["..#..", ".##.."]

interface Composed {
  readonly base: string
  readonly accent?: keyof typeof ACCENT
  readonly cedilla?: boolean
}

const ACCENTED: Readonly<Record<string, Composed>> = {
  Á: { base: "A", accent: "acute" },
  Â: { base: "A", accent: "circ" },
  Ã: { base: "A", accent: "tilde" },
  É: { base: "E", accent: "acute" },
  Ê: { base: "E", accent: "circ" },
  Í: { base: "I", accent: "acute" },
  Ó: { base: "O", accent: "acute" },
  Ô: { base: "O", accent: "circ" },
  Õ: { base: "O", accent: "tilde" },
  Ú: { base: "U", accent: "acute" },
  Ç: { base: "C", cedilla: true },
}

/**
 * Desenha um glifo num buffer novo. `null` para caractere sem desenho — quem
 * chama trata como espaço, então texto novo nunca quebra o render.
 */
export function glyphBuf(ch: string, idx: number): Buf | null {
  const composed = ACCENTED[ch]
  const rows = G[composed?.base ?? ch]
  if (rows === undefined) return null

  const b = makeBuf(GLYPH_W, CELL_H)
  for (let y = 0; y < BODY_H; y++) {
    const row = rows[y]!
    for (let x = 0; x < GLYPH_W; x++) if (row[x] === "#") plot(b, x, BASE_Y + y, idx)
  }
  if (composed?.accent !== undefined) {
    const mark = ACCENT[composed.accent]!
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < GLYPH_W; x++) if (mark[y]![x] === "#") plot(b, x, y, idx)
    }
  }
  if (composed?.cedilla === true) {
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (CEDILLA[y]![x] === "#") plot(b, x, BASE_Y + BODY_H + y, idx)
      }
    }
  }
  return b
}

/** Todo caractere que a fonte sabe desenhar. O teste usa para varrer o conjunto. */
export function knownChars(): ReadonlyArray<string> {
  return [...Object.keys(G), ...Object.keys(ACCENTED)]
}

/** As matrizes cruas, para o teste conferir dimensão sem reimplementar o desenho. */
export function rawRows(): ReadonlyArray<Rows> {
  return Object.values(G)
}

/** Largura em pixels de uma linha, com 1px de espaço entre letras. */
export function textWidth(s: string): number {
  return s.length === 0 ? 0 : s.length * (GLYPH_W + 1) - 1
}
