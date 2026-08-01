import { Texture } from "pixi.js"
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
