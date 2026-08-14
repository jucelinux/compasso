import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import { chromium, type Browser, type Page } from "playwright"
import { projectRoot } from "./loadTuning.ts"

/**
 * Dirigir o build de verdade, num browser de verdade.
 *
 * Existe porque nesta caixa a leitura só chega até onde a verificação alcança, e
 * em trabalho visual teste não alcança. Cinco dos consertos da rodada de pixel
 * art eram invisíveis no código E nos testes: o parallax desenhando as duas
 * cópias no mesmo lugar (bug que sobreviveu a uma revisão minha), o fundo
 * dominando o primeiro plano, o corpo do jogador lendo como pedra. Só olhar
 * encontrou.
 *
 * Isto é apparatus, como o bot. Não pode influenciar o jogo.
 */

export interface Driver {
  page: Page
  /** Segura as teclas por `ms` e solta. Aceita várias ao mesmo tempo. */
  hold(keys: string | ReadonlyArray<string>, ms: number): Promise<void>
  /** Clica num ponto em coordenada de ARENA (640x360). */
  clicaArena(x: number, y: number): Promise<void>
  /** Captura só o canvas, no tamanho nativo de 640x360 vezes `scale`. */
  shot(path: string, scale?: number): Promise<void>
  close(): Promise<void>
}

const PORT = 5199

/**
 * Mata o Vite de verdade.
 *
 * A primeira versão fazia `spawn("npx", ["vite", ...])` e `proc.kill()`. O `npx`
 * é um wrapper: matar ele deixava o Vite neto vivo, segurando a porta. A
 * gravação seguinte não subia, e como o filho órfão mantinha o event loop de pé,
 * o processo pendurava em vez de falhar. Duas horas de "está gravando" que era
 * um processo travado.
 *
 * Solução: chamar o binário local direto (sem wrapper) e num grupo próprio, para
 * poder matar o grupo inteiro.
 */
function killTree(proc: ChildProcess): void {
  if (proc.pid === undefined) return
  try {
    process.kill(-proc.pid, "SIGKILL")
  } catch {
    proc.kill("SIGKILL")
  }
}

/** Sobe o Vite num porto próprio para não brigar com o `npm run dev` do humano. */
function startVite(): Promise<ChildProcess> {
  const bin = resolve(projectRoot, "node_modules", ".bin", "vite")
  const proc = spawn(bin, ["--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  return new Promise((ok, fail) => {
    let stderr = ""
    const die = (msg: string): void => {
      // O filho SEMPRE morre no caminho de erro. Sem isto, o órfão segura a
      // porta e a próxima execução pendura.
      killTree(proc)
      fail(new Error(msg))
    }
    const timer = setTimeout(() => die(`vite não subiu em 30s${stderr ? `:\n${stderr}` : ""}`), 30_000)
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ready in")) {
        clearTimeout(timer)
        ok(proc)
      }
    })
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      // `--strictPort` com a porta ocupada: falha na hora, não em 30s.
      if (stderr.includes("is in use")) {
        clearTimeout(timer)
        die(`porta ${PORT} ocupada — sobrou um vite de uma execução anterior`)
      }
    })
    proc.on("error", (e) => {
      clearTimeout(timer)
      die(e.message)
    })
  })
}

export async function drive(
  seed: number,
  /** Parâmetros extras de URL, para sondas — hoje só `palette`. */
  query: Readonly<Record<string, string>> = {},
): Promise<Driver & { errors: string[] }> {
  const vite = await startVite()
  let browser: Browser | null = null
  try {
    /*
     * `CHROME_PATH` existe para caixas onde o Chromium do Playwright não foi
     * baixado (CI, contêiner). Sem a variável, o comportamento é o de sempre.
     */
    const executablePath = process.env["CHROME_PATH"]
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    })
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text())
    })
    const qs = new URLSearchParams({ seed: String(seed), ...query })
    await page.goto(`http://localhost:${PORT}/?${qs.toString()}`, { waitUntil: "networkidle" })
    // A arte é assada no boot; sem esperar, a primeira captura pega tela vazia.
    await page.waitForTimeout(1200)

    const held = new Set<string>()
    const browserRef = browser
    return {
      page,
      errors,
      async hold(keys, ms) {
        const list = typeof keys === "string" ? [keys] : keys
        for (const k of list) {
          await page.keyboard.down(k)
          held.add(k)
        }
        await page.waitForTimeout(ms)
        for (const k of list) {
          await page.keyboard.up(k)
          held.delete(k)
        }
      },
      /**
       * CLICA num ponto da arena, em coordenada de 640x360.
       *
       * Entrou em 13/08 junto com as cinco portas do cérebro, e não é
       * conveniência: o rig no browser só enxerga a FASE, pelo texto do HUD, e
       * nunca soube onde o glóbulo está. Enquanto havia uma porta só logo acima
       * do ponto de nascimento, segurar CIMA bastava; com as portas nos cantos e
       * o nascimento na praça, não basta mais.
       *
       * Clicar é o outro gesto que o próprio jogador tem, então o aparelho
       * continua pilotando um caminho que alguém percorre — e de quebra a
       * gravação passa a exercitar o ponteiro pelo cano inteiro, do evento do
       * browser ao sufixo no arquivo de replay.
       */
      async clicaArena(x, y) {
        const box = await page.locator("#app canvas").boundingBox()
        if (box === null) throw new Error("sem canvas para clicar")
        await page.mouse.click(
          box.x + (x / 640) * box.width,
          box.y + (y / 360) * box.height,
        )
      },
      async shot(path, scale = 2) {
        await page.evaluate((s) => {
          const c = document.querySelector("#app canvas") as HTMLCanvasElement | null
          if (c === null) return
          c.style.width = `${640 * s}px`
          c.style.height = `${360 * s}px`
          // O canvas passou a ser posicionado à mão em 05/08 (escala inteira
          // na grade física). Sem zerar a posição, a captura em escala maior
          // sai cortada pela borda da janela.
          c.style.left = "0px"
          c.style.top = "0px"
        }, scale)
        await page.locator("#app canvas").screenshot({ path })
      },
      async close() {
        for (const k of held) await page.keyboard.up(k)
        await browserRef.close()
        killTree(vite)
      },
    }
  } catch (err) {
    await browser?.close()
    killTree(vite)
    throw err
  }
}
