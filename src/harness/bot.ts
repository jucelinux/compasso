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
 * Política: defende primeiro, e corre. Um invasor prestes a comer uma célula vale mais
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

/**
 * Folga: quanto espaço o jogador teve, não quanto tempo a run durou.
 *
 * Duração sozinha não distingue "apertado o tempo todo" de "passeio com uma
 * morte boba no fim" — e foi exatamente isso que travou as três reprovações
 * anteriores: o bot dizia 127s, o humano dizia "fácil", e os dois estavam certos
 * sobre coisas diferentes. Estas métricas são a alça objetiva que faltava.
 */
export interface Folga {
  /** Distância média ao patógeno mais próximo, em pixels. */
  media: number
  /** Segundos com o mais próximo a menos de 60px. */
  aperto: number
  /** Segundos em contato com algo que você NÃO consegue engolir na velocidade atual. */
  perigo: number
  /** Segundos invulnerável. Expõe direto quanto da run foi jogada de graça. */
  invulneravel: number
  /** Segundos em cada escalão de velocidade: parado, lento, médio, a toda. */
  escaloes: [number, number, number, number]
}

export interface RunReport {
  seed: number
  waves: WaveRow[]
  diedAtWave: number | null
  diedAtSeconds: number | null
  lostByCells: boolean
  kills: number
  folga: Folga
}

/**
 * Políticas.
 *
 * `agressiva` é a de sempre: mira o alvo e vai no talo. Mede duração de onda bem
 * e é o que produziu todos os números até aqui.
 *
 * `cautelosa` existe para atacar um buraco específico: enquanto os i-frames
 * caíam só ao atingir 85% da velocidade, bastava tomar um toque e ficar logo
 * abaixo disso para comer cinco dos seis patógenos com risco zero e sem prazo.
 * Ela fica no projeto como REGRESSÃO: se um dia voltar a sobreviver para sempre,
 * o buraco voltou.
 *
 * `exploradora` vai atrás do buraco de propósito: primeiro toma um toque de
 * graça (encosta devagar demais para engolir), depois farma logo abaixo do
 * limiar para nunca romper a proteção. É a única forma de medir o tamanho do
 * problema — a `cautelosa` sozinha quase nunca chega ao estado invulnerável,
 * porque este bot raramente apanha.
 */
export type Policy = "agressiva" | "cautelosa" | "exploradora"

/** Escalão de velocidade, os mesmos quatro que o render usa para escolher o sprite. */
const tierOf = (speed: number): 0 | 1 | 2 | 3 =>
  speed < 0.07 ? 0 : speed < 0.42 ? 1 : speed < 0.78 ? 2 : 3

export function playRun(
  seed: number,
  tuning: Tuning,
  maxTicks: number,
  policy: Policy = "agressiva",
): RunReport {
  const sim = createSim(seed, tuning)
  const waves: WaveRow[] = []
  let waveStart = 0
  let lastWave = 1

  let distSum = 0
  let distTicks = 0
  let apertoTicks = 0
  let perigoTicks = 0
  let invulnTicks = 0
  const tierTicks: [number, number, number, number] = [0, 0, 0, 0]

  const report = (tick: number, done: Readonly<SimState>, died: boolean): RunReport => ({
    seed,
    waves,
    diedAtWave: died ? done.wave : null,
    diedAtSeconds: died ? tick / 60 : null,
    lostByCells: died ? done.lostByCells : false,
    kills: done.kills,
    folga: {
      media: distTicks === 0 ? 0 : distSum / distTicks,
      aperto: apertoTicks / 60,
      perigo: perigoTicks / 60,
      invulneravel: invulnTicks / 60,
      escaloes: [tierTicks[0] / 60, tierTicks[1] / 60, tierTicks[2] / 60, tierTicks[3] / 60],
    },
  })

  for (let tick = 0; tick < maxTicks; tick++) {
    const s = sim.state()
    if (s.phase === "dead") return report(tick, s, true)

    // --- medição, antes de decidir o input
    tierTicks[tierOf(s.player.speed)]++
    if (s.player.invulnerable) invulnTicks++
    let nearest = Infinity
    for (const e of s.enemies) {
      const d = Math.sqrt(dist2(e.x, e.y, s.player.x, s.player.y))
      if (d < nearest) nearest = d
      const alcance = (tuning.player.size + tuning.enemy.size * kindScale(tuning, e.kind)) / 2
      if (d <= alcance && s.player.speed < tuning.enemy.kinds[e.kind]!.engulfSpeed) perigoTicks++
    }
    if (nearest < Infinity) {
      distSum += nearest
      distTicks++
      if (nearest < 60) apertoTicks++
    }

    // --- política
    let input = IN()
    const target = chooseTarget(s)
    /*
     * Duas razões para soltar o controle e deixar a velocidade cair:
     *
     * - já invulnerável: freia abaixo de 0.85 para não romper a proteção
     * - ainda não invulnerável, na `exploradora`: fica lento demais para engolir
     *   qualquer coisa, o que garante tomar o toque que liga a proteção
     */
    const protegido = s.player.invulnerable
    const segurar =
      (policy === "cautelosa" || policy === "exploradora") && protegido && s.player.speed > 0.8
    const buscarToque =
      policy === "exploradora" && !protegido && s.lives > 1 && s.player.speed > 0.18
    if (target !== null && !segurar && !buscarToque) {
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

    sim.step(input)
    const now = sim.state()
    if (now.wave > lastWave) {
      waves.push({ wave: lastWave, seconds: (tick - waveStart) / 60, quota: now.quota })
      waveStart = tick
      lastWave = now.wave
    }
  }

  return report(maxTicks, sim.state(), false)
}

function kindScale(tuning: Tuning, kind: string): number {
  return tuning.enemy.kinds[kind]?.sizeScale ?? 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tuning = loadTuning()
  const seeds = [1234, 7, 99, 2024, 31337]
  const MAX = 60 * 60 * 6

  const suite = (policy: Policy): void => {
    console.log(`\n── política ${policy} ──`)
    const lengths: number[] = []
    const folgas: Folga[] = []
    for (const seed of seeds) {
      const r = playRun(seed, tuning, MAX, policy)
      const how = r.diedAtSeconds === null ? "SOBREVIVEU" : r.lostByCells ? "organismo caiu" : "três toques"
      const when = r.diedAtSeconds === null ? ">6min" : `${r.diedAtSeconds.toFixed(0)}s`
      if (r.diedAtSeconds !== null) lengths.push(r.diedAtSeconds)
      folgas.push(r.folga)
      console.log(
        `seed ${String(seed).padEnd(6)} onda ${String(r.diedAtWave ?? "—").padEnd(3)} ` +
          `${when.padEnd(6)} ${String(r.kills).padEnd(5)} kills  (${how})`,
      )
      const tot = r.folga.escaloes.reduce((a, b) => a + b, 0) || 1
      console.log(
        `  folga ${r.folga.media.toFixed(0)}px · aperto ${r.folga.aperto.toFixed(0)}s · ` +
          `perigo ${r.folga.perigo.toFixed(1)}s · invulnerável ${r.folga.invulneravel.toFixed(0)}s · ` +
          `escalões ${r.folga.escaloes.map((v) => `${((v / tot) * 100).toFixed(0)}%`).join("/")}`,
      )
    }
    const media = (pick: (f: Folga) => number): string =>
      (folgas.reduce((a, f) => a + pick(f), 0) / folgas.length).toFixed(1)
    if (lengths.length > 0) {
      console.log(
        `média: run ${(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(0)}s (alvo ~120s) · ` +
          `${lengths.length}/${seeds.length} morreram`,
      )
    } else {
      console.log(`média: NENHUMA das ${seeds.length} seeds morreu em 6 min`)
    }
    console.log(
      `       folga ${media((f) => f.media)}px · aperto ${media((f) => f.aperto)}s · ` +
        `perigo ${media((f) => f.perigo)}s · invulnerável ${media((f) => f.invulneravel)}s`,
    )
  }

  suite("agressiva")
  suite("cautelosa")
  suite("exploradora")
}
