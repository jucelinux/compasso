/**
 * Procedência do replay. No browser vem de um `define` do Vite; em Node vem do
 * próprio git. `null` quando não dá pra saber — divergir não é erro, mas não
 * saber contra qual código um baseline foi gravado, sim.
 */
declare const __GIT_SHA__: string | undefined

export function browserGitSha(): string | null {
  return typeof __GIT_SHA__ === "string" && __GIT_SHA__.length > 0 ? __GIT_SHA__ : null
}
