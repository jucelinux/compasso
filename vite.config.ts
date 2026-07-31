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
  server: { port: 5173 },
  build: { target: "es2022" },
  define: { __GIT_SHA__: JSON.stringify(gitSha()) },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
