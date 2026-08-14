import { chromium } from "playwright"
import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import { projectRoot } from "./loadTuning.ts"

/**
 * O OUVIDO — `npm run ouvido`.
 *
 * O projeto tinha olho (`npm run shot`) e não tinha ouvido. Trilha conferida só
 * escutando é trilha sem verificação nenhuma: escutar pega timbre, e não pega
 * "o freio do relógio parou de frear" nem "a arena ficou mais baixa que o
 * cérebro". Estas são as coisas que o H não deveria ter que descobrir jogando.
 *
 * Ele renderiza a trilha OFFLINE, na mesma cadeia do jogo, e MEDE:
 *
 * - que sai som de verdade em cada cena (o defeito silencioso mais provável de
 *   um motor de áudio é não tocar nada e não reclamar);
 * - que a arena é mais alta que o cérebro, que é o desenho;
 * - e o principal: que com o RELÓGIO DO MUNDO baixo o batimento fica MAIS RARO.
 *   É a afirmação central da trilha — a de que a dilatação passa a ser audível —
 *   e ela não pode viver só num comentário.
 *
 * FALHA com código 1: é portão, não relatório.
 */

const PORT = 5197

function killTree(proc: ChildProcess): void {
  if (proc.pid === undefined) return
  try {
    process.kill(-proc.pid, "SIGKILL")
  } catch {
    proc.kill("SIGKILL")
  }
}

function startVite(): Promise<ChildProcess> {
  const bin = resolve(projectRoot, "node_modules", ".bin", "vite")
  const proc = spawn(bin, ["--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => {
      killTree(proc)
      fail(new Error("vite não subiu em 30s"))
    }, 30_000)
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ready in")) {
        clearTimeout(timer)
        ok(proc)
      }
    })
  })
}

interface Medida {
  rms: number
  pico: number
  /** Batimentos por segundo, contados por detecção de ataque no grave. */
  batidas: number
}

const vite = await startVite()
const chrome = process.env["CHROME_PATH"]
const browser = await chromium.launch({
  ...(chrome === undefined ? {} : { executablePath: chrome }),
  args: ["--no-sandbox"],
})
const falhas: string[] = []

try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" })

  const mede = async (mundo: Record<string, unknown>, segundos: number): Promise<Medida> =>
    page.evaluate(
      async ([m, s]) => {
        // Import por variável: o caminho é do SERVIDOR do Vite, não do disco, e
        // deixá-lo literal faria o TypeScript tentar resolvê-lo aqui.
        const caminho = "/src/audio/audio.ts"
        const mod = (await import(/* @vite-ignore */ caminho)) as {
          renderizaOffline: (m: unknown, s: number) => Promise<Float32Array>
        }
        const d = await mod.renderizaOffline(m, s as number)
        let soma = 0
        let pico = 0
        for (let i = 0; i < d.length; i++) {
          soma += d[i]! * d[i]!
          const a = Math.abs(d[i]!)
          if (a > pico) pico = a
        }
        const rms = Math.sqrt(soma / d.length)
        /*
         * ATAQUES no grave: a envoltória em janelas de 20ms, e um ataque é uma
         * janela que sobe muito acima da anterior depois de ter estado baixa.
         * É a contagem mais grosseira que existe, e é a certa aqui — o que se
         * quer saber é se o coração bate mais raro, não a batida exata.
         */
        const jan = Math.floor(22050 * 0.02)
        const env: number[] = []
        for (let i = 0; i + jan <= d.length; i += jan) {
          let p = 0
          for (let k = i; k < i + jan; k++) p = Math.max(p, Math.abs(d[k]!))
          env.push(p)
        }
        const teto = Math.max(...env)
        let batidas = 0
        let armado = true
        for (const v of env) {
          if (armado && v > teto * 0.5) {
            batidas++
            armado = false
          } else if (v < teto * 0.2) armado = true
        }
        return { rms, pico, batidas: batidas / (s as number) }
      },
      [mundo, segundos] as const,
    )

  const confere = (nome: string, ok: boolean, detalhe: string): void => {
    if (ok) console.log(`  ok   ${nome} · ${detalhe}`)
    else falhas.push(`${nome} · ${detalhe}`)
  }

  console.log("sonda do ouvido: a trilha renderizada offline, medida")

  const arena = await mede({ cena: "arena", relogio: 1, doenca: 0.2, onda: 4, vidas: 3 }, 8)
  confere("a arena SOA", arena.rms > 0.01, `rms ${arena.rms.toFixed(4)}`)

  const cerebro = await mede({ cena: "cerebro", relogio: 1, doenca: 0, onda: 1, vidas: 3 }, 8)
  confere("o cérebro SOA", cerebro.rms > 0.005, `rms ${cerebro.rms.toFixed(4)}`)
  confere(
    "o cérebro é mais BAIXO que a arena",
    cerebro.rms < arena.rms,
    `${cerebro.rms.toFixed(4)} < ${arena.rms.toFixed(4)}`,
  )

  /*
   * A AFIRMAÇÃO CENTRAL da trilha, medida.
   *
   * Com o relógio do mundo no chão — que é o que a adrenalina faz, e o que a
   * dilatação faria o tempo todo se o H a religasse — o batimento tem que ficar
   * sensivelmente mais raro. Se este número não cair, a trilha deixou de contar
   * o que ela existe para contar, e ninguém perceberia ouvindo de passagem.
   */
  const rapido = await mede({ cena: "arena", relogio: 1, doenca: 0.5, onda: 3, vidas: 3 }, 10)
  const lento = await mede({ cena: "arena", relogio: 0, doenca: 0.5, onda: 3, vidas: 3 }, 10)
  confere(
    "o RELÓGIO DO MUNDO freia a trilha — a dilatação é audível",
    lento.batidas < rapido.batidas * 0.6,
    `${rapido.batidas.toFixed(2)}/s a toda contra ${lento.batidas.toFixed(2)}/s parado`,
  )

  const doente = await mede({ cena: "arena", relogio: 1, doenca: 1, onda: 3, vidas: 3 }, 10)
  const sadio = await mede({ cena: "arena", relogio: 1, doenca: 0, onda: 3, vidas: 3 }, 10)
  confere(
    "a DOENÇA acelera o coração",
    doente.batidas > sadio.batidas,
    `${sadio.batidas.toFixed(2)}/s limpo contra ${doente.batidas.toFixed(2)}/s tomado`,
  )

  confere("nada estoura", arena.pico <= 1 && doente.pico <= 1, `pico ${doente.pico.toFixed(3)}`)
} finally {
  await browser.close()
  killTree(vite)
}

if (falhas.length > 0) {
  console.error(`\nSONDA DO OUVIDO REPROVOU:\n  ${falhas.join("\n  ")}`)
  process.exit(1)
}
console.log("\nouvido: a trilha soa, responde ao relógio e responde à doença")
