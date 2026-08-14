/**
 * Contratos da sim. Este arquivo — e tudo em `src/sim/` — não importa nada de
 * `pixi.js`, do DOM ou de `node:*`. A sim roda headless, sob teste, sem canvas.
 */

/** Estado dos controles em um tick. Um por passo de sim, sempre. */
export interface InputFrame {
  readonly up: boolean
  readonly down: boolean
  readonly left: boolean
  readonly right: boolean
  /** Impulso: habilidade com recarga, não mais o verbo central. */
  readonly action: boolean
  /**
   * Recomeça depois de morrer. Tecla PRÓPRIA de propósito: com `action` aqui, o
   * reinício virava reflexo, e o gate mede intenção.
   */
  readonly restart: boolean
  /**
   * O PONTEIRO, em coordenada de arena. 13/08, pedido do H para o cérebro.
   *
   * Entra no `InputFrame` e não num atalho de render porque input que decide
   * jogo tem que atravessar o mesmo cano de sempre: gravado pelo F9,
   * reproduzido pelo replay, refletido no hash. Um clique tratado fora da sim
   * seria a única coisa do jogo que o rig não consegue reproduzir.
   *
   * `click` é o ESTADO do botão, não a borda — a borda é derivada dentro da
   * sim, como já é feito com as teclas, para que o mesmo gesto tenha a mesma
   * regra. Sem ponteiro (teclado puro, toque, replay antigo) vale `-1, -1` e
   * `false`, e nada nesta tela repara na diferença.
   */
  readonly pointerX: number
  readonly pointerY: number
  readonly click: boolean
  /**
   * Habilidade acionada NESTE tick: 0 = nenhuma, 1..N = a enésima. 14/08.
   *
   * Um número e não cinco booleanos, e a razão é o replay: cinco bits custam
   * cinco bits em todo tick de todo replay para dizer, em 99,9% deles, que
   * ninguém apertou nada. Três bits dizem a mesma coisa e ainda sobram slots.
   *
   * Acionar DUAS no mesmo tick não existe de propósito: são teclas separadas e
   * dedos são um só. Se um dia forem simultâneas, isto vira máscara — e aí o
   * custo estará pago pela mecânica que o pediu.
   */
  readonly ability: number
}

export interface SimSnapshot {
  readonly tick: number
  readonly hash: string
}

/**
 * O que o patógeno persegue.
 *
 * `player` — vai atrás de você. Era o único comportamento até 02/08.
 * `cell`   — salta para o tecido mais SADIO e abre frente nova (Salmonella).
 * `colony` — engrossa a colônia que já existe. ABANDONADO em 02/08: na mão do
 *            H a bactéria ficava praticamente parada, porque saturar a borda
 *            mais próxima é um objetivo, e bactéria não tem objetivo.
 * `tumble` — CORRIDA E CAMBALHOTA: nada reto por um tempo, sorteia direção
 *            nova, repete. É a locomoção real da E. coli, e o espalhamento da
 *            doença vira CONSEQUÊNCIA do passeio dela, não intenção dela.
 */
export type Hunts = "player" | "cell" | "colony" | "tumble"

export interface KindSpec {
  readonly speed: number
  readonly hp: number
  readonly sizeScale: number
  /** Quantas células-filha nascem quando ele morre (fissão binária). */
  readonly splits: number
  readonly hunts: Hunts
  /** Nome real do patógeno. Só o render usa. */
  readonly real: string
  /** Morfologia real, que decide o desenho. */
  readonly form: string
  /**
   * Fração da velocidade máxima necessária para engolir este patógeno.
   * Abaixo dela, encostar machuca em vez de matar. É o que amarra ataque,
   * relógio e risco no mesmo número.
   */
  readonly engulfSpeed: number
  /**
   * Quanto este patógeno IGNORA o relógio do mundo. 0 = obedece a dilatação
   * como todo o resto; 1 = anda em tempo real mesmo com você parado.
   *
   * É a peça que ENSINA a dilatação, e não um modificador de dificuldade.
   * Ninguém percebe que tudo desacelerou sem uma referência que não
   * desacelerou — com um `worldScale` único, parar congela a cena inteira e
   * não sobra contraste. Foi por isso que o primeiro jogador externo passou
   * 83s sem sacar o core (02/08).
   *
   * Justificativa temática, e ela é real: no mundo microscópico o tempo é
   * relativo à escala. A filha é pequena e difunde rápido.
   */
  readonly timeImmunity: number
  /**
   * Infecção que ele despeja no próprio tile, por segundo de MUNDO.
   *
   * E. coli é extracelular: adere e envenena por toxina, não invade a célula
   * (invadir e converter é vírus, e fica guardado para a fase de um). As
   * hemácias são corpos de RENDER e já necrosam seguindo a infecção do tile,
   * então envenenar o tecido desenha "a célula morrendo" de graça — e é a
   * versão biologicamente correta das duas.
   */
  readonly poison: number
  /**
   * Raio em que ele passa a enviesar a cambalhota NA SUA DIREÇÃO quando você
   * está devagar. 0 desliga.
   *
   * Isto é QUIMIOTAXIA, e não é licença poética: corrida-e-cambalhota é
   * justamente o mecanismo com que a E. coli sobe um gradiente químico — ela
   * cambalhota menos quando a direção é favorável. O passeio que já estava no
   * jogo era a metade não dirigida; esta é a outra metade.
   *
   * No jogo isto existe para uma razão concreta, medida em 02/08: o H
   * atravessou a fase inteira sem nunca parar para curar, e a dilatação do
   * tempo — o core do projeto — não se manifestou em nenhum momento da run.
   * Parar precisava ter preço, e agora o preço tem nome biológico.
   */
  readonly chemotaxis: number
  /**
   * Sua velocidade abaixo da qual o gradiente "aparece". Acima dela você está
   * rápido demais para o gradiente concentrar, e elas voltam a passear.
   */
  readonly chemoBelowSpeed: number
  /**
   * Segundos de MUNDO de corrida reta antes da cambalhota. 0 usa o global.
   *
   * Por espécie porque o tempo de corrida sozinho não descreve o passeio — o
   * que descreve é tempo VEZES velocidade. A filha corre a 86 contra 54 da
   * mãe, então o mesmo 1,6s virava um risco reto atravessando meia tela. O H
   * viu na hora: "ele sempre se desloca em uma grande linha reta".
   */
  readonly tumbleSeconds: number
}

/**
 * Um DEGRAU da curva de dificuldade, e ele é sempre um MULTIPLICADOR.
 *
 * Nunca valor absoluto, e isso é a regra das âncoras aplicada na estrutura em
 * vez de na prosa (`tuning.anchors.json`, 08/08): a onda 1 É o `tuning.json` que
 * já existia e foi medido, e cada onda seguinte declara em voz alta o quanto
 * aperta em relação a ela. Cinquenta números absolutos aqui seriam cinquenta
 * chutes com aparência de decisão — que é o defeito exato que a âncora trava.
 *
 * Todos sobem a folga do lado da doença. Nenhum mexe no jogador: dificuldade
 * vem de ENCOLHER A FOLGA, não de nerfar quem joga (`TASTE.md` §1).
 */
export interface WaveStep {
  /**
   * Multiplica `fissionSeconds`. ABAIXO de 1 = a colônia dobra mais rápido.
   *
   * É a alavanca principal, e é a única que satisfaz a propriedade copiada do
   * Tetris (`TASTE.md` §1b): a pressão sobe sozinha se você não agir. As outras
   * quatro mudam a POSIÇÃO INICIAL da onda; só esta muda o quanto ela piora
   * enquanto você decide.
   */
  readonly fissao: number
  /** Multiplica `fissionCap`. O teto logístico — o quanto a onda pode piorar. */
  readonly teto: number
  /** Multiplica `field.seeds`. Focos de infecção no tecido ao abrir a onda. */
  readonly focos: number
  /** Multiplica `enemy.openingBase`. Corpos em cena ao abrir a onda. */
  readonly abertura: number
  /** Multiplica o veneno que cada corpo despeja no tecido. */
  readonly fonte: number
}

/**
 * Uma fase é UMA doença. A `spawnTable` que misturava 3-5 tipos por onda saiu
 * em 02/08: com mistura, cada patógeno se sustentava no conjunto e nenhum
 * precisava ser interessante sozinho — a queixa era "não tem memória nem
 * identidade, é mais um vai na direção dele que você mata".
 */
export interface PhaseSpec {
  /** Chave em `enemy.kinds`. É a doença da fase, e a única que nasce do tecido. */
  readonly disease: string
  /** Variante de paleta da fase. Vazio = a paleta em vigor. */
  readonly palette: string
  /**
   * Segundos de MUNDO até a colônia dobrar. A fissão binária da E. coli é a
   * pressão da fase: o foco DOBRA sozinho, então atrasar é catastrófico.
   * 0 desliga.
   *
   * Isto é escala, não fato: a E. coli real dobra em ~20 minutos. A regra de
   * fidelidade de 02/08 permite comprimir tempo à vontade — o que ela proíbe
   * é o jogo AFIRMAR um número que não é verdade.
   */
  readonly fissionSeconds: number
  /**
   * Multiplicador do alastramento pelo TECIDO nesta fase. 1 = normal, 0 = a
   * doença não escorre sozinha pelo chão.
   *
   * Na fase da E. coli é 0, por chamada do H em 02/08: quem espalha é a
   * BACTÉRIA passeando e se dividindo, não o limo. Com os dois ligados, matar
   * bactéria não continha nada e a fase virava enxugar gelo.
   */
  readonly tissueSpread: number
  /**
   * Teto de corpos da doença acima do qual a fissão PARA.
   *
   * Crescimento bacteriano real é LOGÍSTICO, não exponencial: dobra enquanto
   * há meio, e satura quando o meio se esgota. Sem teto, a fase 1 ficou
   * impossível de concluir — o H tentou várias vezes, fez 229 abates em 43,8s
   * com as três vidas intactas, e o tecido caiu mesmo assim.
   */
  readonly fissionCap: number
  /**
   * Quantas ONDAS esta doença dura antes de a próxima entrar.
   *
   * Pedido do H em 02/08, com razão prática: depois de escolher a recompensa
   * ele caía em outra doença, e como as outras ainda não têm mecânica, não
   * dava para testar o poder recém-escolhido contra uma onda mais agressiva da
   * MESMA doença. A onda 1 é fácil de propósito; a dificuldade sobe a cada uma.
   *
   * **Passou de 4 para 10 em 13/08**, junto com a morte da recompensa entre
   * ondas. Com o upgrade fora, a onda deixou de ser a unidade que paga e voltou
   * a ser a unidade que APERTA — e quatro degraus não desenham curva nenhuma.
   */
  readonly waves: number
  /**
   * A curva, um degrau por onda. Vazia = o escalonamento por fórmula de antes
   * (`seedsPerWave`, `sourcePerWave`, `openingPerWave`), que continua no código
   * como caso nulo verificável.
   *
   * Curva EXPLÍCITA e não fórmula porque a fórmula não tem onde declarar
   * intenção: `1 + (onda-1) × 0.1` é uma reta que ninguém desenhou, e a onda 9
   * dela existe por acidente aritmético. Aqui cada degrau é uma decisão que dá
   * para ler, discordar e medir uma por uma.
   *
   * Mais curta que `waves` repete o último degrau; é o único jeito de a lista
   * nunca ser a razão de a run parar de subir — `TASTE.md` §1 recusa teto.
   */
  readonly curva: ReadonlyArray<WaveStep>
  /**
   * O que o COMPLEMENTO faz contra ESTA doença.
   *
   * O item é geral — existe em toda fase, contra qualquer patógeno — e o efeito
   * é que é da doença. Foi assim que o H pediu: *"esse novo item não é
   * específico para a E. Coli, é específico para qualquer patógeno; conforme
   * formos evoluindo na progressão, novas ações podem ser criadas para cada
   * patógeno"*. Então o item é a PORTA e isto é o que está atrás dela.
   *
   * Mora em `PhaseSpec` e não em `KindSpec` porque o que ele conta hoje é
   * comportamento de FASE (`fissionSeconds` é daqui, não do bicho). Quando as
   * características primárias e secundárias por patógeno chegarem, esta é a
   * costura: ou o campo desce para `KindSpec`, ou vira uma lista de efeitos.
   */
  readonly counter: CounterSpec
}

/**
 * O efeito do COMPLEMENTO. Duas alavancas, e as duas atacam a REPRODUÇÃO.
 *
 * Não é dano: dano o jogador já tem, e é o corpo dele. Isto é o que ele não
 * consegue fazer correndo — desmontar a colônia em vez de aparar o que ela
 * produziu. Contra a E. coli isso é literal: varre as filhas e devolve o
 * relógio da fissão para o começo.
 */
export interface CounterSpec {
  /**
   * Chave em `enemy.kinds` que o item VARRE do campo. Vazio = não varre nada.
   *
   * Contra a E. coli é `ecoli_filha` — os bacilos filhos, que são o que sobra
   * de cada abate apressado. Varrer a mãe seria limpar a onda, e limpar a onda
   * é o trabalho do jogador.
   */
  readonly purge: string
  /**
   * Segundos de MUNDO em que a fissão fica parada, e o acumulador dela zera.
   *
   * Zerar sozinho quase não vale nada: se a colônia dobra a cada 8s e você
   * consome o item no segundo 7, zerar compra 7 segundos e mais nada. A pausa é
   * o que transforma o item em janela de trabalho — e é por isso que ele
   * REINICIA e SEGURA, não só reinicia.
   */
  readonly stunSeconds: number
}

export interface Tuning {
  readonly sim: { readonly hz: number }
  readonly arena: { readonly width: number; readonly height: number }
  readonly time: {
    /**
     * A DILATAÇÃO, ligada ou desligada. **Desligada desde 13/08, por chamada
     * do H.**
     *
     * Ela é a tese do projeto — "o tempo só anda quando você anda" — e continua
     * inteira no código, sob teste, atrás deste booleano. Desligar não é
     * aposentar: é a decisão dele de evoluir os outros eixos do jogo enquanto a
     * ideia central espera, para poder ligá-la de volta contra um jogo melhor do
     * que o que ela tem hoje. Ligar é trocar `false` por `true` e mais nada.
     *
     * **Governa DUAS coisas, e as duas são a mesma peça vista de dois lados:**
     *
     * 1. `worldScale`, que passa a ser 1 sempre — o mundo anda em tempo real.
     * 2. A penalidade de velocidade da cura (`field.healSpeedPenalty`), que
     *    deixa de valer — limpar o limo passa a acontecer ANDANDO.
     *
     * O segundo não é carona no primeiro, é consequência dele. A cura só podia
     * exigir imobilidade porque ficar parado COMPRAVA tempo lento; sem essa
     * troca, exigir que o jogador pare é cobrar um preço que não paga mais nada,
     * e o H foi explícito: ele quer combater a manifestação no tick normal, sem
     * precisar ficar parado. Deixar a penalidade de pé com a dilatação desligada
     * seria manter meia mecânica — o custo sem a contrapartida.
     *
     * O que este booleano NÃO governa: a aura plantada abaixo de
     * `dash.auraBelowSpeed`. Ela continua pedindo que você pare, e é a última
     * mecânica de imobilidade de pé. O H não a citou, e decidir por ele seria
     * exatamente o que o `CLAUDE.md` §4 proíbe.
     */
    readonly dilation: boolean
    /** Escala do tempo com a célula parada. Nunca zero, por decisão de 31/07. */
    readonly creep: number
    /**
     * Mistura entre reta e curva na conversão velocidade→tempo. `0` = só a
     * curva `t·√t` (começo do gesto barato), `1` = linear puro.
     *
     * Não é expoente livre de propósito: `Math.pow` não é bit-a-bit entre
     * engines, e o rig inteiro depende de Node e browser darem o mesmo hash.
     * `√` é seguro; expoente arbitrário não.
     */
    readonly linearMix: number
  }
  /**
   * A sequência de fases. A ORDEM é decisão de design, não da epidemiologia
   * (02/08): amarrar a sequência à prevalência real deixaria a curva de tensão
   * refém da biologia, justamente no eixo que ainda está sem bar.
   *
   * Passar do fim da lista repete a última, com a escala continuando a subir.
   */
  readonly phases: ReadonlyArray<PhaseSpec>
  /** Ticks de card antes de a fase liberar. Trava contra dispensar por reflexo. */
  readonly cardLockTicks: number
  readonly player: {
    readonly size: number
    readonly maxSpeed: number
    readonly accel: number
    readonly drag: number
  }
  readonly dash: {
    /** Abaixo desta velocidade o impulso vira AURA em vez de arranco. */
    readonly auraBelowSpeed: number
    /** Duração da aura, em ticks. Ela é o prazo da invulnerabilidade também. */
    readonly auraTicks: number
    /**
     * Quantos focos plantados podem existir ao mesmo tempo.
     *
     * Teto baixo de propósito: é ele que transforma plantar em ESCOLHA. Sem
     * teto, plantar em todo lugar seria sempre certo e a decisão sumia.
     */
    readonly auraFociMax: number
    /** Duração de um foco plantado, em ticks REAIS. */
    readonly auraFocusTicks: number
    /** Cura por segundo REAL de um foco, independente de você. */
    readonly auraFocusHeal: number
    /** Raio do foco, em tiles. */
    readonly auraFocusRadius: number
    readonly durationTicks: number
    readonly cooldownTicks: number
    readonly speedMultiplier: number
  }
  readonly wave: {
    readonly baseQuota: number
    readonly quotaGrowth: number
    /** Termo quadrático: é ele que faz a onda 10 custar visivelmente mais. */
    readonly quotaAccel: number
  }
  readonly run: {
    readonly lives: number
    /**
     * Quantos poderes cabem no build. Cheio, o novo substitui o mais antigo.
     *
     * DORMENTE desde 13/08: sem a tela de recompensa nada preenche o build.
     * Fica porque o mecanismo inteiro de poderes ficou — ver `SimState.owned`.
     */
    readonly buildSlots: number
    readonly hitFreezeTicks: number
    readonly deadLockTicks: number
    /**
     * Segundos REAIS de contagem antes de cada onda. Reais, não de mundo: se
     * dependessem da sua velocidade, ficar parado congelaria a contagem e o
     * respiro viraria refúgio — que é o modo de falha que este projeto já
     * corrigiu duas vezes em outros lugares (o piso do `idleProgress`, e o
     * relógio próprio da necrose).
     */
    readonly intervalSeconds: number
  }
  /**
   * O CÉREBRO: o hub navegável. 13/08.
   *
   * O H pediu que o jogador ANDE aqui com o glóbulo. Isso troca a natureza da
   * tela: ela deixa de ser um menu com fundo bonito e vira um lugar pequeno com
   * uma porta — e a porta é a órbita dos patógenos.
   */
  /**
   * As HABILIDADES da loja — 14/08, chamada do H.
   *
   * Cada uma tem NÍVEIS, e o plano dele é explícito: "esses valores são do
   * nível 1 de cada item; o nível 2, 3 e por aí vai". Por isso a lista de
   * níveis já existe com um item — a segunda entrada é uma linha de JSON, e não
   * uma reescrita da estrutura. Estrutura que só cabe o presente é a que obriga
   * a reescrever quando o futuro chega.
   *
   * A forma de um nível é UNIFORME entre habilidades, mesmo com campos que uma
   * delas não usa (a adrenalina não tem raio). Duas formas diferentes fariam a
   * sim precisar saber QUAL habilidade está lendo, e é justamente isso que ela
   * não sabe: ela conhece número, e quem conhece significado é quem desenha.
   */
  readonly habilidades: ReadonlyArray<{
    readonly id: string
    /** Preço em memória imunológica. */
    readonly custo: number
    /**
     * O que carrega esta habilidade.
     *
     * `abate` — patógenos abatidos, e SÓ os que não são cria: o H foi explícito
     *           ("não bacilos filhos nem efeito secundário").
     * `limo`  — tiles de tecido levados a zero, que é o que "erradicar o limo"
     *           significa em estado.
     */
    readonly gatilho: string
    readonly niveis: ReadonlyArray<{
      /** Segundos REAIS de efeito. Real e não de mundo: a adrenalina MEXE no relógio do mundo. */
      readonly duracao: number
      /** Quantos eventos do gatilho até encher uma carga. */
      readonly recarga: number
      /** Fator do relógio do mundo enquanto ativa. 1 = não mexe. */
      readonly escala: number
      /** Alcance do efeito em área. 0 = não tem área. */
      readonly raio: number
    }>
  }>
  /** Onde o HUD desenha os ícones de habilidade. Layout que o clique também usa. */
  readonly hud: {
    readonly habX: number
    readonly habY: number
    readonly habStep: number
    readonly habRaio: number
    /**
     * Raio de ACERTO do ícone, maior que o desenho dele.
     *
     * Separado do raio visual porque dedo não é cursor: o alvo precisa ser
     * maior do que parece, e o desenho não pode crescer junto sem comer a
     * arena. É o mesmo número que o pad usa para saber que ali não é manche —
     * dois valores diferentes deixariam uma coroa onde o toque move o glóbulo E
     * aciona a habilidade.
     */
    readonly habToque: number
  }
  readonly hub: {
    /** Centro da ÓRBITA dos patógenos, onde se entra para escolher o inimigo. */
    readonly orbitX: number
    readonly orbitY: number
    /** Raio em que os patógenos giram. É também o alvo visual. */
    readonly orbitRadius: number
    /**
     * Distância do centro da órbita que ABRE a seleção.
     *
     * Menor que `orbitRadius`: entrar é atravessar o anel e chegar ao MIOLO, não
     * encostar na borda. Um gatilho na borda dispararia de raspão enquanto o
     * jogador só passeia, e o cérebro é o lugar onde nada deve acontecer sem
     * você querer.
     */
    readonly enterRadius: number
    /** Voltas por segundo dos patógenos na órbita. */
    readonly orbitSpeed: number
    /** Onde o jogador aparece ao chegar no cérebro. */
    readonly spawnX: number
    readonly spawnY: number
    /**
     * Raio das outras PORTAS do cérebro. Igual ao `enterRadius` da órbita de
     * propósito: cinco portas com alcances diferentes ensinariam cinco regras.
     */
    readonly nodeRadius: number
    /**
     * O quadro das telas do cérebro, CENTRADO na arena.
     *
     * Mora no tuning e não no render porque desde 13/08 ele decide jogo: clicar
     * FORA dele fecha a tela. Geometria que responde a input não é decoração, e
     * duas cópias dela — uma que desenha e outra que decide — divergiriam com a
     * primeira mudança de layout, com o clique fechando onde ainda há painel.
     */
    readonly panelW: number
    readonly panelH: number
    /** Lado do [X] de fechar, no canto superior direito do quadro. */
    readonly closeSize: number
    /** Altura de uma linha da loja, e onde a primeira começa dentro do quadro. */
    readonly rowH: number
    readonly rowTop: number
    /**
     * As outras quatro funcionalidades do cérebro, em 13/08 — pedido do H.
     *
     * `id` é o que o render usa para saber o que desenhar dentro; a sim só
     * conhece POSIÇÃO e ÍNDICE. É o que mantém "abrir um painel" como uma regra
     * só em vez de quatro, e é o que faz a quinta porta custar uma linha de
     * `tuning.json` em vez de um ramo novo.
     */
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly x: number
      readonly y: number
      /**
       * Esta porta é a LOJA: clicar numa linha dela compra.
       *
       * Marcado no tuning e não por `id === "upgrades"` na sim de propósito —
       * a sim não conhece o nome de nenhuma porta, e abrir uma exceção para
       * esta seria o primeiro fio de "a sim sabe o que é cada tela".
       */
      readonly loja?: boolean
    }>
  }
  /**
   * A MOEDA: o que o abate deixa para a próxima run. 13/08.
   *
   * Memória imunológica adaptada a roguelite, como o H nomeou — o organismo não
   * guarda o combate, guarda o que aprendeu dele, e o aprendizado sobrevive à
   * morte da célula.
   */
  readonly coin: {
    /**
     * Ticks REAIS até a moeda sumir do campo.
     *
     * Reais e não de mundo: recompensa não pertence ao relógio da doença. Com a
     * dilatação religada, uma moeda em tempo de mundo duraria vinte vezes mais
     * para quem ficasse parado, e ficar parado passaria a render.
     */
    readonly lifeTicks: number
    /** Raio em que ela começa a voar até você. Maior que o da cápsula. */
    readonly magnetRadius: number
    readonly magnetSpeed: number
    /** Teto no campo. Estouro descarta a mais VELHA, nunca a recém-caída. */
    readonly maxOnField: number
  }
  readonly enemy: {
    readonly size: number
    readonly spawnIntervalSeconds: number
    readonly spawnPerWave: number
    readonly openingBase: number
    readonly openingPerWave: number
    readonly maxAlive: number
    readonly splitOffset: number
    readonly spawnGraceTicks: number
    /** Segundos de MUNDO de corrida reta antes da cambalhota. Ver `Hunts`. */
    readonly tumbleSeconds: number
    /**
     * Peso do gradiente contra o sorteio na cambalhota. 0 = passeio puro,
     * valores altos = perseguição reta. Quimiotaxia é viés, não mira.
     */
    readonly chemoBias: number
    readonly kinds: Readonly<Record<string, KindSpec>>
    /**
     * MORTA desde 02/08 — a fase é uma doença só, e quem manda é `phases`.
     * Fica no arquivo porque os replays de 31/07 e 01/08 carregam o hash do
     * tuning inteiro, e remover a chave quebraria a comparação com eles.
     */
    readonly spawnTable: ReadonlyArray<{
      readonly fromWave: number
      readonly weights: Readonly<Record<string, number>>
    }>
  }
  /**
   * O tecido. A arena deixou de ser vazio em 01/08: cada tile tem um nível de
   * infecção que se alastra em tempo de MUNDO e é curado em tempo REAL.
   */
  readonly field: {
    readonly cols: number
    readonly rows: number
    readonly maxInfection: number
    /** Focos iniciais da doença por fase. */
    readonly seeds: number
    /**
     * Piso do relógio da INFECÇÃO, independente da sua velocidade. Abaixo dele a
     * doença não desacelera mais, então parar deixa de ser refúgio.
     */
    readonly idleProgress: number
    /** Focos a mais por fase. É a escalada da doença. */
    readonly seedsPerWave: number
    /** Fração a mais de fonte por fase. */
    readonly sourcePerWave: number
    /** Segundos de MUNDO entre passos de alastramento. */
    readonly spreadSeconds: number
    /** Infecção mínima do tile para ele contaminar o vizinho. */
    readonly spreadThreshold: number
    /** Quanto vaza para cada vizinho a cada passo. */
    readonly spreadAmount: number
    /**
     * Infecção que UM abate por contato limpa no tile onde aconteceu.
     *
     * Existe porque sem ela o verbo único jogava CONTRA o jogador: cada abate
     * gera duas filhas, filha envenena, e o F9 do H em 02/08 mostrou 229
     * abates em 43,8s com o tecido caindo mesmo assim. Fagocitose limpa de
     * verdade — o glóbulo branco não só mata, ele remove.
     */
    readonly engulfCleans: number
    /** Cura por segundo REAL com a célula parada. */
    readonly healRate: number
    /** Fração da cura perdida na velocidade máxima. 1 = a toda não cura nada. */
    readonly healSpeedPenalty: number
    readonly healRadius: number
    /** Quanto a PLAQUETA tira de infecção do campo inteiro, de uma vez. */
    readonly plaquetaHeal: number
    /**
     * Quanto um tile NO TALO cicatriza por passo de alastramento.
     *
     * Ancorado em `spreadAmount` e não escolhido solto — a doença cicatriza o
     * que já tomou no mesmo ritmo em que avança sobre o vizinho. **Zero
     * desliga a necrose inteira**, e é assim que esta rodada se desfaz: um
     * número.
     */
    readonly necroseAmount: number
    /**
     * Fração da cura do jogador que morde a CICATRIZ.
     *
     * Fração e não taxa própria de propósito: assim ela já herda a penalidade
     * de velocidade do `healSpeedPenalty`, e "só a presença desfaz cicatriz"
     * passa a ser consequência de uma regra que já existe em vez de uma
     * segunda regra para o jogador aprender.
     */
    readonly necroseHealFraction: number
    /** Infecção mínima de um tile para ele parir patógeno. */
    readonly spawnThreshold: number
    /** Intervalo de spawn com o campo quase limpo, em segundos de MUNDO. */
    readonly spawnCalmSeconds: number
    /** Abaixo desta fração, e sem patógeno vivo, a fase está contida. */
    readonly winFraction: number
    /** Fração do campo totalmente infectada que encerra a run. */
    readonly loseFraction: number
    /**
     * Fração da velocidade máxima perdida em tecido 100% SÃO. O tecido resiste:
     * tile sadio é tile lotado de hemácia, e atravessar corpo custa. Zero
     * devolve o jogo de antes de 02/08.
     */
    readonly crowdDrag: number
  }
  readonly drops: {
    readonly chance: number
    readonly lifeTicks: number
    readonly magnetRadius: number
    readonly magnetSpeed: number
    readonly durationTicks: number
    readonly maxOnField: number
    /**
     * Segundos de MUNDO entre cápsulas INSTANTÂNEAS nascidas no campo.
     *
     * Não vêm mais de abate: em 02/08 o sorteio por abate criou um laço que
     * premiava ficar parado. Nascendo no relógio, a ajuda chega porque o tempo
     * passou, e não porque você farmou.
     *
     * Existem porque o H mostrou que as duas responsabilidades do jogo —
     * conter o limo e abater o patógeno — competem e podem travar a fase: "não
     * consigo passar da onda 2, não tenho como lidar com a regressão do limo e
     * atacar os inimigos".
     */
    readonly instantEverySeconds: number
  }
  readonly powers: {
    /** Pontos por abate, antes do multiplicador de sequência. */
    readonly scorePerKill: number
    readonly comboWindowTicks: number
    readonly trailTicks: number
    readonly trailRadius: number
    readonly shockEvery: number
    readonly shockRadius: number
    readonly shockLifeTicks: number
    readonly orbitRadius: number
    readonly orbitCos: number
    readonly orbitSin: number
    readonly orbitKillRadius: number
    readonly interferonRadius: number
    readonly interferonSlow: number
    readonly macrophageSpeed: number
    readonly macrophageRadius: number
    readonly cloudTicks: number
    readonly cloudRadius: number
    readonly surgeSpeed: number
    readonly shieldHits: number
  }
  readonly harness: { readonly recordSeconds: number }
}

/**
 * `card` é a apresentação da fase, e o jogo fica PARADO nela.
 *
 * Ela dá IDENTIDADE, não estratégia (02/08): nome real, forma e bicho na tela.
 * O que a doença faz com você continua sendo descoberta — em Flicky ninguém
 * ensinou o objetivo, e é disso que a memória do jogo é feita.
 */
/**
 * `hub`       — O CÉREBRO. Ponto de partida e de retorno, e o único lugar do
 *               jogo onde nada te ataca. Escolhe-se o vilão e conta-se a
 *               memória imunológica. Chamada do H em 13/08: *"será a safezone
 *               do usuário, onde ele irá voltar sempre que morrer"*.
 * `select`    — a ESCOLHA do inimigo, aberta ao entrar na órbita. Separada do
 *               hub porque hub é lugar e escolha é ato: enquanto as duas eram a
 *               mesma tela, andar pelo cérebro e escolher o vilão disputavam as
 *               mesmas teclas.
 * `card`      — apresentação da doença. Identidade, não estratégia.
 * `intervalo` — o respiro entre ondas, com a contagem de 3 segundos. Não pede
 *               nada e não oferece nada: o próximo tabuleiro JÁ ESTÁ montado
 *               atrás da contagem, e os 3 segundos são para lê-lo.
 * `closed`    — a doença inteira contida. Fim de run pelo lado bom.
 * `run`       — jogo.
 * `dead`      — fim de run pelo lado ruim.
 *
 * **`reward` morreu em 13/08, por chamada do H:** o formato onda → upgrade não
 * estava funcionando. O que entrou no lugar não é uma escolha mais barata, é a
 * AUSÊNCIA de escolha — a onda passou a pagar em dificuldade, não em poder.
 * Detalhe e desdobramentos no `DECISIONS.md`.
 */
/**
 * `painel` é UMA fase para as QUATRO portas novas de 13/08, e não quatro fases.
 *
 * Qual delas está aberta mora em `SimState.painel`, um índice em
 * `tuning.hub.nodes`. A alternativa — `historico | inventario | upgrades |
 * pandemia` na união — faria a sim conhecer o NOME de cada funcionalidade, e a
 * sim não conhece: ela sabe abrir e fechar uma porta. Quem sabe o que tem
 * dentro é o render, e a quinta porta custa uma linha de `tuning.json`.
 */
export type Phase =
  | "hub"
  | "select"
  | "painel"
  | "card"
  | "intervalo"
  | "closed"
  | "run"
  | "dead"

/**
 * Uma run TERMINADA, guardada para o histórico. 14/08.
 *
 * Nasce no fim da run — pela morte ou pela vitória — porque é lá que os números
 * ainda existem: o próximo `startRun` zera onda, abates e moedas do campo. É o
 * mesmo motivo pelo qual `bestKills` sempre morou ali.
 *
 * A lista é CURTA de propósito. Ela entra no hash, e um histórico sem teto
 * cresceria sem limite dentro do estado que todo replay carrega — o custo
 * apareceria como um replay ficando mais lento quanto mais tempo se joga.
 */
export interface RunRecord {
  /** Onda em que parou. Com a curva de 10, é a leitura mais direta de "até onde". */
  readonly wave: number
  readonly kills: number
  /** Moedas que ESTA run rendeu, não o banco. */
  readonly coins: number
  readonly venceu: boolean
  /** Duração em ticks de sim. Segundos são coisa de quem exibe. */
  readonly ticks: number
}

export interface Enemy {
  id: number
  kind: string
  x: number
  y: number
  hp: number
  bornTick: number
  /**
   * Direção da CORRIDA atual, como vetor UNITÁRIO. Só o `tumble` usa.
   *
   * Vetor e não ângulo porque a sim não pode chamar `sin`/`cos`: elas não são
   * bit-a-bit entre engines, e o rig inteiro depende de Node e browser darem o
   * mesmo hash. Há teste travando isso, e ele me pegou em 02/08.
   */
  dx: number
  dy: number
  /** Segundos de MUNDO restantes até a próxima CAMBALHOTA. */
  tumble: number
  /** Veneno acumulado por ESTE corpo, na taxa da espécie dele. */
  poisonAcc: number
}

/**
 * MOEDA largada por um patógeno abatido.
 *
 * Objeto no campo e não um contador que sobe sozinho, e a diferença é o que o
 * H pediu na leva anterior: o abate precisa PRODUZIR alguma coisa visível. O
 * estalo diz "acertei"; a moeda diz "ganhei", e as duas leituras são
 * diferentes.
 */
export interface Coin {
  id: number
  x: number
  y: number
  /** Ticks REAIS até sumir. Real, não de mundo: recompensa não é do relógio da doença. */
  life: number
}

/** Cápsula largada por um patógeno. Encostar liga o poder. */
export interface Drop {
  id: number
  power: number
  x: number
  y: number
  life: number
}

export interface Trail {
  id: number
  x: number
  y: number
  life: number
}

export interface Shock {
  id: number
  x: number
  y: number
  radius: number
  life: number
}

export interface Orbiter {
  ox: number
  oy: number
}

export interface Macrophage {
  id: number
  x: number
  y: number
}

/**
 * FOCO DE CURA plantado pela aura. Cura sozinho, sem você por perto.
 *
 * É a peça que desfaz o empate medido em 02/08: a run do H ficou 716s em ponto
 * fixo — 3.799 abates, campo nem limpo nem estourado — porque curar exigia
 * PRESENÇA e matar exigia velocidade, e as duas tarefas disputavam os mesmos
 * segundos no mesmo lugar. O vínculo duro nunca foi a velocidade, era ficar.
 *
 * Plantado, o trabalho continua enquanto você caça. A decisão deixa de ser
 * "curo ou mato" e passa a ser ONDE e QUANDO plantar — decisão recorrente, que
 * é o que o H elogia, em vez de dilema sem saída.
 */
export interface Pulse {
  id: number
  x: number
  y: number
  life: number
}

export interface Cloud {
  id: number
  x: number
  y: number
  life: number
}

export interface Player {
  x: number
  y: number
  /** Velocidade contínua. É a arma, o relógio e o risco no mesmo vetor. */
  vx: number
  vy: number
  /** `|v| / maxSpeed`, entre 0 e 1 (passa de 1 durante o impulso). */
  speed: number
  dashTicks: number
  dashCooldown: number
  /** Cai no primeiro patógeno engolido por CONTATO. Sem timer, por decisão de 31/07. */
  invulnerable: boolean
}

export interface SimState {
  tick: number
  phase: Phase
  runIndex: number
  /** Contador GLOBAL de ondas. É ele que escala dificuldade. */
  wave: number
  /** Qual doença está em cena. Índice em `tuning.phases`. */
  phaseIndex: number
  /** Onda DENTRO da doença atual, começando em 1. */
  round: number
  waveKills: number
  quota: number
  lives: number
  shields: number
  kills: number
  /**
   * Pontuação. Cada abate vale mais conforme a SEQUÊNCIA sobe.
   *
   * Existe por pedido do H em 02/08: ele sentiu falta de "pontuação e gatilhos
   * de recompensa na tela, estímulo sensorial de que está indo bem", citando
   * MegaBonk. O multiplicador é o que transforma pontuação em estímulo — número
   * que só sobe é placar, número que sobe MAIS RÁPIDO quando você joga bem é
   * recompensa.
   */
  score: number
  /** Maior multiplicador atingido na run. Vai para a tela de morte. */
  bestMult: number
  bestKills: number
  bestWave: number
  player: Player
  enemies: Enemy[]
  /** Infecção por tile, 0..`field.maxInfection`. O organismo É o campo. */
  field: Uint8Array
  /**
   * NECROSE por tile — o piso de `field`, e o que a fagocitose não alcança.
   *
   * É o ratchet do jogo, de 05/08: o campo tinha dois atratores e nada puxava
   * de um para o outro, então a tensão era duas retas. Cicatriz não volta
   * sozinha e só cede à PRESENÇA, que é o trabalho que a velocidade não faz.
   */
  necrose: Uint8Array
  /** Soma de `field`, cacheada. Zero encerra a fase; o teto encerra a run. */
  infection: number
  /** Soma de `necrose`, cacheada. Quanto do organismo não volta mais sozinho. */
  necrosed: number
  spreadTimer: number
  /** Relógio da cicatrização. Separado do `spreadTimer` porque a necrose NÃO é
   *  travada por `tissueSpread` — ver o comentário na sim. */
  necroseTimer: number
  infectAcc: number
  healAcc: number
  lostByTissue: boolean
  drops: Drop[]
  /** Ticks restantes de cada poder TEMPORÁRIO. Índice = id do poder. */
  active: number[]
  /** Poderes ESCOLHIDOS. Valem a run inteira. 1 = tem. */
  owned: number[]
  /**
   * O build, em ordem de chegada. Tem TETO (`run.buildSlots`).
   *
   * Sem teto a dificuldade invertia: são 4 recompensas por fase e 10 poderes no
   * jogo, então na onda 4 o jogador tinha metade do catálogo e nenhuma escalada
   * acompanhava. O H mediu isso na pele — 353s, 851 abates, três vidas
   * intactas: "as fases 3 e 4 não tiveram o desafio, só deixou a conclusão mais
   * demorada". Com teto, pegar passa a CUSTAR, e escolher volta a ser escolha.
   */
  buildOrder: number[]
  /**
   * Os poderes oferecidos. DORMENTE desde 13/08 — nada mais preenche esta lista.
   *
   * Campo e mecanismo ficam porque o que o H aposentou foi o FORMATO onda →
   * upgrade, não a existência de poder no jogo; `powers.ts`, `activeStats` e o
   * caminho da cápsula continuam inteiros e testados. Apagar tudo agora seria
   * decidir, no lugar dele, que poder não volta por outra porta.
   */
  offer: number[]
  /** Qual dos oferecidos está sob o cursor. Dormente junto com `offer`. */
  pick: number
  trails: Trail[]
  shocks: Shock[]
  orbiters: Orbiter[]
  macrophages: Macrophage[]
  clouds: Cloud[]
  /** Focos de cura plantados. Teto em `dash.auraFociMax`. */
  pulses: Pulse[]
  /** Cura fracionária acumulada pelos focos. */
  pulseAcc: number
  killsSincePulse: number
  spawnTimer: number
  frozen: number
  deadLock: number
  /**
   * Segundos de MUNDO em que a FISSÃO fica parada, pelo COMPLEMENTO.
   *
   * Em tempo de mundo, e não real, de propósito: ele é uma pausa no relógio da
   * DOENÇA, e tem que medir o mesmo que o relógio que ele pausa. Se contasse em
   * tempo real, com a dilatação religada a pausa valeria muito mais para quem
   * ficasse parado — a ajuda renderia mais justamente para quem não age.
   */
  fissionStun: number
  /**
   * O último item consumido: tick, qual, e onde. É o gancho da ANIMAÇÃO.
   *
   * Mesmo padrão de `lastKill*`, e pela mesma razão: o render desenha quadros,
   * a sim anda ticks, e num quadro lento cabem vários ticks. Diferença de
   * estado entre `prev` e `cur` PERDE o que aconteceu no meio; um carimbo no
   * estado sobrevive, porque o render pergunta "aconteceu nos últimos N ticks?"
   * em vez de "mudou desde o quadro passado?".
   */
  lastPickTick: number
  lastPickPower: number
  lastPickX: number
  lastPickY: number
  /**
   * Qual doença está selecionada no HUB. Índice em `tuning.phases`.
   *
   * Separado de `phaseIndex` de propósito: um é a ESCOLHA e sobrevive à morte,
   * o outro é onde a run está agora e zera a cada run. Com uma doença na lista
   * os dois valem 0 sempre, e é justamente por isso que uni-los passaria em
   * silêncio até a segunda doença voltar.
   */
  villain: number
  /**
   * Qual porta do cérebro está aberta: índice em `tuning.hub.nodes`, ou -1.
   *
   * Vale -1 fora da fase `painel`, e não "o último aberto": estado que sobrevive
   * ao fechamento é estado que reabre sozinho na próxima entrada do hub.
   */
  painel: number
  /**
   * As últimas runs terminadas, da mais NOVA para a mais velha.
   *
   * Mais nova primeiro porque é assim que a tela lê: quem abre o histórico quer
   * saber como foi a última, não a primeira. Ordenar na exibição seria decidir
   * duas vezes a mesma coisa.
   */
/**
   * As habilidades compradas, uma entrada por item de `tuning.habilidades`.
   *
   * `nivel` 0 é NÃO COMPRADA, e não "nível zero": quem não comprou não tem. O
   * plano do H é que o upgrade suba o nível do mesmo item, então o número já é
   * o nível e não um booleano de posse — o dia em que o nível 2 chegar não
   * precisa mudar o formato do estado nem regravar fixture por isso.
   */
  habilidades: Array<{
    nivel: number
    /** Eventos do gatilho acumulados desde a última carga cheia. */
    carga: number
    /** Ticks REAIS restantes de efeito. 0 = parada. */
    ativa: number
  }>
  historico: RunRecord[]
  /** Tick em que a run atual começou. Só existe para medir a duração dela. */
  runStartTick: number
  /**
   * O botão do ponteiro no tick anterior. É o que dá BORDA ao clique.
   *
   * Irmão de `prevBits`, e existe pela mesma razão: sem borda, um botão segurado
   * reabre a porta no quadro seguinte ao fechamento. Está no estado, e portanto
   * no hash, porque a borda é o que decide — e o que decide é reproduzido.
   */
  prevClick: boolean
  /**
   * MOEDAS da run corrente. Cada patógeno abatido larga uma.
   *
   * Zera ao começar uma run e é depositada no `bank` ao terminar — morrendo ou
   * limpando. O H chamou de memória imunológica adaptada a roguelite, e a
   * analogia é boa: o organismo não guarda o combate, guarda o que APRENDEU
   * dele, e o aprendizado sobrevive à morte da célula.
   */
  coins: number
  /**
   * O BANCO: moedas acumuladas entre runs. É o que os upgrades vão gastar.
   *
   * Vive na sim e não fora dela porque tudo que decide jogo precisa estar no
   * hash — um saldo lido de `localStorage` faria o mesmo replay divergir entre
   * duas máquinas, e o rig inteiro assume o contrário. A persistência ENTRE
   * SESSÕES é uma decisão separada, com custo próprio, e não foi tomada aqui.
   */
  bank: number
  /** Moedas soltas no campo, esperando o ímã. */
  pickups: Coin[]
  /** Ticks restantes de trava do card. Zero libera a dispensa. */
  cardLock: number
  /**
   * Ticks REAIS restantes da contagem do `intervalo`. Zero solta a onda.
   *
   * Conta para baixo em tick de simulação puro, sem `worldScale` no meio — é o
   * único relógio do jogo que a sua velocidade não toca, e é de propósito: o
   * respiro tem que durar o mesmo para quem parou e para quem está voando.
   */
  countdown: number
  /**
   * Ticks restantes da AURA — o impulso usado PARADO.
   *
   * É a resposta para "o que se faz no tempo devagar", que o projeto nunca
   * tinha respondido: até 02/08 parar só tinha PREÇO (as filhas vinham) e
   * nenhum verbo. Curar existia, mas era passivo — ficar parado e esperar.
   *
   * O mesmo botão, dois significados por CONTEXTO: em movimento é alcance,
   * parado é intervenção. E a invulnerabilidade é estritamente do prazo da
   * aura, nunca um estado — foi assim que o limbo de 31/07 nasceu, e ele não
   * volta por esta porta.
   */
  auraTicks: number
  /** Segundos de MUNDO acumulados rumo à próxima cápsula instantânea. */
  instantAcc: number
  /** Segundos de MUNDO acumulados rumo à próxima divisão da colônia. */
  fissionAcc: number
  combo: number
  comboTicks: number
  comboBest: number
  lastKillX: number
  lastKillY: number
  lastKillTick: number
  /** Escala do tempo de mundo neste tick. Derivada direto da sua velocidade. */
  worldScale: number
  prevBits: number
  rngState: number
}

export interface Sim {
  /** Avança exatamente 1/60 de tempo de mundo. */
  step(input: InputFrame): void
  snapshot(): SimSnapshot
  serialize(): unknown
  state(): Readonly<SimState>
}
