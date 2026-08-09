/**
 * Fronteira de run a partir de um F9 — `npm run gate <arquivo.json>`.
 *
 * Nasceu como leitura do PORTÃO, quando o portão era taxa de segunda partida.
 * Desde 08/08 o portão é "a dilatação é lida sem explicação" (`CLAUDE.md`), que
 * nenhum script mede: quem lê é uma pessoa olhando outra jogar. Então este
 * comando NÃO devolve veredito nenhum. Ele diz quando cada run acabou, com
 * abates, onda e tempo na tela de morte — e é assim que ele instrumentou o
 * replay da aura em 02/08, que é para esse tipo de uso que ele fica.
 *
 * Não altera nada: replica a sim e olha o estado.
 *
 * O tempo na tela de morte é reportado porque é a única coisa que distingue
 * "não quis" de "não estava lá". Ele NÃO decide sozinho: em 02/08 um "não" de
 * 6,2 minutos era uma conversa acontecendo, e a leitura virou nula.
 *
 * ARMADILHA, e ela já mordeu: no tick do restart a fase já voltou a "run" e os
 * abates já zeraram. Ler a run viva sem checar `endTick` apaga o total da run
 * anterior — o sintoma foi "onda 7 com 0 abates", absurdo na cara e por isso
 * pego. Um erro do mesmo tipo em número plausível teria passado.
 */
import { resolve } from "node:path"
import { createSim } from "../sim/sim.ts"
import { loadReplay, loadTuning } from "./loadTuning.ts"
import { replayInputs } from "./replay.ts"

const file = process.argv[2]!
const replay = loadReplay(resolve(process.cwd(), file))
const tuning = loadTuning()
const sim = createSim(replay.seed, tuning)
const inputs = replayInputs(replay)

interface Run {
  index: number
  startTick: number
  endTick: number | null
  wave: number
  kills: number
  lives: number
  byTissue: boolean | null
  speeds: number[]
  deadIdleTicks: number
}

const runs: Run[] = []
let cur: Run = {
  index: 0, startTick: 0, endTick: null, wave: 1, kills: 0,
  lives: tuning.run.lives, byTissue: null, speeds: [], deadIdleTicks: 0,
}
let prevPhase = "run"
let prevIndex = 0
let tick = 0

for (const input of inputs) {
  sim.step(input)
  const s = sim.state()

  // A run só é lida enquanto está VIVA. No tick do restart a fase já voltou a
  // "run" e os abates já zeraram — ler aqui apagaria o total da run anterior.
  if (s.phase === "run" && cur.endTick === null) {
    cur.speeds.push(s.player.speed)
    cur.wave = Math.max(cur.wave, s.wave)
    cur.kills = s.kills
    cur.lives = s.lives
  } else if (s.phase === "dead") {
    if (prevPhase === "run") {
      cur.endTick = tick
      cur.byTissue = s.lostByTissue
      cur.kills = s.kills
      cur.wave = Math.max(cur.wave, s.wave)
    }
    cur.deadIdleTicks++
  }

  if (s.runIndex !== prevIndex) {
    runs.push(cur)
    cur = {
      index: s.runIndex, startTick: tick, endTick: null, wave: 1, kills: 0,
      lives: tuning.run.lives, byTissue: null, speeds: [], deadIdleTicks: 0,
    }
    prevIndex = s.runIndex
  }
  prevPhase = s.phase
  tick++
}
runs.push(cur)

const S = (t: number) => (t / 60).toFixed(1) + "s"
const fim = sim.state()

console.log(`\narquivo   ${file}`)
console.log(`gitSha    ${replay.gitSha}   ticks ${inputs.length} (${S(inputs.length)})`)
console.log(`runs      ${runs.length}   (runIndex final = ${fim.runIndex})`)
console.log(`fase final ${fim.phase}\n`)

for (const r of runs) {
  const dur = (r.endTick ?? tick) - r.startTick
  const avg = r.speeds.length ? r.speeds.reduce((a, b) => a + b, 0) / r.speeds.length : 0
  const fast = r.speeds.filter((v) => v > 0.78).length / (r.speeds.length || 1)
  const fim_ = r.endTick === null
    ? "NÃO ACABOU (parou vivo)"
    : r.byTissue ? "o tecido caiu" : "perdeu as 3 vidas"
  console.log(
    `run ${r.index + 1}  ${S(dur).padStart(7)}  onda ${r.wave}  ${String(r.kills).padStart(3)} abates  ` +
      `vidas ${r.lives}  vel média ${avg.toFixed(2)}  acima de 0.78 ${(fast * 100).toFixed(0)}%  · ${fim_}`,
  )
  if (r.endTick !== null && r.deadIdleTicks > 0) {
    console.log(`         ficou ${S(r.deadIdleTicks)} na tela de morte antes do que veio depois`)
  }
}
console.log()
