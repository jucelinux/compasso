/**
 * Bot de ritmo — `npm run pace`.
 *
 * Não é um bom jogador. É um jogador CONSTANTE, e é isso que serve para medir
 * duração de onda e de run sem gastar atenção humana. Já achou duas coisas que
 * nenhum teste acharia: a onda 1 de 78 segundos e a inversão da curva de tensão
 * quando o dash virava imunidade.
 *
 * Vive em `src/harness/` e não em `src/sim/`: é apparatus, não regra. Se algum
 * dia ele influenciar o jogo, algo está no lugar errado.
 */
import { createSim } from "../sim/sim.ts"
import type { Enemy, InputFrame, SimState, Tuning } from "../sim/types.ts"
import { loadTuning } from "./loadTuning.ts"

const DIRS: ReadonlyArray<{ dx: number; dy: number; frame: Partial<InputFrame> }> = [
  { dx: 0, dy: -1, frame: { up: true } },
  { dx: 0, dy: 1, frame: { down: true } },
  { dx: -1, dy: 0, frame: { left: true } },
  { dx: 1, dy: 0, frame: { right: true } },
  { dx: -0.7071, dy: -0.7071, frame: { up: true, left: true } },
  { dx: 0.7071, dy: -0.7071, frame: { up: true, right: true } },
  { dx: -0.7071, dy: 0.7071, frame: { down: true, left: true } },
  { dx: 0.7071, dy: 0.7071, frame: { down: true, right: true } },
]

const IN = (o: Partial<InputFrame> = {}): InputFrame => ({
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  restart: false,
  ...o,
})

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by)
}

/**
 * Política: defende primeiro. Um invasor prestes a comer uma célula vale mais
 * que o vírus mais próximo — que é o que um humano faria, e sem isso a medição
 * só mede a burrice do bot.
 */
function chooseTarget(s: Readonly<SimState>): Enemy | null {
  let urgent: Enemy | null = null
  let urgentD = Infinity
  let nearest: Enemy | null = null
  let nearestD = Infinity

  for (const e of s.enemies) {
    const dp = dist2(e.x, e.y, s.player.x, s.player.y)
    if (dp < nearestD) {
      nearestD = dp
      nearest = e
    }
    for (const c of s.cells) {
      const dc = dist2(e.x, e.y, c.x, c.y)
      if (dc < urgentD) {
        urgentD = dc
        urgent = e
      }
    }
  }
  // 120px do organismo é perto o bastante para largar o que estava fazendo.
  return urgent !== null && urgentD < 120 * 120 ? urgent : nearest
}

export interface WaveRow {
  wave: number
  seconds: number
  quota: number
}

export interface RunReport {
  seed: number
  waves: WaveRow[]
  diedAtWave: number | null
  diedAtSeconds: number | null
  lostByCells: boolean
  kills: number
}

export function playRun(seed: number, tuning: Tuning, maxTicks: number): RunReport {
  const sim = createSim(seed, tuning)
  const waves: WaveRow[] = []
  let waveStart = 0
  let prevPhase: string = "run"
  let confirmToggle = false

  for (let tick = 0; tick < maxTicks; tick++) {
    const s = sim.state()
    let input = IN()

    if (s.phase === "pick") {
      // Alterna: a confirmação exige borda de subida.
      input = IN({ action: !confirmToggle })
      confirmToggle = !confirmToggle
    } else if (s.phase === "dead") {
      const done = sim.state()
      return {
        seed,
        waves,
        diedAtWave: done.wave,
        diedAtSeconds: tick / 60,
        lostByCells: done.lostByCells,
        kills: done.kills,
      }
    } else if (s.player.dashTicks === 0 && s.player.recoverTicks === 0) {
      const target = chooseTarget(s)
      if (target !== null) {
        const ax = target.x - s.player.x
        const ay = target.y - s.player.y
        const n = Math.sqrt(ax * ax + ay * ay) || 1
        let best = DIRS[0]!
        let bestDot = -Infinity
        for (const d of DIRS) {
          const dot = (ax / n) * d.dx + (ay / n) * d.dy
          if (dot > bestDot) {
            bestDot = dot
            best = d
          }
        }
        input = IN(best.frame)
      }
    }

    sim.step(input)
    const now = sim.state()
    if (prevPhase === "run" && now.phase === "pick") {
      waves.push({ wave: now.wave, seconds: (tick - waveStart) / 60, quota: now.quota })
    }
    if (prevPhase === "pick" && now.phase === "run") waveStart = tick
    prevPhase = now.phase
  }

  const done = sim.state()
  return {
    seed,
    waves,
    diedAtWave: null,
    diedAtSeconds: null,
    lostByCells: false,
    kills: done.kills,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tuning = loadTuning()
  const seeds = [1234, 7, 99, 2024, 31337]
  const lengths: number[] = []

  for (const seed of seeds) {
    const r = playRun(seed, tuning, 60 * 60 * 6)
    const how = r.lostByCells ? "organismo caiu" : "três toques"
    const when = r.diedAtSeconds === null ? ">6min" : `${r.diedAtSeconds.toFixed(0)}s`
    if (r.diedAtSeconds !== null) lengths.push(r.diedAtSeconds)
    console.log(
      `seed ${String(seed).padEnd(6)} onda ${String(r.diedAtWave ?? "—").padEnd(3)} ` +
        `${when.padEnd(6)} ${r.kills} kills  (${how})`,
    )
    console.log(
      "  " + r.waves.slice(0, 10).map((w) => `o${w.wave}:${w.seconds.toFixed(0)}s`).join(" "),
    )
  }

  if (lengths.length > 0) {
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    console.log(`\nrun média: ${avg.toFixed(0)}s  (alvo ~120s)`)
  }
}
