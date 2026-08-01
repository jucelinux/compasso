import { Packer } from "./hash.ts"
import {
  applyModifiers,
  MODIFIERS,
  MOD_EXTRA_LIFE,
  waveStats,
  type RunStats,
  type WaveStats,
} from "./modifiers.ts"
import { createRng } from "./rng.ts"
import type { Enemy, InputFrame, Sim, SimSnapshot, SimState, Tuning } from "./types.ts"

/**
 * COMPASSO — o tempo só anda quando você anda.
 *
 * Um verbo: o dash. Mover é atacar; parar é a única defesa e também a única
 * forma de não avançar o relógio. Oito direções fixas. Três toques. I-frames do
 * impacto até o fim do próximo dash.
 *
 * Ondas fecham por COTA DE KILLS, nunca por temporizador. O tempo é do jogador:
 * um temporizador seria estalável parando quieto a 5% de creep. Cota exige
 * dashar, e dashar é exatamente o que dá tempo aos inimigos.
 *
 * A dilatação vive AQUI, dentro da sim, e não na taxa do laço de render. Se ela
 * mudasse quantos ticks rodam por segundo, o replay de uma run cheia de creep
 * não reproduziria — o determinismo morreria em silêncio.
 */

const DIAG = 0.7071067811865476

const BIT_UP = 1
const BIT_DOWN = 2
const BIT_LEFT = 4
const BIT_RIGHT = 8
const BIT_ACTION = 16

function bitsOf(input: InputFrame): number {
  return (
    (input.up ? BIT_UP : 0) |
    (input.down ? BIT_DOWN : 0) |
    (input.left ? BIT_LEFT : 0) |
    (input.right ? BIT_RIGHT : 0) |
    (input.action ? BIT_ACTION : 0)
  )
}

/** Oito direções fixas. Sem `sin`/`cos`: não são bit-a-bit entre engines. */
function direction(bits: number): { dx: number; dy: number } | null {
  let dx = (bits & BIT_RIGHT ? 1 : 0) - (bits & BIT_LEFT ? 1 : 0)
  let dy = (bits & BIT_DOWN ? 1 : 0) - (bits & BIT_UP ? 1 : 0)
  if (dx === 0 && dy === 0) return null
  if (dx !== 0 && dy !== 0) {
    dx *= DIAG
    dy *= DIAG
  }
  return { dx, dy }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function createSim(seed: number, tuning: Tuning): Sim {
  const rng = createRng(seed)
  const dt = 1 / tuning.sim.hz
  const { width, height } = tuning.arena
  const packer = new Packer(2048)

  let run: RunStats = applyModifiers(tuning, [])
  let wave: WaveStats = waveStats(tuning, run, 1)

  const s: SimState = {
    tick: 0,
    phase: "run",
    runIndex: 0,
    wave: 1,
    waveKills: 0,
    quota: wave.quota,
    lives: run.lives,
    kills: 0,
    bestKills: 0,
    bestWave: 1,
    player: {
      x: width / 2,
      y: height / 2,
      dashTicks: 0,
      recoverTicks: 0,
      dashDx: 0,
      dashDy: -1,
      invulnerable: false,
      invulnSkipCurrent: false,
    },
    enemies: [],
    spawnTimer: wave.spawnIntervalSeconds,
    worldScale: wave.creep,
    owned: MODIFIERS.map(() => 0),
    offer: [],
    cursor: 0,
    prevBits: 0,
    rngState: rng.state(),
  }

  /** Recalcula as duas camadas: o que os modificadores fixam, o que a onda aperta. */
  const retune = (): void => {
    run = applyModifiers(tuning, s.owned)
    wave = waveStats(tuning, run, s.wave)
    s.quota = wave.quota
  }

  /**
   * Começa uma onda. Abre com inimigos já em campo: tabuleiro vazio faz o
   * jogador ESPERAR o spawn, e esperar é justamente o que este jogo pune.
   */
  const startWave = (): void => {
    retune()
    s.phase = "run"
    s.waveKills = 0
    s.enemies = []
    s.player.dashTicks = 0
    s.player.recoverTicks = 0
    s.spawnTimer = wave.spawnIntervalSeconds
    s.worldScale = wave.creep
    if (s.wave > s.bestWave) s.bestWave = s.wave

    const opening = Math.min(
      wave.quota,
      tuning.enemy.openingBase + (s.wave - 1) * tuning.enemy.openingPerWave,
    )
    for (let i = 0; i < opening; i++) spawnEnemy()
  }

  /** Morreu: perde os modificadores, volta pra onda 1. */
  const startRun = (): void => {
    s.owned = MODIFIERS.map(() => 0)
    s.wave = 1
    s.kills = 0
    s.offer = []
    s.cursor = 0
    s.player.x = width / 2
    s.player.y = height / 2
    s.player.invulnerable = false
    s.player.invulnSkipCurrent = false
    retune()
    s.lives = run.lives
    startWave()
  }

  /** Nasce numa borda da arena — nunca em cima do jogador. */
  const spawnEnemy = (): void => {
    if (s.enemies.length >= tuning.enemy.maxAlive) return
    const half = tuning.enemy.size / 2
    const along = rng.nextFloat()
    const edge = rng.nextInt(0, 4)
    const x = edge === 0 ? half : edge === 1 ? width - half : along * width
    const y = edge === 2 ? half : edge === 3 ? height - half : along * height
    s.enemies.push({
      x: clamp(x, half, width - half),
      y: clamp(y, half, height - half),
      bornTick: s.tick,
    })
  }

  const offerModifiers = (): void => {
    const pool = MODIFIERS.map((m) => m.id)
    const offer: number[] = []
    const count = Math.min(tuning.pick.offerCount, pool.length)
    for (let i = 0; i < count; i++) {
      offer.push(pool.splice(rng.nextInt(0, pool.length), 1)[0]!)
    }
    s.offer = offer
    s.cursor = 0
  }

  const stepRun = (bits: number): void => {
    const p = s.player

    // --- dash: o único verbo. Só começa quando o anterior terminou de se pagar.
    if (p.dashTicks === 0 && p.recoverTicks === 0) {
      const dir = direction(bits)
      if (dir !== null) {
        p.dashDx = dir.dx
        p.dashDy = dir.dy
        p.dashTicks = run.dashDurationTicks
      }
    }

    const dashing = p.dashTicks > 0
    // Tempo de mundo: cheio enquanto o dash acontece, creep no resto. Nunca zero.
    s.worldScale = dashing ? 1 : wave.creep
    const world = dt * s.worldScale

    if (dashing) {
      const half = tuning.player.size / 2
      p.x = clamp(p.x + p.dashDx * run.dashSpeed * dt, half, width - half)
      p.y = clamp(p.y + p.dashDy * run.dashSpeed * dt, half, height - half)
      p.dashTicks--
      if (p.dashTicks === 0) {
        // Fim do dash: é exatamente aqui que os i-frames caem — a menos que o
        // toque tenha sido neste mesmo dash, caso em que vale o próximo.
        p.recoverTicks = wave.recoveryTicks
        if (p.invulnSkipCurrent) p.invulnSkipCurrent = false
        else p.invulnerable = false
      }
    } else if (p.recoverTicks > 0) {
      p.recoverTicks--
    }

    // --- inimigos: perseguem, mas só no tempo que o jogador liberou
    const half = tuning.enemy.size / 2
    for (const e of s.enemies) {
      const ex = p.x - e.x
      const ey = p.y - e.y
      const dist = Math.sqrt(ex * ex + ey * ey)
      if (dist > 0.0001) {
        e.x = clamp(e.x + (ex / dist) * tuning.enemy.speed * world, half, width - half)
        e.y = clamp(e.y + (ey / dist) * tuning.enemy.speed * world, half, height - half)
      }
    }

    s.spawnTimer -= world
    if (s.spawnTimer <= 0) {
      spawnEnemy()
      s.spawnTimer += wave.spawnIntervalSeconds
    }

    // --- resolução: você corta o que dasha PARA DENTRO, e apanha do resto.
    //
    // O corte é direcional de propósito. Aura em volta do jogador tornava o dash
    // uma imunidade: limpava o espaço pessoal inteiro, e como a folga encolhe a
    // cada onda o jogador acabava intocável 90% dos ticks — a curva de tensão
    // invertia. Direcional é também o que "mover = atacar" diz ao pé da letra:
    // você ataca para onde vai, e quem está às suas costas continua cobrando.
    const touchRadius = (tuning.player.size + tuning.enemy.size) / 2
    let hit = false
    const survivors: Enemy[] = []
    for (const e of s.enemies) {
      const ex = e.x - p.x
      const ey = e.y - p.y
      const dist = Math.sqrt(ex * ex + ey * ey)

      if (dashing && dist <= run.killRadius) {
        // dist pode ser 0 quando o inimigo está exatamente em cima: conta como
        // dentro do arco, senão ele fica imortal no pior lugar possível.
        const facing =
          dist < 0.0001 ? 1 : (ex / dist) * p.dashDx + (ey / dist) * p.dashDy
        if (facing >= tuning.dash.killArc) {
          s.kills++
          s.waveKills++
          continue
        }
      }

      if (dist <= touchRadius && !p.invulnerable && !hit) {
        // Um toque por tick, dashando ou não. O inimigo que acertou morre junto:
        // sem isso ele fica grudado e cobra de novo assim que os i-frames caem.
        hit = true
        continue
      }
      survivors.push(e)
    }
    s.enemies = survivors

    if (hit) {
      s.lives--
      p.invulnerable = true
      // Apanhou com o dash ainda em curso: o fim dele não vale, vale o próximo.
      if (p.dashTicks > 0) p.invulnSkipCurrent = true
      if (s.lives <= 0) {
        if (s.kills > s.bestKills) s.bestKills = s.kills
        s.phase = "dead"
        return
      }
    }

    // Cota batida encerra a onda — mesmo no tick em que o jogador levou um toque.
    if (s.waveKills >= s.quota) {
      s.phase = "pick"
      offerModifiers()
    }
  }

  const stepPick = (bits: number): void => {
    const pressed = bits & ~s.prevBits
    const count = s.offer.length
    if (count === 0) {
      s.wave++
      startWave()
      return
    }
    if (pressed & BIT_LEFT) s.cursor = (s.cursor + count - 1) % count
    if (pressed & BIT_RIGHT) s.cursor = (s.cursor + 1) % count
    if (pressed & BIT_ACTION) {
      const id = s.offer[s.cursor]
      if (id !== undefined) {
        s.owned[id] = (s.owned[id] ?? 0) + 1
        // Vida é contador, não curva: precisa entrar agora, não só no próximo cálculo.
        if (id === MOD_EXTRA_LIFE) s.lives++
      }
      s.offer = []
      s.wave++
      startWave()
    }
  }

  /** Não recomeça sozinho: a segunda partida precisa ser um ato deliberado. */
  const stepDead = (bits: number): void => {
    if ((bits & ~s.prevBits) & BIT_ACTION) {
      s.runIndex++
      startRun()
    }
  }

  const step = (input: InputFrame): void => {
    const bits = bitsOf(input)
    if (s.phase === "run") stepRun(bits)
    else if (s.phase === "pick") stepPick(bits)
    else stepDead(bits)
    s.prevBits = bits
    s.rngState = rng.state()
    s.tick++
  }

  const snapshot = (): SimSnapshot => {
    packer
      .reset()
      .u32(s.tick)
      .u8(s.phase === "run" ? 0 : s.phase === "pick" ? 1 : 2)
      .u32(s.runIndex)
      .u32(s.wave)
      .u32(s.waveKills)
      .u32(s.quota)
      .u32(s.lives < 0 ? 0 : s.lives)
      .u32(s.kills)
      .u32(s.bestKills)
      .u32(s.bestWave)
      .f64(s.player.x)
      .f64(s.player.y)
      .f64(s.player.dashDx)
      .f64(s.player.dashDy)
      .u32(s.player.dashTicks)
      .u32(s.player.recoverTicks)
      .bool(s.player.invulnerable)
      .bool(s.player.invulnSkipCurrent)
      .f64(s.spawnTimer)
      .f64(s.worldScale)
      .u32(s.enemies.length)
      .u32(s.cursor)
      .u8(s.prevBits)
      .u32(s.rngState)
    for (const e of s.enemies) packer.f64(e.x).f64(e.y).u32(e.bornTick)
    for (const n of s.owned) packer.u32(n)
    for (const id of s.offer) packer.u32(id)

    return { tick: s.tick, hash: packer.digest() }
  }

  // A primeira onda passa pelo mesmo caminho das outras — senão a run inicial
  // seria a única a abrir com o tabuleiro vazio.
  startWave()

  return {
    step,
    snapshot,
    serialize: () => structuredClone(s),
    state: () => s,
  }
}
