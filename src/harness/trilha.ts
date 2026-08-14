import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { projectRoot } from "./loadTuning.ts"

/**
 * `npm run trilha` — a trilha em ARQUIVO, para ser ouvida. 14/08.
 *
 * O `npm run ouvido` MEDE e reprova; este aqui não julga nada. Ele existe
 * porque a única pessoa que pode dizer se a música presta é o H, e ele não
 * deveria ter que jogar seis situações diferentes para ouvir seis situações
 * diferentes — a adrenalina, por exemplo, exige comprar uma habilidade e
 * acumular 200 abates antes de soar uma vez.
 *
 * Sai em `shots/`, que o git ignora: material de leitura, não artefato de
 * projeto. A cadeia é a MESMA do jogo, então o que sai daqui é o que se ouve lá
 * — a sonda e o arquivo compartilham `renderizaOffline` justamente para que
 * ninguém julgue uma aproximação.
 */
const PORT = 5196
const bin = resolve(projectRoot, "node_modules", ".bin", "vite")
const vite = spawn(bin, ["--port", String(PORT), "--strictPort"], { stdio: ["ignore","pipe","pipe"], detached: true })
await new Promise<void>((ok) => vite.stdout!.on("data", (c: Buffer) => { if (c.toString().includes("ready in")) ok() }))

const wav = (d: Float32Array, sr: number): Buffer => {
  const n = d.length
  const b = Buffer.alloc(44 + n * 2)
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8)
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write("data", 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, d[i]!))
    b.writeInt16LE(Math.round(v * 32000), 44 + i * 2)
  }
  return b
}

const chrome = process.env["CHROME_PATH"]
const browser = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}), args: ["--no-sandbox"] })
const dir = resolve(projectRoot, "shots")
mkdirSync(dir, { recursive: true })
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" })
  const cenas: Array<[string, Record<string, unknown>, number]> = [
    ["1-cerebro", { cena: "cerebro", relogio: 1, doenca: 0, onda: 1, vidas: 3 }, 16],
    ["2-arena-onda1", { cena: "arena", relogio: 1, doenca: 0.05, onda: 1, vidas: 3 }, 12],
    ["3-arena-onda6-doente", { cena: "arena", relogio: 1, doenca: 0.75, onda: 6, vidas: 3 }, 14],
    ["4-adrenalina", { cena: "arena", relogio: 0.05, doenca: 0.5, onda: 4, vidas: 3 }, 12],
    ["5-respiro", { cena: "respiro", relogio: 1, doenca: 0.3, onda: 3, vidas: 3 }, 8],
    ["6-morte", { cena: "morte", relogio: 1, doenca: 0.8, onda: 5, vidas: 0 }, 8],
  ]
  for (const [nome, m, seg] of cenas) {
    const arr = await page.evaluate(async ([mm, ss]) => {
      const caminho = "/src/audio/audio.ts"
      const mod = (await import(/* @vite-ignore */ caminho)) as { renderizaOffline: (m: unknown, s: number, sr?: number) => Promise<Float32Array> }
      return Array.from(await mod.renderizaOffline(mm, ss as number, 44100))
    }, [m, seg] as const)
    writeFileSync(resolve(dir, `trilha-${nome}.wav`), wav(Float32Array.from(arr), 44100))
    console.log(`trilha-${nome}.wav · ${seg}s`)
  }
} finally {
  await browser.close()
  try { process.kill(-vite.pid!, "SIGKILL") } catch { vite.kill("SIGKILL") }
}
