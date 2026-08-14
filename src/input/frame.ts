import type { InputFrame } from "../sim/types.ts"

/**
 * Empacotamento do input. Um `InputFrame` por tick vira um inteiro de 6 bits,
 * serializado em decimal. Replays são commitados — mantenha-os pequenos.
 *
 * ESTE é o único codec. O recorder no browser e o runner headless usam este
 * mesmo módulo; duas implementações seriam duas oportunidades de divergir.
 *
 * O PONTEIRO, que entrou em 13/08, não cabe em bit: são duas coordenadas. Ele
 * sai como sufixo `bits.x.y`, e SÓ quando o botão está apertado — o cursor
 * parado não é evento, e gravar a posição dele em todo tick multiplicaria o
 * tamanho de um replay de 20 mil quadros para não dizer nada. A consequência é
 * que o replay guarda ONDE se clicou e não por onde o cursor passou, que é
 * exatamente a informação que decide jogo.
 *
 * Formato antigo (inteiro puro) continua válido e decodifica sem ponteiro. É o
 * que mantém as catorze fixtures de `replays/` legíveis sem regravar nenhuma.
 */
/**
 * Os BOTÕES: o subconjunto booleano do contrato de input.
 *
 * Existe desde que o ponteiro entrou, em 13/08: `keyof InputFrame` deixou de
 * significar "tecla" no dia em que o contrato ganhou duas coordenadas, e o
 * teclado indexa por tecla. Nomear o subconjunto é o que impede um `held.pointerX`
 * de compilar.
 */
export type Botao = "up" | "down" | "left" | "right" | "action" | "restart"

export const BIT_UP = 1
export const BIT_DOWN = 2
export const BIT_LEFT = 4
export const BIT_RIGHT = 8
export const BIT_ACTION = 16
export const BIT_RESTART = 32
/**
 * A HABILIDADE ocupa TRÊS BITS (64/128/256), não cinco booleanos. 14/08.
 *
 * Cinco bits custariam cinco em todo tick de todo replay para dizer, na quase
 * totalidade deles, que ninguém apertou nada. Três dizem 0..7 — as cinco teclas
 * que o H pediu e mais duas de folga.
 */
export const HAB_SHIFT = 6
export const HAB_MASK = 7

/** Ponteiro ausente. Coordenada impossível, e não 0,0 — 0,0 é um canto real. */
export const SEM_PONTEIRO = -1

export const EMPTY_INPUT: InputFrame = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  restart: false,
  pointerX: SEM_PONTEIRO,
  pointerY: SEM_PONTEIRO,
  click: false,
  ability: 0,
})

export function packInput(f: InputFrame): number {
  return (
    (f.up ? BIT_UP : 0) |
    (f.down ? BIT_DOWN : 0) |
    (f.left ? BIT_LEFT : 0) |
    (f.right ? BIT_RIGHT : 0) |
    (f.action ? BIT_ACTION : 0) |
    (f.restart ? BIT_RESTART : 0) |
    ((f.ability & HAB_MASK) << HAB_SHIFT)
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
    ability: (bits >> HAB_SHIFT) & HAB_MASK,
    pointerX: SEM_PONTEIRO,
    pointerY: SEM_PONTEIRO,
    click: false,
  }
}

export function encodeInput(f: InputFrame): string {
  const bits = packInput(f)
  if (!f.click) return bits.toString(10)
  // Inteiro no arquivo: a arena é 640x360 e meio pixel de ponteiro não decide
  // nada. Fração aqui só engordaria o replay com ruído de dispositivo.
  return `${bits}.${Math.round(f.pointerX)}.${Math.round(f.pointerY)}`
}

export function decodeInput(text: string): InputFrame {
  const partes = text.split(".")
  const bits = Number.parseInt(partes[0] ?? "", 10)
  /*
   * 0..511: NOVE bits desde que a habilidade entrou, em 14/08.
   *
   * O teto subiu de 63 e nada quebra, porque todo valor antigo continua dentro
   * da faixa nova e significa a mesma coisa — os três bits de habilidade valem
   * zero num replay que não os tinha, e zero é "nenhuma". É a mesma propriedade
   * que fez o ponteiro caber sem regravar fixture.
   */
  if (!Number.isInteger(bits) || bits < 0 || bits > 511) {
    throw new Error(`input inválido no replay: ${JSON.stringify(text)}`)
  }
  if (partes.length === 1) return unpackInput(bits)
  if (partes.length !== 3) {
    throw new Error(`input inválido no replay: ${JSON.stringify(text)}`)
  }
  const x = Number.parseInt(partes[1] ?? "", 10)
  const y = Number.parseInt(partes[2] ?? "", 10)
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`ponteiro inválido no replay: ${JSON.stringify(text)}`)
  }
  return { ...unpackInput(bits), pointerX: x, pointerY: y, click: true }
}
