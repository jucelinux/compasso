import type { InputFrame } from "../sim/types.ts"

const KEY_MAP: Readonly<Record<string, keyof InputFrame>> = {
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
  const held = {
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
    frame: () => ({ ...held }),
    dispose: () => {
      target.removeEventListener("keydown", onDown)
      target.removeEventListener("keyup", onUp)
      target.removeEventListener("blur", onBlur)
    },
  }
}
