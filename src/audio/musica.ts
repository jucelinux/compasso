/**
 * A MÚSICA como DADO. 14/08, primeira versão da trilha.
 *
 * Este arquivo não toca nada e não conhece browser: ele responde "quais notas
 * caem neste compasso, nesta cena, com o mundo neste estado". Quem sopra é o
 * `audio.ts`.
 *
 * A separação é a mesma de `sprites.ts` e `atlas.ts`, e pela mesma razão: a
 * parte que decide roda sob teste, e a que toca não decide nada. Sem isso, a
 * única forma de verificar a trilha seria ouvindo — e ouvir pega timbre, não
 * pega "a onda 7 esqueceu de subir de camada".
 *
 * ------------------------------------------------------------------ o desenho
 *
 * A trilha é SINTETIZADA e não gravada, e isso é escolha com três razões:
 *
 * 1. É o mesmo princípio de toda a arte daqui — nada é asset pronto, tudo nasce
 *    de código. O repositório continua sendo texto.
 * 2. Música gravada não REAGE. Esta segue o relógio do mundo, e é isso que a
 *    torna parte do jogo em vez de fundo dele.
 * 3. Se o H quiser trocar por uma variação de peça clássica — o plano B que ele
 *    nomeou —, isso vira uma tabela de notas neste arquivo. A escolha de
 *    sintetizar é justamente o que mantém o plano B a um arquivo de distância.
 *
 * E o que ela persegue: o jogo se passa DENTRO de um corpo, e a arena é uma
 * artéria. A espinha é um CORAÇÃO. O tecido já respira mais rápido com a doença
 * no render (`ritmo = 1,7 + doente × 3,4`); a música lê o MESMO número, para que
 * imagem e som nunca discordem sobre o quanto o corpo está mal.
 */

/** Uma nota agendada. `t` é o instante DENTRO do compasso, em batidas. */
export interface Nota {
  readonly t: number
  /** Semitom em relação ao lá 440. Negativo desce. */
  readonly nota: number
  /** Duração em batidas. */
  readonly dur: number
  readonly voz: Voz
  /** 0..1, antes do volume da cena. */
  readonly forca: number
}

export type Voz = "pulso" | "baixo" | "sopro" | "ruido" | "corpo"

export type Cena = "cerebro" | "arena" | "respiro" | "morte"

/**
 * O ESTADO que a música lê. Só leitura, e só o que muda o som.
 *
 * Não é o `SimState` inteiro de propósito: a trilha não pode passar a depender
 * de um campo que amanhã muda de nome, e listar o que ela usa é a forma de
 * saber, olhando, o que a música sabe sobre o jogo.
 */
export interface Mundo {
  readonly cena: Cena
  /** O relógio do mundo, 0..1. É o que a adrenalina multiplica. */
  readonly relogio: number
  /** Quão tomado está o tecido, 0..1. */
  readonly doenca: number
  /** Onda atual, 1..N. Sobe camada. */
  readonly onda: number
  /** Vidas restantes. Uma só aperta o arranjo. */
  readonly vidas: number
}

/**
 * PENTATÔNICA MENOR em lá. Cinco notas, e a escolha não é gosto.
 *
 * Pentatônica não tem trítono nem semitom vizinho, então qualquer nota cai bem
 * sobre qualquer outra — o que importa quando o arranjo é montado por estado e
 * ninguém revisa cada combinação possível. É a mesma ideia da paleta travada:
 * restringir o alfabeto para que o resultado não precise de curadoria.
 */
const PENTA = [0, 3, 5, 7, 10]

/** Semitom da `i`-ésima nota da escala, subindo por oitavas. */
export function grau(i: number): number {
  const oitava = Math.floor(i / PENTA.length)
  return PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length]! + oitava * 12
}

/** Semitom → hertz. Lá 440 é o zero. */
export function hz(semitom: number): number {
  return 440 * Math.pow(2, semitom / 12)
}

/**
 * O ANDAMENTO, em batidas por minuto.
 *
 * Duas coisas o movem, e as duas são leitura de estado:
 *
 * 1. A DOENÇA acelera. 72 com o campo limpo é coração em repouso; 120 com ele
 *    tomado é taquicardia. O jogador ouve o corpo piorando antes de olhar a
 *    barra — que é a mesma promessa que a respiração do tecido já faz na tela.
 * 2. O RELÓGIO DO MUNDO freia. É a razão de a trilha ser sintetizada: com a
 *    dilatação religada, ou com a adrenalina em uso, o tempo desacelerando
 *    passa a ser AUDÍVEL. É a via mais direta que já apareceu para o portão do
 *    projeto — "a dilatação é lida sem explicação" —, porque ninguém precisa
 *    olhar para um número para ouvir a música arrastar.
 *
 * PISO de 25%: parar a música não lê como tempo lento, lê como bug. O que faz
 * ler é arrastar — andamento baixo somado ao filtro fechando, que é tratamento
 * de câmera lenta desde sempre.
 */
export const BPM_MIN = 72
export const BPM_MAX = 120
export const PISO_RELOGIO = 0.25

export function bpm(m: Mundo): number {
  if (m.cena === "cerebro") return 54
  if (m.cena === "morte") return 40
  const base = BPM_MIN + (BPM_MAX - BPM_MIN) * clamp01(m.doenca)
  const freio = PISO_RELOGIO + (1 - PISO_RELOGIO) * clamp01(m.relogio)
  return base * freio
}

/**
 * Quanto o filtro está ABERTO, 0..1 — o outro meio do freio.
 *
 * Andamento sozinho não lê como câmera lenta: lê como música mais devagar. O
 * que dá a leitura é o brilho caindo junto, porque é o que o ouvido conhece de
 * som atravessando alguma coisa densa. Aqui o denso é o tempo.
 */
export function brilho(m: Mundo): number {
  if (m.cena === "morte") return 0.15
  return 0.25 + 0.75 * clamp01(m.relogio)
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * As CAMADAS: quanto do arranjo está tocando, por onda.
 *
 * Sobe com a progressão e nunca desce dentro da run — é a única coisa da trilha
 * que só anda para a frente, e ela existe para a onda 7 soar diferente da 1 sem
 * que nenhuma nota nova precise ser escrita. Camada é ARRANJO, não melodia.
 */
export function camadas(m: Mundo): { baixo: boolean; arpejo: boolean; sopro: boolean } {
  if (m.cena !== "arena") return { baixo: m.cena === "respiro", arpejo: false, sopro: false }
  return {
    baixo: true,
    arpejo: m.onda >= 2,
    // O sopro entra tarde e some quando resta uma vida: o arranjo AFINA quando
    // aperta, em vez de engrossar. Engrossar no fim é o reflexo errado — o que
    // se quer no último fôlego é ouvir o coração, não a orquestra.
    sopro: m.onda >= 5 && m.vidas > 1,
  }
}

/** Compasso de quatro tempos em todas as cenas. Um metro só, e ele é o do corpo. */
export const BATIDAS = 4

/**
 * As notas de um compasso.
 *
 * Função PURA de (mundo, número do compasso): a mesma cena no mesmo compasso dá
 * sempre a mesma coisa, e é isso que torna a trilha testável sem tocar um som.
 * Nada de aleatório aqui — variação vem do estado, que já varia sozinho.
 */
export function compasso(m: Mundo, n: number): ReadonlyArray<Nota> {
  switch (m.cena) {
    case "cerebro":
      return cerebro(n)
    case "respiro":
      return respiro(n)
    case "morte":
      return morte(n)
    default:
      return arena(m, n)
  }
}

/**
 * O CÉREBRO: sem percussão, sem pulso, nada que meça tempo.
 *
 * É a safezone, e a decisão de 13/08 foi que nada corre lá dentro. Uma trilha
 * com batida contradiria isso pelo ouvido — batida é relógio, e relógio é o que
 * o cérebro não tem. Sobram acordes longos e um sinal esparso, que é o que os
 * neurônios estão fazendo na tela.
 */
function cerebro(n: number): ReadonlyArray<Nota> {
  const raiz = [0, 3, -2, 3][n % 4]!
  return [
    { t: 0, nota: grau(0) - 24 + raiz, dur: 4, voz: "sopro", forca: 0.5 },
    { t: 0, nota: grau(2) - 12 + raiz, dur: 4, voz: "sopro", forca: 0.32 },
    { t: 0, nota: grau(4) - 12 + raiz, dur: 4, voz: "sopro", forca: 0.24 },
    // O sinal sináptico: uma nota alta, curta, em posição que muda a cada
    // compasso. Mesma ideia dos pulsos correndo pelas sinapses no desenho.
    { t: 1 + (n % 3), nota: grau(7 + (n % 4)) + raiz, dur: 0.5, voz: "pulso", forca: 0.22 },
  ]
}

/**
 * A ARENA: coração em cima, tudo o mais por baixo dele.
 *
 * O `corpo` é o batimento — dois toques, sístole e diástole, e não um metrônomo
 * de quatro. Um jogo dentro de um corpo com batida de caixa seria um jogo em
 * qualquer lugar.
 */
function arena(m: Mundo, n: number): ReadonlyArray<Nota> {
  const c = camadas(m)
  const notas: Nota[] = [
    // LUB — DUB. A segunda vem perto e mais fraca, como o coração faz.
    { t: 0, nota: -24, dur: 0.35, voz: "corpo", forca: 0.9 },
    { t: 0.55, nota: -26, dur: 0.3, voz: "corpo", forca: 0.55 },
    { t: 2, nota: -24, dur: 0.35, voz: "corpo", forca: 0.85 },
    { t: 2.55, nota: -26, dur: 0.3, voz: "corpo", forca: 0.5 },
  ]
  if (c.baixo) {
    const passo = [0, 0, 3, 2][n % 4]!
    notas.push(
      { t: 0, nota: grau(passo) - 24, dur: 1.8, voz: "baixo", forca: 0.5 },
      { t: 2, nota: grau(passo) - 24, dur: 1.8, voz: "baixo", forca: 0.42 },
    )
  }
  if (c.arpejo) {
    // Arpejo em colcheias, subindo e descendo. O deslocamento por compasso
    // impede que oito compassos iguais soem como um laço de dois.
    for (let i = 0; i < 8; i++) {
      const g = [0, 2, 4, 5, 4, 2, 1, 2][i]! + (n % 2 === 1 ? 2 : 0)
      notas.push({ t: i * 0.5, nota: grau(g), dur: 0.4, voz: "pulso", forca: 0.2 })
    }
  }
  if (c.sopro) {
    const alvo = [7, 6, 8, 6][n % 4]!
    notas.push({ t: 0, nota: grau(alvo) - 12, dur: 3.6, voz: "sopro", forca: 0.26 })
  }
  // O CHIADO do tecido doente: ruído curto que só aparece com o campo tomado.
  // Ele não toca nota nenhuma — é sujeira, e sujeira é o que a doença é.
  if (m.doenca > 0.45) {
    notas.push({ t: 1.5, nota: 0, dur: 0.25, voz: "ruido", forca: 0.1 + m.doenca * 0.18 })
    notas.push({ t: 3.5, nota: 0, dur: 0.25, voz: "ruido", forca: 0.1 + m.doenca * 0.18 })
  }
  return notas
}

/**
 * O RESPIRO entre ondas: só o coração, e mais devagar.
 *
 * Os 3 segundos existem para OLHAR o tabuleiro sem que ele piore. Tirar o
 * arranjo e deixar o batimento é o equivalente sonoro disso — o silêncio
 * relativo é o que faz os 3 segundos parecerem de graça.
 */
function respiro(n: number): ReadonlyArray<Nota> {
  return [
    { t: 0, nota: -24, dur: 0.35, voz: "corpo", forca: 0.7 },
    { t: 0.55, nota: -26, dur: 0.3, voz: "corpo", forca: 0.4 },
    { t: 2, nota: grau(n % 3) - 24, dur: 1.5, voz: "baixo", forca: 0.3 },
  ]
}

/** A MORTE: o acorde desabando meio tom, que é a cadência mais velha que existe. */
function morte(n: number): ReadonlyArray<Nota> {
  const queda = Math.min(n, 3)
  return [
    { t: 0, nota: grau(0) - 24 - queda, dur: 4, voz: "sopro", forca: 0.5 },
    { t: 0, nota: grau(2) - 12 - queda, dur: 4, voz: "sopro", forca: 0.3 },
    { t: 0, nota: -24 - queda, dur: 3, voz: "baixo", forca: 0.4 },
  ]
}

/**
 * Os ESTALOS: som de evento, disparado, fora do compasso.
 *
 * Eles não entram no sequenciador porque não têm hora certa — acontecem quando
 * acontecem. Mesma razão pela qual o estalo VISUAL do abate ficou fora da sim
 * em 13/08: é resposta, não regra.
 */
export type Estalo = "abate" | "item" | "habilidade" | "dano" | "onda"

export function estalo(tipo: Estalo): ReadonlyArray<Nota> {
  switch (tipo) {
    case "abate":
      // Curto e agudo, e de propósito quase escondido: numa run boa morrem
      // dezenas por minuto, e um som marcante viraria britadeira em trinta
      // segundos. É a mesma conta que fez o tranco de câmera ser 0,9 e não 3.
      return [{ t: 0, nota: grau(6), dur: 0.06, voz: "pulso", forca: 0.16 }]
    case "item":
      return [
        { t: 0, nota: grau(4), dur: 0.1, voz: "pulso", forca: 0.3 },
        { t: 0.09, nota: grau(6), dur: 0.14, voz: "pulso", forca: 0.3 },
      ]
    case "habilidade":
      // Sobe três graus: gastar uma carga precisa soar como algo LIGANDO, e
      // subida é a leitura mais direta disso.
      return [
        { t: 0, nota: grau(2), dur: 0.1, voz: "sopro", forca: 0.4 },
        { t: 0.08, nota: grau(5), dur: 0.1, voz: "sopro", forca: 0.4 },
        { t: 0.16, nota: grau(8), dur: 0.5, voz: "sopro", forca: 0.45 },
      ]
    case "dano":
      return [
        { t: 0, nota: -14, dur: 0.3, voz: "ruido", forca: 0.5 },
        { t: 0, nota: -20, dur: 0.4, voz: "baixo", forca: 0.5 },
      ]
    case "onda":
      return [
        { t: 0, nota: grau(0), dur: 0.16, voz: "sopro", forca: 0.4 },
        { t: 0.15, nota: grau(2), dur: 0.16, voz: "sopro", forca: 0.4 },
        { t: 0.3, nota: grau(5), dur: 0.6, voz: "sopro", forca: 0.45 },
      ]
  }
}
