# BACKLOG.md

O que está aberto. O que está assentado vive no `DECISIONS.md` — misturar os dois é como
log de decisão morre.

---

## Próxima rodada — dificuldade sem teto

- **Folga como curva única.** `creep` sobe e `recoveryTicks` cai conforme a run avança.
  Hoje são constantes.
- **Tirar o teto de spawn.** `minSpawnIntervalSeconds` satura no kill ~60 e a dificuldade
  congela ali. Enquanto spawn for o único eixo, qualquer teto encerra o jogo cedo.
- **Ondas.** Cota de kills por onda, não temporizador — ver a nota abaixo.

## Vindo do tema (célula imunológica), como mecânica e não como arte

- **Vírus com comportamento**, não só mais inimigos: um que se divide ao ser cortado, um
  que só morre em dois toques, um que foge.
- **Células do organismo a defender.** Segunda condição de derrota sem segundo verbo — o
  jogador continua só dashando. Bate com "encolher a folga": defender tira sua liberdade
  de posição, não seu tempo.
- **Modificadores com nome de sistema imune.** Custa um rename quando o resto estiver medido.

## Conhecido e adiado de propósito

- **Arte do tema.** Primitivas geométricas tornam o tema barato depois. Antes do sistema de
  recompensa estar medido, mexer nisso é o viés do `TASTE.md` §2 falando.
- **Mobile sem controle de toque.** Alvo inclui mobile; slice só tem teclado.
- **Áudio.** Nada ainda.
- **Fase 2 do harness.** Gatilho em `HARNESS.md` §7: mesmo eixo subjetivo julgado mais de
  duas vezes por semana. Ainda não aconteceu.

## Aberto com o humano

- **Bar por eixo.** `TASTE-LOOP.md` §4 exige um padrão externo por eixo. O dash foi
  aprovado sem bar declarado — funcionou uma vez, não escala. Próximo eixo a precisar:
  a curva de tensão.
