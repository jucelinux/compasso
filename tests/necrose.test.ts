import { describe, expect, it } from "vitest"
import tuningJson from "../tuning.json"
import { createSim } from "../src/sim/sim.ts"
import { atravessaTela } from "../src/harness/atravessa.ts"
import type { Tuning } from "../src/sim/types.ts"
import {
  applyNecroseFloor,
  healNecroseAround,
  liveInfection,
  necroseStep,
  fieldSpec,
} from "../src/sim/field.ts"

const base = tuningJson as Tuning
/*
 * A NECROSE é o ratchet de 05/08, e o que ela promete é fácil de quebrar sem
 * ninguém notar: o piso é aplicado num lugar só, e QUALQUER cura nova que
 * esqueça de chamá-lo devolve a cicatriz de graça. Estes testes existem para
 * que esse esquecimento apareça como vermelho e não como "o jogo ficou fácil".
 */
describe("necrose — as quatro regras", () => {
  it("cicatriza SÓ o tile no talo", () => {
    const field = new Uint8Array([100, 99, 0, 100])
    const nec = new Uint8Array(4)
    necroseStep(field, nec, 6, 100)
    expect([...nec]).toEqual([6, 0, 0, 6])
  })

  it("a cicatriz é PISO da infecção", () => {
    const field = new Uint8Array([10, 0, 80])
    const nec = new Uint8Array([40, 0, 20])
    applyNecroseFloor(field, nec)
    expect([...field]).toEqual([40, 0, 80])
  })

  it("nunca passa do teto do tile", () => {
    const field = new Uint8Array([100])
    const nec = new Uint8Array([98])
    necroseStep(field, nec, 6, 100)
    expect(nec[0]).toBe(100)
  })

  it("tecido morto não pare: só a infecção VIVA conta", () => {
    const field = new Uint8Array([100, 100])
    const nec = new Uint8Array([100, 0])
    expect(liveInfection(field, nec, 0)).toBe(0)
    expect(liveInfection(field, nec, 1)).toBe(100)
  })

  it("a presença desfaz cicatriz, com queda pela distância", () => {
    const spec = fieldSpec(640, 360, 32, 18)
    const nec = new Uint8Array(32 * 18).fill(100)
    const centro = 9 * 32 + 16
    healNecroseAround(nec, spec, 16 * 20 + 10, 9 * 20 + 10, 2, 40)
    expect(nec[centro]).toBe(60)
    // Vizinho recebe dose menor: cura fraca é rasa E estreita.
    expect(nec[centro + 1]!).toBeGreaterThan(nec[centro]!)
    expect(nec[centro + 1]!).toBeLessThan(100)
  })
})

describe("necrose — o interruptor", () => {
  /*
   * `necroseAmount: 0` tem que devolver o jogo EXATAMENTE como era. É o que
   * torna a rodada reversível num número, e foi assim que ela foi medida: o
   * caso nulo reproduziu o baseline do bot seed por seed, morte por morte.
   */
  const roda = (amount: number): { hash: string; nec: number } => {
    const t: Tuning = { ...base, field: { ...base.field, necroseAmount: amount } }
    const sim = createSim(4242, t)
    for (let i = 0; i < 60 * 40; i++) {
      /*
       * Atravessa a tela que estiver na frente, senão o teste mede NADA — foi
       * exatamente o que aconteceu na primeira versão: toda fase abre parada
       * numa apresentação, input vazio nunca sai dela, e os dois casos deram 0
       * de cicatriz e o MESMO hash. O bot já tinha aprendido isso em 02/08; eu
       * repeti o erro num arquivo novo.
       *
       * E repeti UMA TERCEIRA VEZ em 13/08, com o hub navegável: apertar ação
       * parou de sair do cérebro, os 2400 ticks viraram 2400 ticks de hub, e os
       * dois casos voltaram a dar o mesmo hash. É por isso que a regra agora
       * mora em `src/harness/atravessa.ts` e ninguém mais a reescreve aqui.
       */
      sim.step(atravessaTela(sim.state(), t))
    }
    return { hash: sim.snapshot().hash, nec: sim.state().necrosed }
  }

  it("com zero, nenhuma cicatriz aparece", () => {
    expect(roda(0).nec).toBe(0)
  })

  it("com o valor de produção, a cicatriz existe", () => {
    expect(roda(base.field.necroseAmount).nec).toBeGreaterThan(0)
  })

  it("ligar muda o hash — a cicatriz está no estado, não na tela", () => {
    expect(roda(0).hash).not.toBe(roda(base.field.necroseAmount).hash)
  })
})
