import type { InputFrame } from "../sim/types.ts"
import { EMPTY_INPUT, type Botao } from "./frame.ts"

const KEY_MAP: Readonly<Record<string, Botao>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Space: "action",
  Enter: "restart",
  KeyR: "restart",
}

/**
 * As teclas 1..5 acionam as habilidades — pedido do H em 14/08.
 *
 * Fora do `KEY_MAP` porque elas não são booleanas: o contrato carrega UM número
 * de habilidade por tick, não cinco flags. Mapa e não `parseInt(code)` para que
 * o teclado numérico e um layout exótico não virem habilidade por acidente.
 */
const HAB_MAP: Readonly<Record<string, number>> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  Digit5: 5,
}

export interface Keyboard {
  /** Estado dos controles agora. Chamado uma vez por tick de sim. */
  frame(): InputFrame
  dispose(): void
}

export function createKeyboard(target: Window = window): Keyboard {
  const held: Record<Botao, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    restart: false,
  }

  /**
   * A habilidade é um PULSO, não um estado segurado.
   *
   * Ela vale um tick e é consumida na leitura, como o trinco do toque: segurar
   * o "1" acionaria a adrenalina de novo no quadro seguinte ao efeito acabar, e
   * o gesto de gastar uma carga não pode acontecer sem alguém querer. O teclado
   * repete a tecla enquanto ela fica presa, e é justamente essa repetição que a
   * borda tem que ignorar — daí `event.repeat`.
   */
  let hab = 0

  const set = (code: string, value: boolean) => (event: KeyboardEvent) => {
    const h = HAB_MAP[code]
    if (h !== undefined) {
      if (value && !event.repeat) hab = h
      event.preventDefault()
      return
    }
    const key = KEY_MAP[code]
    if (key === undefined) return
    held[key] = value
    event.preventDefault()
  }

  const onDown = (event: KeyboardEvent) => set(event.code, true)(event)
  const onUp = (event: KeyboardEvent) => set(event.code, false)(event)
  // Perder o foco com uma tecla presa deixaria o input grudado.
  const onBlur = () => {
    held.up = held.down = held.left = held.right = false
    held.action = held.restart = false
    hab = 0
  }

  target.addEventListener("keydown", onDown)
  target.addEventListener("keyup", onUp)
  target.addEventListener("blur", onBlur)

  return {
    // O ponteiro NÃO passa por aqui: ele é do mouse, e juntar os dois neste
    // objeto faria o teclado responder por um estado que ele não observa.
    frame: () => {
      const a = hab
      hab = 0
      return { ...EMPTY_INPUT, ...held, ability: a }
    },
    dispose: () => {
      target.removeEventListener("keydown", onDown)
      target.removeEventListener("keyup", onUp)
      target.removeEventListener("blur", onBlur)
    },
  }
}
