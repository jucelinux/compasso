/**
 * O tecido.
 *
 * A arena era um VAZIO: patógenos atravessando o nada, nada persistindo, nada
 * podendo ser retomado. Era por isso que uma célula só parecia fina — não porque
 * ela é uma, mas porque não havia nada a fazer além de encostar.
 *
 * Aqui o campo tem estado. Cada tile é tecido com um nível de infecção, e o
 * objetivo da fase deixa de ser "mate N" e vira **conter e retomar**.
 *
 * As duas regras que fazem isso ser um jogo, e não um faxina:
 *
 * 1. **A infecção se alastra em tempo de MUNDO.** Correr até o canto oposto para
 *    apagar um foco acende três atrás de você. Não existe velocidade ótima —
 *    existe ritmo.
 * 2. **A cura é em tempo REAL e cai com a velocidade.** Parada, você limpa fundo
 *    e não cobre chão; a toda, você cobre chão e quase não limpa. O gesto de
 *    caçar e o gesto de curar exigem velocidades opostas, e é essa briga que é o
 *    jogo.
 *
 * Tudo aqui é inteiro e sem transcendental — o campo entra no hash.
 */

export interface FieldSpec {
  readonly cols: number
  readonly rows: number
  readonly tileW: number
  readonly tileH: number
}

export function fieldSpec(width: number, height: number, cols: number, rows: number): FieldSpec {
  return { cols, rows, tileW: width / cols, tileH: height / rows }
}

export function makeField(spec: FieldSpec): Uint8Array {
  return new Uint8Array(spec.cols * spec.rows)
}

/** Índice do tile que contém o ponto. Fora da arena, grampeia na borda. */
export function tileAt(spec: FieldSpec, x: number, y: number): number {
  const cx = Math.max(0, Math.min(spec.cols - 1, Math.floor(x / spec.tileW)))
  const cy = Math.max(0, Math.min(spec.rows - 1, Math.floor(y / spec.tileH)))
  return cy * spec.cols + cx
}

/**
 * Quão CHEIO de tecido está o ponto, de 0 (tomado pela doença) a 1 (são).
 *
 * É a base do atrito do tecido, decidido em 02/08: tile sadio é tile lotado de
 * hemácia, tile infectado é tile vazio, e atravessar coisa custa. Não existem
 * corpos individuais na sim de propósito — o campo já É o modelo de "quanto tem
 * aqui", e 80 colisões por quadro não acrescentariam nada que se perceba.
 *
 * Bilinear, não o tile debaixo do pé: com 20px de tile, amostrar um só faria a
 * velocidade máxima pular em degraus na fronteira, e degrau em velocidade é
 * exatamente o que se sente como travada.
 */
export function crowdAt(
  spec: FieldSpec,
  field: Uint8Array,
  max: number,
  x: number,
  y: number,
): number {
  const fx = x / spec.tileW - 0.5
  const fy = y / spec.tileH - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const cl = (v: number, hi: number): number => (v < 0 ? 0 : v > hi ? hi : v)
  let sum = 0
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= 1; i++) {
      const cx = cl(x0 + i, spec.cols - 1)
      const cy = cl(y0 + j, spec.rows - 1)
      const w = (i === 0 ? 1 - tx : tx) * (j === 0 ? 1 - ty : ty)
      sum += w * (field[cy * spec.cols + cx]! / max)
    }
  }
  // `sum` é quanta DOENÇA há aqui; o que resiste é o que sobrou de tecido.
  return 1 - (sum < 0 ? 0 : sum > 1 ? 1 : sum)
}

export function tileCenterX(spec: FieldSpec, index: number): number {
  return (index % spec.cols) * spec.tileW + spec.tileW / 2
}

export function tileCenterY(spec: FieldSpec, index: number): number {
  return Math.floor(index / spec.cols) * spec.tileH + spec.tileH / 2
}

export function totalInfection(field: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < field.length; i++) sum += field[i]!
  return sum
}

/**
 * Um passo de alastramento.
 *
 * Os deltas vão para um rascunho e só depois são aplicados: se a infecção fosse
 * escrita durante a varredura, a ordem do array viraria regra de jogo e dois
 * motores poderiam divergir. Determinismo antes de elegância.
 */
export function spreadStep(
  field: Uint8Array,
  scratch: Int16Array,
  spec: FieldSpec,
  threshold: number,
  amount: number,
  max: number,
): void {
  scratch.fill(0)
  const { cols, rows } = spec
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (field[i]! < threshold) continue
      if (x > 0) scratch[i - 1] = scratch[i - 1]! + amount
      if (x < cols - 1) scratch[i + 1] = scratch[i + 1]! + amount
      if (y > 0) scratch[i - cols] = scratch[i - cols]! + amount
      if (y < rows - 1) scratch[i + cols] = scratch[i + cols]! + amount
    }
  }
  for (let i = 0; i < field.length; i++) {
    const v = field[i]! + scratch[i]!
    field[i] = v > max ? max : v
  }
}

/** Infecta um tile e só ele. Fonte é o patógeno; alastramento é o passo acima. */
export function infectAt(field: Uint8Array, index: number, amount: number, max: number): void {
  const v = field[index]! + amount
  field[index] = v > max ? max : v
}

/**
 * Cura em volta de um ponto. `amount` no centro, caindo pela distância de tile.
 * Devolve quanto foi efetivamente curado, para quem quiser pontuar isso.
 */
export function healAround(
  field: Uint8Array,
  spec: FieldSpec,
  x: number,
  y: number,
  radius: number,
  amount: number,
): number {
  if (amount <= 0) return 0
  const cx = Math.floor(x / spec.tileW)
  const cy = Math.floor(y / spec.tileH)
  let healed = 0
  for (let ty = cy - radius; ty <= cy + radius; ty++) {
    if (ty < 0 || ty >= spec.rows) continue
    for (let tx = cx - radius; tx <= cx + radius; tx++) {
      if (tx < 0 || tx >= spec.cols) continue
      const dist = Math.abs(tx - cx) + Math.abs(ty - cy)
      if (dist > radius) continue
      /*
       * Sem piso mínimo. Com `max(1, …)` uma dose de 1 curava os 13 tiles do
       * raio por igual, e a penalidade de velocidade virava decoração: correndo
       * curava 53% do que parada, quando o tuning pedia 28%. Cura fraca tem que
       * ser rasa E estreita.
       */
      const dose =
        dist === 0 ? amount : Math.floor((amount * (radius - dist + 1)) / (radius + 1))
      if (dose <= 0) continue
      const i = ty * spec.cols + tx
      const before = field[i]!
      const after = before - dose
      field[i] = after < 0 ? 0 : after
      healed += before - field[i]!
    }
  }
  return healed
}

/** O tile mais SADIO, que é para onde um patógeno que caça tecido quer ir. */
export function healthiestTile(field: Uint8Array, max: number): number {
  let best = 0
  let bestVal = max + 1
  for (let i = 0; i < field.length; i++) {
    const v = field[i]!
    if (v < bestVal) {
      bestVal = v
      best = i
      if (v === 0) break
    }
  }
  return best
}
