import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import { chromium } from "playwright"
import { projectRoot } from "./loadTuning.ts"

/**
 * `npm run deploy` — o build de PRODUÇÃO abre? — e nada além disso.
 *
 * Existe por um defeito específico, de 05/08: o jogo não abria no Netlify, e
 * NADA que já existia aqui podia ter pego. Os 92 testes passavam, o `tsc`
 * passava, `npm run dev` abria o jogo, `npm run shot` capturava a tela, e o
 * `vite build` terminava com zero aviso. O defeito só existia no artefato que
 * ninguém abria: o `dist`.
 *
 * A causa foi `await` no topo do módulo de entrada. Em produção o Rollup junta
 * o código do Pixi no pedaço de entrada, o Pixi carrega o ambiente do browser
 * por `import()` dinâmico, e esse pedaço tardio passa a importar de volta da
 * entrada — que nunca termina de avaliar, porque está esperando o Pixi. Um
 * impasse circular que a especificação do ESM não manda ninguém reclamar:
 * tela preta, console limpo, zero exceção.
 *
 * Daí a forma deste instrumento. Ele não julga arte, não julga jogo e não
 * julga desempenho — o headless rasteriza por software e o número de quadro
 * dele não quer dizer nada. Ele responde uma pergunta só, e é a pergunta que
 * separa "subiu" de "não subiu".
 *
 * O contra-exemplo está travado junto: `--verifica-o-instrumento` reintroduz o
 * `await` de topo num build de mentira e exige que ESTE script reprove. Um
 * verificador que nunca reprovou não é verificador (lição de 04/08, `olho.ts`).
 */

const PORT = 5198

function killTree(proc: ChildProcess): void {
  if (proc.pid === undefined) return
  try {
    process.kill(-proc.pid, "SIGKILL")
  } catch {
    proc.kill("SIGKILL")
  }
}

function run(bin: string, args: readonly string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const proc = spawn(resolve(projectRoot, "node_modules", ".bin", bin), [...args], {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "pipe"],
    })
    let err = ""
    proc.stderr?.on("data", (c: Buffer) => (err += c.toString()))
    proc.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${bin} falhou:\n${err}`))))
    proc.on("error", fail)
  })
}

/** Sobe o `vite preview` — que serve o `dist`, e é essa a diferença toda. */
function startPreview(outDir: string): Promise<ChildProcess> {
  const bin = resolve(projectRoot, "node_modules", ".bin", "vite")
  const proc = spawn(bin, ["preview", "--outDir", outDir, "--port", String(PORT), "--strictPort"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => {
      killTree(proc)
      fail(new Error("vite preview não subiu em 30s"))
    }, 30_000)
    proc.stdout?.on("data", (c: Buffer) => {
      if (c.toString().includes(String(PORT))) {
        clearTimeout(timer)
        ok(proc)
      }
    })
    proc.on("error", (e) => {
      clearTimeout(timer)
      killTree(proc)
      fail(e)
    })
  })
}

interface Veredito {
  readonly ok: boolean
  readonly motivo: string
}

async function abre(outDir: string, pagina = "/"): Promise<Veredito> {
  const preview = await startPreview(outDir)
  /*
   * `CHROME_PATH` existe para caixas onde o Chromium do Playwright não foi
   * baixado (CI, contêiner). Sem a variável, o comportamento é o de sempre.
   */
  const executablePath = process.env["CHROME_PATH"]
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const erros: string[] = []
    page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`))
    page.on("console", (m) => {
      // O ícone é servido de `public/`; se ele der 404, é defeito de deploy
      // como qualquer outro, e o console fica sujo de propósito.
      if (m.type() === "error") erros.push(`${m.text()} · ${m.location().url}`)
    })
    await page.goto(`http://localhost:${PORT}${pagina}?seed=7`)

    /*
     * O sintoma do impasse é AUSÊNCIA — nada acontece, para sempre. Só espera
     * com prazo denuncia ausência; `waitUntil` de rede não, porque a rede
     * termina certinha e o módulo é que fica pendurado.
     */
    try {
      await page.waitForSelector("#app canvas", { timeout: 15_000 })
    } catch {
      return {
        ok: false,
        motivo:
          "o canvas nunca apareceu — o módulo de entrada não terminou de avaliar. " +
          "Suspeito número um: `await` no topo de `src/main.ts`.",
      }
    }

    // Não basta existir: tem que estar dimensionado, e em escala INTEIRA.
    const medida = await page.evaluate(() => {
      const c = document.querySelector("#app canvas") as HTMLCanvasElement
      const r = c.getBoundingClientRect()
      return { escala: (r.width * window.devicePixelRatio) / c.width, largura: r.width }
    })
    if (medida.largura === 0) return { ok: false, motivo: "o canvas apareceu com largura zero" }
    if (!Number.isInteger(medida.escala)) {
      return { ok: false, motivo: `escala física fracionária: ${medida.escala}` }
    }

    // O jogo tem que ANDAR, não só existir: um tick parado é tela congelada.
    const t1 = await page.locator("#hud").textContent()
    await page.waitForTimeout(1000)
    const t2 = await page.locator("#hud").textContent()
    const tick = (s: string | null): number => Number(s?.match(/tick (\d+)/)?.[1] ?? -1)
    if (tick(t2) <= tick(t1)) {
      return { ok: false, motivo: `o laço não anda: tick ${tick(t1)} -> ${tick(t2)}` }
    }

    if (erros.length > 0) return { ok: false, motivo: `console sujo:\n  ${erros.join("\n  ")}` }
    return { ok: true, motivo: `canvas em escala ${medida.escala}x, tick andando, console limpo` }
  } finally {
    await browser.close()
    killTree(preview)
  }
}

const verifica = process.argv.includes("--verifica-o-instrumento")

if (verifica) {
  /*
   * O contra-exemplo. Um `main.ts` de mentira, com `await` de topo e nada mais,
   * construído num `dist` à parte. Se ESTE passar, o instrumento é decorativo.
   */
  const { writeFileSync, rmSync, mkdtempSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const tmp = mkdtempSync(resolve(tmpdir(), "compasso-deploy-"))
  const entrada = resolve(projectRoot, "src", "__tla-probe.ts")
  const html = resolve(projectRoot, "__tla-probe.html")
  writeFileSync(
    entrada,
    `import { Application } from "pixi.js"\n` +
      `const app = new Application()\n` +
      `await app.init({ width: 640, height: 360 })\n` +
      `document.getElementById("app")!.appendChild(app.canvas)\n`,
  )
  writeFileSync(
    html,
    `<!doctype html><html><body><div id="app"></div><div id="hud"></div>` +
      `<script type="module" src="/src/__tla-probe.ts"></script></body></html>\n`,
  )
  try {
    // Entrada alternativa não sai pela linha de comando; vai pela API do Vite.
    const { build } = await import("vite")
    await build({
      root: projectRoot,
      logLevel: "error",
      build: { outDir: tmp, emptyOutDir: true, rollupOptions: { input: { probe: html } } },
    })
    const v = await abre(tmp, "/__tla-probe.html")
    if (v.ok) {
      console.error("INSTRUMENTO DECORATIVO: aprovou um build com `await` de topo")
      process.exit(1)
    }
    console.log(`instrumento verificado — reprovou o contra-exemplo: ${v.motivo}`)
  } finally {
    rmSync(entrada, { force: true })
    rmSync(html, { force: true })
    rmSync(tmp, { recursive: true, force: true })
  }
} else {
  await run("tsc", ["--noEmit"])
  await run("vite", ["build"])
  const v = await abre("dist")
  console.log(v.ok ? `deploy ok — ${v.motivo}` : `DEPLOY QUEBRADO — ${v.motivo}`)
  if (!v.ok) process.exit(1)
}
