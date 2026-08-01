import { FIB0, FIB1, HEM2, PLASMA0, PLASMA1, PLASMA2, PLASMA3, RAMP_HEM } from "./palette.ts"
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
      const t = 0.5 + flow * 0.42
      plot(b, x, y, shadeAt(RAMP_PLASMA, t, x, y))
    }
  }
  return b
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
