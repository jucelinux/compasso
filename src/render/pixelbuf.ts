/**
 * Buffer de pixel indexado.
 *
 * Tudo é desenhado aqui, em ÍNDICE de paleta — nunca em RGB. Só na conversão
 * final (`toRGBA`) a cor aparece. Duas consequências, e as duas são o motivo do
 * arquivo existir:
 *
 * 1. O travamento de paleta deixa de ser disciplina e vira estrutura. Não existe
 *    caminho de código que produza uma cor fora da lista.
 * 2. Nada aqui toca DOM, então o pipeline de arte roda sob `vitest` em Node. A
 *    arte fica testável do mesmo jeito que a sim é.
 *
 * Sem alpha parcial, sem antialias, sem `ctx.fill()`. Degradê é dither ordenado.
 */

export interface Buf {
  readonly w: number
  readonly h: number
  /** Um índice de paleta por pixel. 0 = transparente. */
  readonly d: Uint8Array
}

export function makeBuf(w: number, h: number): Buf {
  return { w, h, d: new Uint8Array(w * h) }
}

/**
 * Bayer 4x4. É a matriz que troca "meio tom" por padrão de xadrez — o que faz
 * uma esfera ter volume com quatro cores em vez de trinta.
 */
const BAYER4: ReadonlyArray<number> = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export function bayer(x: number, y: number): number {
  return BAYER4[(y & 3) * 4 + (x & 3)]! / 16
}

export function plot(b: Buf, x: number, y: number, idx: number): void {
  const xi = x | 0
  const yi = y | 0
  if (xi < 0 || yi < 0 || xi >= b.w || yi >= b.h) return
  b.d[yi * b.w + xi] = idx
}

export function at(b: Buf, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0
  return b.d[y * b.w + x]!
}

/** Ruído determinístico. Mesma semente, mesma arte, sempre. */
export function hashNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Escolhe o tom da rampa para uma luminância contínua, ditherizando a fronteira
 * entre os dois tons vizinhos. É AQUI que o degradê morre e o pixel art nasce.
 */
export function shadeAt(ramp: ReadonlyArray<number>, t: number, x: number, y: number): number {
  const f = Math.max(0, Math.min(1, t)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 1, Math.floor(f))
  const frac = f - i
  const up = bayer(x, y) < frac && i + 1 < ramp.length ? 1 : 0
  return ramp[i + up]!
}

/** Luz padrão: alto e à esquerda. Uma só, para todos os corpos, senão some a unidade. */
const LX = -0.5
const LY = -0.6
const LZ = 0.62

/**
 * Lambert → posição na rampa.
 *
 * A primeira versão era `0.22 + 0.78 * max(0, lam)`, e tinha dois defeitos que
 * só apareceram na captura: com `LZ` alto o ponto mais claro caía no CENTRO do
 * corpo em vez de na direção da luz, e o `max(0, …)` grampeava metade da esfera
 * no tom mais escuro. O resultado era uma mancha clara chapada com um borrão
 * escuro embaixo. Aqui a faixa inteira de −1 a 1 vira gradiente, então o brilho
 * fica em cima e à esquerda e o terminador corre na diagonal, como esfera.
 */
function lambertT(lam: number): number {
  return 0.15 + 0.85 * (0.5 + 0.5 * lam)
}

/**
 * Corpo iluminado como hemisfério. `radiusAt` devolve o raio para cada ângulo,
 * o que permite blob, cápsula e bola espinhosa saírem da mesma função.
 *
 * `tint` é opcional e recebe (ângulo, distância normalizada) para trocar a rampa
 * em parte do corpo — é como a frente do leucócito fica ciano na velocidade.
 */
export function body(
  b: Buf,
  cx: number,
  cy: number,
  maxR: number,
  ramp: ReadonlyArray<number>,
  radiusAt: (theta: number) => number,
  tint?: (theta: number, d: number) => ReadonlyArray<number> | null,
): void {
  const x0 = Math.max(0, Math.floor(cx - maxR - 2))
  const x1 = Math.min(b.w - 1, Math.ceil(cx + maxR + 2))
  const y0 = Math.max(0, Math.floor(cy - maxR - 2))
  const y1 = Math.min(b.h - 1, Math.ceil(cy + maxR + 2))

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // amostra no centro do pixel: sem isso a silhueta sai torta em raio pequeno
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > maxR + 1) continue
      const th = Math.atan2(dy, dx)
      const r = radiusAt(th)
      if (dist > r) continue

      // normal do hemisfério: dá volume de verdade em vez de degradê radial
      const u = r > 0 ? dist / r : 0
      const nz = Math.sqrt(Math.max(0, 1 - u * u))
      const nx = r > 0 ? dx / r : 0
      const ny = r > 0 ? dy / r : 0
      const use = tint?.(th, u) ?? ramp
      const t = lambertT(nx * LX + ny * LY + nz * LZ)
      plot(b, x, y, shadeAt(use, t, x, y))
    }
  }
}

/** Disco chapado com borda dura. Para miolo, núcleo e bolha de cacho. */
export function disc(
  b: Buf,
  cx: number,
  cy: number,
  r: number,
  ramp: ReadonlyArray<number>,
): void {
  body(b, cx, cy, r, ramp, () => r)
}

/** Cápsula (bacilo) alinhada no eixo X. Rotação vem de quem chama, no ângulo. */
export function capsule(
  b: Buf,
  cx: number,
  cy: number,
  half: number,
  rad: number,
  angle: number,
  ramp: ReadonlyArray<number>,
): void {
  const ca = Math.cos(-angle)
  const sa = Math.sin(-angle)
  const maxR = half + rad + 1
  const x0 = Math.max(0, Math.floor(cx - maxR))
  const x1 = Math.min(b.w - 1, Math.ceil(cx + maxR))
  const y0 = Math.max(0, Math.floor(cy - maxR))
  const y1 = Math.min(b.h - 1, Math.ceil(cy + maxR))

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - cx
      const py = y + 0.5 - cy
      // para o espaço local da cápsula
      const lx = px * ca - py * sa
      const ly = px * sa + py * ca
      const qx = Math.max(-half, Math.min(half, lx))
      const ddx = lx - qx
      const dist = Math.sqrt(ddx * ddx + ly * ly)
      if (dist > rad) continue

      const u = dist / rad
      const nz = Math.sqrt(Math.max(0, 1 - u * u))
      // a normal da cápsula é perpendicular ao eixo, não radial ao centro
      const nlx = ddx / rad
      const nly = ly / rad
      const nx = nlx * ca + nly * sa
      const ny = -nlx * sa + nly * ca
      plot(b, x, y, shadeAt(ramp, lambertT(nx * LX + ny * LY + nz * LZ), x, y))
    }
  }
}

/** Linha de pixel (Bresenham). Flagelo, espícula, septo. */
export function line(
  b: Buf,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  idx: number,
  thick = 1,
): void {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const xe = Math.round(x1)
  const ye = Math.round(y1)
  const dx = Math.abs(xe - x)
  const dy = -Math.abs(ye - y)
  const sx = x < xe ? 1 : -1
  const sy = y < ye ? 1 : -1
  let err = dx + dy
  const h = (thick - 1) >> 1
  for (;;) {
    for (let oy = -h; oy <= thick - 1 - h; oy++) {
      for (let ox = -h; ox <= thick - 1 - h; ox++) plot(b, x + ox, y + oy, idx)
    }
    if (x === xe && y === ye) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/**
 * Contorno de 1px em volta de tudo que não é transparente.
 *
 * É a regra mais importante do pixel art de sprite e a que mais separa "leitura
 * imediata" de "borrão colorido": em cima de um fundo escuro e cheio de coisa, o
 * corpo só se destaca se tiver uma borda própria.
 */
export function outline(b: Buf, idx: number): void {
  const src = b.d.slice()
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (src[y * b.w + x]! !== 0) continue
      const n =
        (x > 0 ? src[y * b.w + x - 1]! : 0) ||
        (x < b.w - 1 ? src[y * b.w + x + 1]! : 0) ||
        (y > 0 ? src[(y - 1) * b.w + x]! : 0) ||
        (y < b.h - 1 ? src[(y + 1) * b.w + x]! : 0)
      if (n !== 0) b.d[y * b.w + x] = idx
    }
  }
}

/**
 * Granulação: empurra alguns pixels um tom acima ou abaixo na própria rampa.
 * Só age onde já há corpo, então nunca vaza para fora da silhueta.
 */
export function speckle(
  b: Buf,
  ramp: ReadonlyArray<number>,
  seed: number,
  density: number,
): void {
  const pos = new Map<number, number>()
  ramp.forEach((idx, i) => pos.set(idx, i))
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const cur = b.d[y * b.w + x]!
      const i = pos.get(cur)
      if (i === undefined) continue
      const n = hashNoise(x, y, seed)
      if (n > density) continue
      const dir = n < density / 2 ? -1 : 1
      const j = Math.max(0, Math.min(ramp.length - 1, i + dir))
      b.d[y * b.w + x] = ramp[j]!
    }
  }
}

/** Recorta o buffer com um dither: `keep` = fração mantida. Usado em fantasmas e rastro. */
export function ditherMask(b: Buf, keep: number): void {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (bayer(x, y) >= keep) b.d[y * b.w + x] = 0
    }
  }
}

/** Anel de pixel com espessura, em dither. Choque, limiar, aura. */
export function ring(
  b: Buf,
  cx: number,
  cy: number,
  r: number,
  thick: number,
  idx: number,
  keep = 1,
): void {
  const rin = r - thick
  const x0 = Math.max(0, Math.floor(cx - r - 1))
  const x1 = Math.min(b.w - 1, Math.ceil(cx + r + 1))
  const y0 = Math.max(0, Math.floor(cy - r - 1))
  const y1 = Math.min(b.h - 1, Math.ceil(cy + r + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > r || d < rin) continue
      if (keep < 1 && bayer(x, y) >= keep) continue
      b.d[y * b.w + x] = idx
    }
  }
}

/** Copia `src` em cima de `dst`, respeitando transparência. */
export function blit(dst: Buf, src: Buf, ox: number, oy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const v = src.d[y * src.w + x]!
      if (v !== 0) plot(dst, ox + x, oy + y, v)
    }
  }
}

/** Quantos pixels o buffer pinta. */
export function painted(b: Buf): number {
  let n = 0
  for (const v of b.d) if (v !== 0) n++
  return n
}

/**
 * Quantos pixels diferem entre dois buffers do mesmo tamanho.
 *
 * Existe para a trava de cópia de quadro medir DISTÂNCIA em vez de igualdade.
 * A régua "não ser idêntico" passa com um pixel de diferença, e um pixel de
 * diferença é o que um ciclo de N fases que na tela tem N/2 produz.
 */
export function diffCount(a: Buf, b: Buf): number {
  if (a.w !== b.w || a.h !== b.h) return Math.max(a.d.length, b.d.length)
  let n = 0
  for (let i = 0; i < a.d.length; i++) if (a.d[i] !== b.d[i]) n++
  return n
}

/**
 * Índices → RGBA. Único ponto onde cor aparece.
 *
 * Separar isto do desenho é o que permite ciclagem de paleta de graça: o mesmo
 * buffer, convertido com tabelas diferentes, vira quadros diferentes sem
 * reavaliar uma única forma.
 */
export function toRGBA(b: Buf, palette: ReadonlyArray<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(b.w * b.h * 4)
  for (let i = 0; i < b.d.length; i++) {
    const idx = b.d[i]!
    if (idx === 0) continue
    const c = palette[idx]
    if (c === undefined) throw new Error(`índice ${idx} fora da paleta`)
    const o = i * 4
    out[o] = (c >> 16) & 0xff
    out[o + 1] = (c >> 8) & 0xff
    out[o + 2] = c & 0xff
    out[o + 3] = 255
  }
  return out
}
