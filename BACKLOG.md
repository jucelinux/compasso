# BACKLOG.md

O que está aberto. O que está assentado vive no `DECISIONS.md` — misturar os dois é como
log de decisão morre.

---

## Aberto agora

- **Gate não medido.** O gate de 31/07 passou com modificador PERMANENTE entre runs —
  ele voltou porque estava mais forte. Esse mecanismo não existe mais. Até uma nova
  medição, o projeto não tem métrica de direção válida.
- **Nenhuma fixture cobre morte → reinício.** `run-01` é anterior às ondas, `run-02` é
  anterior à tecla de reinício separada. Precisa de uma gravação do build atual.
- **Sem fixture de morte→reinício ainda.** run-03 cobre morte, mas ninguém reiniciou.
- **O hitstop deixou o jogo um pouco mais fácil.** Bot ia até a onda 12–20, agora bate o
  teto de 6 min na onda 19–21. Efeito colateral de feel, não de tuning — não mexi na
  dificuldade nesta rodada de propósito, para a próxima leitura ser atribuível.
- **O bot é bom demais para medir morte.** Promovido para `src/harness/bot.ts` (`npm run
  pace`) e agora defende o organismo. Mede duração de onda muito bem, mas sobrevive 6 min
  em 3 de 5 seeds porque nunca erra a mira. A duração de RUN é estimada pela razão medida
  contra a run-03 (o humano leva ~2,7x o tempo do bot por onda), não medida direto.
- **Escolha a cada ~18s.** Melhor que os 7s da cota baixa, mas 12–20 escolhas por run
  ainda pode ser interrupção demais. Medir depois que o humano jogar.

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
