import {
  FAST1,
  FIB0,
  FIB1,
  HEM2,
  LEU1,
  LEU2,
  NUC0,
  NUC1,
  PLASMA0,
  PLASMA1,
  PLASMA2,
  PLASMA3,
  GREY0,
  GREY1,
  GREY2,
  RAMP_HEM,
  RAMP_NUC,
} from "./palette.ts"
import { bayer, body, hashNoise, line, makeBuf, plot, shadeAt, type Buf } from "./pixelbuf.ts"

/**
 * Fundo.
 *
 * O parallax de 31/07 foi reprovado com razão em 01/08: era a mesma textura em
 * três escalas, e imagem repetida escorregando não é profundidade. Aqui cada
 * camada é outra coisa — hemácia fora de foco no fundo, malha de fibrina no
 * meio, plaqueta nítida na frente — e cada uma fecha na emenda horizontal.
 *
 * Tudo devolve `Buf`, sem DOM.
 */

const RAMP_PLASMA: ReadonlyArray<number> = [PLASMA0, PLASMA1, PLASMA2, PLASMA3]

/**
 * Camada de base, feita para ciclagem de paleta.
 *
 * Os índices formam faixas contíguas de corrente. Trocar as quatro cores de
 * lugar na tabela faz a corrente escorrer sem mover um pixel de geometria — é o
 * truque de fundo mais barato do console, e resolve o fundo continuar VIVO com o
 * jogador parado, que é justamente quando o creep segura a tensão.
 */
export function plasmaBuf(w: number, h: number): Buf {
  const b = makeBuf(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const flow =
        Math.sin(x * 0.021 + Math.sin(y * 0.017) * 1.6) * 0.5 +
        Math.sin(y * 0.033 - x * 0.008) * 0.3
      /*
       * Faixa ESTREITA e ALTA da rampa, não a rampa inteira.
       *
       * Chamada do H em 02/08: *"lá no fundo a variação entre o vermelho e o
       * preto pode ser muito mais sutil"* — e é o diagnóstico certo do
       * "parallax não preenche". Varrendo os quatro tons, o fundo caía no
       * quase-preto e lia como BURACO entre as células, não como fundo. Buraco
       * não preenche por definição.
       *
       * Mexer aqui, e não nos valores da paleta, é o que faz a correção valer
       * para as nove variantes de uma vez — cada uma tem os próprios PLASMA, e
       * todas passam a usar só o terço de cima do que declararam.
       */
      const t = 0.68 + flow * 0.17
      plot(b, x, y, shadeAt(RAMP_PLASMA, t, x, y))
    }
  }
  return b
}

/**
 * A MULTIDÃO: onde cada hemácia mora.
 *
 * Só posições e formas — nenhum pixel. O render instancia um corpo por entrada
 * e empurra os que estiverem no caminho; é a diferença entre um leito que se
 * olha e um leito que se atravessa.
 *
 * Determinístico por `hashNoise`, então a mesma seed dá o mesmo campo sempre, e
 * as posições podem ser assadas numa grade de busca uma vez só no boot.
 */
export interface CrowdCell {
  /** Onde ela mora. O deslocamento é sempre relativo a isto. */
  readonly hx: number
  readonly hy: number
  readonly r: number
  /** Índice da forma assada. */
  readonly variant: number
}

/** Quantas formas distintas são assadas. Mais que isto ninguém distingue. */
export const CROWD_VARIANTS = 16

/**
 * Densidade padrão: uma célula a cada 90 px².
 *
 * Começou em 135, que era a do leito assado, para a troca de técnica não trazer
 * troca de densidade junto e a reação dele ficar atribuível. Com a multidão na
 * tela ele varreu de 10 a 120 na própria máquina — todas a 144fps, o teto do
 * monitor dele — e escolheu 90. É o primeiro número deste projeto ajustado por
 * varredura do humano em vez de proposta minha.
 */
export const CROWD_AREA_PER_CELL = 90

export function crowdLayout(w: number, h: number, seed: number, areaPer = CROWD_AREA_PER_CELL): CrowdCell[] {
  const n = areaPer <= 0 ? 0 : Math.round((w * h) / areaPer)
  const out: CrowdCell[] = []
  for (let i = 0; i < n; i++) {
    const variant = Math.floor(hashNoise(i, seed, 29) * CROWD_VARIANTS) % CROWD_VARIANTS
    out.push({
      // Margem para fora da arena: célula cortada na borda denuncia a moldura.
      hx: hashNoise(i, seed, 11) * (w + 16) - 8,
      hy: hashNoise(i, seed, 13) * (h + 16) - 8,
      // O raio VEM da variante, e não de um sorteio próprio: se o corpo que
      // empurra não tiver o tamanho do corpo que se vê, o empurrão acontece no
      // lugar errado e a multidão parece ter fantasmas.
      r: crowdShape(variant).r,
      variant,
    })
  }
  return out
}

/** Forma da variante `v`: raio, achatamento e inclinação. Assada uma vez. */
export function crowdShape(v: number): { r: number; squash: number; tilt: number } {
  return {
    r: 5.5 + hashNoise(v, 777, 17) * 3.2,
    squash: 0.74 + hashNoise(v, 777, 19) * 0.24,
    tilt: hashNoise(v, 777, 23) * Math.PI,
  }
}

export type LayerKind = "hemacias" | "fibrina" | "detritos"

export function layerBuf(w: number, h: number, kind: LayerKind, seed: number): Buf {
  const b = makeBuf(w, h)
  const wrap = (draw: (x: number) => void, x: number): void => {
    draw(x - w)
    draw(x)
    draw(x + w)
  }

  if (kind === "hemacias") {
    /*
     * Discos bicôncavos: a profundidade do vaso.
     *
     * A primeira versão usava raio de 20 a 54 numa arena de 360 de altura — um
     * disco ocupava um terço da tela e o fundo ficava mais alto que o jogo. Fundo
     * distante precisa ser pequeno, escuro e de baixo contraste; se ele disputa
     * atenção com o patógeno, ele não é fundo. Rampa sem o tom mais claro e
     * dither mais agressivo pela mesma razão.
     */
    for (let i = 0; i < 20; i++) {
      const cy = hashNoise(i, seed, 2) * h
      const r = 9 + hashNoise(i, seed, 3) * 16
      const squash = 0.55 + hashNoise(i, seed, 5) * 0.35
      const oval = (rr: number) => (th: number): number => {
        const s = Math.sin(th)
        return rr / Math.sqrt(1 + (1 / (squash * squash) - 1) * s * s)
      }
      wrap((cx) => {
        body(b, cx, cy, r, RAMP_HEM, oval(r))
        // centro escuro do disco bicôncavo
        body(b, cx, cy, r * 0.42, [PLASMA1, PLASMA2], oval(r * 0.42))
      }, hashNoise(i, seed, 1) * w)
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (b.d[y * w + x] !== 0 && bayer(x, y) > 0.45) b.d[y * w + x] = 0
      }
    }
  } else if (kind === "fibrina") {
    // Malha de fibras: dá direção. É a camada que faz o deslocamento ser legível.
    for (let i = 0; i < 20; i++) {
      const y0 = hashNoise(i, seed, 7) * h
      const amp = 10 + hashNoise(i, seed, 8) * 40
      const idx = hashNoise(i, seed, 9) > 0.55 ? FIB1 : FIB0
      wrap(() => {
        let px = -w
        let py = y0
        for (let k = 1; k <= 40; k++) {
          const qx = -w + (k / 40) * w * 3
          const qy = y0 + Math.sin((k / 40) * Math.PI * 6 + i) * amp
          line(b, px, py, qx, qy, idx, 1)
          px = qx
          py = qy
        }
      }, 0)
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (b.d[y * w + x] !== 0 && bayer(x, y) > 0.5) b.d[y * w + x] = 0
      }
    }
  } else {
    // Plaquetas e detritos: partícula pequena e NÍTIDA, que corre rápido. É o
    // único plano de fundo sem dither, e é por isso que ele lê como "na frente".
    for (let i = 0; i < 150; i++) {
      const y = hashNoise(i, seed, 12) * h
      const big = hashNoise(i, seed, 13) > 0.78
      const idx = big ? HEM2 : FIB1
      wrap((x) => {
        plot(b, x, y, idx)
        if (big) {
          plot(b, x + 1, y, idx)
          plot(b, x, y + 1, idx)
          plot(b, x + 1, y + 1, idx)
        }
      }, hashNoise(i, seed, 11) * w)
    }
  }

  return b
}

/**
 * O CÉREBRO: as camadas de fundo do hub. 13/08.
 *
 * O H pediu a mesma riqueza do parallax da arena, e a arena tem três camadas
 * com papéis distintos — profundidade, direção e nitidez. Aqui são as mesmas
 * três funções com outro corpo, porque o que dá riqueza não é a quantidade de
 * coisa desenhada, é cada camada resolver um problema diferente.
 *
 * A PALETA é a travada, sem cor nova: o cérebro usa a rampa do leucócito e a do
 * núcleo, que são frias e pálidas, contra o mesmo `INK`. Isso não é economia —
 * é o que faz o hub LER como outro lugar sem inventar tinta. A arena é vermelha
 * e quente; o cérebro sai azul e parado, e a diferença aparece antes de qualquer
 * texto ser lido.
 */
export type BrainLayerKind = "chao" | "corpos" | "axonios" | "faiscas"

export function brainLayerBuf(w: number, h: number, kind: BrainLayerKind, seed: number): Buf {
  const b = makeBuf(w, h)
  const wrap = (draw: (x: number) => void, x: number): void => {
    draw(x - w)
    draw(x)
    draw(x + w)
  }

  if (kind === "chao") {
    /*
     * O CHÃO cinza do cérebro, pedido do H em 13/08 ("fundo mais acinzentado
     * escuro"). Até aqui o hub não tinha chão nenhum: era o `INK` do canvas.
     *
     * Não é uma cor chapada. Chapado num jogo de pixel art lê como buraco, e o
     * fundo da arena já ensinou o olho a esperar textura — o plasma tem quatro
     * tons ciclando. Aqui são manchas largas e sobrepostas de `RAMP_GREY`, com
     * dither, que é a mesma técnica do plasma com outra temperatura.
     *
     * Sem `wrap`: este é o único plano que NÃO desliza. Ele é o chão, e chão que
     * escorre transforma a safezone em esteira.
     */
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) plot(b, x, y, GREY0)
    }
    for (let i = 0; i < 34; i++) {
      const cx = hashNoise(i, seed, 61) * w
      const cy = hashNoise(i, seed, 63) * h
      const r = 40 + hashNoise(i, seed, 67) * 90
      const tom = hashNoise(i, seed, 71) > 0.55 ? GREY1 : GREY2
      for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy > r * r) continue
          // Dither por distância: a mancha desbota da borda para dentro, então
          // duas manchas vizinhas se fundem em vez de virar um recorte.
          const t = 1 - Math.sqrt(dx * dx + dy * dy) / r
          if (bayer(x, y) < t * 0.5) plot(b, x, y, tom)
        }
      }
    }
  } else if (kind === "corpos") {
    /*
     * Somas distantes: a PROFUNDIDADE, equivalente aos discos de hemácia.
     *
     * Pequenos, escuros e de baixo contraste pela mesma razão de lá — fundo que
     * disputa atenção não é fundo. O dither agressivo no fim é o que os empurra
     * para trás; sem ele a camada lê como se estivesse no mesmo plano dos
     * neurônios vivos da multidão.
     */
    for (let i = 0; i < 16; i++) {
      const cy = hashNoise(i, seed, 2) * h
      const r = 7 + hashNoise(i, seed, 3) * 13
      wrap((cx) => {
        body(b, cx, cy, r, RAMP_NUC, () => r)
        // Dendritos curtos saindo do soma: é o que faz a mancha virar neurônio.
        for (let k = 0; k < 5; k++) {
          const a = hashNoise(i * 7 + k, seed, 4) * Math.PI * 2
          const reach = r * (1.3 + hashNoise(i * 7 + k, seed, 6) * 0.9)
          line(b, cx, cy, cx + Math.cos(a) * reach, cy + Math.sin(a) * reach, NUC0, 1)
        }
      }, hashNoise(i, seed, 1) * w)
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (b.d[y * w + x] !== 0 && bayer(x, y) > 0.42) b.d[y * w + x] = 0
      }
    }
  } else if (kind === "axonios") {
    /*
     * Feixes de axônio: a DIREÇÃO, equivalente à fibrina.
     *
     * Mais retos e mais longos que a fibrina de propósito. Fibra de sangue
     * ondula porque flutua; axônio corre em feixe porque liga dois pontos, e a
     * diferença de curvatura é o que diz ao olho que este não é o mesmo lugar.
     */
    for (let i = 0; i < 16; i++) {
      const y0 = hashNoise(i, seed, 7) * h
      const amp = 4 + hashNoise(i, seed, 8) * 16
      const idx = hashNoise(i, seed, 9) > 0.5 ? LEU1 : NUC1
      wrap(() => {
        let px = -w
        let py = y0
        for (let k = 1; k <= 30; k++) {
          const qx = -w + (k / 30) * w * 3
          const qy = y0 + Math.sin((k / 30) * Math.PI * 2 + i) * amp
          line(b, px, py, qx, qy, idx, 1)
          px = qx
          py = qy
        }
      }, 0)
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (b.d[y * w + x] !== 0 && bayer(x, y) > 0.55) b.d[y * w + x] = 0
      }
    }
  } else {
    /*
     * Faíscas: a NITIDEZ, equivalente aos detritos.
     *
     * Único plano sem dither, e por isso o único que lê como "na frente". São
     * os potenciais de ação viajando — o que faz o cérebro parecer LIGADO em
     * vez de um desenho de cérebro.
     */
    for (let i = 0; i < 110; i++) {
      const y = hashNoise(i, seed, 12) * h
      const big = hashNoise(i, seed, 13) > 0.82
      const idx = big ? FAST1 : LEU2
      wrap((x) => {
        plot(b, x, y, idx)
        if (big) {
          plot(b, x + 1, y, idx)
          plot(b, x, y + 1, idx)
        }
      }, hashNoise(i, seed, 11) * w)
    }
  }

  return b
}

/**
 * A MULTIDÃO DE NEURÔNIOS: o mesmo esquema das hemácias, pedido do H.
 *
 * Reusa `crowdLayout` de propósito, e isso não é preguiça: a multidão da arena
 * já resolveu o problema difícil — distribuir corpos sem grade visível, dar a
 * cada um raio e variante próprios, e deixar o empurrão acontecer no lugar
 * certo. Trocar só a FORMA mantém tudo isso e garante que as duas telas se
 * movam com o mesmo caráter.
 *
 * O que muda é o raio: neurônio é maior e mais esparso que hemácia, porque o
 * que precisa caber entre eles são as SINAPSES. Multidão apertada não tem onde
 * desenhar ligação.
 */
export function neuronShape(v: number): { r: number; dendritos: number; tilt: number } {
  return {
    r: 7 + hashNoise(v, 909, 17) * 4.5,
    dendritos: 4 + Math.floor(hashNoise(v, 909, 19) * 3),
    tilt: hashNoise(v, 909, 23) * Math.PI,
  }
}

/**
 * Onde fica a PONTA do dendrito `k` — ângulo e alcance a partir do centro.
 *
 * Mora aqui, e não dentro de `neuronSheet`, porque desde 13/08 duas coisas
 * precisam da mesma resposta: o SPRITE, que desenha o braço, e o RENDER, que
 * ancora a sinapse na ponta dele a pedido do H. Sprite assado não devolve
 * coordenada, então o render teria que recalcular — e "recalcular" aqui seria
 * recopiar duas linhas de trigonometria que ninguém iria manter em par.
 *
 * A tela cheia de rodadas passadas já pagou por essa classe de defeito: quando
 * a regra de atravessar tela existia em seis cópias, mudá-la deixou duas para
 * trás e as duas viraram teste verde medindo nada. Uma cópia é uma a mais.
 *
 * A RESPIRAÇÃO (±0,06 rad) não entra: ela é do quadro, não da geometria. O
 * sprite a soma ao ângulo; o render a ignora de propósito, porque no alcance
 * típico ela vale ~1px e mexer nas pontas por quadro faria a rede inteira tremer
 * para devolver a mesma imagem.
 */
export function neuronDendrito(
  r: number,
  dendritos: number,
  tilt: number,
  seed: number,
  k: number,
): { a: number; reach: number } {
  return {
    a: tilt + (k / dendritos) * Math.PI * 2,
    reach: r * (1.5 + hashNoise(k, seed, 31) * 0.9),
  }
}
