import { execSync } from "node:child_process"
import { defineConfig } from "vitest/config"

/** Sem repo, ou git indisponível: procedência vira `null`, não quebra o build. */
function gitSha(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

export default defineConfig({
  /*
   * Caminho RELATIVO, e é o itch.io que obriga. 26/08.
   *
   * Lá o jogo não é servido da raiz de um domínio: ele mora dentro de
   * `html-classic.itch.zone/html/<id>/`, num iframe. Com o padrão do Vite o
   * `index.html` pediria `/assets/index-<hash>.js`, que naquele host é a raiz
   * do itch e não a do jogo — 404 no bundle, tela preta, e nada no console que
   * diga "o caminho é que está errado".
   *
   * `"./"` também serve a Netlify, que publica na raiz: relativo a partir de um
   * `index.html` que está na raiz é o mesmo arquivo. Um caminho só, os dois
   * destinos.
   */
  base: "./",
  server: { port: 5173 },
  build: { target: "es2022" },
  define: { __GIT_SHA__: JSON.stringify(gitSha()) },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
