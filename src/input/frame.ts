import type { InputFrame } from "../sim/types.ts"

/**
 * Empacotamento do input. Um `InputFrame` por tick vira um inteiro de 5 bits,
 * serializado em decimal. Replays são commitados — mantenha-os pequenos.
 *
 * ESTE é o único codec. O recorder no browser e o runner headless usam este
 * mesmo módulo; duas implementações seriam duas oportunidades de divergir.
 */
export const BIT_UP = 1
export const BIT_DOWN = 2
export const BIT_LEFT = 4
export const BIT_RIGHT = 8
export const BIT_ACTION = 16
export const BIT_RESTART = 32

export const EMPTY_INPUT: InputFrame = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  restart: false,
})

export function packInput(f: InputFrame): number {
  return (
    (f.up ? BIT_UP : 0) |
    (f.down ? BIT_DOWN : 0) |
    (f.left ? BIT_LEFT : 0) |
    (f.right ? BIT_RIGHT : 0) |
    (f.action ? BIT_ACTION : 0) |
    (f.restart ? BIT_RESTART : 0)
  )
}

export function unpackInput(bits: number): InputFrame {
  return {
    up: (bits & BIT_UP) !== 0,
    down: (bits & BIT_DOWN) !== 0,
    left: (bits & BIT_LEFT) !== 0,
    right: (bits & BIT_RIGHT) !== 0,
    action: (bits & BIT_ACTION) !== 0,
    restart: (bits & BIT_RESTART) !== 0,
  }
}

export function encodeInput(f: InputFrame): string {
  return packInput(f).toString(10)
}

export function decodeInput(text: string): InputFrame {
  const bits = Number.parseInt(text, 10)
  // 0..63: seis bits. Replays antigos usam só 0..31 e continuam válidos.
  if (!Number.isInteger(bits) || bits < 0 || bits > 63) {
    throw new Error(`input inválido no replay: ${JSON.stringify(text)}`)
  }
  return unpackInput(bits)
}
