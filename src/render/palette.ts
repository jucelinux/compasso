/**
 * Paleta travada.
 *
 * Decisão de 01/08: pixel art autêntico, 640x360 nativo. A consequência dura é
 * esta lista. NADA no jogo pode usar uma cor que não esteja aqui — não por
 * nostalgia, mas porque é o que faz o conjunto parecer desenhado pela mesma mão.
 * Gradiente contínuo é justamente o que dava aquele ar de "forma preenchida com
 * degradê" que o humano reprovou; aqui degradê é DITHER entre dois índices.
 *
 * Organização: rampas de 3 a 4 tons, todas compartilhando o mesmo `INK` de
 * contorno e o mesmo `WHITE` de brilho. É o truque que amarra 56 cores num
 * conjunto só — SNES fazia igual, com 15 cores por paleta de sprite.
 *
 * Índice 0 é transparente e nunca é desenhado.
 */

export const T = 0

// contorno e luz, compartilhados por TODAS as rampas
export const INK = 1
export const INK2 = 2
export const WHITE = 3

// plasma: o fundo
export const PLASMA0 = 4
export const PLASMA1 = 5
export const PLASMA2 = 6
export const PLASMA3 = 7

// hemácias fora de foco
export const HEM0 = 8
export const HEM1 = 9
export const HEM2 = 10

// fibrina e detritos
export const FIB0 = 11
export const FIB1 = 12

// leucócito: o corpo do jogador
export const LEU0 = 13
export const LEU1 = 14
export const LEU2 = 15
export const LEU3 = 16

// ciano de velocidade: a leitura do relógio
export const FAST0 = 17
export const FAST1 = 18
export const FAST2 = 19

// núcleo lobado
export const NUC0 = 20
export const NUC1 = 21
export const NUC2 = 22

// célula do organismo
export const ORG0 = 23
export const ORG1 = 24
export const ORG2 = 25
export const ORG3 = 26

// patógenos, uma rampa cada
export const INF0 = 27
export const INF1 = 28
export const INF2 = 29
export const INF3 = 30

export const ECO0 = 31
export const ECO1 = 32
export const ECO2 = 33
export const ECO3 = 34

export const EST0 = 35
export const EST1 = 36
export const EST2 = 37
export const EST3 = 38

export const SAL0 = 39
export const SAL1 = 40
export const SAL2 = 41
export const SAL3 = 42

export const COR0 = 43
export const COR1 = 44
export const COR2 = 45
export const COR3 = 46

// dano, escudo, ouro, ui
export const HURT0 = 47
export const HURT1 = 48
export const SHI0 = 49
export const SHI1 = 50
export const GLD0 = 51
export const GLD1 = 52
export const GLD2 = 53
export const DIM0 = 54
export const DIM1 = 55

/** RGB de cada índice. A ordem é a das constantes acima e não pode mudar. */
const RGB: number[] = [
  0x000000, // 0 transparente (alpha 0; o RGB não é lido)
  0x0a0409, // 1 INK
  0x1a0a12, // 2 INK2
  0xfdfdff, // 3 WHITE

  0x14070b, // 4 PLASMA0
  0x1e0a11, // 5 PLASMA1
  0x2a0d14, // 6 PLASMA2
  0x3a1520, // 7 PLASMA3

  0x4a0d18, // 8 HEM0
  0x72141f, // 9 HEM1
  0x9c1e2c, // 10 HEM2

  0x5c2630, // 11 FIB0
  0x8c4a52, // 12 FIB1

  0x4a6a90, // 13 LEU0
  0x7e9cc0, // 14 LEU1
  0xb9d2ea, // 15 LEU2
  0xecf5ff, // 16 LEU3

  0x2f8fb0, // 17 FAST0
  0x7fe9ff, // 18 FAST1
  0xcdfaff, // 19 FAST2

  0x3d4f74, // 20 NUC0
  0x6a80ab, // 21 NUC1
  0x9fb4d8, // 22 NUC2

  0x1d4a72, // 23 ORG0
  0x3d84b8, // 24 ORG1
  0x6ec2ff, // 25 ORG2
  0xb4e2ff, // 26 ORG3

  0x7a2a12, // 27 INF0
  0xc4441f, // 28 INF1
  0xff6a3d, // 29 INF2
  0xffa984, // 30 INF3

  0x7a5c10, // 31 ECO0
  0xc49a1c, // 32 ECO1
  0xffd23d, // 33 ECO2
  0xffeda0, // 34 ECO3

  0x3d2870, // 35 EST0
  0x6b45b8, // 36 EST1
  0x9d6bff, // 37 EST2
  0xc9aaff, // 38 EST3

  0x0f5c3c, // 39 SAL0
  0x1fa96a, // 40 SAL1
  0x3dff9e, // 41 SAL2
  0xa8ffd4, // 42 SAL3

  0x6b1030, // 43 COR0
  0xb52058, // 44 COR1
  0xff3b8c, // 45 COR2
  0xff9ac4, // 46 COR3

  0xa8102c, // 47 HURT0
  0xff3b5c, // 48 HURT1
  0x1f9e70, // 49 SHI0
  0x8affc8, // 50 SHI1
  0xb8801c, // 51 GLD0
  0xffb03d, // 52 GLD1
  0xffe58a, // 53 GLD2
  0x7a4450, // 54 DIM0
  0x4a2830, // 55 DIM1
]

/**
 * A tabela viva. `RGB` é o mesmo objeto, então trocar valores nele muda a
 * paleta inteira do jogo sem tocar num pixel de geometria.
 */
export const PALETTE: ReadonlyArray<number> = RGB

/** Escala um RGB por um fator, canal a canal. */
function shade(rgb: number, f: number): number {
  const r = Math.min(255, Math.round(((rgb >> 16) & 0xff) * f))
  const g = Math.min(255, Math.round(((rgb >> 8) & 0xff) * f))
  const b = Math.min(255, Math.round((rgb & 0xff) * f))
  return (r << 16) | (g << 8) | b
}

/**
 * O plasma DERIVA da hemácia escura, em vez de ser declarado à parte.
 *
 * Pedido do H em 02/08: *"lá no fundo a variação entre o vermelho e o preto
 * pode ser muito mais sutil"*. O fundo lia como buraco preto entre as células,
 * e buraco não preenche — era essa a causa real do "o parallax não preenche",
 * que nem era do parallax.
 *
 * Amarrando o plasma ao `HEM0` da paleta em vigor, o fundo passa a ser hemácia
 * fora de foco em vez de vazio, a variação interna fica estreita por
 * construção, e a correção vale para as nove variantes de uma vez sem eu
 * reescrever quatro números em cada uma.
 */
export function plasmaFrom(hem0: number): [number, number, number, number] {
  return [shade(hem0, 0.55), shade(hem0, 0.68), shade(hem0, 0.81), shade(hem0, 0.95)]
}

{
  const base = plasmaFrom(RGB[HEM0]!)
  RGB[PLASMA0] = base[0]
  RGB[PLASMA1] = base[1]
  RGB[PLASMA2] = base[2]
  RGB[PLASMA3] = base[3]
}

const BASE: ReadonlyArray<number> = RGB.slice()

/**
 * Sonda de paleta — `TASTE-LOOP.md` §3.0, e descartável por construção.
 *
 * O pedido do H em 02/08: o vermelho escuro dramatiza como jogo de violência, e
 * ele quer VER outras leituras no estilo retro antes de decidir. Cada variante
 * troca só o AMBIENTE — tinta, plasma, hemácia, fibrina. Jogador, patógeno e
 * colônia ficam onde estão de propósito: são as cores que carregam regra, e
 * mexer nelas junto tornaria impossível atribuir a reação dele ao ambiente.
 *
 * São idiomas materialmente diferentes, não três tons do mesmo vermelho — a
 * sonda existe para varrer a faixa, e variante de variante não varre nada.
 *
 * **Segunda rodada, 02/08.** A primeira varria o MATIZ — turquesa de campo
 * escuro, magenta de coloração de Gram, âmbar de fósforo. O veredito do H foi o
 * mesmo para as quatro: *"todas muito escuras"*, e o arterial ganhou. Ou seja,
 * o eixo que importava não era matiz, era VALOR, e a sonda varreu o eixo errado.
 * As três reprovadas saíram do arquivo — `DECISIONS.md` as guarda; arquivo de
 * estado guarda o presente.
 *
 * Esta rodada varre quatro MECANISMOS diferentes de clarear, porque "mais claro"
 * não é uma direção só: levantar o piso, esquentar o matiz, dessaturar e abrir
 * o contraste produzem quatro sensações distintas de luz.
 *
 * O que olhar: o leucócito é azul-claro e NÃO muda nestas amostras. Quanto mais
 * claro o campo, menos ele se separa dele. Se o vencedor for um dos claros, a
 * cor do jogador vira o passo seguinte, não parte deste.
 */
export const PALETTE_VARIANTS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  /** Como está hoje: sangue arterial, escuro e saturado. A referência. */
  arterial: {},

  /**
   * Piso levantado, mesmo matiz. O vermelho é o mesmo; o que sai é o quase-preto.
   * É a tradução mais literal de "está escuro demais", e serve de controle: se
   * esta bastar, as outras três são complicação.
   */
  "arterial-claro": {
    [INK]: 0x1c0c12,
    [INK2]: 0x2e131c,
    [HEM0]: 0x7e2032,
    [HEM1]: 0xaa2e42,
    [HEM2]: 0xd44357,
    [FIB0]: 0x8e4c58,
    [FIB1]: 0xc0868f,
  },

  /**
   * Sangue OXIGENADO. O vermelho escuro do jogo é sangue venoso; o arterial de
   * verdade é mais claro e mais alaranjado. Clareia por matiz, não por valor —
   * e é a variante em que o tema faz o trabalho, porque a cor está certa.
   */
  "arterial-oxigenado": {
    [INK]: 0x1e0a08,
    [INK2]: 0x331410,
    [HEM0]: 0x992a1a,
    [HEM1]: 0xcc4226,
    [HEM2]: 0xf9663c,
    [FIB0]: 0xa25f4c,
    [FIB1]: 0xdb9c86,
  },

  /**
   * Dessaturado para cima. **Dessaturação é o que o olho lê como luz** — uma cor
   * saturada e clara ainda parece pigmento, uma cor lavada parece iluminada.
   * É a variante que mais deve clarear a sensação e a que mais custa em drama.
   */
  "arterial-rosa": {
    [INK]: 0x241820,
    [INK2]: 0x38262e,
    [HEM0]: 0x8e4a58,
    [HEM1]: 0xb46a78,
    [HEM2]: 0xd8909c,
    [FIB0]: 0xa07d86,
    [FIB1]: 0xd4b8be,
  },

  /**
   * Contraste em vez de brilho. Os escuros ficam quase onde estão e as altas
   * luzes sobem muito, então existe LUZ batendo nas células em vez de tudo
   * subir junto. Clareia sem lavar, e é a única que não perde o drama — a
   * aposta é que "escuro demais" era falta de luz, não excesso de escuridão.
   */
  "arterial-contraste": {
    [INK]: 0x0a0409,
    [INK2]: 0x1c0d16,
    [HEM0]: 0x6e1626,
    [HEM1]: 0xb42c40,
    [HEM2]: 0xec546a,
    [FIB0]: 0x7e3c4a,
    [FIB1]: 0xc89ca4,
  },

  /*
   * As quatro abaixo entraram na terceira passada, e a razão é um erro meu de
   * calibragem: o H disse "todas muito escuras" sobre quatro amostras, eu subi
   * pouco, e a minha própria variante de controle continuou escura. Uma sonda
   * serve para CERCAR a resposta, então esta leva vai deliberadamente longe
   * demais de um lado — se a mais clara for clara demais, isso é informação, e
   * é mais barato do que subir de pouquinho em pouquinho por três rodadas.
   */

  /** Contraste levado ao extremo: escuros onde estão, luz até quase branco. */
  "arterial-vivo": {
    [INK]: 0x0a0409,
    [INK2]: 0x1c0d16,
    [HEM0]: 0x8a1c30,
    [HEM1]: 0xd43a52,
    [HEM2]: 0xff8098,
    [FIB0]: 0x8e4858,
    [FIB1]: 0xe8b8c0,
  },

  /** Dessaturada E quente: pêssego. A rosa com o matiz do oxigenado. */
  "arterial-quente": {
    [INK]: 0x2a1a14,
    [INK2]: 0x40281e,
    [HEM0]: 0xa85440,
    [HEM1]: 0xcc7458,
    [HEM2]: 0xefa084,
    [FIB0]: 0xb88a74,
    [FIB1]: 0xe8c4b0,
  },

  /** O mais claro que o vermelho aguenta antes de virar rosa de doce. */
  "arterial-luz": {
    [INK]: 0x3a2028,
    [INK2]: 0x50303a,
    [HEM0]: 0xb04050,
    [HEM1]: 0xd4606e,
    [HEM2]: 0xf0909c,
    [FIB0]: 0xc09096,
    [FIB1]: 0xecc8cc,
  },

  /**
   * Lâmina sob luz forte. É o extremo do outro lado e provavelmente longe
   * demais: o leucócito é azul-claro e aqui o campo inteiro é claro, então a
   * aposta é que ele SUMA. Está na sonda exatamente por isso — o limite só é
   * conhecido quando alguém passa dele.
   */
  "arterial-lamina": {
    [INK]: 0x4a3038,
    [INK2]: 0x624048,
    [HEM0]: 0xc06874,
    [HEM1]: 0xdc8c96,
    [HEM2]: 0xf4b4bc,
    [FIB0]: 0xd4a8ae,
    [FIB1]: 0xf4dcdf,
  },
}

/** Ordem de ciclagem da tecla P, no build de dev. */
export const PALETTE_NAMES: ReadonlyArray<string> = Object.keys(PALETTE_VARIANTS)

/**
 * Aplica uma variante. Volta sempre à base antes, então aplicar duas vezes não
 * acumula. Chamada UMA vez, no boot, antes de assar o atlas — depois disso as
 * texturas já estão na GPU e a tabela não é mais lida.
 */
export function applyPaletteVariant(name: string): boolean {
  const v = PALETTE_VARIANTS[name]
  if (v === undefined) return false
  for (let i = 0; i < RGB.length; i++) RGB[i] = BASE[i]!
  for (const [idx, rgb] of Object.entries(v)) RGB[Number(idx)] = rgb
  // O plasma nunca é declarado por variante: ele SEGUE a hemácia escura dela.
  // Assim o fundo de qualquer paleta é hemácia fora de foco, e não vazio preto.
  const p = plasmaFrom(RGB[HEM0]!)
  RGB[PLASMA0] = p[0]
  RGB[PLASMA1] = p[1]
  RGB[PLASMA2] = p[2]
  RGB[PLASMA3] = p[3]
  return true
}

/**
 * Rampas de sombreamento: do mais escuro ao mais claro. A função de corpo em
 * `pixelbuf.ts` recebe uma destas e escolhe o tom pela luz, com dither na
 * fronteira entre dois tons vizinhos.
 */
export type Ramp = ReadonlyArray<number>

/*
 * Citoplasma. O topo é LEU2, não LEU3 nem WHITE, e isso é deliberado: sobra uma
 * hierarquia de três degraus acima do corpo — membrana em LEU3, especular em
 * WHITE. Com o corpo saturando em quase-branco, nem um nem outro apareciam.
 */
export const RAMP_LEU: Ramp = [LEU0, LEU0, LEU1, LEU2]
export const RAMP_FAST: Ramp = [LEU0, FAST0, FAST1, FAST2]
/** Membrana: cor CHAPADA. Rampa de um tom só devolve sempre o mesmo índice. */
export const RAMP_MEMBRANE: Ramp = [LEU3]
export const RAMP_SPECULAR: Ramp = [WHITE]
/*
 * Núcleo lobado. Reaproveita o azul escuro da célula do organismo porque a rampa
 * NUC sozinha caía dentro da faixa de valor do citoplasma e o núcleo sumia. Azul
 * escuro e não roxo de propósito: roxo é a cor do estafilo, e o jogador não pode
 * carregar um pedaço da cor de um inimigo dentro do corpo.
 */
export const RAMP_NUC: Ramp = [ORG0, ORG0, NUC0, NUC1]
export const RAMP_ORG: Ramp = [ORG0, ORG1, ORG2, ORG3, WHITE]
export const RAMP_INF: Ramp = [INK2, INF0, INF1, INF2, INF3]
export const RAMP_ECO: Ramp = [INK2, ECO0, ECO1, ECO2, ECO3]
export const RAMP_EST: Ramp = [INK2, EST0, EST1, EST2, EST3]
export const RAMP_SAL: Ramp = [INK2, SAL0, SAL1, SAL2, SAL3]
export const RAMP_COR: Ramp = [INK2, COR0, COR1, COR2, COR3]
export const RAMP_GLD: Ramp = [INK2, GLD0, GLD1, GLD2, WHITE]
export const RAMP_SHI: Ramp = [INK2, SHI0, SHI1, WHITE]
/** Sem o tom mais claro: hemácia é fundo distante, não corpo em jogo. */
export const RAMP_HEM: Ramp = [PLASMA0, PLASMA1, HEM0, HEM1]

/** Rampa por patógeno. Só o render usa; a sim não sabe que cor é nada. */
export const KIND_RAMP: Readonly<Record<string, Ramp>> = {
  influenza: RAMP_INF,
  ecoli: RAMP_ECO,
  ecoli_filha: RAMP_ECO,
  estafilo: RAMP_EST,
  salmonela: RAMP_SAL,
  corona: RAMP_COR,
}

/** Cor sólida de cada patógeno, para partícula e pop. */
export const KIND_TINT: Readonly<Record<string, number>> = {
  influenza: INF2,
  ecoli: ECO2,
  ecoli_filha: ECO3,
  estafilo: EST2,
  salmonela: SAL2,
  corona: COR2,
}

/**
 * Ciclagem de paleta: o truque de fundo mais barato e mais SNES que existe. O
 * buffer do plasma é avaliado UMA vez; só a tabela de cor gira. Quatro variantes
 * dão a impressão de corrente escorrendo sem mover um pixel de geometria.
 */
export function cycledPalette(step: number): ReadonlyArray<number> {
  const p = PALETTE.slice()
  const ring = [PLASMA0, PLASMA1, PLASMA2, PLASMA3]
  for (let i = 0; i < ring.length; i++) {
    p[ring[i]!] = PALETTE[ring[(i + step) % ring.length]!]!
  }
  return p
}

/** Rampa dos escalões de combo. Sobe em temperatura, como o bar do Candy Crush pede. */
export const COMBO_TIERS: ReadonlyArray<number> = [WHITE, GLD2, GLD1, INF2, COR2]
