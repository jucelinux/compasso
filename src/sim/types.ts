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
   */
  readonly waves: number
}

export interface Tuning {
  readonly sim: { readonly hz: number }
  readonly arena: { readonly width: number; readonly height: number }
  readonly time: {
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
    /** Quantos poderes cabem no build. Cheio, o novo substitui o mais antigo. */
    readonly buildSlots: number
    readonly hitFreezeTicks: number
    readonly deadLockTicks: number
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
    /** Quanto cada patógeno infecta o próprio tile, por segundo de MUNDO. */
    readonly sourceRate: number
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

/** Só duas fases: a tela de escolha morreu junto com o powerup escolhido. */
/**
 * `card` é a apresentação da fase, e o jogo fica PARADO nela.
 *
 * Ela dá IDENTIDADE, não estratégia (02/08): nome real, forma e bicho na tela.
 * O que a doença faz com você continua sendo descoberta — em Flicky ninguém
 * ensinou o objetivo, e é disso que a memória do jogo é feita.
 */
/**
 * `card`   — apresentação da doença. Identidade, não estratégia.
 * `reward` — RECOMPENSA por ter contido uma ONDA: escolha de um poder.
 * `closed` — FECHAMENTO da doença, na última onda. Não oferece poder: a fase
 *            acabou, e o que cabe ali é o balanço dela (chamada do H, 02/08).
 * `run`    — jogo.
 * `dead`   — fim.
 *
 * A recompensa vem DEPOIS de conter, e nunca antes: começar a partida já
 * escolhendo poder não faz sentido (chamada do H em 02/08). Poder é o que se
 * ganha por ter feito, não o que se recebe por ter chegado.
 */
export type Phase = "card" | "reward" | "closed" | "run" | "dead"

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
  /** Soma de `field`, cacheada. Zero encerra a fase; o teto encerra a run. */
  infection: number
  spreadTimer: number
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
  /** Os três poderes oferecidos no card desta fase. */
  offer: number[]
  /** Qual dos três está sob o cursor. */
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
  /** Ticks restantes de trava do card. Zero libera a dispensa. */
  cardLock: number
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
