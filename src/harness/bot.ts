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
import { fieldSpec, tileAt } from "../sim/field.ts"
import type { Enemy, InputFrame, SimState, Tuning } from "../sim/types.ts"
import { EMPTY_INPUT } from "../input/frame.ts"
import { atravessaTela, ehTela } from "./atravessa.ts"
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

const IN = (o: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...o })

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by)
}

/**
 * Política: defende primeiro, e corre. Um invasor prestes a comer uma célula vale mais
 * que o vírus mais próximo — que é o que um humano faria, e sem isso a medição
 * só mede a burrice do bot.
 */
function chooseTarget(s: Readonly<SimState>): Enemy | null {
  let nearest: Enemy | null = null
  let nearestD = Infinity

  for (const e of s.enemies) {
    const dp = dist2(e.x, e.y, s.player.x, s.player.y)
    if (dp < nearestD) {
      nearestD = dp
      nearest = e
    }
  }
  return nearest
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
  /** Infecção média do campo ao longo da run, em fração do teto de derrota. */
  infMedia: number
  /** Pico de infecção atingido. Perto de 1 significa que passou perto de perder. */
  infPico: number
  /** Fases limpas até o fim: infecção levada a zero. */
  fases: number
  /** Cicatriz média do campo, em fração do teto de derrota. O ratchet de 05/08. */
  necMedia: number
  /** Pico de cicatriz. É o que diz se a ladeira existe ou se voltou a ser reta. */
  necPico: number
}

export interface RunReport {
  seed: number
  waves: WaveRow[]
  diedAtWave: number | null
  diedAtSeconds: number | null
  lostByTissue: boolean
  /**
   * Segundos até LIMPAR a doença inteira, ou `null` se não limpou.
   *
   * Entrou em 13/08 com a progressão de 10 ondas, e é a pergunta que o bot não
   * sabia fazer: antes dela, `fases` contava degraus subidos e uma run que
   * limpasse tudo ficava indistinguível de uma que atolasse na onda 9. A curva
   * inteira se justifica ou não por esta coluna — se toda política vence, ela
   * não aperta; se nenhuma vence, ela não é curva, é parede.
   */
  wonAtSeconds: number | null
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
 *
 * `ritmo` e `curandeira` existem para o campo com estado, de 01/08. A hipótese
 * é que com a infecção alastrando em tempo de MUNDO, "sempre no talo" deixe de
 * ser dominante — e a única forma de saber é comparar com quem alterna e com
 * quem só cura. Se `agressiva` continuar ganhando, a hipótese caiu.
 */
/*
 * `triagem` entrou em 05/08 e existe para uma pergunta só: **o dilema é real
 * agora?**
 *
 * A medição daquele dia mostrou que não era. Matar limpava o campo (a
 * `agressiva` fechava fases sem nunca parar) e curar não (a `curandeira`
 * morria 5/5). Com isso, "matar exige velocidade, curar exige presença" — o
 * tema que o projeto vinha desenhando desde 01/08 — não existia na mecânica:
 * parar nunca era certo.
 *
 * Esta política faz o gesto que a necrose deveria tornar obrigatório: caça,
 * mas PARA em cima da cicatriz, porque cicatriz é a única coisa que a
 * velocidade não desfaz. Se ela não ganhar das outras duas, a necrose não
 * criou dilema nenhum — criou só punição, e a rodada falhou.
 */
export type Policy =
  | "agressiva"
  | "cautelosa"
  | "exploradora"
  | "ritmo"
  | "curandeira"
  | "triagem"

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
  const FIELD = fieldSpec(tuning.arena.width, tuning.arena.height, tuning.field.cols, tuning.field.rows)
  const waves: WaveRow[] = []
  let waveStart = 0
  let lastWave = 1

  let distSum = 0
  let distTicks = 0
  let apertoTicks = 0
  let perigoTicks = 0
  let invulnTicks = 0
  const tierTicks: [number, number, number, number] = [0, 0, 0, 0]
  const TETO = tuning.field.cols * tuning.field.rows * tuning.field.maxInfection
  const PERDE = TETO * tuning.field.loseFraction
  let infSum = 0
  let infPico = 0
  let necSum = 0
  let necPico = 0
  let fases = 0

  const report = (
    tick: number,
    done: Readonly<SimState>,
    died: boolean,
    won = false,
  ): RunReport => ({
    seed,
    waves,
    diedAtWave: died ? done.wave : null,
    diedAtSeconds: died ? tick / 60 : null,
    wonAtSeconds: won ? tick / 60 : null,
    lostByTissue: died ? done.lostByTissue : false,
    kills: done.kills,
    folga: {
      media: distTicks === 0 ? 0 : distSum / distTicks,
      aperto: apertoTicks / 60,
      perigo: perigoTicks / 60,
      invulneravel: invulnTicks / 60,
      escaloes: [tierTicks[0] / 60, tierTicks[1] / 60, tierTicks[2] / 60, tierTicks[3] / 60],
      infMedia: tick === 0 ? 0 : infSum / tick / PERDE,
      infPico: infPico / PERDE,
      necMedia: tick === 0 ? 0 : necSum / tick / PERDE,
      necPico: necPico / PERDE,
      fases,
    },
  })

  for (let tick = 0; tick < maxTicks; tick++) {
    const s = sim.state()
    if (s.phase === "dead") return report(tick, s, true)
    /*
     * `closed` é a doença INTEIRA contida — a run acabou pelo lado bom.
     *
     * Sem esta linha o bot ficaria parado nela até `maxTicks` medindo um jogo
     * que já terminou, e toda média por tick da run vencedora sairia diluída.
     * O `fases` da última onda já foi contado quando ela virou.
     */
    if (s.phase === "closed") return report(tick, s, false, true)

    /*
     * Dispensa o card, senão o bot mede NADA.
     *
     * Toda fase abre parada numa apresentação desde 02/08, e o bot não tinha
     * como sair dela: a primeira medição depois da mudança saiu com 0 abates,
     * 0 fases e infecção travada em 1% nas cinco seeds. O absurdo denunciou —
     * um erro do mesmo tipo em número plausível teria virado balanço.
     *
     * A trava conta com input vazio; a borda de subida gasta um tick.
     *
     * O `intervalo` que entrou em 13/08 NÃO aceita tecla — ele corre sozinho e
     * solta a onda. Passa por aqui só para não ser medido como jogo: são 3
     * segundos em que o bot não decide nada, e contá-los afundaria toda média
     * por tick em ~5% por onda contida.
     */
    /*
     * O CÉREBRO virou navegável em 13/08: o bot ANDA até a órbita em vez de
     * apertar uma tecla. Sem isto ele fica parado no hub para sempre e `npm run
     * pace` mede zero — o mesmo modo de falha do card em 02/08, que saiu com 0
     * abates em cinco seeds e só foi notado porque o absurdo denunciou.
     *
     * Ele não ESCOLHE vilão: aceita o que estiver selecionado. Medir a escolha
     * exigiria uma política de META-jogo, e o bot mede a arena — misturar os
     * dois faria `npm run pace` responder a duas perguntas e nenhuma bem.
     *
     * A regra de atravessar mora em `atravessa.ts`, com os outros que precisam
     * dela. Ela mudou uma vez, seis cópias existiam, duas ficaram para trás e
     * viraram medição de nada; esta é uma das que sobreviveram por sorte.
     */
    if (ehTela(s.phase)) {
      sim.step(atravessaTela(s, tuning))
      continue
    }

    // --- medição, antes de decidir o input
    infSum += s.infection
    if (s.infection > infPico) infPico = s.infection
    necSum += s.necrosed
    if (s.necrosed > necPico) necPico = s.necrosed
    tierTicks[tierOf(s.player.speed)]++
    if (s.player.invulnerable) invulnTicks++
    let nearest = Infinity
    // Um tick em perigo é UM tick, não um por inimigo. Contando por inimigo, a
    // curandeira parada numa multidão marcava 1538s numa run de 360s.
    let emPerigo = false
    for (const e of s.enemies) {
      const d = Math.sqrt(dist2(e.x, e.y, s.player.x, s.player.y))
      if (d < nearest) nearest = d
      const alcance = (tuning.player.size + tuning.enemy.size * kindScale(tuning, e.kind)) / 2
      if (d <= alcance && s.player.speed < tuning.enemy.kinds[e.kind]!.engulfSpeed) emPerigo = true
    }
    if (emPerigo) perigoTicks++
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
    /*
     * `ritmo`: caça quando há fonte perto, cura quando o chão embaixo está sujo.
     * É a política que testa a hipótese — se ela ganhar da `agressiva`, a
     * velocidade máxima deixou de ser jogada dominante.
     */
    const tileAqui = tileAt(FIELD, s.player.x, s.player.y)
    const sujeiraAqui = s.field[tileAqui]! / tuning.field.maxInfection
    const cicatrizAqui = s.necrose[tileAqui]! / tuning.field.maxInfection
    const fonteLonge = target === null || Math.sqrt(dist2(target.x, target.y, s.player.x, s.player.y)) > 90
    /*
     * A `triagem` para em cima de cicatriz mesmo com fonte por perto — é esse
     * o custo que a decisão tem que ter. Parar só quando é seguro não é
     * triagem, é folga.
     */
    const curar =
      policy === "curandeira" ||
      (policy === "ritmo" && sujeiraAqui > 0.25 && fonteLonge) ||
      (policy === "triagem" && cicatrizAqui > 0.15)

    const protegido = s.player.invulnerable
    const segurar =
      (policy === "cautelosa" || policy === "exploradora") && protegido && s.player.speed > 0.8
    const buscarToque =
      policy === "exploradora" && !protegido && s.lives > 1 && s.player.speed > 0.18
    if (target !== null && !segurar && !buscarToque && !curar) {
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
      fases++
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
    let vitorias = 0
    for (const seed of seeds) {
      const r = playRun(seed, tuning, MAX, policy)
      const how =
        r.wonAtSeconds !== null
          ? "LIMPOU AS 10"
          : r.diedAtSeconds === null
            ? "SOBREVIVEU"
            : r.lostByTissue
              ? "tecido morreu"
              : "três toques"
      const when =
        r.wonAtSeconds !== null
          ? `${r.wonAtSeconds.toFixed(0)}s`
          : r.diedAtSeconds === null
            ? ">6min"
            : `${r.diedAtSeconds.toFixed(0)}s`
      if (r.diedAtSeconds !== null) lengths.push(r.diedAtSeconds)
      folgas.push(r.folga)
      if (r.wonAtSeconds !== null) vitorias++
      console.log(
        `seed ${String(seed).padEnd(6)} onda ${String(r.diedAtWave ?? r.folga.fases + 1).padEnd(3)} ` +
          `${when.padEnd(6)} ${String(r.kills).padEnd(5)} kills  (${how})`,
      )
      const tot = r.folga.escaloes.reduce((a, b) => a + b, 0) || 1
      console.log(
        `  fases ${r.folga.fases} · infecção méd ${(r.folga.infMedia * 100).toFixed(0)}% ` +
          `pico ${(r.folga.infPico * 100).toFixed(0)}% · cicatriz méd ${(r.folga.necMedia * 100).toFixed(0)}% ` +
          `pico ${(r.folga.necPico * 100).toFixed(0)}% · perigo ${r.folga.perigo.toFixed(1)}s · ` +
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
    console.log(`       ${vitorias}/${seeds.length} limparam as 10 ondas`)
    console.log(
      `       fases ${media((f) => f.fases)} · infecção méd ${media((f) => f.infMedia * 100)}% ` +
        `pico ${media((f) => f.infPico * 100)}% · cicatriz méd ${media((f) => f.necMedia * 100)}% ` +
        `pico ${media((f) => f.necPico * 100)}% · perigo ${media((f) => f.perigo)}s · ` +
        `folga ${media((f) => f.media)}px`,
    )
  }

  // `cautelosa` e `exploradora` seguem no arquivo como regressão do buraco de
  // i-frames; a sonda do campo com estado compara estas três.
  suite("agressiva")
  suite("ritmo")
  suite("curandeira")
  suite("triagem")
}
