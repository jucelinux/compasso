import tuningJson from "../tuning.json"
import { createSim } from "./sim/sim.ts"
import type { SimState, Tuning } from "./sim/types.ts"
import { createKeyboard } from "./input/keyboard.ts"
import { createRecorder, downloadReplay } from "./input/recorder.ts"
import { createRenderer } from "./render/renderer.ts"

const tuning = tuningJson as Tuning
const STEP = 1 / tuning.sim.hz

/**
 * Escala de tempo de mundo. Fica em 1.0 na rodada zero: multiplica quantos
 * passos de sim ocorrem por frame real, sem mexer no framerate do render.
 */
const timeScale = 1.0

const seed = Number(new URLSearchParams(location.search).get("seed") ?? 1234) | 0

const mount = document.getElementById("app")!
const hud = document.getElementById("hud")!

const sim = createSim(seed, tuning)
const keyboard = createKeyboard()
const recorder = createRecorder(seed, tuning)
const renderer = await createRenderer(mount, tuning)

const clone = (s: Readonly<SimState>): SimState => structuredClone(s) as SimState
let prev = clone(sim.state())

let accumulator = 0
let last = performance.now()
// Teto de recuperação: uma aba em segundo plano não pode virar um catch-up de
// mil ticks quando volta ao foco.
const MAX_FRAME_SECONDS = 0.25

function frame(now: number): void {
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
  last = now
  accumulator += elapsed * timeScale

  while (accumulator >= STEP) {
    prev = clone(sim.state())
    const input = keyboard.frame()
    recorder.push(input)
    sim.step(input)
    accumulator -= STEP
  }

  renderer.draw(prev, sim.state(), accumulator / STEP)

  const s = sim.state()
  hud.textContent =
    `seed ${seed}  tick ${s.tick}  hash ${sim.snapshot().hash}\n` +
    `colisões ${s.collisions}  buffer ${recorder.length}t\n` +
    `WASD/setas mover · espaço reposiciona · F9 últimos ${tuning.harness.recordSeconds}s · shift+F9 run inteira`

  requestAnimationFrame(frame)
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "F9") return
  event.preventDefault()
  const full = event.shiftKey
  const replay = full
    ? recorder.dumpAll(`f9-full-${seed}`)
    : recorder.dumpWindow(`f9-${seed}-t${recorder.length}`)
  if (!full && recorder.length > recorder.windowTicks) {
    console.warn(
      `F9: janela começa no tick ${recorder.length - recorder.windowTicks}, não no 0. ` +
        `O replay roda, mas não reproduz o estado que você acabou de ver — ` +
        `use shift+F9 pra isso.`,
    )
  }
  downloadReplay(replay)
})

requestAnimationFrame(frame)
