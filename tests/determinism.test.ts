import { describe, expect, it } from "vitest"
import { readdirSync } from "node:fs"
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
const BASELINE_HASH = "8d66b8df"

/**
 * Run real do humano, 7,6 min de input de verdade, do core do dash (`7c952a6`).
 *
 * A tela de escolha que este input atravessava não existe mais desde 01/08.
 * Vale hoje só como determinismo sobre input humano longo e real — não como
 * leitura de ritmo, e não como cobertura de morte.
 */
const RUN_01 = resolve(projectRoot, "replays", "run-01.json")
const RUN_01_HASH = "f6014d86"

/**
 * Segunda run real: 5 min, 10 ondas, uma morte. Gravada antes da tecla de
 * reinício separada — o espaço que ela usa para recomeçar não recomeça mais.
 * Vale como determinismo sobre input humano longo.
 */
const RUN_02 = resolve(projectRoot, "replays", "run-02.json")
const RUN_02_HASH = "cdd0637c"

/**
 * Terceira run real: 5,7 min de input humano, gravada quando os modificadores
 * ainda eram porcentagem.
 *
 * Chegou a voltar a morrer na onda 6, com os patógenos reais. Desde 13/08 não
 * sai mais do cérebro — ver o teste da cobertura, mais abaixo.
 */
const RUN_03 = resolve(projectRoot, "replays", "run-03.json")
const RUN_03_HASH = "dbbfb078"

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
 * Desde 05/08 toda gravação passa por verificação BROWSER↔NODE: o `npm run rec`
 * colhe pares (tick, hash) do HUD durante a captura e exige que o replay em Node
 * reproduza os mesmos hashes nos mesmos ticks. Sem isso, um baseline nascido no
 * browser seria verdade só do Node. A gravação vigente bateu em 9 testemunhas,
 * e ela é a primeira que atravessa a porta CLICANDO — o ponteiro de 13/08 passa
 * pelo cano inteiro, do evento no browser ao sufixo no arquivo, e reproduz.
 *
 * Desde 13/08 esta é também a ÚNICA fixture que cobre morte no core atual: as
 * três humanas não saem mais do cérebro. Regravar quando ela parar de morrer
 * deixou de ser zelo e virou a única forma de a suíte cobrir o fim da run.
 */
const CORE_ATUAL = resolve(projectRoot, "replays", "core-atual.json")
const CORE_ATUAL_HASH = "28d9247b"

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
 *
 * QUINTA VEZ, em 05/08, e esta foi como rebase deve ser: a NECROSE entrou.
 *
 * Tile no talo passa a cicatrizar; cicatriz é piso da infecção; fagocitose não
 * a alcança e só a presença desfaz; e tecido morto não pare. Quatro regras que
 * mudam o campo, logo mudam todo hash — deriva declarada, no mesmo commit da
 * mudança, com a âncora regravada antes de qualquer número ser trocado.
 *
 * A diferença entre esta e a quarta é o que o portão da âncora comprou: em
 * `68fb8fd` ninguém soube que os baselines tinham morrido, e eles ficaram três
 * commits vermelhos. Desta vez o teste da âncora caiu no primeiro `npm test`
 * depois da mudança, com o remédio escrito na mensagem, e o rebase virou passo
 * de procedimento em vez de arqueologia.
 *
 * SEXTA VEZ, em 13/08: a PROGRESSÃO trocou de formato.
 *
 * A recompensa entre ondas saiu, entrou um respiro de 3 segundos com contagem
 * (fase `intervalo`, e o `countdown` dela entrou no hash), a E. coli passou a
 * ter uma curva de 10 degraus, e a carência de nascimento passa a ser renovada
 * quando a contagem solta a onda. Todo hash muda por qualquer uma dessas; por
 * todas juntas, muda duas vezes. Deriva declarada, âncora regravada ANTES de
 * qualquer número ser trocado, no mesmo commit da mudança.
 *
 * E uma armadilha do APARELHO, aprendida caro no caminho — vale a pena saber
 * antes de acreditar num vermelho aqui: **a primeira regravação divergiu entre
 * browser e node em 5 de 5 testemunhas, e a sim não tinha nada de errado.** Eu
 * tinha editado `src/main.ts` com o gravador rodando, e o HMR do Vite trocou o
 * módulo no meio da run — a página passou a rodar um código e o Node replicou
 * outro. Três diagnósticos separados inocentaram a sim (a mesma sim nos dois
 * motores sobre o mesmo log: 2281/2281 hashes idênticos), e regravar com a
 * árvore parada bateu de primeira. Se este arquivo ficar vermelho logo depois
 * de um `npm run rec`, a primeira pergunta é se alguém encostou em `src/`
 * enquanto ele gravava, não o que quebrou na sim.
 *
 * SÉTIMA VEZ, no mesmo 13/08: a DILATAÇÃO foi desligada.
 *
 * `time.dilation: false`, chamada do H. O `worldScale` passa a ser 1 em todo
 * tick, e a penalidade de velocidade da cura deixa de valer — dois termos que
 * entram em praticamente todo avanço da sim, então nenhum hash tinha como
 * sobreviver. Deriva declarada, âncora regravada antes dos números.
 *
 * Vale reparar no que ESTES cinco baselines passaram a ser: replays gravados
 * num jogo sem relógio lento. A fórmula continua sob teste em `slice.test.ts`
 * contra um tuning com `dilation: true`, mas NENHUMA fixture a exercita mais.
 * Quando o H religar o relógio, os cinco caem juntos de novo — e isso é o
 * comportamento certo, não uma dívida.
 *
 * OITAVA VEZ, ainda em 13/08: o REBALANCEAMENTO que o toggle exigiu.
 *
 * `phases.0.fissionSeconds` 3,0 → 8,0 (varrido, não escolhido — a razão inteira
 * está na âncora), e dois números MORTOS saíram do arquivo: `field.sourceRate`,
 * que a sim não lia desde 02/08, e `powers.backRadius`. Remover chave muda o
 * `tuningHash`, e a fissão muda a trajetória de todo replay.
 *
 * Três derivas declaradas no mesmo dia é muito, e vale dizer por quê: foram três
 * mudanças de jogo pedidas por ele, cada uma medida e commitada separada. O
 * preço de separar é rebasear três vezes; o de juntar seria não saber qual das
 * três fez o quê — que foi exatamente o custo de 02/08.
 *
 * NONA VEZ, ainda em 13/08: o COMPLEMENTO entrou.
 *
 * Item novo, com efeito na sim — varre as filhas, reinicia e segura o relógio
 * da fissão. Entraram no hash `fissionStun` e o carimbo `lastPick*`, e o
 * `phases[0].counter` entrou no `tuningHash`. Deriva declarada.
 *
 * O ESTALO do abate, pedido na mesma leva, NÃO aparece aqui — e é exatamente
 * por isso que ele foi desenhado como render puro. Anel, partículas e tremor de
 * câmera não tocam um byte do estado, então o feel dá para afinar quantas vezes
 * for preciso sem regravar fixture nenhuma. Vale como regra e não como sorte:
 * quando o efeito couber no render, ponha no render.
 *
 * DÉCIMA VEZ, ainda em 13/08: o CÉREBRO e as MOEDAS.
 *
 * Entrou a fase `hub`, e com ela `villain`, `coins`, `bank` e a lista de moedas
 * no campo — todos no hash. Mudou também o SIGNIFICADO de `runIndex`: ele passou
 * a contar runs TERMINADAS em vez de começadas, porque com o hub no boot a
 * contagem antiga faria a primeira run nascer com 1 e o verificador de reinício
 * deste gravador aprovaria qualquer gravação.
 *
 * Vale notar o que ESTA fixture passou a cobrir e as anteriores não cobriam: o
 * caminho morte → cérebro → run nova. É um estado a mais entre os dois que o
 * teste "atravessa morte E reinício" já media, e ele é atravessado de verdade
 * — o gravador aperta espaço até voltar a `run`, e voltou.
 *
 * DÉCIMA PRIMEIRA VEZ, ainda em 13/08: o cérebro virou NAVEGÁVEL.
 *
 * Pedido do H — o jogador anda com o glóbulo dentro do cérebro, e a saída deixou
 * de ser uma tecla para virar um LUGAR: a órbita dos patógenos, no centro-baixo.
 * Entrou a fase `select` entre o hub e o card. Posição do jogador no cérebro e
 * fase nova mudam o hash de qualquer replay que passe por ali, que são todos.
 *
 * E esta deriva cobrou um preço que as dez anteriores não cobraram, porque
 * trocar tecla por lugar invalida INPUT GRAVADO de um jeito que acrescentar tela
 * não invalidava. Medido, fixture por fixture, antes de trocar número nenhum:
 *
 *   `smoke.json`   → visitava `hub` e MAIS NENHUMA fase. 900 ticks de passeio
 *                    aleatório no cérebro. A fixture que quatro testes daqui
 *                    usam de baseline tinha parado de tocar no jogo.
 *   `run-02.json`  → ainda entra na run, mas não morre mais dentro do log: os
 *                    ticks que ela gastava jogando agora são gastos saindo do
 *                    cérebro.
 *   `run-03.json`  → como a `run-01` em 13/08 de manhã: não sai do cérebro.
 *
 * A `smoke` foi CONSERTADA, não rebaseada, e a diferença importa: ela é a única
 * declarada regenerável byte a byte, então o `makeSmoke.ts` ganhou um prólogo
 * que atravessa as telas rodando a sim enquanto gera — 987 ticks, e o passeio
 * aleatório de 15s voltou a acontecer DENTRO da run. Rebasear o número dela
 * teria congelado uma fixture que não mede mais nada, que é o defeito de 05/08
 * com outra roupa. O sintoma que denunciou: `tuning.json > muda o comportamento
 * sem editar código` passou a não mudar hash nenhum — no cérebro não há dash.
 *
 * As outras duas não têm conserto possível: input humano não se regrava. Elas
 * perdem a cobertura de morte e continuam valendo pelo que sempre valeram,
 * determinismo sobre input humano longo. O teste logo abaixo passa a AFIRMAR
 * isso em vez de afirmar a cobertura que sumiu.
 */

/*
 * DÉCIMA SEGUNDA VEZ, ainda em 13/08: a ÓRBITA mudou de lugar.
 *
 * `hub.orbitX/orbitY` 320,196 → 486,128, do centro para o canto superior
 * direito. Pedido do H, e o motivo é o que vem depois: o centro fica reservado
 * para o upgrade do glóbulo. Mexer no `tuning.json` muda o `tuningHash`, e a
 * âncora deixa de estar ancorada — que foi exatamente o teste que caiu.
 *
 * E aqui aconteceu uma coisa que vale mais que o rebase: DOIS dos cinco
 * baselines NÃO se mexeram, e eu fui conferir antes de aceitar. Hash igual
 * depois de mexer no tuning é do tipo de coisa que costuma significar que o
 * estado parou de entrar no hash.
 *
 * Não era. Medido, comparando o mesmo replay sob o tuning velho e o novo: os
 * hashes DENTRO do cérebro diferem (t5 e t40 diferentes), então a posição do
 * jogador está no hash. O que coincide é o resto — `poeNoCerebro` põe o jogador
 * a `orbitY + orbitRadius + 2×size` da órbita, então mover a órbita TRANSLADA
 * jogador e alvo pelo mesmo vetor. Sem bater em parede, o percurso do hub é
 * invariante à translação: mesma distância, mesmo número de ticks (87 nos dois),
 * e a run começa do zero pela seed. `smoke` e `core-atual` andam em linha reta e
 * herdam a invariância; as três humanas vagam e batem nas bordas, que é o que a
 * quebra para elas.
 *
 * A âncora foi regravada assim mesmo, e não por burocracia: o `tuningHash` dela
 * precisa voltar a bater, senão ela deixa de ser o que o nome diz. A gravação
 * nova bateu em 12 testemunhas browser↔node e mudou de hash — o passeio do
 * gravador é outro, com a porta em outro canto.
 */

/*
 * DÉCIMA TERCEIRA VEZ, em 13/08: as CINCO PORTAS e o PONTEIRO.
 *
 * Pedido do H: cinco funcionalidades espalhadas pelos cantos e pelo centro, a
 * órbita encolhida ao tamanho de porta (o gatilho ficou 10% maior que o
 * glóbulo, e o anel externo caiu na mesma proporção), e o clique como segunda
 * forma de abrir e a única de fechar sem tecla.
 *
 * Três coisas mudaram o hash, e vale separá-las:
 *
 * 1. `tuning.hub` inteiro — órbita menor, quatro portas novas, praça de
 *    nascimento própria e o quadro dos painéis. `tuningHash` novo.
 * 2. `SimState` ganhou `painel` e `prevClick`, e os dois entraram no pacote.
 *    Não são enfeite: um diz qual tela está aberta e o outro dá BORDA ao
 *    clique, e sem borda um botão segurado reabre a porta para sempre.
 * 3. A fase `painel` entrou na união, com código próprio no hash.
 *
 * E o ponteiro entrou no `InputFrame`, o que é mudança de FORMATO DE REPLAY —
 * o contrato mais caro deste projeto, porque quebrá-lo não dá erro, dá um jogo
 * que roda diferente do gravado. O sufixo `bits.x.y` só aparece quando há
 * clique, e inteiro puro continua válido: as catorze fixtures de `replays/`
 * seguem legíveis sem regravar nenhuma, e é por isso que as três humanas ainda
 * produzem hash aqui.
 *
 * A `smoke` foi REGENERADA de novo, pelo mesmo motivo da última vez: as portas
 * mudaram de lugar e o prólogo baked dela parou de chegar na run. O sintoma
 * apareceu no mesmo teste lateral de sempre — `muda o comportamento sem editar
 * código` parou de mudar hash, porque no cérebro não existe dash. É a segunda
 * vez que esse teste denuncia o que cinco baselines não denunciam.
 *
 * DÉCIMA QUARTA VEZ, em 14/08: o HISTÓRICO passou a existir.
 *
 * O H fechou a lacuna que a rodada anterior deixava: **só o modo pandemia
 * continua inativo.** Para o histórico ser uma tela de verdade, a run terminada
 * precisa deixar registro — onda, abates, moedas, se venceu e quanto durou — e
 * esse registro é ESTADO, então entra no hash com o conteúdo e não só com a
 * contagem. Contar sem olhar deixaria dois históricos diferentes com o mesmo
 * hash, que é a única coisa que o hash existe para impedir.
 *
 * Esta deriva é diferente das treze anteriores num ponto que vale dizer: o
 * `tuning.json` NÃO mudou. O `tuningMatches` da âncora continua verdadeiro, e
 * por isso a mensagem que este arquivo dá ao cair é a de REGRESSÃO — "o tuning
 * é o mesmo e o hash mudou assim mesmo, não rebaseie". A mensagem está certa
 * como regra e errada neste caso, e a diferença é a intenção: eu acrescentei
 * estado de propósito. A âncora foi regravada, e é isso que separa "declarei"
 * de "rebasei porque estava vermelho".
 */

/*
 * DÉCIMA QUINTA VEZ, em 14/08: as HABILIDADES.
 *
 * Adrenalina e febre entraram na loja, e com elas três coisas que mexem no
 * hash: `tuning.habilidades` e `tuning.hud` novos (tuningHash), o estado
 * `habilidades[]` com nível, carga e prazo de cada uma, e o `ability` no
 * `InputFrame` — que é mudança de FORMATO DE REPLAY pela segunda vez em dois
 * dias.
 *
 * O formato aguentou de novo pela mesma propriedade que salvou o ponteiro: os
 * três bits de habilidade ocupam posições que valiam zero antes, e zero
 * significa "nenhuma". O teto do decodificador subiu de 63 para 511 e nenhum
 * valor antigo mudou de sentido — as catorze fixtures continuam legíveis sem
 * regravar nenhuma, e as três humanas seguem produzindo hash aqui.
 *
 * A `smoke` foi regenerada pela terceira vez em dois dias, sempre pelo mesmo
 * motivo: ela é a única fixture com prólogo BAKED, e prólogo baked morre quando
 * a geometria da porta muda. Vale como padrão — quando o cérebro mexer, o
 * `npm run smoke` vem junto.
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
    /*
     * NENHUM dos três replays humanos morre mais, e isto não é regressão.
     *
     * Em 13/08 o cérebro virou navegável: sair dele deixou de ser uma tecla e
     * passou a ser um LUGAR. Input gravado em `7c952a6` não sabe andar até a
     * órbita, então o log inteiro se gasta antes de o jogo começar. Medido, fase
     * por fase, no dia em que caiu:
     *
     *   `run-01` → visita `hub`, e mais nenhuma.
     *   `run-03` → idem.
     *   `run-02` → chega a `run` por acaso (o passeio dela cruza a órbita com a
     *              ação apertada), mas o que sobra de log já não dá para morrer.
     *
     * É o preço declarado de trocar tecla por lugar, e ele cai primeiro no
     * replay mais antigo. Os três continuam valendo pelo que este arquivo já
     * dizia deles — determinismo sobre input humano longo, mesma seed e mesmo
     * hash — e deixaram de valer como cobertura de morte.
     *
     * A cobertura de morte inteira mora agora no `core-atual.json`, que é
     * sintético e REGRAVÁVEL, e é por isso que ele existe. O que continua
     * faltando é um replay do HUMANO no core novo; isso nenhum script grava.
     *
     * O que não pode acontecer é o teste continuar AFIRMANDO uma cobertura que
     * sumiu — é exatamente o defeito que ele foi escrito para impedir.
     */
    expect(reaches(RUN_01), "run-01 não sai mais do cérebro").toBe(false)
    expect(reaches(RUN_02), "run-02 entra na run, mas o log acaba antes da morte").toBe(false)
    expect(reaches(RUN_03), "run-03 não sai mais do cérebro").toBe(false)
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

/**
 * PROCEDÊNCIA — 08/08.
 *
 * Nasceu de um defeito real: `replays/` tem catorze arquivos e a suíte conhecia
 * CINCO. Os outros nove são as leituras humanas de 02/08, gravadas contra
 * `73f423d`, e nada travava coisa nenhuma sobre elas.
 *
 * O custo apareceu na mesma hora em que se olhou. O `BACKLOG.md` cita "0,4% de
 * cura contra veneno" e "3.799 abates em 716,4s de run VIVA" como se fossem
 * números do jogo. Rodando `humano-aura-02-08.json` contra o HEAD, a run morre
 * aos 133,8s com 248 abates. O número existe — só que em `73f423d`, e em mais
 * lugar nenhum. É o baseline-boato do `TASTE-LOOP.md` §3b.4.
 *
 * A trava NÃO exige que replay antigo reproduza; exige que ele esteja DECLARADO,
 * com o build em que foi gravado. Arquivo novo em `replays/` quebra isto até
 * alguém dizer o que ele é.
 */
const PROCEDENCIA: ReadonlyArray<readonly [string, string, string]> = [
  ["smoke.json", "ae02dd9", "sintética, regenerável byte a byte por `npm run smoke`"],
  ["core-atual.json", "ae02dd9", "sintética, VIVA — regravar com `npm run rec`"],
  ["run-01.json", "7c952a6", "humana, core do dash; hoje só âncora de determinismo"],
  ["run-02.json", "7c952a6", "humana, core do dash; hoje só âncora de determinismo"],
  ["run-03.json", "7c952a6", "humana, core do dash; hoje só âncora de determinismo"],
  ["filho-02-08.json", "73f423d", "1º jogador externo; a dilatação NÃO foi lida"],
  ["humano-02-08.json", "73f423d", "H, core do tecido"],
  ["humano-aura-02-08.json", "73f423d", "H, 716,4s — a run do PONTO FIXO e da medição de 0,4%"],
  ["humano-concluiu-02-08.json", "73f423d", "H, fase concluída"],
  ["humano-escolha-02-08.json", "73f423d", "H, card de escolha"],
  ["humano-fase1-02-08.json", "73f423d", "H, fase 1"],
  ["humano-foco-02-08.json", "73f423d", "H, foco plantado"],
  ["humano-ondas-02-08.json", "73f423d", "H, ondas"],
  ["humano-venceu-02-08.json", "73f423d", "H, morreu e rejogou 3,2s depois"],
]

describe("procedência dos replays", () => {
  it("todo arquivo em replays/ está declarado, e com o build em que foi gravado", () => {
    const dir = resolve(projectRoot, "replays")
    const noDisco = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    const declarados = PROCEDENCIA.map(([nome]) => nome).sort()
    expect(noDisco, "replay não declarado em PROCEDENCIA — diga o que ele é").toEqual(declarados)

    for (const [nome, sha] of PROCEDENCIA) {
      const replay = loadReplay(resolve(dir, nome))
      expect(replay.gitSha, `${nome} mudou de build sem atualizar a declaração`).toBe(sha)
    }
  })

  it("existe exatamente UMA fixture declarada viva", () => {
    // As outras treze são históricas por natureza: input humano não se regrava.
    // Se um dia houver duas vivas, alguém precisa dizer qual é a âncora.
    const viva = PROCEDENCIA.filter(([, , nota]) => nota.includes("VIVA"))
    expect(viva.length).toBe(1)
  })

  it("o caso nulo: a lista reprova um arquivo não declarado", () => {
    // `TASTE-LOOP.md` §2 — instrumento novo passa pelo caso nulo. Sem isto, uma
    // comparação frouxa passaria verde sem comparar nada.
    const declarados = PROCEDENCIA.map(([nome]) => nome).sort()
    const comIntruso = [...declarados, "replay-que-ninguem-declarou.json"].sort()
    expect(comIntruso).not.toEqual(declarados)
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
