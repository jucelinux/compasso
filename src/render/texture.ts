import { Rectangle, Texture } from "pixi.js"
import { PALETTE } from "./palette.ts"
import { toRGBA, type Buf } from "./pixelbuf.ts"

/**
 * Único ponto do render que toca DOM na hora de assar arte. Fica isolado aqui de
 * propósito: `pixelbuf.ts` e todos os desenhistas rodam headless sob teste, e só
 * este arquivo precisa de canvas.
 */
export function toTexture(b: Buf, palette: ReadonlyArray<number> = PALETTE): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = b.w
  canvas.height = b.h
  const c = canvas.getContext("2d")
  if (c === null) throw new Error("canvas 2d indisponível")
  const img = c.createImageData(b.w, b.h)
  img.data.set(toRGBA(b, palette))
  c.putImageData(img, 0, 0)
  const tex = Texture.from(canvas)
  // Sem isto o upscale interpola e o pixel vira borrão — é a decisão de 01/08.
  tex.source.scaleMode = "nearest"
  return tex
}

/**
 * Assa vários buffers numa FOLHA só, e devolve uma textura por buffer.
 *
 * Existe por medida, não por elegância. A multidão de hemácias são ~1700
 * sprites; com 48 texturas independentes intercaladas em ordem aleatória, o
 * lote do Pixi quebrava quase a cada corpo. Compartilhando uma fonte só, a
 * multidão inteira vira um punhado de chamadas de desenho.
 *
 * Uma folha de verdade — atlas empacotado — e não `Texture.from` por buffer: é
 * a mesma arte, e a diferença está inteira no número de trocas de estado da GPU.
 */
export function toSheet(bufs: ReadonlyArray<Buf>, palette: ReadonlyArray<number> = PALETTE): Texture[] {
  if (bufs.length === 0) return []
  const cw = Math.max(...bufs.map((b) => b.w))
  const ch = Math.max(...bufs.map((b) => b.h))
  const cols = Math.ceil(Math.sqrt(bufs.length))
  const rows = Math.ceil(bufs.length / cols)

  const canvas = document.createElement("canvas")
  canvas.width = cols * cw
  canvas.height = rows * ch
  const c = canvas.getContext("2d")
  if (c === null) throw new Error("canvas 2d indisponível")

  bufs.forEach((b, i) => {
    const img = c.createImageData(b.w, b.h)
    img.data.set(toRGBA(b, palette))
    c.putImageData(img, (i % cols) * cw, Math.floor(i / cols) * ch)
  })

  const source = Texture.from(canvas).source
  source.scaleMode = "nearest"
  return bufs.map(
    (b, i) =>
      new Texture({
        source,
        frame: new Rectangle((i % cols) * cw, Math.floor(i / cols) * ch, b.w, b.h),
      }),
  )
}
