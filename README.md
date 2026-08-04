# COMPASSO

**O tempo só anda quando você anda.**

Um jogo de arena de run curta, com camada roguelite de poderes temporários. Você é um
glóbulo branco dentro de um tecido infectado: mover *é* atacar, o mundo roda a 5% da
velocidade enquanto você está parada, e a fase acaba quando a doença está **contida** — não
quando uma cota de abates é cumprida.

Web primeiro. Roda em navegador de desktop e de celular. Pixel art nativo em 640x360, com
paleta travada.

---

## Rodar

Requer **Node 22.18+** — os scripts do rig executam `.ts` direto, sem passo de build.

```bash
npm install
npm run dev        # http://localhost:5173
```

Parâmetros de URL úteis no dev: `?seed=1234` fixa a semente, `?palette=<nome>` troca a
variante de cor (a tecla **P** cicla entre elas mantendo a mesma seed).

## Controles

| tecla | o quê |
|---|---|
| **WASD** / setas | mover — e mover é atacar |
| **espaço** | impulso: em movimento é arranco, parada é aura |
| **R** / Enter | recomeçar depois de morrer (tecla própria, de propósito) |
| **F9** | grava os últimos 30s como replay JSON |
| **shift+F9** | grava a run inteira |
| **P** | próxima paleta, mesma seed |

O impulso tem recarga e **dois verbos decididos por contexto**: acima do limiar de
velocidade é alcance, abaixo dele planta um foco de cura que trabalha sem você (teto de 2).
`R` é tecla separada de `espaço` porque o portão do projeto mede intenção de rejogar, e
reinício no mesmo botão da ação vira reflexo.

---

## As regras que não se mexem

Cada uma é uma linha em `DECISIONS.md` e só cai com outra linha lá.

- **Um verbo.** Mover é atacar. O impulso é recurso com recarga, não o verbo central.
- **Velocidade é o relógio do mundo.** Parada, o mundo roda a `time.creep` (0.05); a toda,
  a 1.0. Você anda sempre em tempo real. Essa assimetria *é* o jogo.
- **O contato resolve por velocidade.** Rápido o bastante engole; devagar demais machuca. O
  limiar é por patógeno (`engulfSpeed`).
- **Três vidas**, e i-frames **sem timer** — caem no primeiro patógeno que você engolir.
- **O campo é o organismo.** A arena é tecido com infecção por tile. A infecção espalha em
  tempo de *mundo*; a cura corre em tempo *real* e cai junto com a sua velocidade. Patógeno
  nasce de tecido infectado, então a fase pode convergir.
- **Pixel art nativo, paleta travada.** Sem rotação em runtime, posições inteiras, sprite
  redondo dentro da hitbox com que a sim colide.

Patógenos são doenças reais e a morfologia decide o comportamento: E. coli anda em
corrida-e-cambalhota e faz fissão binária, influenza caça você, e assim por diante
(`tuning.json` → `enemy.kinds`). Os poderes são imunológicos — CITOCINA, FEBRE, ANTICORPO,
MACRÓFAGO, HISTAMINA, INTERFERON, ENZIMA, SURTO, MEMBRANA, PLAQUETA.

---

## Arquitetura

```
src/
  sim/          # lógica pura e determinística — o core
  render/       # renderer, interpolação, atlas de pixel art
  input/        # captura e log de input
  harness/      # runner headless, replay, bot, capturas
tests/          # determinismo, slice, harness, pixel art
tuning.json     # TODO número do jogo
replays/        # replays commitados: fixtures de regressão
```

Pré-requisitos inegociáveis, detalhados em `HARNESS.md` §1:

1. **Sim e render separados.** `src/sim/` nunca importa o renderer nem o DOM.
2. **Passo fixo a 60Hz.** Nada de lógica dependente de `deltaTime` variável.
3. **RNG semeado.** `Math.random()` é proibido em `src/sim/`.
4. **Input é log.** Uma run inteira é `{ seed, inputs[] }` — replay determinístico de graça.
5. **Todo número de ajuste vive em `tuning.json`.** É também o A/B mais barato que existe.
6. **Determinismo é testado.** Se o teste de determinismo quebrar, para tudo e conserta.

## O rig

```bash
npm run test                       # sim headless + determinismo
npm run typecheck                  # tsc --noEmit
npm run build                      # build de produção
npm run replay <arquivo.json>      # roda um replay, imprime o hash, escreve out/<label>/metrics.csv
npm run gate <arquivo.json>        # leitura de portão: depois que a run acabou, veio outra?
npm run pace                       # bot de ritmo — jogador constante, mede duração de onda e de run
npm run sweep <caminho> <v1> <v2>  # varre um parâmetro do tuning e ranqueia por métrica
npm run shot [seed]                # capturas do build atual em shots/
npm run palettes [seed]            # capturas de todas as variantes de paleta
npm run rec [nome] [seed]          # grava uma fixture sintética do build atual
npm run smoke                      # regera replays/smoke.json
```

`shots/` e os dumps `f9-*.json` da raiz são ignorados pelo git: captura é ferramenta de
leitura, não artefato de projeto. As fixtures que ficam moram em `replays/`.

## Stack

| camada | escolha | por quê |
|---|---|---|
| linguagem | TypeScript (strict) | tudo é texto; sem ida e volta pelo editor |
| render | PixiJS | rápido, WebGL, sem opinião sobre arquitetura de jogo |
| build | Vite | HMR instantâneo |
| testes | Vitest | sim determinística testável sem navegador |
| captura | Playwright | quadros e clipes do build real |

**Nenhuma engine em cima do Pixi.** O game loop, o ECS e as máquinas de estado são nossos e
do tamanho exato do que o jogo precisa.

---

## Os documentos

O repositório é metade jogo, metade método. Os `.md` não são documentação do código — são o
estado do projeto, e a sessão seguinte começa lendo eles.

| arquivo | o quê |
|---|---|
| `CLAUDE.md` | instância do projeto: gênero, decisões vinculantes, ordem de construção, don'ts |
| `TASTE.md` | gosto do humano destilado, bar por eixo, vieses e teto do modelo |
| `DECISIONS.md` | log append-only de decisões. Superado ≠ errado-na-época |
| `BACKLOG.md` | só o presente: o que está aberto e o contador do portão |
| `HARNESS.md` | o rig — contratos da sim, formato de replay, aceitação, fase 2 |
| `TASTE-LOOP.md` | o método: como uma rodada roda e quando chamar o humano |
| `TASTE-LOOP-LEARNING.md` | insumo para evoluir o próprio método |

**O portão** é a métrica de direção do projeto: ele conta *strikes*, não acertos — zero é o
melhor estado possível. A contagem atual fica no topo do `BACKLOG.md` e a definição no
`DECISIONS.md`. A métrica está **em revisão** desde 02/08: com o formato de fases, "segunda
partida" mede repetir quando o sucesso virou avançar. A proposta em aberto é *"a fase
seguinte, sem ajuda"*, e ela não foi ratificada.

## Don'ts do projeto

- Não adicione dependência sem propor antes.
- Não configure Tauri nem Capacitor antes do slice vertical ser aprovado.
- Não reabra as decisões vinculantes sem uma linha nova no `DECISIONS.md`.
- Não restaure do zero as coisas marcadas como mortas no `CLAUDE.md` — o log é append-only
  e ainda carrega o que caiu.
