import { Packer } from "./hash.ts"
import {
  applyModifiers,
  MODIFIERS,
  MOD_EXTRA_LIFE,
  MOD_REPAIR,
  waveStats,
  type RunStats,
  type WaveStats,
} from "./modifiers.ts"
import { createRng } from "./rng.ts"
import type {
  Enemy,
  InputFrame,
  KindSpec,
  Sim,
  SimSnapshot,
  SimState,
  Tuning,
} from "./types.ts"

/**
 * COMPASSO — o tempo só anda quando você anda.
 *
 * Um verbo: o dash. Mover é atacar; parar é a única defesa e também a única
 * forma de não avançar o relógio. Oito direções fixas. Três toques. I-frames do
 * impacto até o fim do próximo dash. O corte é direcional: você mata o que
 * dasha para dentro, e quem está atrás continua cobrando.
 *
 * Ondas fecham por COTA DE KILLS, nunca por temporizador. O tempo é do jogador:
 * um temporizador seria estalável parando quieto a 5% de creep.
 *
 * Duas formas de perder: os três toques, ou o organismo. As células não se
 * movem e não atacam — mas os invasores ignoram você e vão atrás delas, então
 * limpar a cota e defender competem pelo mesmo dash.
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
const BIT_RESTART = 32

function bitsOf(input: InputFrame): number {
  return (
    (input.up ? BIT_UP : 0) |
    (input.down ? BIT_DOWN : 0) |
    (input.left ? BIT_LEFT : 0) |
    (input.right ? BIT_RIGHT : 0) |
    (input.action ? BIT_ACTION : 0) |
    (input.restart ? BIT_RESTART : 0)
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

/** Estilhaço é o filho do divisor. Nomeado aqui porque a regra o cita. */
const KIND_SHARD = "estilhaco"

export function createSim(seed: number, tuning: Tuning): Sim {
  const rng = createRng(seed)
  const dt = 1 / tuning.sim.hz
  const { width, height } = tuning.arena
  const packer = new Packer(4096)

  let nextId = 0
  let run: RunStats = applyModifiers(tuning, [])
  let wave: WaveStats = waveStats(tuning, run, 1)

  const kindOf = (name: string): KindSpec => tuning.enemy.kinds[name]!
  const sizeOf = (e: Enemy): number => tuning.enemy.size * kindOf(e.kind).sizeScale

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
    cells: [],
    cellsLost: 0,
    lostByCells: false,
    spawnTimer: wave.spawnIntervalSeconds,
    frozen: 0,
    shields: 0,
    deadLock: 0,
    worldScale: wave.creep,
    owned: MODIFIERS.map(() => 0),
    offer: [],
    cursor: 0,
    prevBits: 0,
    rngState: rng.state(),
  }

  const retune = (): void => {
    run = applyModifiers(tuning, s.owned)
    wave = waveStats(tuning, run, s.wave)
    s.quota = wave.quota
  }

  /** Composição desta onda: a última linha da tabela cuja `fromWave` já passou. */
  const weightsFor = (waveNumber: number): ReadonlyArray<[string, number]> => {
    let chosen = tuning.enemy.spawnTable[0]!
    for (const row of tuning.enemy.spawnTable) {
      if (waveNumber >= row.fromWave) chosen = row
    }
    return Object.entries(chosen.weights).filter(([, w]) => w > 0)
  }

  const rollKind = (): string => {
    const entries = weightsFor(s.wave)
    let total = 0
    for (const [, w] of entries) total += w
    let pick = rng.nextInt(0, total)
    for (const [name, w] of entries) {
      pick -= w
      if (pick < 0) return name
    }
    return entries[0]![0]!
  }

  const pushEnemy = (kind: string, x: number, y: number): void => {
    if (s.enemies.length >= tuning.enemy.maxAlive) return
    const half = (tuning.enemy.size * kindOf(kind).sizeScale) / 2
    s.enemies.push({
      id: nextId++,
      kind,
      x: clamp(x, half, width - half),
      y: clamp(y, half, height - half),
      hp: kindOf(kind).hp,
      bornTick: s.tick,
    })
  }

  /** Nasce numa borda da arena — nunca em cima do jogador. */
  const spawnEnemy = (): void => {
    const along = rng.nextFloat()
    const edge = rng.nextInt(0, 4)
    const x = edge === 0 ? 0 : edge === 1 ? width : along * width
    const y = edge === 2 ? 0 : edge === 3 ? height : along * height
    pushEnemy(rollKind(), x, y)
  }

  /** Células em posições fixas: o jogador aprende o mapa, não sorteia. */
  const placeCells = (): void => {
    const m = 74
    const spots: ReadonlyArray<readonly [number, number]> = [
      [m, m],
      [width - m, height - m],
      [width - m, m],
      [m, height - m],
      [width / 2, m],
    ]
    s.cells = []
    for (let i = 0; i < Math.min(tuning.cells.count, spots.length); i++) {
      const spot = spots[i]!
      s.cells.push({ id: i, x: spot[0], y: spot[1], hp: tuning.cells.hp })
    }
  }

  const startWave = (): void => {
    retune()
    s.phase = "run"
    s.waveKills = 0
    s.enemies = []
    s.player.dashTicks = 0
    s.player.recoverTicks = 0
    s.spawnTimer = wave.spawnIntervalSeconds
    s.worldScale = wave.creep
    s.frozen = 0
    s.shields = run.shields
    if (s.wave > s.bestWave) s.bestWave = s.wave

    // O organismo entra em cena a partir da onda marcada e persiste na run.
    if (s.wave >= tuning.cells.fromWave && s.cells.length === 0 && s.cellsLost === 0) {
      placeCells()
    }

    const opening = Math.min(
      wave.quota,
      tuning.enemy.openingBase + (s.wave - 1) * tuning.enemy.openingPerWave,
    )
    for (let i = 0; i < opening; i++) spawnEnemy()
  }

  /** Morreu: perde os modificadores, o organismo e a onda. */
  const startRun = (): void => {
    s.owned = MODIFIERS.map(() => 0)
    s.wave = 1
    s.kills = 0
    s.offer = []
    s.cursor = 0
    s.cells = []
    s.cellsLost = 0
    s.lostByCells = false
    s.player.x = width / 2
    s.player.y = height / 2
    s.player.invulnerable = false
    s.player.invulnSkipCurrent = false
    retune()
    s.lives = run.lives
    startWave()
  }

  const offerModifiers = (): void => {
    // Reparo só entra na oferta com organismo em campo e machucado.
    const pool = MODIFIERS.map((m) => m.id).filter(
      (id) => id !== MOD_REPAIR || s.cells.some((c) => c.hp < tuning.cells.hp),
    )
    const offer: number[] = []
    const count = Math.min(tuning.pick.offerCount, pool.length)
    for (let i = 0; i < count; i++) {
      offer.push(pool.splice(rng.nextInt(0, pool.length), 1)[0]!)
    }
    s.offer = offer
    s.cursor = 0
  }

  const endRun = (byCells: boolean): void => {
    if (s.kills > s.bestKills) s.bestKills = s.kills
    s.lostByCells = byCells
    s.phase = "dead"
    s.deadLock = tuning.feel.deadLockTicks
    s.frozen = 0
  }

  const stepRun = (bits: number): void => {
    const p = s.player

    // Congelamento de impacto: o mundo inteiro para por alguns ticks para que a
    // perda seja PERCEBIDA. Fica fora de `worldScale` de propósito — aquilo é a
    // taxa do creep, que por decisão de 31/07 nunca é zero.
    if (s.frozen > 0) {
      s.frozen--
      return
    }

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
    s.worldScale = dashing ? 1 : wave.creep
    const world = dt * s.worldScale

    if (dashing) {
      const half = tuning.player.size / 2
      p.x = clamp(p.x + p.dashDx * run.dashSpeed * dt, half, width - half)
      p.y = clamp(p.y + p.dashDy * run.dashSpeed * dt, half, height - half)
      p.dashTicks--
      if (p.dashTicks === 0) {
        p.recoverTicks = wave.recoveryTicks
        if (p.invulnSkipCurrent) p.invulnSkipCurrent = false
        else p.invulnerable = false
      }
    } else if (p.recoverTicks > 0) {
      p.recoverTicks--
    }

    // --- vírus: cada tipo persegue o seu alvo, e só no tempo que o jogador liberou
    for (const e of s.enemies) {
      const spec = kindOf(e.kind)
      let tx = p.x
      let ty = p.y
      if (spec.hunts === "cell") {
        let bd = Infinity
        for (const c of s.cells) {
          const d = (c.x - e.x) * (c.x - e.x) + (c.y - e.y) * (c.y - e.y)
          if (d < bd) {
            bd = d
            tx = c.x
            ty = c.y
          }
        }
        // Sem organismo em campo, o invasor volta a caçar o jogador.
      }
      const ex = tx - e.x
      const ey = ty - e.y
      const dist = Math.sqrt(ex * ex + ey * ey)
      if (dist > 0.0001) {
        const half = sizeOf(e) / 2
        e.x = clamp(e.x + (ex / dist) * spec.speed * world, half, width - half)
        e.y = clamp(e.y + (ey / dist) * spec.speed * world, half, height - half)
      }
    }

    s.spawnTimer -= world
    if (s.spawnTimer <= 0) {
      spawnEnemy()
      s.spawnTimer += wave.spawnIntervalSeconds
    }

    // --- resolução: você corta o que dasha PARA DENTRO, e apanha do resto.
    const touchBase = tuning.player.size / 2
    let hit = false
    const survivors: Enemy[] = []
    const spawned: Array<{ kind: string; x: number; y: number }> = []

    for (const e of s.enemies) {
      const half = sizeOf(e) / 2
      const ex = e.x - p.x
      const ey = e.y - p.y
      const dist = Math.sqrt(ex * ex + ey * ey)

      if (dashing && dist <= run.killRadius) {
        const facing = dist < 0.0001 ? 1 : (ex / dist) * p.dashDx + (ey / dist) * p.dashDy
        if (facing >= run.killArc) {
          e.hp--
          if (e.hp <= 0) {
            s.kills++
            s.waveKills++
            const spec = kindOf(e.kind)
            // Estilhaços saem PERPENDICULARES ao dash e longe o bastante para
            // ficarem fora do alcance de toque. Nascendo em cima do jogador, o
            // divisor matava sem que houvesse resposta possível.
            for (let i = 0; i < spec.splits; i++) {
              const side = i % 2 === 0 ? -1 : 1
              const off = tuning.enemy.splitOffset * side
              spawned.push({
                kind: KIND_SHARD,
                x: e.x - p.dashDy * off,
                y: e.y + p.dashDx * off,
              })
            }
            continue
          }
          // Sobreviveu ao corte: é empurrado, para o segundo golpe ser possível.
          e.x = clamp(e.x + p.dashDx * 22, half, width - half)
          e.y = clamp(e.y + p.dashDy * 22, half, height - half)
          survivors.push(e)
          continue
        }
      }

      // --- o organismo: SÓ o invasor come célula.
      //
      // Sem esta guarda todo vírus comum comia célula de passagem — eles nascem
      // nas bordas e cruzam os cantos indo pro jogador. O organismo cairia por
      // um motivo que o jogador não consegue ler na tela, e a silhueta verde de
      // três pontas deixaria de significar alguma coisa.
      let consumed = false
      for (const c of kindOf(e.kind).hunts === "cell" ? s.cells : []) {
        if (c.hp <= 0) continue
        const cx = c.x - e.x
        const cy = c.y - e.y
        if (Math.sqrt(cx * cx + cy * cy) <= tuning.cells.size / 2 + half) {
          c.hp--
          if (c.hp <= 0) s.cellsLost++
          consumed = true
          break
        }
      }
      if (consumed) continue

      // Carência de nascimento: nada machuca no instante em que aparece.
      const newborn = s.tick - e.bornTick < tuning.enemy.spawnGraceTicks
      if (dist <= touchBase + half && !newborn && !p.invulnerable && !hit) {
        hit = true
        continue
      }
      survivors.push(e)
    }

    s.enemies = survivors
    for (const sp of spawned) pushEnemy(sp.kind, sp.x, sp.y)
    s.cells = s.cells.filter((c) => c.hp > 0)

    if (hit) {
      p.invulnerable = true
      if (p.dashTicks > 0) p.invulnSkipCurrent = true
      s.frozen = tuning.feel.hitFreezeTicks

      if (s.shields > 0) {
        s.shields--
      } else {
        s.lives--
        if (s.lives <= 0) {
          endRun(false)
          return
        }
      }
    }

    // Perder o organismo inteiro encerra a run mesmo com vidas sobrando.
    if (s.cellsLost > 0 && s.cells.length === 0) {
      endRun(true)
      return
    }

    if (s.waveKills >= s.quota) {
      s.phase = "pick"
      s.frozen = tuning.feel.waveFreezeTicks
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
        // Contadores entram agora; curvas entram no próximo `retune`.
        if (id === MOD_EXTRA_LIFE) s.lives++
        if (id === MOD_REPAIR) for (const c of s.cells) c.hp = tuning.cells.hp
      }
      s.offer = []
      s.wave++
      startWave()
    }
  }

  /**
   * Não recomeça sozinho, ignora input por um instante, e exige uma tecla que
   * NÃO é a da escolha de modificador. As três coisas existem pela mesma razão:
   * o gate mede segunda partida voluntária, e reflexo não é vontade.
   */
  const stepDead = (bits: number): void => {
    if (s.deadLock > 0) {
      s.deadLock--
      return
    }
    if ((bits & ~s.prevBits) & BIT_RESTART) {
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
      .u32(s.frozen)
      .u32(s.shields)
      .u32(s.deadLock)
      .u32(s.cellsLost)
      .bool(s.lostByCells)
      .u32(s.enemies.length)
      .u32(s.cells.length)
      .u32(s.cursor)
      .u8(s.prevBits)
      .u32(s.rngState)
    for (const e of s.enemies) {
      packer.u32(e.id).f64(e.x).f64(e.y).u32(e.hp).u32(e.bornTick)
      for (let i = 0; i < e.kind.length; i++) packer.u8(e.kind.charCodeAt(i))
    }
    for (const c of s.cells) packer.u32(c.id).f64(c.x).f64(c.y).u32(c.hp)
    for (const n of s.owned) packer.u32(n)
    for (const id of s.offer) packer.u32(id)

    return { tick: s.tick, hash: packer.digest() }
  }

  startWave()

  return {
    step,
    snapshot,
    serialize: () => structuredClone(s),
    state: () => s,
  }
}
