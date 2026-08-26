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
    (await d.page.locator("#hud").textContent())?.match(/phase (\w+)/)?.[1] ?? "?"

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

  /*
   * O gesto que o H pegou jogando, e o motivo desta sonda ter crescido.
   *
   * No aparelho de toque a metade DIREITA da tela é o impulso, e na `select` o
   * impulso é LUTAR. Tocar à direita para fechar a tela começava a partida — o
   * gesto de sair fazendo a única coisa que não dá para desfazer. Aqui o toque
   * cai bem na direita, e BEM FORA do quadro: tem que fechar, não lutar.
   */
  await d.clicaArena(t.hub.orbitX, t.hub.orbitY)
  await confere("toque na órbita abre a escolha (de novo)", "select")
  await d.clicaArena(t.arena.width - 12, t.arena.height - 12)
  await confere("toque na METADE DIREITA, fora do quadro, FECHA e não luta", "hub")

  // E a outra metade do par: dentro do quadro, o toque confirma.
  await d.clicaArena(t.hub.orbitX, t.hub.orbitY)
  await confere("toque na órbita abre a escolha (terceira vez)", "select")
  await d.clicaArena(t.arena.width / 2, t.arena.height / 2)
  await confere("toque DENTRO do quadro confirma o inimigo", "card")
  await d.clicaArena(t.arena.width / 2, t.arena.height - 20)
  await confere("toque dispensa o card", "run")

  if (d.errors.length > 0) falhas.push(`erros no browser:\n${d.errors.join("\n")}`)
} finally {
  await d.close()
}

if (falhas.length > 0) {
  console.error(`\nSONDA DO TOQUE REPROVOU:\n  ${falhas.join("\n  ")}`)
  process.exit(1)
}
console.log("\ntoque: todas as portas abrem e fecham")
