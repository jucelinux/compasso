/**
 * Fonte única de aleatoriedade, semeada e injetada. `Math.random()` é proibido
 * em `src/sim/`.
 *
 * mulberry32: só inteiros de 32 bits e `Math.imul`, ambos exatos. Nada de
 * transcendentais — `sin`/`cos`/`pow` não têm bit-a-bit garantido entre engines,
 * e o rig depende de Node e browser produzirem o mesmo hash.
 */
export interface Rng {
  /** Inteiro sem sinal de 32 bits. */
  nextU32(): number
  /** `[0, 1)` — 32 bits de mantissa, derivado de `nextU32`. */
  nextFloat(): number
  /**
   * `[min, max)` sobre inteiros. Módulo puro: sem viés só quando o intervalo
   * divide 2³² (2, 4, 8, 16...). Para escolher 3 de 5 modificadores depois,
   * trocar por rejection sampling.
   */
  nextInt(min: number, max: number): number
  /** Estado interno, para entrar no hash da sim. */
  state(): number
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0

  const nextU32 = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  const nextFloat = (): number => nextU32() / 4294967296

  return {
    nextU32,
    nextFloat,
    nextInt: (min, max) => min + (nextU32() % (max - min)),
    state: () => a >>> 0,
  }
}
