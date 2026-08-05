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

/**
 * NECROSE — o tecido que morreu de vez.
 *
 * Entrou em 05/08 e é a resposta a uma medição, não a uma intuição. O bot
 * mostrou que o campo tinha DOIS atratores e que a seed escolhia qual: com a
 * mesma política, a seed 7 fechava três fases a 3% de infecção e a seed 99
 * morria a 100%. Nenhuma força puxava de um para o outro, então a curva de
 * tensão era duas retas, não uma curva.
 *
 * A necrose é o RATCHET que faltava. Três regras, e nenhuma delas é número
 * novo solto:
 *
 * 1. **Tile no talo cicatriza.** Fica em `maxInfection` tempo demais e vira
 *    necrose, na mesma taxa com que a doença toma o vizinho (`spreadAmount`
 *    por `spreadSeconds`). A doença cicatriza o que já tomou no mesmo ritmo em
 *    que avança — não é analogia, é a mesma constante.
 * 2. **Necrose é PISO da infecção, e fagocitose não encosta nela.** Abater
 *    limpa infecção viva; cicatriz não. É isto que dá à presença um trabalho
 *    que a velocidade não faz — o dilema que o projeto vinha desenhando desde
 *    01/08 e que a medição de 05/08 mostrou que não existia no jogo.
 * 3. **Tecido morto não pare.** Só infecção VIVA (`field - necrose`) cria
 *    patógeno. Sem isto a cicatriz vira criadouro eterno e o ratchet vira
 *    espiral da morte; com isto, deixar uma região cicatrizar é uma forma
 *    legítima de parar a reprodução — pagando o chão para sempre. É triagem, e
 *    é a decisão recorrente que o formato pedia.
 */

/** Quanto de infecção do tile é VIVA — a única que produz patógeno. */
export function liveInfection(field: Uint8Array, necrose: Uint8Array, index: number): number {
  const v = field[index]! - necrose[index]!
  return v < 0 ? 0 : v
}

/**
 * Um passo de cicatrização. Só morde tile no talo; o resto não cicatriza.
 *
 * `max` é o teto do tile. A necrose nunca passa dele, senão o piso subiria
 * acima do próprio valor que ele limita.
 */
export function necroseStep(
  field: Uint8Array,
  necrose: Uint8Array,
  amount: number,
  max: number,
): void {
  if (amount <= 0) return
  for (let i = 0; i < field.length; i++) {
    if (field[i]! < max) continue
    const v = necrose[i]! + amount
    necrose[i] = v > max ? max : v
  }
}

/**
 * O PISO. Chamado depois de tudo que cura, e é o que torna a cicatriz cicatriz.
 *
 * Fica numa função só, e é chamado num lugar só, porque espalhar `Math.max`
 * pelos quatro pontos que curam é como um deles seria esquecido.
 */
export function applyNecroseFloor(field: Uint8Array, necrose: Uint8Array): void {
  for (let i = 0; i < field.length; i++) {
    if (field[i]! < necrose[i]!) field[i] = necrose[i]!
  }
}

/**
 * Cura de necrose em volta de um ponto — a mesma geometria de `healAround`.
 *
 * Reaproveita a forma de propósito: a cicatriz cede ao MESMO gesto que a
 * infecção, só que mais devagar. Duas geometrias diferentes fariam o jogador
 * ter que aprender duas coisas para uma decisão só.
 */
export function healNecroseAround(
  necrose: Uint8Array,
  spec: FieldSpec,
  x: number,
  y: number,
  radius: number,
  amount: number,
): number {
  if (amount <= 0) return 0
  const cx = Math.floor(x / spec.tileW)
  const cy = Math.floor(y / spec.tileH)
  let curado = 0
  for (let ty = cy - radius; ty <= cy + radius; ty++) {
    if (ty < 0 || ty >= spec.rows) continue
    for (let tx = cx - radius; tx <= cx + radius; tx++) {
      if (tx < 0 || tx >= spec.cols) continue
      const dist = Math.abs(tx - cx) + Math.abs(ty - cy)
      if (dist > radius) continue
      const dose =
        dist === 0 ? amount : Math.floor((amount * (radius - dist + 1)) / (radius + 1))
      if (dose <= 0) continue
      const i = ty * spec.cols + tx
      const before = necrose[i]!
      const after = before - dose
      necrose[i] = after < 0 ? 0 : after
      curado += before - necrose[i]!
    }
  }
  return curado
}

/** Quanto do campo já é cicatriz. Serve ao HUD e às métricas do bot. */
export function totalNecrose(necrose: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < necrose.length; i++) sum += necrose[i]!
  return sum
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
/**
 * A FRONTEIRA da colônia mais próxima: o tile já infectado que ainda não
 * saturou. É para onde a bactéria vai.
 *
 * Diferente de propósito do `healthiestTile`, que é o alvo da Salmonella. Os
 * dois são "não caça o jogador", mas dizem coisas opostas: a Salmonella SALTA
 * para o tecido mais são e abre frente nova (pressão posicional, defender em
 * vez de caçar); a E. coli ENGROSSA o que já tomou, trabalhando a borda até
 * saturar. Se as duas usassem o mesmo alvo, seriam reskin — que é a queixa que
 * abriu este desenho (01/08).
 *
 * Sem fronteira nenhuma (campo limpo, ou tudo no talo), devolve -1 e quem
 * chamou decide o que fazer.
 */
export function frontierTile(
  field: Uint8Array,
  spec: FieldSpec,
  x: number,
  y: number,
  max: number,
): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < field.length; i++) {
    const v = field[i]!
    if (v === 0 || v >= max) continue
    const dx = tileCenterX(spec, i) - x
    const dy = tileCenterY(spec, i) - y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

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
