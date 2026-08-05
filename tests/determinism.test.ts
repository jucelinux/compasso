import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import { loadReplay, loadTuning, projectRoot } from "../src/harness/loadTuning.ts"
import { runReplay } from "../src/harness/runReplay.ts"
import { replayInputs } from "../src/harness/replay.ts"
import { createSim } from "../src/sim/sim.ts"
import type { Tuning } from "../src/sim/types.ts"

/**
 * Se algum destes quebrar, pare tudo e conserte antes de qualquer outra coisa.
 */

const SMOKE = resolve(projectRoot, "replays", "smoke.json")
const BASELINE_HASH = "e6a65e63"

/**
 * Run real do humano, 7,6 min de input de verdade, do core do dash (`7c952a6`).
 *
 * A tela de escolha que este input atravessava não existe mais desde 01/08.
 * Vale hoje só como determinismo sobre input humano longo e real — não como
 * leitura de ritmo, e não como cobertura de morte.
 */
const RUN_01 = resolve(projectRoot, "replays", "run-01.json")
const RUN_01_HASH = "55ac22a0"

/**
 * Segunda run real: 5 min, 10 ondas, uma morte. Gravada antes da tecla de
 * reinício separada — o espaço que ela usa para recomeçar não recomeça mais.
 * Vale como determinismo sobre input humano longo.
 */
const RUN_02 = resolve(projectRoot, "replays", "run-02.json")
const RUN_02_HASH = "5545c765"

/**
 * Terceira run real: 5,7 min de input humano, gravada quando os modificadores
 * ainda eram porcentagem.
 *
 * Com os patógenos reais este input voltou a morrer, na onda 6.
 */
const RUN_03 = resolve(projectRoot, "replays", "run-03.json")
const RUN_03_HASH = "ebe09613"

/**
 * Fixture do core contínuo, gravada por `npm run rec`. Sintética, não humana:
 * serve de âncora de determinismo, não para julgar ritmo. É a ÚNICA que atravessa
 * morte → reinício, que é o gesto que o gate mede — as quatro anteriores são
 * todas do `7c952a6`, anterior ao pivô.
 *
 * **Regravada em 02/08** (`c0a30ec`): com o tecido resistindo, o input de 01/08
 * deixou de morrer e a fixture perdeu a única coisa que a tornava especial.
 *
 * **Regravada de novo em 05/08** (`a821cbb`), pela mesma razão exata: depois das
 * FASES a run parou de morrer de novo, e a fixture voltou a não cobrir o que diz
 * cobrir. Duas vezes o mesmo modo de falha em quatro dias é o que fez a âncora
 * ganhar teste próprio, logo abaixo.
 *
 * Esta é a primeira gravada com verificação BROWSER↔NODE: o `npm run rec` colhe
 * pares (tick, hash) do HUD durante a captura e exige que o replay em Node
 * reproduza os mesmos hashes nos mesmos ticks. Bateu em 15 testemunhas. Sem
 * isso, um baseline nascido no browser seria verdade só do Node.
 */
const CORE_ATUAL = resolve(projectRoot, "replays", "core-atual.json")
const CORE_ATUAL_HASH = "90c2bd87"

const smoke = () => loadReplay(SMOKE)
const tuning = () => loadTuning()

/*
 * Baselines REBASEADOS duas vezes em 01/08, as duas conscientes:
 *
 * 1. os i-frames passaram a cair no primeiro abate por contato, e o campo morto
 *    `invulnSkipCurrent` saiu do hash junto;
 * 2. o TECIDO entrou, e depois a doença ganhou RELÓGIO PRÓPRIO com piso — parar
 *    deixou de congelar o alastramento junto com o resto do mundo. A arena deixou de ser vazio: 576 tiles de infecção agora
 *    fazem parte do estado e do hash, as três células discretas do organismo
 *    saíram, e a fase acaba por contenção em vez de por cota.
 *
 * E uma terceira vez em 02/08: **o tecido passou a RESISTIR.** A velocidade
 * máxima agora cai com quanta hemácia há no ponto, então todo input antigo
 * produz outra trajetória. Não é regressão; é a mudança que o H pediu, e o
 * rebase é o preço declarado dela.
 *
 * QUARTA VEZ, em 05/08, e esta foi rebase ATRASADO, não rebase consciente.
 *
 * O commit `68fb8fd` ("a run infinita sai, e a E. coli ganha uma fase inteira")
 * reescreveu `sim.ts`, `types.ts` e `tuning.json`, atualizou o `slice.test.ts`
 * junto — e não encostou neste arquivo. Bisseccionado: os mesmos seis testes
 * passam em `73f423d` e falham em `68fb8fd`. Ficaram vermelhos por três
 * commits, contra a regra do `HARNESS.md` §1 que manda parar tudo quando o
 * determinismo quebra.
 *
 * O determinismo em si nunca esteve quebrado: "mesma seed = mesmo hash" e "não
 * diverge em nenhum tick" passaram o tempo todo. O que apodreceu foi o
 * REGISTRO. E é por isso que o conserto não foi só trocar cinco números —
 * ver a âncora, logo abaixo.
 */

/**
 * A ÂNCORA, e o que ela tripwire.
 *
 * O `core-atual.json` é o único replay gravado contra o `tuning.json` VIGENTE;
 * os outros quatro são input humano de `7c952a6` e o `tuningHash` deles nunca
 * mais vai bater — eles valem como determinismo sobre input real, e só.
 *
 * Então esta é a asserção que faltava em 02/08: a âncora tem que continuar
 * ancorada. Editar `tuning.json` derruba este teste na hora, com o remédio
 * escrito na mensagem, em vez de deixar cinco baselines apodrecerem em
 * silêncio por três commits.
 *
 * Não contradiz "divergência de tuningHash é aviso, não erro", lá embaixo:
 * para um replay QUALQUER é aviso mesmo. Para o replay cuja identidade é *ser
 * o core atual*, é erro por definição — ele deixou de ser o que diz que é.
 */
const REGRAVA =
  "o `core-atual.json` foi gravado contra outro `tuning.json` e não é mais a " +
  "âncora do core atual. Regrave com `npm run rec` e atualize os cinco " +
  "baselines deste arquivo — os quatro replays humanos mudam de hash junto."

/**
 * A mensagem para quando o tuning NÃO mudou e o hash mudou assim mesmo.
 *
 * Distinguir os dois casos é o trabalho que em 05/08 teve que ser feito à mão,
 * com bissecção, porque "expected X got Y" não diz de qual dos dois se trata —
 * e os dois pedem coisas opostas: um pede rebase, o outro pede desfazer.
 */
const REGRESSAO =
  "o `tuning.json` é o MESMO da gravação e o hash mudou assim mesmo: isto é " +
  "regressão de código em `src/sim/`, não deriva de design. Não rebaseie o " +
  "baseline — ache o que mudou. `npm run replay <arquivo>` imprime hash por tick."

/**
 * A mensagem dos quatro replays de `7c952a6`.
 *
 * Para eles o `tuningHash` está permanentemente diferente — foram gravados
 * contra um `tuning.json` que não existe mais — então esse sinal não separa
 * nada, e a pergunta tem que ir para quem está lendo. Só há duas respostas, e
 * uma delas é "não mexi em nada", que é a resposta perigosa.
 */
const DERIVA_OU_REGRESSAO =
  "hash diferente do baseline. Você mudou `src/sim/` ou `tuning.json` DE " +
  "PROPÓSITO? Então é deriva: regrave a âncora com `npm run rec`, atualize os " +
  "cinco baselines juntos e escreva no bloco de comentário acima o que mudou e " +
  "por quê. Não mudou nada? Então é REGRESSÃO, e rebasear esconde o defeito — " +
  "foi assim que estes testes ficaram três commits vermelhos em 02/08."

describe("determinismo", () => {
  it("mesma seed + mesmos inputs = mesmo hash", () => {
    expect(runReplay(smoke(), tuning()).finalHash).toBe(
      runReplay(smoke(), tuning()).finalHash,
    )
  })

  it("bate com o baseline commitado", () => {
    // Mudar este valor é um ato consciente: significa que o comportamento mudou.
    expect(runReplay(smoke(), tuning()).finalHash, DERIVA_OU_REGRESSAO).toBe(BASELINE_HASH)
  })

  it("não diverge em nenhum tick, não só no final", () => {
    const a = runReplay(smoke(), tuning()).hashes
    const b = runReplay(smoke(), tuning()).hashes
    const divergence = a.findIndex((h, i) => h !== b[i])
    expect(divergence, `divergiu no tick ${divergence}`).toBe(-1)
  })

  it("input humano real: bate com o baseline", () => {
    const result = runReplay(loadReplay(RUN_01), tuning())
    expect(result.finalHash, DERIVA_OU_REGRESSAO).toBe(RUN_01_HASH)
    expect(result.ticks).toBeGreaterThan(20000)
  })

  it("segunda run humana: bate com o baseline", () => {
    const result = runReplay(loadReplay(RUN_02), tuning())
    expect(result.finalHash, DERIVA_OU_REGRESSAO).toBe(RUN_02_HASH)
    expect(result.ticks).toBeGreaterThan(17000)
  })

  it("terceira run humana: bate com o baseline", () => {
    const replay = loadReplay(RUN_03)
    const result = runReplay(replay, tuning())
    expect(result.finalHash, DERIVA_OU_REGRESSAO).toBe(RUN_03_HASH)
    expect(result.ticks).toBeGreaterThan(19000)
  })

  it("as fixtures antigas morrem cedo no core novo — travado contra registro podre", () => {
    // Este teste existe porque os comentários deste arquivo já mentiram duas
    // vezes: a run-01 alegava cobrir morte depois das ondas, e a run-03 depois
    // dos modificadores-comportamento. Agora quem afirma é o teste.
    const reaches = (path: string): boolean => {
      const replay = loadReplay(path)
      const sim = createSim(replay.seed, tuning())
      for (const input of replayInputs(replay)) {
        sim.step(input)
        if (sim.state().phase === "dead") return true
      }
      return false
    }
    /*
     * Estes quatro replays são de cores ANTIGOS (`7c952a6`). No core contínuo
     * aquele input não sabe pilotar: fica devagar, e devagar agora machuca — as
     * três runs humanas morrem cedo por isso, não por serem boas fixtures de
     * morte. Continuam valendo como determinismo sobre input real.
     *
     * A cobertura do core atual vem do `core-atual.json`, testado logo abaixo.
     * O que ainda falta é um replay do HUMANO no core novo; isso nenhum script
     * grava.
     */
    expect(reaches(SMOKE), "smoke não morre: input sintético mal se move").toBe(false)
    expect(reaches(RUN_01)).toBe(true)
    expect(reaches(RUN_02)).toBe(true)
    expect(reaches(RUN_03)).toBe(true)
  })

  it("a âncora ainda está ancorada: o tuning da gravação é o tuning de agora", () => {
    expect(runReplay(loadReplay(CORE_ATUAL), tuning()).tuningMatches, REGRAVA).toBe(true)
  })

  it("a fixture do core atual bate com o baseline", () => {
    const result = runReplay(loadReplay(CORE_ATUAL), tuning())
    expect(result.finalHash, result.tuningMatches ? REGRESSAO : REGRAVA).toBe(CORE_ATUAL_HASH)
  })

  it("a fixture do core atual atravessa morte E reinício", () => {
    // Era o buraco declarado no BACKLOG desde 31/07: nenhuma fixture reiniciava,
    // e reiniciar é exatamente o que o gate mede.
    const replay = loadReplay(CORE_ATUAL)
    const sim = createSim(replay.seed, tuning())
    let morreu = false
    let reiniciou = false
    for (const input of replayInputs(replay)) {
      sim.step(input)
      const s = sim.state()
      if (s.phase === "dead") morreu = true
      if (morreu && s.phase === "run" && s.runIndex > 0) reiniciou = true
    }
    expect(morreu, "não morreu").toBe(true)
    expect(reiniciou, "não reiniciou").toBe(true)
    expect(sim.state().runIndex).toBeGreaterThan(0)
  })

  it("hash evolui — não é constante", () => {
    const { hashes } = runReplay(smoke(), tuning())
    expect(new Set(hashes).size).toBeGreaterThan(100)
  })
})

describe("tuning.json", () => {
  it("muda o comportamento sem editar código", () => {
    const base = runReplay(smoke(), tuning())
    const faster: Tuning = { ...tuning(), dash: { ...tuning().dash, speedMultiplier: 4 } }
    expect(runReplay(smoke(), faster).finalHash).not.toBe(base.finalHash)
  })

  it("divergência de tuningHash é aviso, não erro", () => {
    const other: Tuning = { ...tuning(), dash: { ...tuning().dash, speedMultiplier: 4 } }
    const result = runReplay(smoke(), other)
    expect(result.tuningMatches).toBe(false)
    expect(result.ticks).toBe(smoke().inputs.length)
  })
})
