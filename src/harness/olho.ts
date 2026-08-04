import { loadTuning } from "./loadTuning.ts"
import { PALETTE, RAMP_GLD, FAST0, FAST1, SHI1 } from "../render/palette.ts"
import { painted, type Buf } from "../render/pixelbuf.ts"
import {
  auraBuf,
  bloodCell,
  CELL_LEVELS,
  colonyTile,
  dropSheet,
  macrophageSheet,
  organSheet,
  pathogenSheet,
  playerSheet,
  shockRings,
  TISSUE_LEVELS,
  TISSUE_VARIANTS,
  type Sheet,
} from "../render/sprites.ts"
import { CROWD_VARIANTS, crowdShape, layerBuf, plasmaBuf } from "../render/backdrop.ts"

/**
 * O OLHO — `npm run olho [nome] [escalão]`.
 *
 * Não é teste. Despeja a arte assada no terminal como blocos de luminância,
 * para pegar o que suite verde não pega: quem cobre quem, quem encosta em quem,
 * e a peça que saiu em branco.
 *
 * Por que ele existe, e por que não substitui a captura: `npm run shot` mostra a
 * CENA, mas só o pedaço dela que o bot consegue alcançar — é por isso que o
 * pulso da pontuação e os rótulos do build continuam sem verificação, o bot não
 * mata e não pega poder. Este aqui mostra QUALQUER folha assada, sem browser e
 * sem bot, em menos de um segundo. Os dois olham coisas diferentes e nenhum
 * dispensa o outro.
 *
 * Trazido do ateliê (`~/development/atelie`, `tests/eyeball.ts`, 03/08), onde
 * pegou olhos que sumiram por raio de 0,55 de pixel, um pescoço apontando para
 * baixo e um sol desenhado duas vezes na mesma tela — nenhum deles quebrava
 * teste nenhum.
 */

/*
 * A escada de leitura, e ela não é escolha estética.
 *
 * A primeira versão usava ' ' para o tom mais escuro e '·' para o buraco — que é
 * a convenção do ateliê. Aqui isso lê INVERTIDO: a tinta do contorno é quase
 * preta, então o contorno saía em branco e o buraco saía marcado. Vazio parecia
 * corpo. Agora buraco é branco de verdade, a escada começa em '.', e a barra
 * separa quadro de quadro — senão dois corpos vizinhos encostam e a folga na
 * moldura vira ilusão de ótica.
 */
const TONS = ".:-=+*#%@"
const SEPARADOR = " | "
const LARGURA_MAX = 180

const tuning = loadTuning()
const alvo = process.argv[2]
const escalao = Number(process.argv[3] ?? 0)

/** Luminância perceptual do índice, ou -1 para o buraco. */
function luz(idx: number): number {
  if (idx === 0) return -1
  const c = PALETTE[idx]
  if (c === undefined) return -1
  return (((c >> 16) & 0xff) * 0.299 + ((c >> 8) & 0xff) * 0.587 + (c & 0xff) * 0.114) / 255
}

/**
 * O tom de um bloco reduzido: MÉDIA sobre o bloco inteiro, com piso visível se
 * qualquer pixel dele estiver pintado. Devolve -1 só quando o bloco é todo
 * buraco.
 *
 * As três vias foram testadas olhando, e as duas primeiras mentem:
 *
 * · **por ponto** apaga camada esparsa. `detritos` são 150 partículas de 1 a 4
 *   pixels numa arena de 640x360 — 0,10% da tela, e de propósito (`backdrop.ts`
 *   §detritos: partícula pequena e NÍTIDA é o que faz ler como "na frente"). Ela
 *   saía em branco, e branco aqui quer dizer AUSENTE.
 * · **por máximo** salva a esparsa e destrói a densidade: a aura de interferon é
 *   dither a 14% num raio de 104, e saiu SÓLIDA — porque num bloco de 2x4 sempre
 *   existe um pixel aceso.
 *
 * A média com piso devolve as duas: o detrito vira o tom mais escuro em vez de
 * sumir, e o dither de 14% vira véu em vez de parede. Com passo 1 — que é o caso
 * de toda folha de sprite — o bloco é um pixel só e nada disto muda nada.
 */
function tomDoBloco(q: Buf, x0: number, y0: number, px: number, py: number): number {
  let soma = 0
  let total = 0
  let pintados = 0
  for (let y = y0; y < Math.min(y0 + py, q.h); y++) {
    for (let x = x0; x < Math.min(x0 + px, q.w); x++) {
      const l = luz(q.d[y * q.w + x] ?? 0)
      total++
      if (l >= 0) {
        soma += l
        pintados++
      }
    }
  }
  if (pintados === 0) return -1
  return total === 0 ? -1 : soma / total
}

interface Linha {
  rotulo: string
  quadros: ReadonlyArray<Buf>
}

interface Peca {
  nome: string
  linhas: ReadonlyArray<Linha>
  nota?: string
}

/**
 * O passo de amostragem.
 *
 * Caractere de terminal é ~2x mais alto que largo, então o passo em Y é o dobro
 * do passo em X — senão tudo sai achatado e "encosta na borda" vira ilusão de
 * ótica em vez de leitura.
 */
/**
 * O passo de amostragem, e ele só existe para o que NÃO cabe.
 *
 * A primeira versão reduzia sempre que a fila de quadros passasse da largura do
 * terminal, e isso quebrou o olho antes mesmo de ele ser usado: a folha do
 * jogador é 40x40, seis fases não cabiam, saía uma redução de 3:1, e as OITO
 * DIREÇÕES apareciam idênticas. A redução escondia exatamente a diferença que o
 * olho existe para enxergar. Folha de sprite nunca reduz — ela quebra em linhas.
 * Reduzir ficou só para o que sozinho já é maior que a tela: as camadas de
 * fundo, onde o que se lê é presença e densidade, não forma.
 *
 * O passo em Y é o dobro do passo em X porque caractere de terminal é ~2x mais
 * alto que largo. Sem isso tudo sai achatado e "encosta na borda" vira ilusão
 * de ótica em vez de leitura.
 */
function passoDe(largura: number): [number, number] {
  const px = Math.max(1, Math.ceil((largura + SEPARADOR.length) / LARGURA_MAX))
  return [px, px * 2]
}

/**
 * Quadros da mesma tira NÃO têm o mesmo tamanho, e supor que têm foi o segundo
 * defeito do próprio olho: as três auras têm raios diferentes (rastro, nuvem,
 * interferon), a tira usou a largura da primeira para todas, e as duas maiores
 * vazaram para fora da coluna. A grade sai do MAIOR quadro; os menores são
 * preenchidos até ela.
 */
function tira(quadros: ReadonlyArray<Buf>, rotulos: ReadonlyArray<string>): void {
  if (quadros.length === 0) return
  const maiorW = Math.max(...quadros.map((q) => q.w))
  const maiorH = Math.max(...quadros.map((q) => q.h))
  const [px, py] = passoDe(maiorW)
  const largura = Math.ceil(maiorW / px)
  const porLinha = Math.max(1, Math.floor(LARGURA_MAX / (largura + SEPARADOR.length)))

  for (let i = 0; i < quadros.length; i += porLinha) {
    const lote = quadros.slice(i, i + porLinha)
    const junta = (blocos: ReadonlyArray<string>): string =>
      "  " + blocos.map((b) => b.padEnd(largura)).join(SEPARADOR)
    if (i > 0) console.log("")
    console.log(junta(rotulos.slice(i, i + porLinha)))
    for (let y = 0; y < maiorH; y += py) {
      const blocos = lote.map((q) => {
        let bloco = ""
        for (let x = 0; x < maiorW; x += px) {
          const l = x < q.w && y < q.h ? tomDoBloco(q, x, y, px, py) : -1
          // piso 0 (`.`) para quem tem pixel: o que existe nunca aparece como vazio
          bloco += l < 0 ? " " : TONS[Math.min(TONS.length - 1, Math.round(l * (TONS.length - 1)))]
        }
        return bloco
      })
      console.log(junta(blocos))
    }
  }
}

function despeja(p: Peca): void {
  if (alvo !== undefined && !p.nome.includes(alvo)) return
  const todos = p.linhas.flatMap((l) => l.quadros)
  if (todos.length === 0) return
  const tons = Math.max(...todos.map((q) => new Set(q.d.filter((v) => v !== 0)).size))
  const vazios = todos.filter((q) => q.d.every((v) => v === 0)).length
  const cob = todos.map((q) => (painted(q) / q.d.length) * 100)
  const dims = [...new Set(todos.map((q) => `${q.w}x${q.h}`))]
  console.log(
    `\n\n=== ${p.nome} — ${todos.length} quadros de ${dims.length > 3 ? `${dims.length} tamanhos` : dims.join(", ")}`,
  )
  console.log(
    `    tons máx por quadro: ${tons}  ·  cobertura ${Math.min(...cob).toFixed(1)}–` +
      `${Math.max(...cob).toFixed(1)}%${vazios > 0 ? `  ·  VAZIOS: ${vazios}` : ""}`,
  )
  if (p.nota !== undefined) console.log(`    ${p.nota}`)
  for (const l of p.linhas) {
    console.log(`\n  ${l.rotulo}:`)
    tira(l.quadros, l.quadros.map((_, i) => `${i}`))
  }
}

/** Uma folha animada vira uma linha por direção, no escalão pedido. */
function daFolha(nome: string, s: Sheet, nota?: string): Peca {
  const t = Math.max(0, Math.min(s.tiers - 1, escalao))
  const texto =
    nota ?? (s.tiers > 1 ? `escalão ${t} de ${s.tiers - 1} — troque com o 2º argumento` : undefined)
  return {
    nome,
    ...(texto === undefined ? {} : { nota: texto }),
    linhas: Array.from({ length: s.dirs }, (_, d) => ({
      rotulo: `direção ${d}`,
      quadros: s.frames.slice((t * s.dirs + d) * s.phases, (t * s.dirs + d) * s.phases + s.phases),
    })),
  }
}

const pecas: Peca[] = [
  daFolha("player", playerSheet(tuning.player.size)),
  ...Object.entries(tuning.enemy.kinds).map(([kind, spec]) =>
    daFolha(kind, pathogenSheet(spec.form, tuning.enemy.size * spec.sizeScale)),
  ),
  daFolha("macrofago", macrophageSheet(tuning.powers.macrophageRadius)),
  daFolha("gota", dropSheet(RAMP_GLD), "rampa dourada só de amostra — o atlas escolhe por poder"),
  {
    ...daFolha("orgao", organSheet(tuning.player.size * 2, 3)),
    nota: "ATENÇÃO: `organSheet` não é chamado por `atlas.ts` nem por nada em src/. Assado por ninguém.",
  },
  {
    nome: "hemacia",
    nota: "a multidão: linha é necrose, coluna é variante",
    linhas: Array.from({ length: CELL_LEVELS }, (_, lv) => ({
      rotulo: `necrose ${lv}`,
      quadros: Array.from({ length: Math.min(8, CROWD_VARIANTS) }, (_, v) => {
        const s = crowdShape(v)
        return bloodCell(s.r, s.squash, s.tilt, lv)
      }),
    })),
  },
  {
    nome: "colonia",
    nota: "a doença POR CIMA do leito: nível 0 é transparente de propósito",
    linhas: Array.from({ length: TISSUE_LEVELS }, (_, lv) => ({
      rotulo: `nível ${lv}`,
      quadros: Array.from({ length: TISSUE_VARIANTS }, (_, v) =>
        colonyTile(
          Math.ceil(tuning.arena.width / tuning.field.cols),
          Math.ceil(tuning.arena.height / tuning.field.rows),
          lv,
          v,
        ),
      ),
    })),
  },
  {
    nome: "choque",
    linhas: [{ rotulo: "anéis", quadros: shockRings(tuning.powers.shockRadius, SHI1) }],
  },
  {
    nome: "auras",
    nota: "dither, nunca alpha — uma linha por raio, porque os três raios são MUITO diferentes",
    linhas: [
      { rotulo: `rastro (r=${tuning.powers.trailRadius})`, quadros: [auraBuf(tuning.powers.trailRadius, FAST1, 0.4)] },
      { rotulo: `nuvem (r=${tuning.powers.cloudRadius})`, quadros: [auraBuf(tuning.powers.cloudRadius, RAMP_GLD[2]!, 0.34)] },
      {
        rotulo: `interferon (r=${tuning.powers.interferonRadius})`,
        quadros: [auraBuf(tuning.powers.interferonRadius, FAST0, 0.14)],
      },
    ],
  },
  {
    nome: "fundo",
    nota: "camadas de tela cheia, muito reduzidas — aqui se lê presença e densidade, não forma",
    linhas: [
      { rotulo: "plasma", quadros: [plasmaBuf(tuning.arena.width, tuning.arena.height)] },
      ...(["hemacias", "fibrina", "detritos"] as const).map((k, i) => ({
        rotulo: k,
        quadros: [layerBuf(tuning.arena.width, tuning.arena.height, k, i * 91 + 7)],
      })),
    ],
  },
]

for (const p of pecas) despeja(p)
console.log(`\n${alvo === undefined ? pecas.length : pecas.filter((p) => p.nome.includes(alvo)).length} peça(s). Filtre com \`npm run olho <nome> [escalão]\`.`)
