# BACKLOG.md

O que está aberto. O que está assentado vive no `DECISIONS.md` — misturar os dois é como
log de decisão morre.

Reescrito por inteiro em 01/08. A versão anterior descrevia um jogo que não existia mais:
falava de tela de escolha, de `textures.ts`, de bot imortal e de salto gráfico por shader,
todos superados. `DECISIONS.md` guarda o histórico; este arquivo guarda só o presente.

---

## Aberto agora

- **Balanço do tecido é de primeira mão.** A sonda de 01/08 deu run de 157s (agressiva) a
  266s (ritmo) contra alvo de ~120s, com 3-4 fases por run. Está jogável e na faixa certa,
  mas não foi afinado com humano nenhum ainda.
- **A colônia não tem cor de doença.** Hoje toda infecção é verde. Com fase = doença, ela
  devia herdar a rampa do patógeno dominante — a máquina já existe (`KIND_RAMP`).
- **O card de apresentação da fase ainda não existe.** Aprovado na conversa de 01/08 e não
  implementado: sprite animado grande, nome real, características. Os sprites e a fonte já
  estão prontos, é montagem.
- ~~O jogo é lotado, mas não é perigoso~~ — atacado pelo tecido; a morte agora vem da
  infecção tomar o campo, não de encostar. Remedir com humano.
- **O jogo era lotado, mas não perigoso.** Medido em 01/08 com o bot: 55% da run tem um
  patógeno a menos de 60px, e o tempo em posição de tomar dano é **0,1s numa run de 127s**.
  A causa é direta — 82% da run é passada acima de 0.78 de velocidade, e cinco dos seis
  `engulfSpeed` ficam abaixo disso. O limiar que deveria transformar contato em decisão
  nunca chega a apertar. **É a articulação medida da reprovação de 01/08** ("não achei tão
  desafiador") e o lugar mais provável para a próxima rodada de design.
- **A morte vem do organismo, não das suas vidas.** 3 de 5 seeds do bot acabam em
  "organismo caiu". Se a intenção é que a pressão seja sobre o jogador, o número que manda
  hoje não é esse.
- **Nenhum replay do humano no core atual.** `replays/core-atual.json` é sintético e serve
  para determinismo; não serve para julgar ritmo. Só uma gravação dele resolve.
- **Vigiar o abate passivo.** Se passar de ~40%, o verbo único virou enfeite.
- **A invulnerabilidade continua sem prazo, só que agora é estéril.** A regra de 01/08
  trocou a condição, não a removeu: antes bastava ficar abaixo de 0.85 e você ainda comia
  cinco dos seis tipos; agora, para permanecer protegido, você não pode comer nada. Visto
  numa captura — 30s parada, um toque tomado, influenza encostada e nada acontecendo. Não é
  exploit, porque parada o mundo anda a 5% e a cota não enche; é limbo. Fica registrado
  porque "regra sem número" é preferência do H, e o preço dela é este.

## Aberto com o humano

- **Bar do eixo "curva de tensão".** `TASTE-LOOP.md` §4 exige um padrão externo por eixo, e
  este — o que está falhando — não tem. Sem ele o loop degrada para "perguntar toda rodada".
  Os outros seis estão em `TASTE.md` §1b.
- **Poderes automáticos.** Escolha do H em 01/08, contra minha recomendação, com o custo
  nomeado e aceito na hora: some a camada de draft e some a build permanente que ele tinha
  elogiado. A queixa "nem tão roguelike quanto a proposta" veio na mesma sessão. Vale
  reabrir — mas **depois** de a próxima leitura ter número, não antes.

## Vindo do tema, como mecânica e não como arte

- **Patógeno que pune velocidade.** Hoje correr é sempre certo. Algo que só possa ser
  engolido devagar inverteria o eixo e faria a velocidade ser escolha em vez de default.
- **Ciclagem de paleta além do plasma.** A máquina existe (`cycledPalette`); hoje só o
  fundo usa. Membrana pulsando por troca de tabela sai de graça.

## Conhecido e adiado de propósito

- **Palette swap de dano assado.** O flash usa `tint` do Pixi, a única multiplicação de cor
  do render. Assar a folha vermelha do jogador custa 192 quadros e não muda jogo nenhum.
- **Arte desenhada à mão.** O pipeline em `sprites.ts` é o ponto de troca: a interface é
  uma matriz de índices de paleta por quadro.
- **Mobile sem controle de toque.** O alvo inclui mobile; o slice só tem teclado.
- **Áudio.** Nada ainda.
- **Fase 2 do harness.** Gatilho em `HARNESS.md` §7: mesmo eixo subjetivo julgado mais de
  duas vezes por semana. `npm run shot` e `npm run rec` já cobrem parte do rig de captura.
- **Empacotamento.** Tauri e Capacitor só depois do slice aprovado — `CLAUDE.md` §5.
