import { Packer } from "./hash.ts"
import { activeStats, INSTANT, POWERS, quotaFor, spawnIntervalFor } from "./powers.ts"
import {
  fieldSpec,
  healAround,
  healthiestTile,
  infectAt,
  makeField,
  spreadStep,
  tileAt,
  tileCenterX,
  tileCenterY,
  totalInfection,
} from "./field.ts"
import { createRng } from "./rng.ts"
import type { Enemy, InputFrame, KindSpec, Sim, SimSnapshot, SimState, Tuning } from "./types.ts"

/**
 * COMPASSO — o tempo só anda quando você anda.
 *
 * REESCRITO em 01/08. O dash discreto era o core e caiu no gate, três leituras
 * negativas seguidas: o humano descreveu como "soluços", e arranco discreto não
 * vira fluidez com polimento — é o desenho.
 *
 * O core agora é contínuo: **a sua velocidade É a escala do tempo do mundo**.
 * Parada, a célula deixa o mundo a 5%; a toda, a 100%. Pela primeira vez a frase
 * do projeto é literalmente verdadeira, e não só durante rajadas de 9 ticks.
 *
 * Ataque é fagocitose por velocidade: encostar rápido engole, encostar devagar
 * machuca, e cada patógeno exige a sua velocidade. Isso amarra ataque, relógio e
 * risco no mesmo número — acelerar para matar é escolher acelerar o inimigo.
 *
 * O jogador anda em TEMPO REAL; todo o resto anda em TEMPO DE MUNDO. É essa
 * assimetria que faz a dilatação existir.
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

/** Oito direções de entrada. A velocidade resultante é contínua. */
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

const KIND_SHARD = "ecoli_filha"

export function createSim(seed: number, tuning: Tuning): Sim {
  const rng = createRng(seed)
  const dt = 1 / tuning.sim.hz
  const { width, height } = tuning.arena
  const packer = new Packer(8192)
  const FIELD = fieldSpec(width, height, tuning.field.cols, tuning.field.rows)
  const MAXINF = tuning.field.maxInfection
  const LOSE = Math.round(FIELD.cols * FIELD.rows * MAXINF * tuning.field.loseFraction)
  const WIN = Math.round(FIELD.cols * FIELD.rows * MAXINF * tuning.field.winFraction)
  const scratch = new Int16Array(FIELD.cols * FIELD.rows)

  let nextId = 0
  const kindOf = (name: string): KindSpec => tuning.enemy.kinds[name]!
  const sizeOf = (e: Enemy): number => tuning.enemy.size * kindOf(e.kind).sizeScale

  const s: SimState = {
    tick: 0,
    phase: "run",
    runIndex: 0,
    wave: 1,
    waveKills: 0,
    quota: quotaFor(tuning, 1),
    lives: tuning.run.lives,
    shields: 0,
    kills: 0,
    bestKills: 0,
    bestWave: 1,
    player: {
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      speed: 0,
      dashTicks: 0,
      dashCooldown: 0,
      invulnerable: false,
    },
    enemies: [],
    field: makeField(FIELD),
    infection: 0,
    spreadTimer: 0,
    infectAcc: 0,
    healAcc: 0,
    lostByTissue: false,
    drops: [],
    active: POWERS.map(() => 0),
    trails: [],
    shocks: [],
    orbiters: [],
    macrophages: [],
    clouds: [],
    killsSincePulse: 0,
    spawnTimer: spawnIntervalFor(tuning, 1),
    frozen: 0,
    deadLock: 0,
    combo: 0,
    comboTicks: 0,
    comboBest: 0,
    lastKillX: 0,
    lastKillY: 0,
    lastKillTick: -1,
    worldScale: tuning.time.creep,
    prevBits: 0,
    rngState: rng.state(),
  }

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

  /**
   * O patógeno nasce DO TECIDO INFECTADO, não da borda da tela.
   *
   * Esta é a peça que faz a fase convergir. Com spawn de borda em intervalo
   * fixo, a infecção nunca podia chegar a zero — a sonda de 01/08 mostrou cinco
   * seeds e zero fases limpas, porque a condição de vitória era inalcançável por
   * construção.
   *
   * Nascendo do tecido, o sistema vira realimentação nos DOIS sentidos: matar
   * fonte reduz infecção, que reduz spawn, que reduz infecção. Deixar crescer faz
   * o contrário. O trabalho do jogador é inverter o sinal — e isso É a curva de
   * tensão, porque a mesma alavanca acelera os dois lados.
   */
  const spawnFromTissue = (): boolean => {
    let candidatos = 0
    for (let i = 0; i < s.field.length; i++) {
      if (s.field[i]! >= tuning.field.spawnThreshold) candidatos++
    }
    if (candidatos === 0) return false
    let pick = rng.nextInt(0, candidatos)
    for (let i = 0; i < s.field.length; i++) {
      if (s.field[i]! < tuning.field.spawnThreshold) continue
      if (pick-- > 0) continue
      pushEnemy(rollKind(), tileCenterX(FIELD, i), tileCenterY(FIELD, i))
      return true
    }
    return false
  }

  /** Semeia os focos iniciais da doença, longe do centro onde a célula nasce. */
  const seedInfection = (): void => {
    s.field.fill(0)
    // A doença escala por fase: mais focos iniciais e fonte mais forte. Sem
    // isto a fase 20 é idêntica à fase 1, que é a queixa de 01/08 com outra
    // roupa ("a quantidade de kills era a mesma de acordo com o nível").
    const focos = tuning.field.seeds + Math.floor((s.wave - 1) * tuning.field.seedsPerWave)
    for (let i = 0; i < focos; i++) {
      const col = rng.nextInt(0, FIELD.cols)
      const row = rng.nextInt(0, FIELD.rows)
      infectAt(s.field, row * FIELD.cols + col, MAXINF, MAXINF)
    }
    s.infection = totalInfection(s.field)
  }

  const startWave = (): void => {
    s.phase = "run"
    s.waveKills = 0
    s.quota = quotaFor(tuning, s.wave)
    s.enemies = []
    s.spawnTimer = spawnIntervalFor(tuning, s.wave)
    s.frozen = 0
    if (s.wave > s.bestWave) s.bestWave = s.wave

    seedInfection()
    s.spreadTimer = 0

    const opening = tuning.enemy.openingBase + (s.wave - 1) * tuning.enemy.openingPerWave
    for (let i = 0; i < opening; i++) spawnFromTissue()
  }

  const startRun = (): void => {
    s.wave = 1
    s.kills = 0
    s.field.fill(0)
    s.infection = 0
    s.spreadTimer = 0
    s.infectAcc = 0
    s.healAcc = 0
    s.lostByTissue = false
    s.lives = tuning.run.lives
    s.shields = 0
    s.drops = []
    s.active = POWERS.map(() => 0)
    s.trails = []
    s.shocks = []
    s.orbiters = []
    s.macrophages = []
    s.clouds = []
    s.killsSincePulse = 0
    s.combo = 0
    s.comboBest = 0
    s.player.x = width / 2
    s.player.y = height / 2
    s.player.vx = 0
    s.player.vy = 0
    s.player.speed = 0
    s.player.dashTicks = 0
    s.player.dashCooldown = 0
    s.player.invulnerable = false
    startWave()
  }

  const endRun = (byTissue: boolean): void => {
    if (s.kills > s.bestKills) s.bestKills = s.kills
    s.lostByTissue = byTissue
    s.phase = "dead"
    s.deadLock = tuning.run.deadLockTicks
    s.frozen = 0
  }

  /** Liga um poder. Instantâneos agem na hora e não ficam ativos. */
  const grant = (power: number): void => {
    if (INSTANT.has(power)) {
      for (let i = 0; i < s.field.length; i++) {
        const v = s.field[i]! - tuning.field.plaquetaHeal
        s.field[i] = v < 0 ? 0 : v
      }
      s.infection = totalInfection(s.field)
      return
    }
    if (power === 8) {
      s.shields += tuning.powers.shieldHits
      return
    }
    s.active[power] = Math.max(s.active[power] ?? 0, tuning.drops.durationTicks)
  }

  const stepRun = (bits: number): void => {
    const p = s.player

    if (s.frozen > 0) {
      s.frozen--
      return
    }

    // --- poderes ativos envelhecem em tempo real: são o seu gesto, não o mundo
    for (let i = 0; i < s.active.length; i++) {
      if ((s.active[i] ?? 0) > 0) s.active[i] = (s.active[i] ?? 0) - 1
    }
    const st = activeStats(tuning, s.active)

    // --- impulso: agora é habilidade com recarga, não o verbo
    if (p.dashCooldown > 0) p.dashCooldown--
    const dir = direction(bits)
    if ((bits & ~s.prevBits & BIT_ACTION) !== 0 && p.dashCooldown === 0 && dir !== null) {
      p.dashTicks = tuning.dash.durationTicks
      p.dashCooldown = tuning.dash.cooldownTicks
      p.vx = dir.dx * tuning.player.maxSpeed * tuning.dash.speedMultiplier
      p.vy = dir.dy * tuning.player.maxSpeed * tuning.dash.speedMultiplier
    }

    // --- movimento contínuo: aceleração e arrasto, sem passo discreto
    const maxSpeed = tuning.player.maxSpeed * st.speedMultiplier
    if (p.dashTicks > 0) {
      p.dashTicks--
    } else if (dir !== null) {
      p.vx += dir.dx * tuning.player.accel * dt
      p.vy += dir.dy * tuning.player.accel * dt
    } else {
      const sp0 = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (sp0 > 0.001) {
        const drop = Math.min(sp0, tuning.player.drag * dt)
        p.vx -= (p.vx / sp0) * drop
        p.vy -= (p.vy / sp0) * drop
      } else {
        p.vx = 0
        p.vy = 0
      }
    }

    let sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    const cap = p.dashTicks > 0 ? maxSpeed * tuning.dash.speedMultiplier : maxSpeed
    if (sp > cap) {
      p.vx = (p.vx / sp) * cap
      p.vy = (p.vy / sp) * cap
      sp = cap
    }
    p.speed = sp / tuning.player.maxSpeed

    // O jogador anda em tempo REAL. É essa assimetria que cria a dilatação.
    const half = tuning.player.size / 2
    const nx = p.x + p.vx * dt
    const ny = p.y + p.vy * dt
    if (nx < half || nx > width - half) p.vx = -p.vx * 0.4
    if (ny < half || ny > height - half) p.vy = -p.vy * 0.4
    p.x = clamp(nx, half, width - half)
    p.y = clamp(ny, half, height - half)

    // --- O RELÓGIO. A escala do tempo é a sua velocidade, e nada mais.
    const t01 = Math.min(1, sp / tuning.player.maxSpeed)
    // `t·√t` no lugar de `t^1.5`: só multiplicação e raiz, que são exatas.
    const eased = t01 * Math.sqrt(t01)
    const mix = tuning.time.linearMix
    s.worldScale =
      tuning.time.creep + (1 - tuning.time.creep) * (mix * t01 + (1 - mix) * eased)
    const world = dt * s.worldScale

    // --- combo, rastro e cápsulas envelhecem em tempo real
    if (s.comboTicks > 0) {
      s.comboTicks--
      if (s.comboTicks === 0) s.combo = 0
    }
    if (st.trailTicks > 0) s.trails.push({ id: nextId++, x: p.x, y: p.y, life: st.trailTicks })
    for (const tr of s.trails) tr.life--
    s.trails = s.trails.filter((tr) => tr.life > 0)
    for (const sh of s.shocks) sh.life--
    s.shocks = s.shocks.filter((sh) => sh.life > 0)
    for (const cl of s.clouds) cl.life--
    s.clouds = s.clouds.filter((cl) => cl.life > 0)
    for (const d of s.drops) d.life--
    s.drops = s.drops.filter((d) => d.life > 0)

    // --- anticorpos e macrófagos acompanham os poderes ligados
    while (s.orbiters.length < st.orbiters) {
      const c = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ][s.orbiters.length % 4]!
      s.orbiters.push({ ox: c[0]!, oy: c[1]! })
    }
    if (s.orbiters.length > st.orbiters) s.orbiters.length = st.orbiters
    while (s.macrophages.length < st.macrophages) {
      s.macrophages.push({ id: nextId++, x: width / 2, y: height / 4 })
    }
    if (s.macrophages.length > st.macrophages) s.macrophages.length = st.macrophages

    const { orbitCos, orbitSin } = tuning.powers
    for (const o of s.orbiters) {
      const ox = o.ox * orbitCos - o.oy * orbitSin
      const oy = o.ox * orbitSin + o.oy * orbitCos
      const len = Math.sqrt(ox * ox + oy * oy) || 1
      o.ox = ox / len
      o.oy = oy / len
    }
    for (const m of s.macrophages) {
      let bx = p.x
      let by = p.y
      let bd = Infinity
      for (const e of s.enemies) {
        const d = (e.x - m.x) * (e.x - m.x) + (e.y - m.y) * (e.y - m.y)
        if (d < bd) {
          bd = d
          bx = e.x
          by = e.y
        }
      }
      const mx = bx - m.x
      const my = by - m.y
      const md = Math.sqrt(mx * mx + my * my)
      if (md > 0.5) {
        m.x = clamp(m.x + (mx / md) * tuning.powers.macrophageSpeed * world, 8, width - 8)
        m.y = clamp(m.y + (my / md) * tuning.powers.macrophageSpeed * world, 8, height - 8)
      }
    }

    // --- patógenos: em tempo de MUNDO
    for (const e of s.enemies) {
      const spec = kindOf(e.kind)
      let tx = p.x
      let ty = p.y
      if (spec.hunts === "cell") {
        // Vai atrás do tecido mais SADIO: ele quer terreno novo, não você.
        const target = healthiestTile(s.field, MAXINF)
        tx = tileCenterX(FIELD, target)
        ty = tileCenterY(FIELD, target)
      }
      const ex = tx - e.x
      const ey = ty - e.y
      const dist = Math.sqrt(ex * ex + ey * ey)
      if (dist > 0.0001) {
        let speed = spec.speed
        if (st.interferonRadius > 0) {
          const px2 = p.x - e.x
          const py2 = p.y - e.y
          if (Math.sqrt(px2 * px2 + py2 * py2) <= st.interferonRadius) speed *= st.interferonSlow
        }
        const eh = sizeOf(e) / 2
        e.x = clamp(e.x + (ex / dist) * speed * world, eh, width - eh)
        e.y = clamp(e.y + (ey / dist) * speed * world, eh, height - eh)
      }
    }

    /*
     * O intervalo de spawn escala com a INFECÇÃO, não com o relógio da onda.
     * Campo limpo não produz patógeno nenhum; campo tomado produz sem parar.
     */
    s.spawnTimer -= world
    if (s.spawnTimer <= 0) {
      spawnFromTissue()
      const frac = Math.min(1, s.infection / (FIELD.cols * FIELD.rows * MAXINF))
      const base = spawnIntervalFor(tuning, s.wave)
      s.spawnTimer += base + (tuning.field.spawnCalmSeconds - base) * (1 - Math.min(1, frac * 4))
    }

    // --- cápsulas: atraídas de perto, coletadas por contato
    for (const d of s.drops) {
      const gx = p.x - d.x
      const gy = p.y - d.y
      const gd = Math.sqrt(gx * gx + gy * gy)
      if (gd < tuning.drops.magnetRadius && gd > 0.5) {
        d.x += (gx / gd) * tuning.drops.magnetSpeed * dt
        d.y += (gy / gd) * tuning.drops.magnetSpeed * dt
      }
    }
    const keptDrops = []
    for (const d of s.drops) {
      const gx = p.x - d.x
      const gy = p.y - d.y
      if (Math.sqrt(gx * gx + gy * gy) <= half + 8) grant(d.power)
      else keptDrops.push(d)
    }
    s.drops = keptDrops

    const spawned: Array<{ kind: string; x: number; y: number }> = []

    const killed = (e: Enemy): void => {
      s.kills++
      s.waveKills++
      s.combo++
      s.comboTicks = tuning.powers.comboWindowTicks
      if (s.combo > s.comboBest) s.comboBest = s.combo
      s.lastKillX = e.x
      s.lastKillY = e.y
      s.lastKillTick = s.tick

      const spec = kindOf(e.kind)
      for (let i = 0; i < spec.splits; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const off = tuning.enemy.splitOffset * side
        const vlen = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1
        spawned.push({
          kind: KIND_SHARD,
          x: e.x - (p.vy / vlen) * off,
          y: e.y + (p.vx / vlen) * off,
        })
      }
      if (st.cloudTicks > 0) s.clouds.push({ id: nextId++, x: e.x, y: e.y, life: st.cloudTicks })
      if (st.shockEvery > 0) {
        s.killsSincePulse++
        if (s.killsSincePulse >= st.shockEvery) {
          s.killsSincePulse = 0
          s.shocks.push({
            id: nextId++,
            x: p.x,
            y: p.y,
            radius: st.shockRadius,
            life: tuning.powers.shockLifeTicks,
          })
        }
      }
      if (s.drops.length < tuning.drops.maxOnField && rng.nextFloat() < tuning.drops.chance) {
        s.drops.push({
          id: nextId++,
          power: rng.nextInt(0, POWERS.length),
          x: e.x,
          y: e.y,
          life: tuning.drops.lifeTicks,
        })
      }
    }

    /*
     * --- O TECIDO
     *
     * Três relógios diferentes de propósito, e a briga entre eles é o jogo:
     * a fonte e o alastramento andam em tempo de MUNDO, a cura anda em tempo
     * REAL e cai com a sua velocidade. Correr até o outro lado apaga um foco e
     * acende três atrás; ficar parado limpa fundo e não cobre chão nenhum.
     */
    /*
     * A doença tem RELÓGIO PRÓPRIO, com piso.
     *
     * Antes ela andava só em tempo de mundo, e parado o mundo corre a 5% — então
     * ficar parado era quase de graça, e o humano apontou: "precisa me punir
     * quando fico parado, e também quando fico só me movimentando". Doença
     * progride quer você se mexa ou não; é o patógeno que anda no seu relógio,
     * não a infecção. Com piso, nenhum dos dois extremos é jogável e o ótimo
     * passa a ser oscilar.
     */
    const fonte = tuning.field.sourceRate * (1 + (s.wave - 1) * tuning.field.sourcePerWave)
    const passo = Math.max(tuning.field.idleProgress, s.worldScale) * dt
    s.infectAcc += fonte * passo
    if (s.infectAcc >= 1) {
      const n = Math.floor(s.infectAcc)
      s.infectAcc -= n
      for (const e of s.enemies) infectAt(s.field, tileAt(FIELD, e.x, e.y), n, MAXINF)
    }

    // O mesmo piso da fonte. Sem ele o ALASTRAMENTO congelava com o jogador
    // parado, e ficar parado continuava sendo refúgio mesmo com a fonte no piso
    // — é o alastramento que toma terreno, não a fonte.
    s.spreadTimer += passo
    if (s.spreadTimer >= tuning.field.spreadSeconds) {
      s.spreadTimer -= tuning.field.spreadSeconds
      spreadStep(
        s.field,
        scratch,
        FIELD,
        tuning.field.spreadThreshold,
        tuning.field.spreadAmount,
        MAXINF,
      )
    }

    const healRate =
      tuning.field.healRate * Math.max(0, 1 - p.speed * tuning.field.healSpeedPenalty)
    s.healAcc += healRate * dt
    if (s.healAcc >= 1) {
      const n = Math.floor(s.healAcc)
      s.healAcc -= n
      healAround(s.field, FIELD, p.x, p.y, tuning.field.healRadius, n)
    }

    s.infection = totalInfection(s.field)

    // --- resolução: fagocitose por velocidade
    let hit = false
    /*
     * Abate POR CONTATO neste tick — o seu gesto, não o de um poder passivo.
     * É o que derruba os i-frames, mais abaixo. Acumulado durante o laço e
     * aplicado depois dele de propósito: se derrubasse no meio, o patógeno
     * seguinte da lista poderia acertar você no mesmo tick, e a ordem do array
     * viraria regra de jogo.
     */
    let contactKill = false
    const survivors: Enemy[] = []
    for (const e of s.enemies) {
      const eh = sizeOf(e) / 2
      const ex = e.x - p.x
      const ey = e.y - p.y
      const dist = Math.sqrt(ex * ex + ey * ey)
      const newborn = s.tick - e.bornTick < tuning.enemy.spawnGraceTicks

      let eaten = false
      for (const o of s.orbiters) {
        const gx = p.x + o.ox * tuning.powers.orbitRadius - e.x
        const gy = p.y + o.oy * tuning.powers.orbitRadius - e.y
        if (Math.sqrt(gx * gx + gy * gy) <= tuning.powers.orbitKillRadius + eh) {
          eaten = true
          break
        }
      }
      if (!eaten) {
        for (const m of s.macrophages) {
          const gx = m.x - e.x
          const gy = m.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= tuning.powers.macrophageRadius + eh) {
            eaten = true
            break
          }
        }
      }
      if (!eaten) {
        for (const tr of s.trails) {
          const gx = tr.x - e.x
          const gy = tr.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= st.trailRadius + eh) {
            eaten = true
            break
          }
        }
      }
      if (!eaten) {
        for (const cl of s.clouds) {
          const gx = cl.x - e.x
          const gy = cl.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= tuning.powers.cloudRadius + eh) {
            eaten = true
            break
          }
        }
      }

      /*
       * O contato. Rápido o bastante, você engole; devagar, você apanha.
       * A velocidade exigida é por patógeno: influenza cede a 28% da sua
       * velocidade máxima, S. aureus só a 70%, SARS-CoV-2 quase no talo.
       */
      if (!eaten && dist <= half + eh) {
        if (st.enzyme || p.speed >= kindOf(e.kind).engulfSpeed) {
          eaten = true
          contactKill = true
        } else if (!newborn && !p.invulnerable && !hit) {
          hit = true
          continue
        }
      }

      if (eaten) {
        e.hp--
        if (e.hp <= 0) {
          killed(e)
          continue
        }
        survivors.push(e)
        continue
      }

      survivors.push(e)
    }
    s.enemies = survivors
    for (const sp2 of spawned) pushEnemy(sp2.kind, sp2.x, sp2.y)

    // --- pulso mata no tick em que nasce
    const fresh = s.shocks.filter((sh) => sh.life === tuning.powers.shockLifeTicks)
    if (fresh.length > 0) {
      const left: Enemy[] = []
      for (const e of s.enemies) {
        let popped = false
        for (const sh of fresh) {
          const gx = sh.x - e.x
          const gy = sh.y - e.y
          if (Math.sqrt(gx * gx + gy * gy) <= sh.radius) {
            popped = true
            break
          }
        }
        if (popped) {
          e.hp--
          if (e.hp <= 0) {
            killed(e)
            continue
          }
        }
        left.push(e)
      }
      s.enemies = left
    }

    if (hit) {
      p.invulnerable = true
      s.frozen = tuning.run.hitFreezeTicks
      // Apanhar te FREIA: o custo do erro é perder o relógio junto com a vida.
      p.vx *= 0.15
      p.vy *= 0.15
      p.speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) / tuning.player.maxSpeed
      if (s.shields > 0) {
        s.shields--
      } else {
        s.lives--
        if (s.lives <= 0) {
          endRun(false)
          return
        }
      }
    } else if (p.invulnerable && contactKill) {
      /*
       * Os i-frames caem no primeiro patógeno que você engole. Regra sem número,
       * como as outras duas que o humano aprovou.
       *
       * A regra anterior era "cai ao atingir 85% da velocidade", e tinha um
       * buraco: como nada limitava o tempo, dava para tomar um toque, ficar logo
       * abaixo de 0.85 e comer cinco dos seis patógenos com risco zero e sem
       * prazo — a fagocitose só olha `engulfSpeed`, e cinco deles cedem abaixo
       * de 0.85. Medido com o bot `exploradora` em 01/08: o buraco existia mas
       * quase não era alcançável na prática. Fechado mesmo assim, porque
       * invulnerabilidade sem fim é regra torta esperando um jogador melhor.
       *
       * Só abate por CONTATO conta. Nuvem, órbita e macrófago são o abate
       * passivo, que já tem teto próprio declarado em 31/07.
       */
      p.invulnerable = false
    }

    if (s.infection >= LOSE) {
      endRun(true)
      return
    }

    /*
     * A fase acaba CONTIDA, não esterilizada: infecção abaixo do limiar E nenhum
     * patógeno vivo. Exigir zero absoluto transformava o fim de fase numa
     * varredura de 576 tiles atrás dos últimos sujos — a sonda mediu 10 minutos
     * por fase. Conter e depois caçar os últimos é o fim divertido; varrer não é.
     */
    if (s.infection <= WIN && s.enemies.length === 0) {
      s.wave++
      startWave()
    }
  }

  const stepDead = (bits: number): void => {
    if (s.deadLock > 0) {
      s.deadLock--
      return
    }
    if ((bits & ~s.prevBits & BIT_RESTART) !== 0) {
      s.runIndex++
      startRun()
    }
  }

  const step = (input: InputFrame): void => {
    const bits = bitsOf(input)
    if (s.phase === "run") stepRun(bits)
    else stepDead(bits)
    s.prevBits = bits
    s.rngState = rng.state()
    s.tick++
  }

  const snapshot = (): SimSnapshot => {
    packer
      .reset()
      .u32(s.tick)
      .u8(s.phase === "run" ? 0 : 2)
      .u32(s.runIndex)
      .u32(s.wave)
      .u32(s.waveKills)
      .u32(s.quota)
      .u32(s.lives < 0 ? 0 : s.lives)
      .u32(s.shields)
      .u32(s.kills)
      .u32(s.bestKills)
      .u32(s.bestWave)
      .f64(s.player.x)
      .f64(s.player.y)
      .f64(s.player.vx)
      .f64(s.player.vy)
      .u32(s.player.dashTicks)
      .u32(s.player.dashCooldown)
      .bool(s.player.invulnerable)
      .f64(s.spawnTimer)
      .f64(s.worldScale)
      .u32(s.frozen)
      .u32(s.deadLock)
      .u32(s.infection)
      .f64(s.spreadTimer)
      .f64(s.infectAcc)
      .f64(s.healAcc)
      .bool(s.lostByTissue)
      .u32(s.combo)
      .u32(s.comboTicks)
      .u32(s.enemies.length)

      .u32(s.drops.length)
      .u32(s.trails.length)
      .u32(s.shocks.length)
      .u32(s.clouds.length)
      .u32(s.orbiters.length)
      .u32(s.macrophages.length)
      .u32(s.killsSincePulse)
      .u8(s.prevBits)
      .u32(s.rngState)
    for (const e of s.enemies) {
      packer.u32(e.id).f64(e.x).f64(e.y).u32(e.hp).u32(e.bornTick)
      for (let i = 0; i < e.kind.length; i++) packer.u8(e.kind.charCodeAt(i))
    }
    for (let i = 0; i < s.field.length; i++) packer.u8(s.field[i]!)
    for (const d of s.drops) packer.u32(d.id).u32(d.power).f64(d.x).f64(d.y).u32(d.life)
    for (const n of s.active) packer.u32(n)
    for (const tr of s.trails) packer.f64(tr.x).f64(tr.y).u32(tr.life)
    for (const sh of s.shocks) packer.f64(sh.x).f64(sh.y).u32(sh.life)
    for (const cl of s.clouds) packer.f64(cl.x).f64(cl.y).u32(cl.life)
    for (const o of s.orbiters) packer.f64(o.ox).f64(o.oy)
    for (const m of s.macrophages) packer.f64(m.x).f64(m.y)

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
