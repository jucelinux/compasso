# COMPASSO — página do itch.io

Texto pronto para colar. **O corpo da página está em inglês** porque o jogo está em inglês
desde 26/08; este arquivo, como o resto do repositório, continua em português.

O que sobe é o `compasso-itch.zip`: o `dist` inteiro, com o `index.html` na RAIZ do zip. O
`base: "./"` do `vite.config.ts` existe para isto — no itch o jogo não mora na raiz de um
domínio, e caminho absoluto daria 404 no bundle com o console limpo.

---

## ANTES DE PUBLICAR: a frase do projeto não descreve o build

O pitch do `CLAUDE.md` é *"time only moves when you move"*, e ele **não vale para o que está
no zip**: `time.dilation` está `false` desde 13/08. Hoje o mundo anda em tempo real
independente da sua velocidade — a fórmula está inteira, sob teste, atrás do booleano, mas
desligada.

Pôr a frase na tagline seria vender uma mecânica que o jogador não vai encontrar, e o
primeiro comentário da página seria sobre isso. **A cópia abaixo descreve o build de
verdade.** A versão com a dilatação ligada está no fim do arquivo, pronta, para o dia em que
o toggle voltar — e ligar ou não é chamada do H, não minha.

O que sobrou de dilatação no build é a **adrenalina**: comprada por 200 de memória, ela leva
o mundo a 5% por 10 segundos. Câmera lenta existe no jogo; ela só não está mais amarrada ao
seu movimento.

---

## Tagline

**You are the cure, and the cure has to keep moving.**

Ela é verdade nos dois sentidos que o jogo cobra: o tecido só sara em volta de você, então
parar é deixar o resto do corpo sem tratamento; e o abate depende da sua velocidade, então
parar é também não matar. Duas alternativas:

- *Move fast enough and the disease dies on contact.*
- *Ten waves of E. coli, one verb: move.*

## Campos do formulário

| campo | valor |
|---|---|
| Title | COMPASSO |
| Short description / tagline | You are the cure, and the cure has to keep moving. |
| Classification | Game |
| Kind of project | HTML (playable in browser) |
| Release status | In development |
| Pricing | No payments (ou "Donations" se quiser deixar aberto) |
| Uploads | `compasso-itch.zip` → marcar **This file will be played in the browser** |
| Embed options | Manually set size: **1280 x 720**, Fullscreen button ✅, Mobile friendly ✅ (landscape), Automatically start on page load ❌ |
| Genre | Action |
| Tags | pixel-art, arcade, roguelite, singleplayer, bullet-hell, html5, short, score-attack, biology, top-down |
| Inputs | Keyboard, Mouse, Touchscreen |
| Accessibility | — (o jogo não tem legenda nem modo para daltonismo; não prometa o que não mediu) |

O embed em 1280x720 é o dobro exato do buffer nativo de 640x360, então o vizinho-próximo sai
sem pixel de tamanho 2 ao lado de pixel de tamanho 3. Qualquer múltiplo inteiro serve;
fracionário cintila.

## Corpo da página (em inglês)

> ### You are the cure, and the cure has to keep moving.
>
> You are a white blood cell inside a body that is losing. The tissue is infected, the colony
> doubles on its own clock, and there is exactly one verb: **move**.
>
> Moving *is* attacking. There is no fire button — you kill by ramming, and speed is what
> decides the contact: fast enough and you engulf the pathogen, too slow and it takes a life.
> The same movement is the treatment, because tissue only heals in the radius around you. Every
> second you spend somewhere is a second the rest of the organism is not being treated.
>
> A wave does not end on a kill quota. It ends when the field is **contained** — infection
> under the line and nothing alive to spread it.
>
> **A run is ten waves of E. coli**, and the colony gets a little worse at every step: it
> splits faster, it seeds more foci, it pushes harder from the sources. Between waves you get
> three seconds of breath and nothing to press.
>
> You have three lives and no invulnerability timer — the shield you get after a hit lasts
> until the first pathogen you engulf yourself. It is a rule with no number in it, and you can
> read it from across the room.
>
> **What survives your death is immunological memory.** Spend it in the brain hub: adrenaline
> drops the world to a twentieth of real time for ten seconds, fever burns everything around
> you. And any wave you have reached stays unlocked — die on wave 6 and you can start the next
> run there, at wave 6 difficulty.
>
> ---
>
> **Controls**
>
> - **Desktop** — WASD or arrows to move, **space** to dash, **R** to restart, **1** to fire a
>   bought ability. Click the doors in the hub.
> - **Mobile** — drag anywhere on the left half to steer, tap the right half to dash, tap an
>   ability icon to fire it.
>
> ---
>
> **What it is made of**
>
> Native 640x360 pixel art on a locked palette, a fixed-timestep deterministic simulation and
> seeded runs — and no engine: the loop, the entities and the art are hand-rolled on top of
> PixiJS. Every run replays frame for frame from its input log, which is how the thing gets
> tested at all.
>
> Made by Jucelinux. The feedback worth most is *"I did not understand X"* — say that one
> before you say you liked it.

## O que ainda falta para a página ficar completa

- **Capa 630x500.** O itch exige uma para a listagem, e nenhuma das capturas está nessa
  proporção. As de `shots/` (`1-parada.png`, `0b-selecao.png`, `3-morte.png`, `0c-upgrades.png`)
  servem de screenshot, não de capa.
- **GIF curto** do glóbulo atravessando o tecido e limpando o limo. É o único jeito de a
  mecânica aparecer numa página parada.

## Se a dilatação voltar

Trocar `time.dilation` para `true` no `tuning.json`, rodar `npm test` e `npm run deploy`,
regerar o zip — e a página muda para:

- **Tagline:** *Time only moves when you move.*
- **Parágrafo que entra depois do primeiro:**

> Your speed is the world's clock. Stand still and the world crawls at a twentieth of real
> time; run flat out and it runs at full speed. You always move in real time — that asymmetry
> is the whole game. And standing still is not safety: healing runs on your clock too, so the
> moment you stop to think, the infection stops being pushed back.

## O portão, e por que esta publicação mexe nele

O portão é *"a dilatação é lida sem explicação"*, e o `BACKLOG.md` o registra **suspenso**
desde 13/08 justamente porque a dilatação está desligada — não há o que ler. Publicar no itch
com o toggle em `false` **não destrava o portão**: cada visitante é uma leitura em potencial
de um jogo que não contém a linha que o portão pergunta.

O que a publicação destrava é o outro lado: um canal de estranhos jogando sem ninguém
explicar, que é exatamente o insumo raro que o método pede (duas leituras em oito dias). No
dia em que o relógio voltar, a página já está no lugar — e vale pedir nela, com todas as
letras, o relato de quem não entendeu.
