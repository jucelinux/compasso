import { drive } from "./drive.ts"
import { loadTuning } from "./loadTuning.ts"

/**
 * A SONDA DO TOQUE — `npm run toque`.
 *
 * Existe por um defeito que passou inteiro por 182 testes verdes e por todas as
 * capturas: **no iPad nenhum clique chegava à sim.** A camada de toque cobre a
 * tela toda, o guarda que impede o pad de virar clique engolia todo evento, e
 * as cinco portas do cérebro — que abrem no ponteiro — eram inalcançáveis.
 * Pior: um painel aberto ANDANDO virava armadilha, porque `restart` no toque só
 * existe na tela de morte.
 *
 * Nenhum instrumento do projeto olhava para o modo de toque. O `shot` e o `rec`
 * rodam sempre em desktop, e os testes de sim não conhecem browser — então o
 * caminho que o H de fato joga era o único sem cobertura de espécie nenhuma.
 *
 * Ela FALHA com código 1: é portão, não relatório.
 */
const t = loadTuning()
const d = await drive(7, { touch: "1", hud: "1" })
const falhas: string[] = []

try {
  const fase = async (): Promise<string> =>
    (await d.page.locator("#hud").textContent())?.match(/fase (\w+)/)?.[1] ?? "?"

  const confere = async (nome: string, esperado: string): Promise<void> => {
    await d.page.waitForTimeout(260)
    const f = await fase()
    if (f === esperado) console.log(`  ok   ${nome} → ${f}`)
    else falhas.push(`${nome}: esperava "${esperado}", veio "${f}"`)
  }

  console.log("sonda do toque, em modo `?touch=1`:")

  // As quatro portas novas, uma a uma: abre no toque, fecha tocando FORA.
  for (const n of t.hub.nodes) {
    await d.clicaArena(n.x, n.y)
    await confere(`toque abre "${n.id}"`, "painel")
    await d.clicaArena(6, 6)
    await confere(`toque fora fecha "${n.id}"`, "hub")
  }

  // O [X], que é o outro caminho de fechar e o que o H nomeou.
  await d.clicaArena(t.hub.nodes[0]!.x, t.hub.nodes[0]!.y)
  await confere("toque reabre a primeira porta", "painel")
  await d.clicaArena(
    (t.arena.width + t.hub.panelW) / 2 - t.hub.closeSize / 2,
    (t.arena.height - t.hub.panelH) / 2 + t.hub.closeSize / 2,
  )
  await confere("toque no [X] fecha", "hub")

  // A órbita leva à escolha, e a escolha também tem que ter saída.
  await d.clicaArena(t.hub.orbitX, t.hub.orbitY)
  await confere("toque na órbita abre a escolha", "select")
  await d.clicaArena(6, 6)
  await confere("toque fora fecha a escolha", "hub")

  if (d.errors.length > 0) falhas.push(`erros no browser:\n${d.errors.join("\n")}`)
} finally {
  await d.close()
}

if (falhas.length > 0) {
  console.error(`\nSONDA DO TOQUE REPROVOU:\n  ${falhas.join("\n  ")}`)
  process.exit(1)
}
console.log("\ntoque: todas as portas abrem e fecham")
