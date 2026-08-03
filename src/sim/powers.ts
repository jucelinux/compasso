import type { Tuning } from "./types.ts"

/**
 * Poderes — automáticos, temporários e aleatórios.
 *
 * Decisão do humano em 01/08, CONTRA a minha recomendação. O custo foi apontado
 * e aceito: some a camada de draft (escolher 1 de 3 era o que fazia isto ser
 * roguelite) e some a build permanente da run. Em troca, o ritmo fica frenético
 * e a recompensa vira coisa que cai da tela.
 *
 * Cada patógeno tem chance de largar uma cápsula ao morrer. Encostar nela liga
 * o poder por um tempo. Nada é escolhido e nada é permanente.
 */
export interface Power {
  readonly id: number
  readonly name: string
  readonly blurb: string
  readonly color: number
}

export const POWERS: readonly Power[] = [
  { id: 0, name: "CITOCINA", blurb: "seu rastro queima", color: 0x7fe9ff },
  { id: 1, name: "FEBRE", blurb: "o corpo ferve a cada 6", color: 0xff8a3d },
  { id: 2, name: "ANTICORPO", blurb: "orbita e corta", color: 0x8affc8 },
  { id: 3, name: "MACRÓFAGO", blurb: "um aliado caça", color: 0xbfe6ff },
  { id: 4, name: "HISTAMINA", blurb: "quem morre deixa nuvem", color: 0xffe58a },
  { id: 5, name: "INTERFERON", blurb: "o que chega perto emperra", color: 0x8fd8ff },
  { id: 6, name: "ENZIMA", blurb: "engole qualquer coisa", color: 0xff5ad0 },
  { id: 7, name: "SURTO", blurb: "você fica mais rápida", color: 0xffd23d },
  { id: 8, name: "MEMBRANA", blurb: "absorve um toque", color: 0xa0ffd0 },
  { id: 9, name: "PLAQUETA", blurb: "regenera o tecido", color: 0x6ec2ff },
]

/** Efeito imediato, não temporário: acontece ao encostar e acaba ali. */
export const INSTANT = new Set([9])

/** O que está ligado agora. Recalculado todo tick a partir dos ativos. */
export interface ActiveStats {
  trailTicks: number
  trailRadius: number
  shockEvery: number
  shockRadius: number
  orbiters: number
  macrophages: number
  cloudTicks: number
  interferonRadius: number
  interferonSlow: number
  /** `true` = engole qualquer patógeno, ignorando a velocidade exigida. */
  enzyme: boolean
  speedMultiplier: number
}

/**
 * `owned` é o que você ESCOLHEU e vale a run inteira; `active` é o que ainda
 * escorre de um efeito temporário.
 *
 * Os dois existem porque em 02/08 o sorteio por abate morreu: com 475 abates
 * numa fase o jogador virava enxurrada de poder, e o pior é que a enxurrada
 * premiava ficar PARADO — parar multiplica bacilo, bacilo vira abate, abate
 * virava poder. Escolha no card não tem esse laço.
 */
export function activeStats(
  tuning: Tuning,
  active: readonly number[],
  owned: readonly number[] = [],
): ActiveStats {
  const on = (id: number): boolean => (active[id] ?? 0) > 0 || (owned[id] ?? 0) > 0
  const p = tuning.powers

  return {
    trailTicks: on(0) ? p.trailTicks : 0,
    trailRadius: p.trailRadius,
    shockEvery: on(1) ? p.shockEvery : 0,
    shockRadius: p.shockRadius,
    orbiters: on(2) ? 2 : 0,
    macrophages: on(3) ? 1 : 0,
    cloudTicks: on(4) ? p.cloudTicks : 0,
    interferonRadius: on(5) ? p.interferonRadius : 0,
    interferonSlow: p.interferonSlow,
    enzyme: on(6),
    speedMultiplier: on(7) ? p.surgeSpeed : 1,
  }
}

/**
 * A cota cresce em curva, não em soma.
 *
 * O humano reclamou em 01/08 que "a quantidade de kills era a mesma de acordo
 * com o nível": +5 linear some dentro de números que já são grandes. Curva
 * exponencial suave faz a onda 10 custar visivelmente mais que a onda 2.
 */
export function quotaFor(tuning: Tuning, wave: number): number {
  const step = Math.max(0, wave - 1)
  // Quadrática, não `Math.pow`: expoente arbitrário não é bit-a-bit entre
  // engines, e o rig depende de Node e browser darem o mesmo hash.
  return Math.round(
    tuning.wave.baseQuota + tuning.wave.quotaGrowth * step + tuning.wave.quotaAccel * step * step,
  )
}

/** Intervalo de spawn da onda. Aperta por divisão: nunca chega a zero. */
export function spawnIntervalFor(tuning: Tuning, wave: number): number {
  const step = Math.max(0, wave - 1)
  return tuning.enemy.spawnIntervalSeconds / (1 + step * tuning.enemy.spawnPerWave)
}
