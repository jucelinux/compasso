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

  const set = (code: string, value: boolean) => (event: KeyboardEvent) => {
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
  }

  target.addEventListener("keydown", onDown)
  target.addEventListener("keyup", onUp)
  target.addEventListener("blur", onBlur)

  return {
    // O ponteiro NÃO passa por aqui: ele é do mouse, e juntar os dois neste
    // objeto faria o teclado responder por um estado que ele não observa.
    frame: () => ({ ...EMPTY_INPUT, ...held }),
    dispose: () => {
      target.removeEventListener("keydown", onDown)
      target.removeEventListener("keyup", onUp)
      target.removeEventListener("blur", onBlur)
    },
  }
}
