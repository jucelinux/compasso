import type { Texture } from "pixi.js"
import {
  CROWD_VARIANTS,
  brainLayerBuf,
  crowdLayout,
  crowdShape,
  neuronShape,
  layerBuf,
  plasmaBuf,
  type CrowdCell,
  type LayerKind,
} from "./backdrop.ts"
import { glyphBuf } from "./font.ts"
import {
  cycledPalette,
  FAST0,
  FAST1,
  PALETTE,
  RAMP_COR,
  RAMP_ECO,
  RAMP_EST,
  RAMP_FAST,
  RAMP_GLD,
  RAMP_INF,
  RAMP_LEU,
  RAMP_ORG,
  KIND_RAMP,
  RAMP_SAL,
  RAMP_SHI,
  SHI1,
  WHITE,
  type Ramp,
} from "./palette.ts"
import { ditherMask, makeBuf, type Buf } from "./pixelbuf.ts"
import {
  auraBuf,
  dotBuf,
  dropSheet,
  ghostOf,
  hatchBuf,
  macrophageSheet,
  orbiterBuf,
  pathogenSheet,
  playerSheet,
  bloodCell,
  CELL_LEVELS,
  coinSheet,
  colonyTile,
  haloSheet,
  neuronSheet,
  pulseSheet,
  necroticTile,
  TISSUE_LEVELS,
  TISSUE_VARIANTS,
  sheetIndex,
  shockRings,
  type Sheet,
} from "./sprites.ts"
import { toSheet, toTexture } from "./texture.ts"
import { POWERS } from "../sim/powers.ts"
import type { Tuning } from "../sim/types.ts"

/**
 * Assa tudo uma vez, no boot, e entrega texturas prontas.
 *
 * A separação importa: `sprites.ts` e `backdrop.ts` produzem matrizes de índice
 * e rodam sob teste; este arquivo é o que converte para GPU. Se um dia entrar
 * arte desenhada à mão, é só aqui que a origem da matriz muda.
 */

export interface TexSheet {
  readonly dirs: number
  readonly phases: number
  readonly tiers: number
  readonly frames: ReadonlyArray<Texture>
}

function bake(s: Sheet): TexSheet {
  return {
    dirs: s.dirs,
    phases: s.phases,
    tiers: s.tiers,
    frames: s.frames.map((f) => toTexture(f)),
  }
}

export function frameOf(s: TexSheet, tier: number, dir: number, phase: number): Texture {
  const t = Math.max(0, Math.min(s.tiers - 1, tier | 0))
  const d = ((dir | 0) % s.dirs + s.dirs) % s.dirs
  const p = ((phase | 0) % s.phases + s.phases) % s.phases
  return s.frames[(t * s.dirs + d) * s.phases + p]!
}

/** Escolhe a rampa mais próxima de uma cor de poder. Mantém tudo dentro da paleta. */
const RAMP_CHOICES: ReadonlyArray<Ramp> = [
  RAMP_FAST,
  RAMP_INF,
  RAMP_SHI,
  RAMP_LEU,
  RAMP_GLD,
  RAMP_COR,
  RAMP_ECO,
  RAMP_ORG,
  RAMP_EST,
  RAMP_SAL,
]

function nearestRamp(hex: number): Ramp {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  let best = RAMP_CHOICES[0]!
  let bestD = Infinity
  for (const ramp of RAMP_CHOICES) {
    const sig = PALETTE[ramp[ramp.length - 2]!]!
    const dr = ((sig >> 16) & 0xff) - r
    const dg = ((sig >> 8) & 0xff) - g
    const db = (sig & 0xff) - b
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) {
      bestD = d
      best = ramp
    }
  }
  return best
}

export interface Atlas {
  readonly player: TexSheet
  /** Fantasmas do borrão de velocidade: [tier][dir][nível]. */
  readonly ghosts: ReadonlyArray<ReadonlyArray<ReadonlyArray<Texture>>>
  readonly pathogens: ReadonlyMap<string, TexSheet>
  /**
   * A multidão de hemácias: `[necrose][variante]`. Corpos, não imagem de fundo.
   *
   * Substitui `tissueBed` (uma textura de tela cheia) e `tissueFront` (uma
   * camada por cima), as duas de 01–02/08. Nenhuma das duas podia ser
   * empurrada, e é ser empurrada que o H estava pedindo desde o começo.
   */
  readonly blood: ReadonlyArray<ReadonlyArray<Texture>>
  /** Onde cada hemácia mora. Mesmo comprimento em toda a vida do atlas. */
  readonly crowd: ReadonlyArray<CrowdCell>
  /** Colônia da doença por cima: [nível][variante]. Nível 0 é transparente. */
  readonly colony: ReadonlyArray<ReadonlyArray<Texture>>
  /** A CICATRIZ, mesma grade do `colony`. Ver `necroticTile`. */
  readonly necrose: ReadonlyArray<ReadonlyArray<Texture>>
  readonly drops: ReadonlyArray<TexSheet>
  /** Cápsula no VERDE DO LIMO. É a supressão da doença. */
  readonly dropLimo: TexSheet
  /** Cápsula na rampa de cada patógeno. É o COMPLEMENTO. */
  readonly dropsByKind: ReadonlyMap<string, TexSheet>
  /** Anel multicolorido piscante: a identidade de "isto é item". */
  readonly halo: TexSheet
  /** A moeda: memória imunológica caída no chão. */
  readonly coin: TexSheet
  /** Layout da multidão de neurônios do hub. Mesma máquina das hemácias. */
  readonly brainCrowd: ReadonlyArray<CrowdCell>
  /** Uma folha por variante de neurônio. */
  readonly neurons: ReadonlyArray<TexSheet>
  /** Parallax do cérebro: corpos distantes, axônios, faíscas. */
  readonly brainLayers: ReadonlyArray<Texture>
  /** Onda do efeito consumido, verde do limo. */
  readonly pulseLimo: TexSheet
  /** Onda do efeito consumido, na cor do patógeno. */
  readonly pulsesByKind: ReadonlyMap<string, TexSheet>
  readonly macrophage: TexSheet
  readonly orbiter: Texture
  readonly shock: ReadonlyArray<Texture>
  readonly trail: Texture
  readonly cloud: Texture
  readonly interferon: Texture
  readonly hatch: Texture
  /** Véus de tela cheia em dither. Flash de dano e escurecimento da morte. */
  readonly veil: (idx: number, level: 0 | 1 | 2) => Texture
  readonly plasma: ReadonlyArray<Texture>
  readonly layers: ReadonlyMap<LayerKind, Texture>
  dot(idx: number, size: number): Texture
  glyph(ch: string, idx: number): Texture | null
}

/**
 * Densidades do borrão de velocidade.
 *
 * Começaram em 0.55/0.30/0.15 e a captura mostrou o defeito: o fantasma mais
 * próximo saía quase sólido e a fila inteira ficava mais brilhante que o corpo,
 * lendo como um colar de contas em vez de rastro. O rastro é subordinado — quem
 * o jogador precisa achar na tela é a célula.
 */
const GHOST_LEVELS: ReadonlyArray<readonly [number, number]> = [
  [0.3, FAST1],
  [0.16, FAST0],
  [0.07, FAST0],
]

/**
 * Área por hemácia da multidão. Sonda: `?crowd=<n>` no build de dev troca a
 * densidade sem recompilar, e `0` desliga a multidão inteira — que é como se
 * mede quanto ela custa por quadro.
 */
export function buildAtlas(tuning: Tuning, crowdArea?: number): Atlas {
  const playerSh = playerSheet(tuning.player.size)
  const player = bake(playerSh)

  // Fantasma é derivado do próprio quadro do jogador, então o borrão tem
  // exatamente a silhueta do corpo — inclusive a deformação do escalão.
  const ghosts: Texture[][][] = []
  for (let t = 0; t < playerSh.tiers; t++) {
    const byDir: Texture[][] = []
    for (let d = 0; d < playerSh.dirs; d++) {
      const src = playerSh.frames[sheetIndex(playerSh, t, d, 0)]!
      byDir.push(GHOST_LEVELS.map(([keep, idx]) => toTexture(ghostOf(src, keep, idx))))
    }
    ghosts.push(byDir)
  }

  // Forma E cor saem da morfologia declarada em `tuning.json`. Um tipo novo no
  // tuning ganha sprite animado sem uma linha a mais aqui.
  const pathogens = new Map<string, TexSheet>()
  for (const [kind, spec] of Object.entries(tuning.enemy.kinds)) {
    pathogens.set(kind, bake(pathogenSheet(spec.form, tuning.enemy.size * spec.sizeScale)))
  }

  // Avaliado UMA vez; as quatro variantes só trocam a tabela de cor. É a
  // ciclagem de paleta — corrente escorrendo de graça.
  const plasma = plasmaBuf(tuning.arena.width, tuning.arena.height)
  const tileW = tuning.arena.width / tuning.field.cols
  const tileH = tuning.arena.height / tuning.field.rows

    /*
   * Quantos degraus a onda do item cresce. 14 a 60fps são ~0,23s, que é o tempo
   * de um efeito instantâneo LER como instantâneo — mais longo vira animação de
   * espera, e o item não faz esperar.
   */
  const PULSE_STEPS = 14

  const drops = POWERS.map((p) => bake(dropSheet(nearestRamp(p.color))))

  /*
   * Cápsulas na cor do que elas AFETAM, a pedido do H em 13/08.
   *
   * A supressão veste o verde do limo; o COMPLEMENTO veste a rampa do patógeno
   * da fase. Por isso as duas não podem sair do `POWERS[].color`, que é um só:
   * a segunda muda de cor conforme a doença em cena.
   *
   * `RAMP_SAL` é o verde do limo por um motivo concreto e não por gosto — é a
   * rampa que o `colonyTile` usa (`RAMP_PUS`) para desenhar a colônia em TODA
   * fase. Se aquele verde mudar, este item tem que mudar junto, e é isto que
   * esta linha registra.
   */
  const dropLimo = bake(dropSheet(RAMP_SAL))
  const dropsByKind = new Map<string, TexSheet>()
  for (const kind of Object.keys(tuning.enemy.kinds)) {
    dropsByKind.set(kind, bake(dropSheet(KIND_RAMP[kind] ?? RAMP_SAL)))
  }

  const halo = bake(haloSheet())
  const coin = bake(coinSheet())

  /*
   * O CÉREBRO: multidão de neurônios e três camadas de parallax.
   *
   * A multidão reusa `crowdLayout` com área MAIOR por corpo — neurônio é maior
   * e mais esparso que hemácia, e o que precisa caber entre eles é a sinapse.
   * Multidão apertada não tem onde desenhar ligação.
   */
  /*
   * Área por neurônio: ~29x a da hemácia, e o número veio da CAPTURA.
   *
   * Eu tinha calculado 560 no papel — "6x a hemácia, sobra espaço" — e a
   * primeira imagem do hub mostrou 411 neurônios de 48px empilhados sem um vão
   * sequer: as sinapses não apareciam, o texto não se lia, e o fundo virava
   * primeiro plano. O erro foi confundir área por CENTRO com espaço entre
   * CORPOS; a 560 os centros ficam a ~24px e o sprite tem 48.
   *
   * Passei por 2600 (centros a ~51px) e o H pediu POPULAÇÃO MAIOR. 1350 dá ~170
   * corpos com centros a ~37px: ainda sobra vão para a sinapse — que é a
   * restrição real desta tela —, e a rede fica densa o bastante para parecer
   * tecido nervoso em vez de uma constelação. Abaixo disso os corpos voltam a se
   * tocar e as ligações somem por baixo deles.
   */
  /*
   * TERCEIRO ajuste, 13/08: o H pediu populacao maior de novo, tendo VISTO a de
   * 1350. Dois numeros mudaram junto e o segundo e o que torna este possivel —
   * a sinapse passou a sair da PONTA DO DENDRITO em vez do nucleo, entao ela
   * nasce ja fora do soma e nao depende mais de haver vao entre os corpos para
   * ser vista. Era exatamente a restricao que travava a densidade aqui.
   *
   * 950 da ~220 corpos com centros a ~31px. O raio do soma vai de 7 a 11,5,
   * entao dois vizinhos somam no maximo 23px de corpo: eles se aproximam sem se
   * tocar, e os dendritos passam a se entrelacar — que e o que faz a tela ler
   * como TECIDO nervoso em vez de constelacao.
   */
  const NEURON_AREA = 950
  const brainCrowd = crowdLayout(tuning.arena.width, tuning.arena.height, 909, NEURON_AREA)
  const neurons = Array.from({ length: CROWD_VARIANTS }, (_, v) => {
    const sh = neuronShape(v)
    return bake(neuronSheet(sh.r, sh.dendritos, sh.tilt, v))
  })
  const brainLayers = (["chao", "corpos", "axonios", "faiscas"] as const).map((kind, i) =>
    toTexture(brainLayerBuf(tuning.arena.width, tuning.arena.height, kind, 4200 + i)),
  )
  /*
   * Uma onda por rampa de efeito. Assadas no boot como todo o resto — a
   * alternativa seria compor o anel em tempo de execução, que é exatamente o
   * que este pipeline existe para não fazer.
   */
  const pulseLimo = bake(pulseSheet(RAMP_SAL, PULSE_STEPS, 120))
  const pulsesByKind = new Map<string, TexSheet>()
  for (const kind of Object.keys(tuning.enemy.kinds)) {
    pulsesByKind.set(kind, bake(pulseSheet(KIND_RAMP[kind] ?? RAMP_SAL, PULSE_STEPS, 96)))
  }

  const dotCache = new Map<number, Texture>()
  const glyphCache = new Map<string, Texture | null>()
  const veilCache = new Map<number, Texture>()
  // Três densidades de dither. Alpha resolveria em uma linha, mas meia-cor lisa
  // por cima de tudo é justamente o que denuncia render moderno.
  const VEIL_KEEP: ReadonlyArray<number> = [0.25, 0.5, 0.8]

  return {
    player,
    ghosts,
    pathogens,
    /*
     * FOLHA ÚNICA, e isso é medida e não gosto: são ~1700 corpos na tela, e com
     * 48 texturas soltas intercaladas o lote do Pixi quebrava quase a cada
     * sprite. Uma fonte compartilhada derruba a multidão inteira para um punhado
     * de chamadas de desenho.
     */
    blood: (() => {
      const bufs = []
      for (let lv = 0; lv < CELL_LEVELS; lv++) {
        for (let v = 0; v < CROWD_VARIANTS; v++) {
          const s = crowdShape(v)
          bufs.push(bloodCell(s.r, s.squash, s.tilt, lv))
        }
      }
      const folha = toSheet(bufs)
      return Array.from({ length: CELL_LEVELS }, (_, lv) =>
        folha.slice(lv * CROWD_VARIANTS, (lv + 1) * CROWD_VARIANTS),
      )
    })(),
    crowd: crowdLayout(tuning.arena.width, tuning.arena.height, 4242, crowdArea),
    necrose: Array.from({ length: TISSUE_LEVELS }, (_, lv) =>
      Array.from({ length: TISSUE_VARIANTS }, (_, v) =>
        toTexture(necroticTile(Math.ceil(tileW), Math.ceil(tileH), lv, v)),
      ),
    ),
    colony: Array.from({ length: TISSUE_LEVELS }, (_, lv) =>
      Array.from({ length: TISSUE_VARIANTS }, (_, v) =>
        toTexture(colonyTile(Math.ceil(tileW), Math.ceil(tileH), lv, v)),
      ),
    ),
    drops,
    dropLimo,
    dropsByKind,
    halo,
    coin,
    brainCrowd,
    neurons,
    brainLayers,
    pulseLimo,
    pulsesByKind,
    macrophage: bake(macrophageSheet(tuning.powers.macrophageRadius)),
    orbiter: toTexture(orbiterBuf(tuning.powers.orbitKillRadius)),
    shock: shockRings(tuning.powers.shockRadius, SHI1).map((b) => toTexture(b)),
    trail: toTexture(auraBuf(tuning.powers.trailRadius, FAST1, 0.4)),
    cloud: toTexture(auraBuf(tuning.powers.cloudRadius, RAMP_GLD[2]!, 0.34)),
    interferon: toTexture(auraBuf(tuning.powers.interferonRadius, FAST0, 0.14)),
    hatch: toTexture(hatchBuf(tuning.enemy.size * 0.9, WHITE)),
    veil(idx, level) {
      const key = idx * 4 + level
      let t = veilCache.get(key)
      if (t === undefined) {
        const b: Buf = makeBuf(tuning.arena.width, tuning.arena.height)
        b.d.fill(idx)
        ditherMask(b, VEIL_KEEP[level]!)
        t = toTexture(b)
        veilCache.set(key, t)
      }
      return t
    },
    plasma: [0, 1, 2, 3].map((step) => toTexture(plasma, cycledPalette(step))),
    layers: new Map<LayerKind, Texture>(
      (["hemacias", "fibrina", "detritos"] as const).map((k, i) => [
        k,
        toTexture(layerBuf(tuning.arena.width, tuning.arena.height, k, i * 91 + 7)),
      ]),
    ),
    dot(idx, size) {
      const key = idx * 16 + size
      let t = dotCache.get(key)
      if (t === undefined) {
        t = toTexture(dotBuf(size, idx))
        dotCache.set(key, t)
      }
      return t
    },
    glyph(ch, idx) {
      const key = `${ch} ${idx}`
      if (glyphCache.has(key)) return glyphCache.get(key) ?? null
      const b = glyphBuf(ch, idx)
      const t = b === null ? null : toTexture(b)
      glyphCache.set(key, t)
      return t
    },
  }
}
