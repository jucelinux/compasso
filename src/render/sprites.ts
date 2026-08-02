import {
  INK,
  INK2,
  RAMP_COR,
  RAMP_ECO,
  RAMP_EST,
  RAMP_FAST,
  RAMP_INF,
  RAMP_LEU,
  RAMP_MEMBRANE,
  RAMP_NUC,
  RAMP_ORG,
  RAMP_SAL,
  RAMP_SHI,
  RAMP_SPECULAR,
  COR0,
  HEM0,
  HEM1,
  PLASMA0,
  PLASMA1,
  SAL0,
  SAL1,
  COR1,
  ECO0,
  EST0,
  INF1,
  INF3,
  ORG1,
  ORG2,
  SAL2,
  SAL3,
  WHITE,
  type Ramp,
} from "./palette.ts"
import {
  bayer,
  blit,
  body,
  capsule,
  disc,
  line,
  makeBuf,
  hashNoise,
  outline,
  plot,
  ring,
  speckle,
  ditherMask,
  type Buf,
} from "./pixelbuf.ts"

/**
 * Assadores de sprite.
 *
 * A diferença de fundo em relação ao que existia até 01/08: aqui NADA é uma
 * imagem só girada e escalada em tempo de execução. Cada corpo é uma matriz de
 * quadros — direção × fase — desenhada pixel a pixel no boot.
 *
 * Isso não é preciosismo. Sprite rotacionado em ângulo livre destrói a grade de
 * pixel; era exatamente por isso que a Salmonella "girava no próprio eixo" (o
 * defeito de 01/08) e que tudo parecia rígido. Oito direções assadas resolvem as
 * duas coisas de uma vez.
 *
 * Todas as funções devolvem `Buf` (índice de paleta) e não tocam DOM — a
 * conversão para textura acontece em `atlas.ts`. Assim a arte roda sob teste.
 */

const TAU = Math.PI * 2

/**
 * Folga da moldura. O contorno de 1px e o arredondamento das linhas somam mais
 * que os fatores de tamanho sozinhos previam, e o teste de borda pegou a
 * influenza encostando na última fileira. Sprite que toca a borda perde o
 * contorno daquele lado e passa a "colar" no vizinho na tela.
 */
const PAD = 6

export interface Sheet {
  readonly dirs: number
  readonly phases: number
  readonly tiers: number
  readonly w: number
  readonly h: number
  readonly frames: ReadonlyArray<Buf>
}

export function sheetIndex(s: Sheet, tier: number, dir: number, phase: number): number {
  const t = Math.max(0, Math.min(s.tiers - 1, tier))
  const d = ((dir % s.dirs) + s.dirs) % s.dirs
  const p = ((phase % s.phases) + s.phases) % s.phases
  return (t * s.dirs + d) * s.phases + p
}

function buildSheet(
  w: number,
  h: number,
  tiers: number,
  dirs: number,
  phases: number,
  draw: (tier: number, dir: number, phase: number) => Buf,
): Sheet {
  const frames: Buf[] = []
  for (let t = 0; t < tiers; t++) {
    for (let d = 0; d < dirs; d++) {
      for (let p = 0; p < phases; p++) frames.push(draw(t, d, p))
    }
  }
  return { dirs, phases, tiers, w, h, frames }
}

// ---------------------------------------------------------------- leucócito

export const PLAYER_TIERS = 4
export const PLAYER_DIRS = 8
export const PLAYER_PHASES = 6

/**
 * O jogador.
 *
 * Quatro escalões de velocidade, e o escalão muda a FORMA, não só a cor: parado
 * é uma bolha quase redonda que respira; a toda é uma gota esticada na marcha,
 * com a frente em ciano. É a leitura mais direta do core de 01/08 — a velocidade
 * é o relógio, então ela precisa estar no corpo, não só numa barra de HUD.
 *
 * O núcleo lobado fica ATRÁS do centro, deslocado contra o movimento. É como
 * amebóide se desloca de verdade, e dá ao sprite uma frente e um fundo.
 */
export function playerSheet(px: number): Sheet {
  const R = px / 2
  const S = Math.ceil(R * 3.4 / 2) * 2 + PAD
  const c = S / 2

  return buildSheet(S, S, PLAYER_TIERS, PLAYER_DIRS, PLAYER_PHASES, (tier, dir, phase) => {
    const b = makeBuf(S, S)
    const dirA = (dir / PLAYER_DIRS) * TAU
    const lead = tier * 0.13
    // Ondulação baixa. Em 0.12 os harmônicos achatavam o topo e o corpo lia como
    // pedra lascada; membrana de célula ondula pouco e devagar.
    const wob = 0.055 - tier * 0.008
    const ph = (phase / PLAYER_PHASES) * TAU
    const dcos = Math.cos(dirA)
    const dsin = Math.sin(dirA)

    /*
     * Volume constante. Sem este fator o corpo só INCHA para a frente, e no
     * escalão 3 o sprite ficava 35% maior que a hitbox — numa mecânica onde
     * encostar mata ou machuca, isso é mentira de leitura. Conservando volume, a
     * gota fica mais COMPRIDA e mais ESTREITA: a leitura passa a ser "escorrego
     * por vãos", que é o que a velocidade de fato compra.
     */
    const norm = 1 / (1 + lead * 0.55)

    const radiusAt = (th: number): number => {
      const rel = th - dirA
      return (
        R *
        norm *
        (1 +
          lead * Math.cos(rel) +
          // sinal POSITIVO: estica na marcha e estreita nos flancos. Invertido,
          // fazia o contrário — alargava os lados, que é o oposto de aerodinâmico.
          lead * 0.38 * Math.cos(2 * rel) +
          wob * Math.sin(3 * th + ph) +
          wob * 0.55 * Math.sin(5 * th - 2 * ph))
      )
    }

    /*
     * Três leituras empilhadas, e a ordem importa:
     *
     * - MEMBRANA: a borda de dentro em cor chapada. Sem ela o corpo virava uma
     *   mancha clara sem contorno próprio e lia como pedra, não como célula.
     * - CRISTA CIANO: só na frente, e só a partir do escalão 1. É o corpo
     *   denunciando que agora ele engole em vez de apanhar.
     * - CITOPLASMA: o miolo, com volume por dither.
     */
    const tint = (th: number, u: number): Ramp | null => {
      if (u > 0.85) {
        const front = Math.cos(th - dirA)
        return tier > 0 && front > 0.5 ? RAMP_FAST : RAMP_MEMBRANE
      }
      return null
    }

    body(b, c, c, R * 1.6, RAMP_LEU, radiusAt, tint)
    // Granulação leve. Em 0.17 o corpo virava granito.
    speckle(b, RAMP_LEU, 17 + phase, 0.09)

    const back = -lead * R * 1.1
    const nx = c + dcos * back
    const ny = c + dsin * back
    const lobes: ReadonlyArray<readonly [number, number, number]> = [
      [-0.24, -0.1, 0.34],
      [0.2, -0.18, 0.29],
      [0.02, 0.24, 0.31],
    ]
    lobes.forEach(([ox, oy, s], i) => {
      const jx = Math.sin(ph + i * 2.1) * R * 0.07
      const jy = Math.cos(ph + i * 1.7) * R * 0.07
      disc(b, nx + ox * R + jx, ny + oy * R + jy, R * s, RAMP_NUC)
    })

    // Brilho especular: o único branco do sprite. Dois ou três pixels no alto à
    // esquerda são o que faz o olho ler "molhado e redondo" de imediato — é o
    // truque mais antigo do desenho de esfera em pixel, e o mais eficaz.
    disc(b, c - R * 0.4, c - R * 0.44, R * 0.15, RAMP_SPECULAR)

    outline(b, INK)
    return b
  })
}

// ---------------------------------------------------------------- patógenos

const PATH_DIRS = 8

/**
 * Influenza: bola com muitas cerdas curtas que pulsam. Rápida e frágil.
 *
 * O corpo é `R*0.68` e as cerdas alcançam `R` — não o contrário. Antes o disco
 * tinha raio `R` cheio e as cerdas iam a `R*1.41`, o que desenhava um bicho 40%
 * maior que a própria colisão. Num jogo em que encostar engole ou machuca, isso
 * é o pior tipo de mentira: o jogador julga a distância pelo que vê.
 */
function influenzaFrames(R: number): Sheet {
  const S = Math.ceil((R * 3.2) / 2) * 2 + PAD
  const c = S / 2
  const PH = 6
  const core = R * 0.68
  return buildSheet(S, S, 1, PATH_DIRS, PH, (_t, dir, phase) => {
    const b = makeBuf(S, S)
    const rot = (dir / PATH_DIRS) * TAU
    const ph = (phase / PH) * TAU
    const n = 14
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU
      const reach = core + R * (0.2 + 0.06 * Math.sin(ph + i * 0.8))
      const x2 = c + Math.cos(a) * reach
      const y2 = c + Math.sin(a) * reach
      line(b, c + Math.cos(a) * core * 0.9, c + Math.sin(a) * core * 0.9, x2, y2, INF1, 1)
      plot(b, Math.round(x2), Math.round(y2), INF3)
    }
    disc(b, c, c, core, RAMP_INF)
    speckle(b, RAMP_INF, 31 + phase, 0.2)
    outline(b, INK)
    return b
  })
}

/**
 * E. coli: bastão que aponta para onde vai, com o septo de divisão se
 * aprofundando ao longo das fases. Ela se parte em duas ao morrer, e o sprite
 * avisa isso antes de acontecer.
 */
function bacillusFrames(R: number): Sheet {
  const S = Math.ceil((R * 3.0) / 2) * 2 + PAD
  const c = S / 2
  const PH = 4
  return buildSheet(S, S, 1, PATH_DIRS, PH, (_t, dir, phase) => {
    const b = makeBuf(S, S)
    const a = (dir / PATH_DIRS) * TAU
    const half = R * 0.66
    const rad = R * 0.46
    capsule(b, c, c, half, rad, a, RAMP_ECO)

    // o septo: duas mordidas laterais que aprofundam, e a linha escura no meio
    const grow = 0.15 + 0.85 * (0.5 - 0.5 * Math.cos((phase / PH) * TAU))
    const px = -Math.sin(a)
    const py = Math.cos(a)
    const bite = rad * 0.62 * grow
    ring(b, c + px * rad, c + py * rad, bite, bite, 0)
    ring(b, c - px * rad, c - py * rad, bite, bite, 0)
    line(b, c + px * rad * 0.8, c + py * rad * 0.8, c - px * rad * 0.8, c - py * rad * 0.8, ECO0, 1)

    speckle(b, RAMP_ECO, 41 + phase, 0.18)
    outline(b, INK)
    return b
  })
}

/**
 * S. aureus: cacho de cocos com parede DUPLA. Contorno em dois passes é o que
 * comunica "blindado" sem número na tela — e ele exige 0.7 da velocidade máxima
 * para ser engolido.
 */
function clusterFrames(R: number): Sheet {
  const S = Math.ceil((R * 3.2) / 2) * 2 + PAD
  const c = S / 2
  const PH = 4
  const spots: ReadonlyArray<readonly [number, number]> = [
    [-1, -0.9],
    [1, -0.8],
    [-1.05, 0.9],
    [0.9, 1],
    [0, 0],
    [-0.2, -1.65],
  ]
  return buildSheet(S, S, 1, PATH_DIRS, PH, (_t, dir, phase) => {
    const b = makeBuf(S, S)
    const rot = (dir / PATH_DIRS) * TAU
    const ph = (phase / PH) * TAU
    // A parede dupla custa 2px por lado. O cacho é dimensionado JÁ contando com
    // ela, senão o contorno que comunica "blindado" põe o bicho para fora da
    // própria hitbox.
    const rad = R * 0.34
    spots.forEach(([ox, oy], i) => {
      const d = Math.sqrt(ox * ox + oy * oy)
      const ang = Math.atan2(oy, ox) + rot
      const jig = 1 + Math.sin(ph + i * 1.9) * 0.05
      disc(b, c + Math.cos(ang) * d * rad * 0.9, c + Math.sin(ang) * d * rad * 0.9, rad * jig, RAMP_EST)
    })
    speckle(b, RAMP_EST, 53 + phase, 0.16)
    outline(b, EST0)
    outline(b, INK)
    return b
  })
}

/**
 * Salmonella: corpo à frente, três flagelos chicoteando atrás. É a animação que
 * mais carrega o conjunto — flagelo parado não existe na natureza, e era o que
 * o sprite estático dava.
 */
function flagellateFrames(R: number): Sheet {
  /*
   * Proporção corrigida depois da prévia: com metade da moldura gasta em
   * flagelo, o corpo sobrava com 5px de altura e a Salmonella virava um risco
   * horizontal. Aqui o corpo manda — ele é o que precisa ser reconhecido — e o
   * flagelo é curto e chicoteia forte.
   */
  const S = Math.ceil((R * 4.4) / 2) * 2 + PAD
  const c = S / 2
  const PH = 6
  return buildSheet(S, S, 1, PATH_DIRS, PH, (_t, dir, phase) => {
    const b = makeBuf(S, S)
    const a = (dir / PATH_DIRS) * TAU
    const ph = (phase / PH) * TAU
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const half = R * 0.6
    const rad = R * 0.62
    const bx = c + ca * R * 0.5
    const by = c + sa * R * 0.5
    const rearX = bx - ca * (half + rad * 0.2)
    const rearY = by - sa * (half + rad * 0.2)

    for (let f = 0; f < 3; f++) {
      let px = rearX
      let py = rearY
      const spread = (f - 1) * 0.5
      for (let k = 1; k <= 7; k++) {
        const along = k * R * 0.26
        const lat = Math.sin(k * 0.9 - ph + f * 2.1) * R * 0.5 * (k / 7) + spread * R * 0.22
        const qx = rearX - ca * along - sa * lat
        const qy = rearY - sa * along + ca * lat
        line(b, px, py, qx, qy, f === 1 ? SAL3 : SAL2, 1)
        px = qx
        py = qy
      }
    }

    capsule(b, bx, by, half, rad, a, RAMP_SAL)
    speckle(b, RAMP_SAL, 67 + phase, 0.16)
    outline(b, INK)
    return b
  })
}

/**
 * SARS-CoV-2: poucas espículas longas de ponta em taco — a coroa que dá o nome.
 * O mais pesado dos seis, e o único imune a dano indireto; parede dupla de novo.
 */
function coronaFrames(R: number): Sheet {
  const S = Math.ceil((R * 3.4) / 2) * 2 + PAD
  const c = S / 2
  const PH = 6
  return buildSheet(S, S, 1, PATH_DIRS, PH, (_t, dir, phase) => {
    const b = makeBuf(S, S)
    const rot = (dir / PATH_DIRS) * TAU
    const ph = (phase / PH) * TAU
    // Mesma regra da influenza: corpo em `R*0.62`, taco alcançando `R`. A coroa
    // continua sendo a leitura, mas o bicho passa a ocupar a própria hitbox.
    const core = R * 0.58
    const n = 10
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU
      // O alcance é até o CENTRO do taco; o raio do taco e a parede dupla ainda
      // vêm depois, e é a soma dos três que precisa caber na hitbox.
      const reach = core + R * (0.16 + 0.04 * Math.sin(ph + i * 1.1))
      const tx = c + Math.cos(a) * reach
      const ty = c + Math.sin(a) * reach
      line(b, c + Math.cos(a) * core * 0.9, c + Math.sin(a) * core * 0.9, tx, ty, COR1, 2)
      disc(b, tx, ty, R * 0.11, RAMP_COR)
    }
    disc(b, c, c, core, RAMP_COR)
    speckle(b, RAMP_COR, 79 + phase, 0.16)
    outline(b, COR0)
    outline(b, INK)
    return b
  })
}

export function pathogenSheet(form: string, px: number): Sheet {
  const R = px / 2
  switch (form) {
    case "bacilo":
      return bacillusFrames(R)
    case "cacho":
      return clusterFrames(R)
    case "flagelado":
      return flagellateFrames(R)
    case "coroa":
      return coronaFrames(R)
    default:
      return influenzaFrames(R)
  }
}

// ------------------------------------------------------------ outros corpos

/**
 * Célula do organismo. Translúcida — e em pixel art translúcido é dither, não
 * alpha. O interior é xadrez; só a membrana é sólida, o que a mantém legível
 * mesmo com dez patógenos por cima.
 */
export function organSheet(px: number, hpMax: number): Sheet {
  const R = px / 2
  const S = Math.ceil((R * 2.6) / 2) * 2 + PAD
  const c = S / 2
  const PH = 6
  return buildSheet(S, S, hpMax, 1, PH, (tier, _d, phase) => {
    const b = makeBuf(S, S)
    const ph = (phase / PH) * TAU
    const health = (tier + 1) / hpMax
    const r = R * (1 + Math.sin(ph) * 0.05)

    disc(b, c, c, r * 0.94, RAMP_ORG)
    ditherMask(b, 0.35 + 0.25 * health)
    ring(b, c, c, r, 2, ORG2)
    // O anel interno usa cosseno: com os dois em seno, as fases opostas do
    // respiro caíam no mesmo desenho e metade dos quadros era cópia.
    ring(b, c, c, r * 0.78 + Math.cos(ph) * R * 0.07, 1, ORG1, 0.5)

    // rachaduras quando ferida: dano vira desenho, não só alpha menor
    const cracks = hpMax - 1 - tier
    for (let i = 0; i < cracks; i++) {
      const a = (i / Math.max(1, cracks)) * TAU + 0.7
      line(b, c + Math.cos(a) * r * 0.2, c + Math.sin(a) * r * 0.2, c + Math.cos(a) * r, c + Math.sin(a) * r, INK2, 1)
    }
    outline(b, INK)
    return b
  })
}

/** Cápsula de poder: hexágono pulsante na cor do poder. */
export function dropSheet(ramp: Ramp): Sheet {
  const S = 20
  const c = S / 2
  const PH = 8
  return buildSheet(S, S, 1, 1, PH, (_t, _d, phase) => {
    const b = makeBuf(S, S)
    const ph = (phase / PH) * TAU
    const r = 5 + Math.sin(ph) * 0.9
    body(b, c, c, r + 1, ramp, (th) => {
      // hexágono: raio constante por setor, que é o que dá aresta reta em pixel
      const k = Math.PI / 3
      const seg = Math.abs(((th % k) + k) % k) - k / 2
      return r / Math.cos(seg)
    })
    ring(b, c, c, r + 2.5, 1, WHITE, 0.5)
    outline(b, INK)
    return b
  })
}

/** Macrófago aliado: bolha grande e mole, respirando. */
export function macrophageSheet(px: number): Sheet {
  const R = px
  const S = Math.ceil((R * 2.8) / 2) * 2 + PAD
  const c = S / 2
  const PH = 6
  return buildSheet(S, S, 1, 1, PH, (_t, _d, phase) => {
    const b = makeBuf(S, S)
    const ph = (phase / PH) * TAU
    body(b, c, c, R * 1.3, RAMP_LEU, (th) => R * (1 + 0.1 * Math.sin(3 * th + ph)))
    disc(b, c + R * 0.2, c - R * 0.2, R * 0.34, RAMP_NUC)
    outline(b, INK)
    return b
  })
}

/** Orbitador do poder de órbita: bolinha dura, sem respiro. */
export function orbiterBuf(r: number): Buf {
  const S = Math.ceil((r * 2 + 4) / 2) * 2 + PAD
  const b = makeBuf(S, S)
  disc(b, S / 2, S / 2, r, RAMP_SHI)
  outline(b, INK)
  return b
}

/**
 * Anéis de choque, em passos discretos de raio.
 *
 * Um anel de raio contínuo exigiria redesenhar pixel a pixel todo quadro. Assar
 * doze raios e escolher o mais próximo custa nada e ainda soa mais a console:
 * a onda cresce em degraus visíveis, não numa rampa lisa.
 */
export const RING_STEPS = 12

export function shockRings(maxR: number, idx: number): ReadonlyArray<Buf> {
  const out: Buf[] = []
  for (let i = 0; i < RING_STEPS; i++) {
    const r = (maxR * (i + 1)) / RING_STEPS
    const S = Math.ceil((r * 2 + 6) / 2) * 2 + PAD
    const b = makeBuf(S, S)
    const thick = 1 + Math.round((1 - i / RING_STEPS) * 3)
    ring(b, S / 2, S / 2, r, thick, idx)
    ring(b, S / 2, S / 2, r + 1.5, 1, idx, 0.5)
    out.push(b)
  }
  return out
}

/** Aura fixa em dither: rastro, nuvem, interferon. Raio vem do tuning e não muda. */
export function auraBuf(r: number, idx: number, keep: number): Buf {
  const S = Math.ceil((r * 2 + 4) / 2) * 2 + PAD
  const b = makeBuf(S, S)
  ring(b, S / 2, S / 2, r, r, idx, keep)
  ring(b, S / 2, S / 2, r, 1, idx, 1)
  return b
}

/**
 * Tecido: um tile de hemácias, em cinco estados de infecção.
 *
 * O estado 0 é a gota de sangue cheia — hemácia encostando em hemácia. Conforme
 * a infecção sobe, as células escurecem e somem, até o tile virar plasma vazio.
 *
 * A leitura é imediata e não gasta cor nova: **a arena vazia que o jogo tinha
 * até agora é, literalmente, o estado totalmente infectado.** Curar repovoa.
 */
export const TISSUE_LEVELS = 5
export const TISSUE_VARIANTS = 6

/**
 * O leito de hemácias: UMA textura de tela cheia, empacotada de forma irregular.
 *
 * A primeira versão desenhava 4 hemácias por tile em posições fixas de uma grade
 * de 32x18, e o humano reprovou na hora: saía um xadrez, não uma gota de sangue.
 * Sob microscópio as células se tocam, se sobrepõem e não têm alinhamento nenhum.
 *
 * A correção estrutural é desacoplar: o leito é uma imagem só, contínua e sem
 * grade; o estado da infecção vem por cima, em `colonyTile`. A grade continua
 * existindo na sim, mas some da tela.
 */
export const BED_FRAMES = 4

/**
 * Camada da frente: poucas hemácias, desenhadas POR CIMA dos corpos em jogo.
 *
 * Chamada do humano em 01/08: *"a batalha acontece acima das hemácias; se
 * acontecesse entre elas seria mais dramático"*. Um leito só, sempre atrás,
 * vira papel de parede — o jogo passa a acontecer numa camada e o cenário em
 * outra. Com um punhado de células na frente, o leucócito passa por baixo de
 * algumas e por cima de outras, e o campo deixa de ser fundo e vira MEIO.
 *
 * Esparsa de propósito: densa demais na frente e ela esconde o jogo.
 */
export function tissueFront(w: number, h: number, seed: number, frame: number): Buf {
  const b = makeBuf(w, h)
  /*
   * ESCURA de propósito. Com a mesma rampa do leito a camada sumia dentro dele e
   * não lia como profundidade — só somava massa. Célula entre a luz e o campo é
   * silhueta; escurecer é o sinal de "está na frente" e ainda impede que ela
   * dispute atenção com o que importa.
   */
  const RAMP_FRONT: Ramp = [INK, INK2, INK2, PLASMA1]
  const n = Math.round((w * h) / 2600)
  const ph = (frame / BED_FRAMES) * TAU
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(ph + i * 1.7) * 1.6
    const cx = hashNoise(i, seed, 51) * (w + 24) - 12 + drift
    const cy = hashNoise(i, seed, 53) * (h + 24) - 12 + Math.cos(ph + i * 2.3) * 1.2
    // maiores que as do leito: tamanho é metade da leitura de profundidade
    const r = 9 + hashNoise(i, seed, 57) * 4
    const squash = 0.7 + hashNoise(i, seed, 59) * 0.26
    const tilt = hashNoise(i, seed, 61) * Math.PI
    const oval = (rr: number) => (th: number): number => {
      const s2 = Math.sin(th - tilt)
      return rr / Math.sqrt(1 + (1 / (squash * squash) - 1) * s2 * s2)
    }
    body(b, cx, cy, r + 1.4, [INK2], oval(r + 1.4))
    body(b, cx, cy, r, RAMP_FRONT, oval(r))
    body(b, cx, cy, r * 0.34, [HEM0], oval(r * 0.34))
  }
  return b
}

export function tissueBed(w: number, h: number, seed: number, frame = 0): Buf {
  const b = makeBuf(w, h)
  // Jostle: as células tremem no lugar, em tempo de MUNDO. O leito não ROLA
  // porque a grade de infecção é fixa em coordenada de arena — se ele rolasse,
  // a colônia descolaria do tecido que ela infecta.
  const ph = (frame / BED_FRAMES) * TAU
  /*
   * A rampa para no HEM1, não no HEM2. O leito ocupa a tela inteira: se ele for
   * ao tom mais claro do vermelho, vira uma parede saturada e o jogador — que é
   * um ponto de 20px — some dentro dela. Fundo é fundo mesmo quando é o campo de
   * jogo; quem tem que brilhar é quem você controla.
   */
  const RAMP_RBC: Ramp = [PLASMA1, HEM0, HEM0, HEM1]
  const n = Math.round((w * h) / 135)
  for (let i = 0; i < n; i++) {
    const cx = hashNoise(i, seed, 11) * (w + 16) - 8 + Math.sin(ph + i * 0.9) * 0.9
    const cy = hashNoise(i, seed, 13) * (h + 16) - 8 + Math.cos(ph + i * 1.3) * 0.9
    const r = 5.5 + hashNoise(i, seed, 17) * 3.2
    const squash = 0.74 + hashNoise(i, seed, 19) * 0.24
    const tilt = hashNoise(i, seed, 23) * Math.PI
    const oval = (rr: number) => (th: number): number => {
      const s2 = Math.sin(th - tilt)
      return rr / Math.sqrt(1 + (1 / (squash * squash) - 1) * s2 * s2)
    }
    // Halo escuro antes do corpo: é o que separa uma célula da vizinha. Sem ele
    // a alta densidade vira massa única em vez de células empacotadas.
    body(b, cx, cy, r + 1.2, [PLASMA0], oval(r + 1.2))
    body(b, cx, cy, r, RAMP_RBC, oval(r))
    // Depressão bicôncava CHAPADA e pequena. Com sombreamento próprio e raio
    // grande ela desenhava um anel, e o leito inteiro lia como rosquinhas.
    body(b, cx, cy, r * 0.34, [HEM0], oval(r * 0.34))
  }
  return b
}

/**
 * A doença, por cima do leito.
 *
 * Correção de desenho pedida pelo humano: **doença se manifesta, não subtrai.**
 * A versão anterior apagava hemácias conforme a infecção subia, e o campo tomado
 * virava vazio — que é justamente como o jogo parecia ANTES do tecido existir, e
 * que lê como "seguro". Aqui o tecido continua lá; o que cresce é a colônia.
 *
 * Nível 0 é transparente por completo: tecido sadio não desenha nada.
 */
export function colonyTile(w: number, h: number, level: number, variant: number): Buf {
  const b = makeBuf(w, h)
  if (level <= 0) return b

  // A necrose: o leito escurece por baixo da colônia, sem sumir.
  const escuro = [0, 0.18, 0.36, 0.56, 0.78][level] ?? 0
  if (escuro > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (bayer(x, y) < escuro) plot(b, x, y, level >= 4 ? INK2 : PLASMA0)
      }
    }
  }

  // A colônia, que MULTIPLICA. É a leitura de ameaça que faltava.
  const colonias = [0, 2, 5, 10, 17][level] ?? 0
  const RAMP_PUS: Ramp = [SAL0, SAL0, SAL1, SAL2]
  for (let i = 0; i < colonias; i++) {
    const cx = hashNoise(i, variant, 31) * w
    const cy = hashNoise(i, variant, 37) * h
    const r = 1.2 + hashNoise(i, variant, 41) * (0.8 + level * 0.35)
    body(b, cx, cy, r, RAMP_PUS, () => r)
  }
  return b
}

/** Partícula: quadradinho. Quatro tamanhos cobrem tudo que explode. */
export function dotBuf(size: number, idx: number): Buf {
  const b = makeBuf(size, size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) plot(b, x, y, idx)
  return b
}

/** Marca de nascimento: losango que some. Substitui o escalonamento do sprite. */
export function hatchBuf(r: number, idx: number): Buf {
  const S = Math.ceil((r * 2 + 4) / 2) * 2 + PAD
  const b = makeBuf(S, S)
  ring(b, S / 2, S / 2, r, 1, idx)
  return b
}

/** Fantasma do rastro de velocidade: a silhueta do jogador, recortada em dither. */
export function ghostOf(src: Buf, keep: number, idx: number): Buf {
  const b = makeBuf(src.w, src.h)
  blit(b, src, 0, 0)
  for (let i = 0; i < b.d.length; i++) if (b.d[i] !== 0) b.d[i] = idx
  ditherMask(b, keep)
  return b
}
