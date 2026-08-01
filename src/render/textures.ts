import { Texture } from "pixi.js"

/**
 * Textura procedural.
 *
 * A restrição "só primitivas geométricas" foi reaberta pelo humano em 31/07: ele
 * queria detalhe orgânico que polígono chapado não alcança. Como eu não desenho,
 * a saída é gerar a textura em código — membrana, núcleo, granulação, capsídeo —
 * num canvas offscreen no boot. Sem pipeline de asset, sem arquivo binário no
 * repo, e tudo continua sendo número que dá pra mexer.
 *
 * Se um dia entrar arte desenhada à mão, é aqui que ela substitui — a interface
 * é a mesma: um `Texture` por tipo.
 */

/** Ruído determinístico. Nada aqui é sim, mas repetível deixa a arte estável. */
function hashNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function ctx(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext("2d")
  if (c === null) throw new Error("canvas 2d indisponível")
  return c
}

const rgba = (r: number, g: number, b: number, a: number): string => `rgba(${r},${g},${b},${a})`

function shade(hex: number, f: number): [number, number, number] {
  return [
    Math.min(255, Math.round(((hex >> 16) & 0xff) * f)),
    Math.min(255, Math.round(((hex >> 8) & 0xff) * f)),
    Math.min(255, Math.round((hex & 0xff) * f)),
  ]
}

/** Granulação: o que separa "polígono chapado" de "corpo". */
function grain(c: CanvasRenderingContext2D, size: number, seed: number, strength: number): void {
  const img = c.getImageData(0, 0, size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (d[i + 3]! === 0) continue
      const n = (hashNoise(x, y, seed) - 0.5) * strength
      d[i] = Math.max(0, Math.min(255, d[i]! + n * 255))
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n * 255))
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n * 255))
    }
  }
  c.putImageData(img, 0, 0)
}

/**
 * Vírus: capsídeo com espinhos, núcleo interno e casca iluminada de cima.
 * O número de pontas continua sendo a leitura de ameaça — a textura só dá corpo.
 */
export function virusTexture(color: number, spikes: number, px: number, seed: number): Texture {
  const size = Math.max(32, Math.ceil(px * 2))
  const c = ctx(size)
  const cx = size / 2
  const cy = size / 2
  const outer = size * 0.46
  const inner = outer * 0.56

  const [r, g, b] = shade(color, 1)
  const [dr, dg, db] = shade(color, 0.42)

  // corpo espinhoso
  c.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const rad = i % 2 === 0 ? outer : inner
    const px2 = cx + Math.cos(a) * rad
    const py2 = cy + Math.sin(a) * rad
    if (i === 0) c.moveTo(px2, py2)
    else c.lineTo(px2, py2)
  }
  c.closePath()

  const grad = c.createRadialGradient(cx - outer * 0.3, cy - outer * 0.35, outer * 0.1, cx, cy, outer)
  grad.addColorStop(0, rgba(Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60), 1))
  grad.addColorStop(0.55, rgba(r, g, b, 1))
  grad.addColorStop(1, rgba(dr, dg, db, 1))
  c.fillStyle = grad
  c.fill()

  // membrana
  c.lineWidth = Math.max(1, size * 0.02)
  c.strokeStyle = rgba(255, 255, 255, 0.32)
  c.stroke()

  // núcleo: um miolo mais escuro, deslocado, que dá profundidade
  c.beginPath()
  c.arc(cx + outer * 0.06, cy + outer * 0.08, inner * 0.5, 0, Math.PI * 2)
  c.fillStyle = rgba(dr, dg, db, 0.85)
  c.fill()

  // vacúolos
  for (let i = 0; i < 5; i++) {
    const a = hashNoise(i, seed, 7) * Math.PI * 2
    const d = inner * (0.2 + hashNoise(i, seed, 13) * 0.5)
    c.beginPath()
    c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.02 + hashNoise(i, seed, 5) * 0.03), 0, Math.PI * 2)
    c.fillStyle = rgba(255, 255, 255, 0.12)
    c.fill()
  }

  grain(c, size, seed, 0.12)
  return Texture.from(c.canvas)
}

/** Leucócito: membrana translúcida, citoplasma granulado, núcleo lobado. */
export function playerTexture(px: number, body: number, nucleus: number): Texture {
  const size = Math.max(48, Math.ceil(px * 3))
  const c = ctx(size)
  const cx = size / 2
  const cy = size / 2
  const rad = size * 0.32

  const [r, g, b] = shade(body, 1)

  // halo de membrana
  const halo = c.createRadialGradient(cx, cy, rad * 0.7, cx, cy, rad * 1.45)
  halo.addColorStop(0, rgba(r, g, b, 0.35))
  halo.addColorStop(1, rgba(r, g, b, 0))
  c.fillStyle = halo
  c.beginPath()
  c.arc(cx, cy, rad * 1.45, 0, Math.PI * 2)
  c.fill()

  // corpo
  const grad = c.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.1, cx, cy, rad)
  grad.addColorStop(0, rgba(255, 255, 255, 1))
  grad.addColorStop(0.6, rgba(r, g, b, 1))
  grad.addColorStop(1, rgba(...shade(body, 0.72), 1))
  c.beginPath()
  c.arc(cx, cy, rad, 0, Math.PI * 2)
  c.fillStyle = grad
  c.fill()

  // núcleo lobado: três bolhas sobrepostas, que é o formato real do neutrófilo
  const [nr, ng, nb] = shade(nucleus, 1)
  c.fillStyle = rgba(nr, ng, nb, 0.9)
  for (const [ox, oy, s] of [
    [-0.22, -0.1, 0.3],
    [0.2, -0.16, 0.26],
    [0.02, 0.22, 0.28],
  ] as const) {
    c.beginPath()
    c.arc(cx + rad * ox, cy + rad * oy, rad * s, 0, Math.PI * 2)
    c.fill()
  }

  grain(c, size, 3, 0.1)
  return Texture.from(c.canvas)
}

/** Célula do organismo: bolha translúcida com membrana dupla. */
export function organCellTexture(px: number, color: number): Texture {
  const size = Math.max(48, Math.ceil(px * 2.4))
  const c = ctx(size)
  const cx = size / 2
  const cy = size / 2
  const rad = size * 0.38
  const [r, g, b] = shade(color, 1)

  const grad = c.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad)
  grad.addColorStop(0, rgba(255, 255, 255, 0.5))
  grad.addColorStop(0.5, rgba(r, g, b, 0.42))
  grad.addColorStop(1, rgba(r, g, b, 0.1))
  c.beginPath()
  c.arc(cx, cy, rad, 0, Math.PI * 2)
  c.fillStyle = grad
  c.fill()

  c.lineWidth = Math.max(1.5, size * 0.03)
  c.strokeStyle = rgba(r, g, b, 0.9)
  c.stroke()
  c.beginPath()
  c.arc(cx, cy, rad * 0.82, 0, Math.PI * 2)
  c.lineWidth = Math.max(1, size * 0.012)
  c.strokeStyle = rgba(255, 255, 255, 0.28)
  c.stroke()

  grain(c, size, 11, 0.08)
  return Texture.from(c.canvas)
}

/** Plasma: fundo com veios e hemácias fora de foco. Dá referência de movimento. */
export function plasmaTexture(w: number, h: number, base: number, dark: number): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const c = canvas.getContext("2d")
  if (c === null) throw new Error("canvas 2d indisponível")

  const [br, bg, bb] = shade(base, 1)
  const [dr, dg, db] = shade(dark, 1)
  const grad = c.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, rgba(br, bg, bb, 1))
  grad.addColorStop(1, rgba(dr, dg, db, 1))
  c.fillStyle = grad
  c.fillRect(0, 0, w, h)

  // hemácias desfocadas: discos com centro escuro
  for (let i = 0; i < 46; i++) {
    const x = hashNoise(i, 1, 21) * w
    const y = hashNoise(i, 2, 33) * h
    const rad = 7 + hashNoise(i, 3, 44) * 13
    const g2 = c.createRadialGradient(x, y, rad * 0.15, x, y, rad)
    g2.addColorStop(0, rgba(dr, dg, db, 0.55))
    g2.addColorStop(0.7, rgba(Math.min(255, br + 26), bg, bb, 0.3))
    g2.addColorStop(1, rgba(br, bg, bb, 0))
    c.fillStyle = g2
    c.beginPath()
    c.arc(x, y, rad, 0, Math.PI * 2)
    c.fill()
  }

  // veios
  c.strokeStyle = rgba(Math.min(255, br + 22), bg, bb, 0.22)
  for (let i = 0; i < 7; i++) {
    c.beginPath()
    c.lineWidth = 1 + hashNoise(i, 9, 3) * 2.5
    let x = 0
    let y = hashNoise(i, 4, 55) * h
    c.moveTo(x, y)
    while (x < w) {
      x += 24
      y += (hashNoise(i, x, 66) - 0.5) * 34
      c.lineTo(x, y)
    }
    c.stroke()
  }

  return Texture.from(canvas)
}
