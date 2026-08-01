import tuningJson from "../tuning.json"
import { createSim } from "./sim/sim.ts"
import type { SimState, Tuning } from "./sim/types.ts"
import { createKeyboard } from "./input/keyboard.ts"
import { createRecorder, downloadReplay } from "./input/recorder.ts"
import { browserGitSha } from "./harness/gitSha.ts"
import { createRenderer } from "./render/renderer.ts"

const tuning = tuningJson as Tuning
const STEP = 1 / tuning.sim.hz

const seed = Number(new URLSearchParams(location.search).get("seed") ?? 1234) | 0

const mount = document.getElementById("app")!
const hud = document.getElementById("hud")!

const sim = createSim(seed, tuning)
const keyboard = createKeyboard()
const recorder = createRecorder(seed, tuning, browserGitSha())
const renderer = await createRenderer(mount, tuning)

/**
 * Escala inteira.
 *
 * Decorre direto do pixel art nativo escolhido em 01/08: com vizinho-próximo em
 * escala fracionária, uma parte dos pixels ocupa 2 unidades de tela e outra 3, e
 * a diferença aparece como cintilação assim que o fundo rola. Múltiplo inteiro
 * custa uma tarja preta e devolve a grade intacta. 640x360 é exatamente 1/3 de
 * 1920x1080 e 1/2 de 1280x720, então na maioria das telas não sobra nada.
 */
function fitInteger(): void {
  const canvas = mount.querySelector("canvas")
  if (canvas === null) return
  const scale = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / tuning.arena.width, window.innerHeight / tuning.arena.height)),
  )
  canvas.style.width = `${tuning.arena.width * scale}px`
  canvas.style.height = `${tuning.arena.height * scale}px`
}
fitInteger()
window.addEventListener("resize", fitInteger)

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
  accumulator += elapsed

  // A sim SEMPRE anda a 60Hz. A dilatação do tempo é regra de jogo, dentro da
  // sim — mudar a taxa do laço aqui quebraria o replay em silêncio.
  while (accumulator >= STEP) {
    prev = clone(sim.state())
    const input = keyboard.frame()
    recorder.push(input)
    sim.step(input)
    accumulator -= STEP
  }

  renderer.draw(prev, sim.state(), accumulator / STEP)

  const s = sim.state()
  // `fase` está aqui para o `npm run rec` saber quando a run morreu sem
  // adivinhar por relógio. Instrumentação, como o resto desta linha.
  hud.textContent =
    `run ${s.runIndex + 1} · seed ${seed} · tick ${s.tick} · fase ${s.phase} · ${sim.snapshot().hash}\n` +
    `WASD/setas movem · espaço = impulso · R recomeça · shift+F9 grava a run`

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
