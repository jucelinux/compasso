import {
  BATIDAS,
  bpm,
  brilho,
  compasso,
  estalo,
  hz,
  type Cena,
  type Estalo,
  type Mundo,
  type Nota,
  type Voz,
} from "./musica.ts"

/**
 * O MOTOR de áudio — quem sopra o que `musica.ts` decide.
 *
 * WebAudio cru, sem biblioteca. Não é ascetismo: o que este jogo precisa de um
 * motor de áudio são osciladores, envelopes e um filtro, e isso é menos código
 * do que a configuração de qualquer biblioteca que fizesse mais.
 *
 * ------------------------------------------------------------ o que ele NÃO é
 *
 * Ele não decide nada e não escreve em lugar nenhum. A trilha é RENDER, no
 * mesmo sentido em que o estalo do abate é render desde 13/08: lê estado,
 * nunca produz. Se um dia o som mudar um byte do hash, algo está no lugar
 * errado — e o replay deixaria de reproduzir o jogo em silêncio.
 *
 * ------------------------------------------------------------ agendamento
 *
 * Nota agendada no quadro em que ela toca chega tarde: `requestAnimationFrame`
 * varia dezenas de milissegundos, e dezenas de milissegundos de erro em ritmo é
 * a diferença entre música e alguém batendo palma fora do tempo. Então o motor
 * agenda um pouco à FRENTE, no relógio do próprio `AudioContext`, que é o único
 * relógio da máquina com precisão de amostra.
 */

/** Quanto o motor enfileira à frente do relógio de áudio. */
const HORIZONTE = 0.25
/** Quanto ele espera antes do primeiro som, para o primeiro compasso não chegar cortado. */
const PARTIDA = 0.06

export interface Trilha {
  /** Chamado uma vez por quadro com o estado atual. */
  quadro(m: Mundo): void
  /** Dispara um som de evento. Fora do compasso, de propósito. */
  toca(tipo: Estalo): void
  /** Liga/desliga. Devolve o novo estado. */
  mudo(v?: boolean): boolean
  destroy(): void
}

interface Ctx {
  ac: BaseAudioContext
  master: GainNode
  filtro: BiquadFilterNode
  /** Ruído branco assado uma vez. Gerar por nota alocaria a cada estalo. */
  chiado: AudioBuffer
}

/**
 * Uma trilha MUDA, para quando não há áudio disponível.
 *
 * Existe para que `main.ts` não precise perguntar se o som existe antes de cada
 * chamada — e para que o rig, que roda sem gesto do usuário e às vezes sem
 * dispositivo de áudio, siga o mesmo caminho de código do jogo de verdade.
 */
const SILENCIO: Trilha = {
  quadro: () => {},
  toca: () => {},
  mudo: () => true,
  destroy: () => {},
}

/**
 * O ruído: um segundo de branco, assado uma vez.
 *
 * Determinístico de propósito — `Math.random` daria um chiado diferente a cada
 * carregamento, e a sonda offline precisa medir sempre a mesma coisa. É o mesmo
 * gerador congruente que o resto do projeto usa quando precisa de ruído estável.
 */
function assaChiado(ac: BaseAudioContext): AudioBuffer {
  const n = Math.floor(ac.sampleRate)
  const buf = ac.createBuffer(1, n, ac.sampleRate)
  const d = buf.getChannelData(0)
  let x = 22222
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    d[i] = (x / 0xffffffff) * 2 - 1
  }
  return buf
}

/**
 * A CADEIA de áudio, montada igual no vivo e na sonda offline.
 *
 * Uma função só porque a sonda tem que medir o que o jogador ouve, e não uma
 * aproximação dele. Dois grafos parecidos divergiriam na primeira mudança de
 * filtro, e a medição passaria a falar de um som que ninguém escuta.
 */
function montaCadeia(ac: BaseAudioContext, destino: AudioNode): Ctx {
  const master = ac.createGain()
  master.gain.value = 0.5
  const filtro = ac.createBiquadFilter()
  filtro.type = "lowpass"
  filtro.frequency.value = 18000
  filtro.Q.value = 0.7
  filtro.connect(master)
  master.connect(destino)
  return { ac, master, filtro, chiado: assaChiado(ac) }
}

/** O timbre de cada voz. Onda, e quanto ela dura depois do ataque. */
const TIMBRE: Readonly<Record<Voz, { onda: OscillatorType; ataque: number; queda: number }>> = {
  // Quadrada é o corpo do chiptune, e o arpejo é a voz que precisa cortar por
  // cima de tudo sem ocupar espaço.
  pulso: { onda: "square", ataque: 0.005, queda: 0.06 },
  // Triangular no baixo: quadrada aqui embaixo vira zumbido e come o batimento.
  baixo: { onda: "triangle", ataque: 0.01, queda: 0.12 },
  // Dente de serra é a única com harmônico suficiente para um acorde longo não
  // sumir atrás do resto.
  sopro: { onda: "sawtooth", ataque: 0.12, queda: 0.4 },
  ruido: { onda: "square", ataque: 0.002, queda: 0.05 },
  corpo: { onda: "sine", ataque: 0.004, queda: 0.09 },
}

function soa(c: Ctx, n: Nota, quando: number, volume: number): void {
  const g = c.ac.createGain()
  g.connect(c.filtro)
  const t = TIMBRE[n.voz]
  const pico = Math.max(0.0001, n.forca * volume)

  if (n.voz === "ruido") {
    const src = c.ac.createBufferSource()
    src.buffer = c.chiado
    src.loop = true
    src.connect(g)
    g.gain.setValueAtTime(0.0001, quando)
    g.gain.exponentialRampToValueAtTime(pico, quando + t.ataque)
    g.gain.exponentialRampToValueAtTime(0.0001, quando + n.dur + t.queda)
    src.start(quando)
    src.stop(quando + n.dur + t.queda + 0.02)
    return
  }

  const osc = c.ac.createOscillator()
  osc.type = t.onda
  const f = hz(n.nota)
  osc.frequency.setValueAtTime(f, quando)
  /*
   * O CORPO — o batimento — cai de altura enquanto soa.
   *
   * É como um bumbo é feito desde sempre, e aqui ele tem sentido a mais: o
   * batimento não é percussão emprestada, é o coração do organismo em que o
   * jogo se passa. Um seno caindo de 80Hz para 40Hz é literalmente o que um
   * peito faz.
   */
  if (n.voz === "corpo") osc.frequency.exponentialRampToValueAtTime(f * 0.5, quando + n.dur)
  osc.connect(g)
  g.gain.setValueAtTime(0.0001, quando)
  g.gain.exponentialRampToValueAtTime(pico, quando + t.ataque)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + n.dur + t.queda)
  osc.start(quando)
  osc.stop(quando + n.dur + t.queda + 0.02)
}

/**
 * O volume por cena.
 *
 * O cérebro é mais baixo que a arena de propósito: é onde o jogador para para
 * pensar, e trilha alta num lugar sem pressa vira barulho em minuto e meio.
 */
const VOLUME: Readonly<Record<Cena, number>> = {
  cerebro: 0.5,
  arena: 0.85,
  respiro: 0.6,
  morte: 0.7,
}

export function criaTrilha(): Trilha {
  const AC: typeof AudioContext | undefined =
    typeof AudioContext === "function"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (AC === undefined) return SILENCIO

  // O contexto VIVO é guardado à parte do `Ctx` genérico: só ele tem `resume` e
  // `close`, e a cadeia compartilhada com a sonda não pode depender disso.
  let vivo: AudioContext | null = null
  let c: Ctx | null = null
  let mudoAtual = false
  /** Instante de áudio até onde o compasso já foi enfileirado. */
  let agendadoAte = 0
  let numeroDoCompasso = 0
  let cenaAtual: Cena | null = null

  /*
   * O contexto nasce no PRIMEIRO GESTO, e não no carregamento.
   *
   * Todo navegador desde 2018 recusa áudio antes de um toque ou tecla, e recusa
   * em silêncio: o contexto nasce suspenso e nada toca. Criar aqui, na primeira
   * interação, é o que faz a trilha existir sem pedir permissão a ninguém.
   */
  const acorda = (): void => {
    if (vivo !== null) {
      if (vivo.state === "suspended") void vivo.resume()
      return
    }
    const ac = new AC()
    vivo = ac
    c = montaCadeia(ac, ac.destination)
    agendadoAte = ac.currentTime + PARTIDA
  }
  const gesto = (): void => acorda()
  window.addEventListener("pointerdown", gesto)
  window.addEventListener("keydown", gesto)

  return {
    quadro(m) {
      if (c === null || mudoAtual) return
      const { ac } = c
      if (ac.state === "suspended") return

      /*
       * Trocar de cena CORTA o que estava enfileirado — mas só o que ainda não
       * começou.
       *
       * Sem isto, entrar no cérebro depois de morrer deixaria até um quarto de
       * segundo de arena tocando por cima, e a tela nova chegaria com a trilha
       * da anterior. Um quarto de segundo é pouco no relógio e muito no ouvido.
       */
      if (m.cena !== cenaAtual) {
        cenaAtual = m.cena
        numeroDoCompasso = 0
        agendadoAte = Math.max(agendadoAte, ac.currentTime + PARTIDA)
      }

      // O filtro segue o relógio do mundo. Exponencial porque altura e brilho
      // são logarítmicos para o ouvido — linear aqui não soa como meio caminho.
      const abre = brilho(m)
      c.filtro.frequency.setTargetAtTime(180 + abre * abre * 17000, ac.currentTime, 0.08)

      const seg = 60 / bpm(m)
      const volume = VOLUME[m.cena]
      let guarda = 0
      while (agendadoAte < ac.currentTime + HORIZONTE && guarda++ < 16) {
        const inicio = Math.max(agendadoAte, ac.currentTime + 0.005)
        for (const n of compasso(m, numeroDoCompasso)) {
          soa(c, n, inicio + n.t * seg, volume)
        }
        agendadoAte = inicio + BATIDAS * seg
        numeroDoCompasso++
      }
    },

    toca(tipo) {
      if (c === null || mudoAtual || c.ac.state === "suspended") return
      const agora = c.ac.currentTime + 0.005
      for (const n of estalo(tipo)) soa(c, n, agora + n.t, 1)
    },

    mudo(v) {
      mudoAtual = v ?? !mudoAtual
      if (c !== null) {
        c.master.gain.setTargetAtTime(mudoAtual ? 0 : 0.5, c.ac.currentTime, 0.05)
        // Reenfileira do zero ao voltar: o que foi cortado no mudo já passou.
        if (!mudoAtual) agendadoAte = Math.max(agendadoAte, c.ac.currentTime + PARTIDA)
      }
      return mudoAtual
    },

    destroy() {
      window.removeEventListener("pointerdown", gesto)
      window.removeEventListener("keydown", gesto)
      void vivo?.close()
      vivo = null
      c = null
    },
  }
}

/**
 * A SONDA: renderiza a trilha OFFLINE e devolve as amostras. 14/08.
 *
 * O olho do projeto tem `npm run shot`; o ouvido não tinha nada. Esta é a peça
 * que falta para que "a música responde ao relógio do mundo" seja uma afirmação
 * MEDIDA e não uma intenção escrita no comentário.
 *
 * Ela roda no browser porque WebAudio é do browser, e usa a MESMA cadeia do
 * jogo — sem isso mediria um som parecido com o que o jogador ouve, que é o
 * tipo de aproximação que faz medição mentir.
 */
export async function renderizaOffline(
  m: Mundo,
  segundos: number,
  sampleRate = 22050,
): Promise<Float32Array> {
  const OAC: typeof OfflineAudioContext | undefined =
    typeof OfflineAudioContext === "function"
      ? OfflineAudioContext
      : (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
          .webkitOfflineAudioContext
  if (OAC === undefined) throw new Error("sem OfflineAudioContext nesta caixa")
  const ac = new OAC(1, Math.ceil(sampleRate * segundos), sampleRate)
  const c = montaCadeia(ac, ac.destination)
  c.filtro.frequency.value = 180 + brilho(m) * brilho(m) * 17000

  const seg = 60 / bpm(m)
  const volume = VOLUME[m.cena]
  let t = 0
  let n = 0
  while (t < segundos && n < 512) {
    for (const nota of compasso(m, n)) {
      const quando = t + nota.t * seg
      if (quando < segundos) soa(c, nota, quando, volume)
    }
    t += BATIDAS * seg
    n++
  }
  const buf = await ac.startRendering()
  return buf.getChannelData(0)
}
