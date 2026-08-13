/**
 * Gera `replays/smoke.json` — a fixture de regressão da cena descartável.
 *
 * O padrão de input é sintético e semeado, para que a fixture seja regenerável
 * byte a byte. Fixtures de verdade vêm do F9; esta existe pra ter um baseline
 * antes de existir jogo.
 */
import { execSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createRng } from "../sim/rng.ts"
import { createSim } from "../sim/sim.ts"
import type { InputFrame } from "../sim/types.ts"
import { unpackInput } from "../input/frame.ts"
import { createReplay, stringifyReplay } from "./replay.ts"
import { atravessaTela } from "./atravessa.ts"
import { loadTuning, projectRoot } from "./loadTuning.ts"

const SEED = 12345
const TICKS = 900 // 15s de tempo de mundo, DEPOIS de a run começar
const HOLD = 20 // ticks segurando cada direção
const ACTION_EVERY = 137

const tuning = loadTuning()
const rng = createRng(99)
const inputs: InputFrame[] = []

/*
 * O PRÓLOGO: atravessar as telas até a run começar.
 *
 * Até 13/08 este arquivo era um passeio aleatório cego, e isso bastava porque o
 * jogo abria direto na run. Não abre mais: hoje o boot cai no CÉREBRO, e sair de
 * lá exige ANDAR até a órbita dos patógenos, escolher o vilão e dispensar o card.
 *
 * Medido antes de consertar, e é o motivo de consertar em vez de rebasear: os
 * 900 ticks aleatórios visitavam a fase `hub` e mais NENHUMA. A fixture que
 * quatro testes de determinismo usam de baseline tinha parado de tocar no jogo —
 * o sintoma visível era `tuning.json > muda o comportamento sem editar código`
 * passando a não mudar hash nenhum, porque no cérebro não existe dash.
 *
 * Por isso o gerador agora RODA a sim enquanto gera, em vez de emitir teclas no
 * escuro: a direção certa depende de onde o glóbulo está. Continua determinístico
 * e regenerável byte a byte — mesma seed, mesmo tuning, mesmo arquivo — e se a
 * geometria do hub mudar de novo, o prólogo se corrige sozinho em vez de voltar
 * a mentir em silêncio.
 */
const piloto = createSim(SEED, tuning)

let guarda = 0
while (piloto.state().phase !== "run" && guarda++ < 900) {
  const frame = atravessaTela(piloto.state(), tuning)
  inputs.push(frame)
  piloto.step(frame)
}
if (piloto.state().phase !== "run") {
  throw new Error("o prólogo não chegou à run — a fixture não cobriria o jogo")
}

// 5 bits de direção; mantém 0..15 (sem o bit de ação) e liga a ação à parte.
let dir = 0
for (let tick = 0; tick < TICKS; tick++) {
  if (tick % HOLD === 0) dir = rng.nextInt(0, 16)
  const action = tick % ACTION_EVERY === 0 && tick > 0
  inputs.push(unpackInput(dir | (action ? 16 : 0)))
}

let gitSha: string | null = null
try {
  gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8", cwd: projectRoot }).trim()
} catch {
  gitSha = null // sem repo: o replay ainda roda, só perde a procedência
}

const replay = createReplay({ seed: SEED, tuning, label: "smoke", inputs, gitSha })
mkdirSync(resolve(projectRoot, "replays"), { recursive: true })
const path = resolve(projectRoot, "replays", "smoke.json")
writeFileSync(path, stringifyReplay(replay) + "\n")
console.log(`escrito ${path} — ${inputs.length} ticks`)
