import { describe, expect, it } from "vitest"
import {
  BATIDAS,
  BPM_MAX,
  BPM_MIN,
  PISO_RELOGIO,
  bpm,
  brilho,
  camadas,
  compasso,
  estalo,
  grau,
  hz,
  type Estalo,
  type Mundo,
} from "../src/audio/musica.ts"

/**
 * A TRILHA sob teste, 14/08.
 *
 * Ouvir pega timbre; ouvir não pega "a onda 7 esqueceu de subir de camada" nem
 * "o freio do relógio parou de frear". Por isso a parte que DECIDE a música é
 * pura e mora fora do motor de áudio: aqui ela é verificada sem tocar um som.
 *
 * O que estes testes NÃO fazem é dizer se está bonito. Isso é ouvido do H, e
 * nenhum teste substitui — a divisão é a mesma da arte: o teste garante que a
 * peça existe e responde, o humano diz se presta.
 */

const MUNDO: Mundo = { cena: "arena", relogio: 1, doenca: 0, onda: 1, vidas: 3 }
const com = (o: Partial<Mundo>): Mundo => ({ ...MUNDO, ...o })

describe("a escala", () => {
  it("é pentatônica: nenhum par de notas a um semitom", () => {
    /*
     * É a razão de ser pentatônica. Com o arranjo montado por ESTADO, nenhuma
     * combinação é revisada uma a uma — então o alfabeto tem que ser seguro por
     * construção. Mesma ideia da paleta travada.
     */
    const oitava = Array.from({ length: 5 }, (_, i) => grau(i))
    for (let i = 0; i < oitava.length; i++) {
      for (let j = i + 1; j < oitava.length; j++) {
        expect(Math.abs(oitava[i]! - oitava[j]!), `${oitava[i]} e ${oitava[j]}`).not.toBe(1)
      }
    }
  })

  it("sobe uma oitava exata a cada cinco graus", () => {
    for (let i = 0; i < 12; i++) expect(grau(i + 5) - grau(i)).toBe(12)
  })

  it("o lá 440 é o zero, e a oitava dobra a frequência", () => {
    expect(hz(0)).toBeCloseTo(440, 6)
    expect(hz(12)).toBeCloseTo(880, 6)
    expect(hz(-12)).toBeCloseTo(220, 6)
  })
})

describe("o andamento segue o corpo e o relógio", () => {
  it("a DOENÇA acelera: campo limpo é repouso, campo tomado é taquicardia", () => {
    expect(bpm(com({ doenca: 0 }))).toBeCloseTo(BPM_MIN, 6)
    expect(bpm(com({ doenca: 1 }))).toBeCloseTo(BPM_MAX, 6)
    expect(bpm(com({ doenca: 0.5 }))).toBeGreaterThan(bpm(com({ doenca: 0.2 })))
  })

  it("o RELÓGIO DO MUNDO freia — e é isto que torna a dilatação AUDÍVEL", () => {
    /*
     * O teste mais importante deste arquivo, e a razão de a trilha ser
     * sintetizada em vez de gravada.
     *
     * Com a dilatação religada, ou com a adrenalina em uso, o tempo
     * desacelerando passa a ser ouvido. É a via mais direta que já apareceu
     * para o portão do projeto — "a dilatação é lida sem explicação" — porque
     * ninguém precisa olhar para um número para ouvir a música arrastar.
     */
    const cheio = bpm(com({ relogio: 1 }))
    const parado = bpm(com({ relogio: 0 }))
    expect(parado).toBeLessThan(cheio)
    expect(parado / cheio).toBeCloseTo(PISO_RELOGIO, 6)
  })

  it("mas NÃO para: música parada lê como defeito, não como tempo lento", () => {
    expect(bpm(com({ relogio: 0 }))).toBeGreaterThan(0)
    expect(bpm(com({ relogio: 0, doenca: 0 }))).toBeGreaterThanOrEqual(BPM_MIN * PISO_RELOGIO)
  })

  it("o BRILHO cai junto com o relógio — o outro meio do freio", () => {
    // Andamento sozinho lê como "música mais devagar". O que dá câmera lenta é
    // o brilho caindo junto, que é o som de algo atravessando meio denso.
    expect(brilho(com({ relogio: 0 }))).toBeLessThan(brilho(com({ relogio: 1 })))
    expect(brilho(com({ relogio: 1 }))).toBeCloseTo(1, 6)
  })

  it("o cérebro tem andamento PRÓPRIO, e não o do corpo doente", () => {
    // A safezone não pode acelerar porque o campo da última run estava ruim: o
    // estado da doença nem existe mais quando se está lá.
    const calmo = bpm({ ...MUNDO, cena: "cerebro", doenca: 0 })
    const tomado = bpm({ ...MUNDO, cena: "cerebro", doenca: 1 })
    expect(calmo).toBe(tomado)
  })
})

describe("o arranjo responde ao jogo", () => {
  it("a camada SOBE com a onda", () => {
    expect(camadas(com({ onda: 1 })).arpejo).toBe(false)
    expect(camadas(com({ onda: 2 })).arpejo).toBe(true)
    expect(camadas(com({ onda: 4 })).sopro).toBe(false)
    expect(camadas(com({ onda: 5 })).sopro).toBe(true)
  })

  it("com UMA vida o arranjo AFINA em vez de engrossar", () => {
    /*
     * O reflexo errado no último fôlego é somar instrumento. O que se quer
     * ouvir ali é o coração, não a orquestra — a mesma razão pela qual o HUD
     * não ganha mais nada quando você está para morrer.
     */
    expect(camadas(com({ onda: 8, vidas: 3 })).sopro).toBe(true)
    expect(camadas(com({ onda: 8, vidas: 1 })).sopro).toBe(false)
  })

  it("o CÉREBRO não tem percussão nenhuma", () => {
    // Batida é relógio, e o cérebro é o único lugar do jogo sem relógio: uma
    // trilha com pulso contradiria pelo ouvido a decisão de 13/08.
    for (let n = 0; n < 8; n++) {
      const vozes = compasso({ ...MUNDO, cena: "cerebro" }, n).map((x) => x.voz)
      expect(vozes).not.toContain("corpo")
      expect(vozes).not.toContain("ruido")
    }
  })

  it("a ARENA tem batimento em TODO compasso, e ele é duplo", () => {
    // Sístole e diástole. Um metrônomo de quatro seria um jogo em qualquer
    // lugar; isto é um jogo dentro de um corpo.
    for (let n = 0; n < 8; n++) {
      const batidas = compasso(com({ onda: 3 }), n).filter((x) => x.voz === "corpo")
      expect(batidas.length).toBe(4)
      expect(batidas[1]!.t - batidas[0]!.t).toBeLessThan(1)
      expect(batidas[1]!.forca).toBeLessThan(batidas[0]!.forca)
    }
  })

  it("o CHIADO só aparece com o campo tomado", () => {
    const limpo = compasso(com({ doenca: 0.1 }), 0).filter((x) => x.voz === "ruido")
    const sujo = compasso(com({ doenca: 0.9 }), 0).filter((x) => x.voz === "ruido")
    expect(limpo.length).toBe(0)
    expect(sujo.length).toBeGreaterThan(0)
    expect(sujo[0]!.forca).toBeGreaterThan(0)
  })

  it("o RESPIRO é mais vazio que a arena — é o que faz os 3s parecerem de graça", () => {
    const arena = compasso(com({ onda: 6 }), 0).length
    const respiro = compasso({ ...MUNDO, cena: "respiro" }, 0).length
    expect(respiro).toBeLessThan(arena)
  })
})

describe("a forma de um compasso", () => {
  it("nenhuma nota começa fora do compasso nem passa do fim", () => {
    /*
     * Nota fora do compasso não some: ela toca em cima do compasso seguinte,
     * que é como um arranjo vira papa sem ninguém saber por quê.
     */
    const cenas: ReadonlyArray<Mundo> = [
      com({ onda: 1 }),
      com({ onda: 6, doenca: 0.9 }),
      { ...MUNDO, cena: "cerebro" },
      { ...MUNDO, cena: "respiro" },
      { ...MUNDO, cena: "morte" },
    ]
    for (const m of cenas) {
      for (let n = 0; n < 8; n++) {
        for (const nota of compasso(m, n)) {
          expect(nota.t, `${m.cena} compasso ${n}`).toBeGreaterThanOrEqual(0)
          expect(nota.t, `${m.cena} compasso ${n}`).toBeLessThan(BATIDAS)
          expect(nota.dur).toBeGreaterThan(0)
          expect(nota.forca).toBeGreaterThan(0)
          expect(nota.forca).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it("é PURA: mesmo mundo, mesmo compasso, mesmas notas", () => {
    // Sem isto a sonda offline não mediria a mesma coisa duas vezes, e um
    // baseline de som seria impossível.
    const m = com({ onda: 4, doenca: 0.5 })
    expect(compasso(m, 3)).toEqual(compasso(m, 3))
  })

  it("o compasso VARIA: oito seguidos não são o mesmo oito vezes", () => {
    // O caso nulo da pureza. Um sequenciador puro e constante passaria no teste
    // acima soando como um bipe repetido para sempre.
    const m = com({ onda: 6 })
    const formas = new Set(
      Array.from({ length: 8 }, (_, n) =>
        compasso(m, n)
          .map((x) => `${x.t}:${x.nota}:${x.voz}`)
          .join("|"),
      ),
    )
    expect(formas.size).toBeGreaterThan(1)
  })
})

describe("os estalos", () => {
  const TIPOS: ReadonlyArray<Estalo> = ["abate", "item", "habilidade", "dano", "onda"]

  it("todos existem e são curtos", () => {
    for (const t of TIPOS) {
      const ns = estalo(t)
      expect(ns.length, t).toBeGreaterThan(0)
      for (const n of ns) expect(n.dur, t).toBeLessThanOrEqual(0.6)
    }
  })

  it("o do ABATE é o mais discreto de todos", () => {
    /*
     * Numa run boa morrem dezenas por minuto. Um som marcante viraria
     * britadeira em trinta segundos — é a mesma conta que fez o tranco de
     * câmera do estalo visual ser 0,9 e não 3.
     */
    const forcaAbate = Math.max(...estalo("abate").map((n) => n.forca))
    for (const t of TIPOS) {
      if (t === "abate") continue
      expect(Math.max(...estalo(t).map((n) => n.forca)), t).toBeGreaterThan(forcaAbate)
    }
  })

  it("o da HABILIDADE sobe, porque gastar carga tem que soar como algo ligando", () => {
    const ns = estalo("habilidade")
    for (let i = 1; i < ns.length; i++) expect(ns[i]!.nota).toBeGreaterThan(ns[i - 1]!.nota)
  })
})
