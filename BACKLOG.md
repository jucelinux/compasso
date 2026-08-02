# BACKLOG.md

O que está aberto. O que está assentado vive no `DECISIONS.md` — misturar os dois é como
log de decisão morre.

Reescrito por inteiro em 01/08. A versão anterior descrevia um jogo que não existia mais:
falava de tela de escolha, de `textures.ts`, de bot imortal e de salto gráfico por shader,
todos superados. `DECISIONS.md` guarda o histórico; este arquivo guarda só o presente.

---

## Aberto agora

**PORTÃO: 0 de 3, desde 01/08.** Zerado quando o core mudou; nenhuma leitura de segunda
partida voluntária foi tomada contra o tecido. Atualizar esta linha na mesma vez que a
leitura chegar — a definição está no `DECISIONS.md` (31/07), o contador mora aqui.

- **Balanço do tecido é de primeira mão.** Baseline atual, medido em 02/08 com
  `crowdDrag` em 0.3: agressiva 87s, ritmo 91s, contra alvo de ~120s, 4,4 a 5,0 fases por
  run, 5 de 5 seeds morrem. Jogável e ainda curto; nunca foi afinado com humano.
  _Os números de 157s/266s que este arquivo trazia eram de um tuning anterior e conviviam
  com um segundo baseline contraditório (75-89s) no mesmo arquivo. Unificados em 02/08._
- ~~A camada de profundidade ficou fraca~~ — **estava ausente, não fraca.** O
  `frontSprite` era criado e tinha a textura trocada 60 vezes por segundo sem estar em
  container nenhum. Corrigido em 02/08, junto com a reescrita da textura: corpo vazado em
  dither com borda sólida acesa, para ocluir sem esconder o jogador. **A densidade dela
  ainda não passou por você** — `FRONT_KEEP` e a contagem em `tissueFront` são os dois
  números, e "ainda menos espaço vazio" é chamada de olho, não de teste.
- **O balanço do campo nunca passou por humano.** Os números do `npm run pace`
  saem de um bot cru (heurística: cura se o chão está sujo e não há fonte a menos
  de 90px). As runs curtas podem estar certas para ele — só ele decide.
- **A colônia não tem cor de doença.** Hoje toda infecção é verde. Com fase = doença, ela
  devia herdar a rampa do patógeno dominante — a máquina já existe (`KIND_RAMP`).
- **O card de apresentação da fase ainda não existe.** Aprovado na conversa de 01/08 e não
  implementado: sprite animado grande, nome real, características. Os sprites e a fonte já
  estão prontos, é montagem.
- ~~O jogo é lotado, mas não é perigoso~~ — **atacado e medido em 02/08.** A causa era 82%
  da run acima de 0.78 de velocidade com cinco dos seis `engulfSpeed` abaixo disso. O
  atrito do tecido derrubou o teto em tecido são para 0.7 e cruzou os limiares: o tempo em
  posição de tomar dano foi de **0,0s para 9,5s (agressiva) e 14,4s (ritmo)**. Aparece em
  DEGRAU, não em rampa — abaixo de `crowdDrag` 0.3 o teto não cruza nada e o perigo é zero.
  **Falta a leitura humana**, que é a única que diz se virou desafiador ou só irritante.
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

## EM CURSO — leva 2 do ciclo de 02/08

Pedido dele, nesta ordem. A leva 1 (campo, paleta, atrito) está entregue.

1. ~~O plano único, no render~~ — **entregue e fechado em 02/08.** Hemácias como corpos
   empurráveis a 90 px² por célula (varredura dele, 144fps em toda a faixa), com
   respiração local e corrente global em tempo de mundo. `tissueBed` e `tissueFront`
   apagados. O fundo deixou de ser preto: o plasma agora deriva do `HEM0` da paleta em
   vigor, então é hemácia fora de foco em vez de vazio. Fibrina atrás, detrito na frente.
   O batimento do fundo e a respiração do tecido aceleram com a infecção, e o decaimento
   da hemácia para no vermelho escuro em vez de chegar ao preto.
   _Ainda não confirmado por ele, e nenhuma das duas coisas aparece em captura: se a
   respiração LÊ como vida, e se o batimento acelerando LÊ como colapso. A medição por
   diferença de pixels não isola nada — a ciclagem de paleta sozinha repinta 96,6% do fundo._
2. **Card de apresentação da fase e UMA doença por fase.** Aprovado duas vezes por ele,
   em 01/08 e 02/08. A doença escolhida para validar a tese é a **E. coli**, por fissão
   binária ser a única dinâmica legível sem texto — você VÊ o foco dobrar.
3. **As duas funcionalidades novas do core.** Parada: pulso que ATRAI patógeno. Em
   movimento: abates encadeiam com o limiar de engolir subindo junto.
4. **Draft de powerup reativo.** Escolher contra o que se observou da doença.

## DESENHO DE REFERÊNCIA — fases com identidade

_Aprovado por ele em 01/08 e desenhado nesta conversa. Está aqui inteiro de
propósito: a sessão que pegar isto não precisa da conversa que o originou._

A queixa exata: **"os inimigos memoráveis são aqueles que lembramos, que nos
esforçamos para entender sua estratégia e que merece ser derrotado. Do jeito que
está não tem memória, nem identidade — é mais um 'vai na direção dele que você
mata'."**

**1. Uma doença por fase.** A `spawnTable` que mistura 3-5 tipos por onda sai.
A fase 4 É a Salmonella. Consequência dura: cada patógeno precisa ser interessante
SOZINHO, e hoje nenhum é — eles se sustentam na mistura.

**2. Card de apresentação.** Sprite animado grande, nome real, características,
taxa de progressão. Os sprites e a fonte bitmap já existem; é montagem, não arte
nova. Console fazia isso (bestiário, intro de chefe) e cabe na tese retro.

**3. Dinâmica de campo própria por doença.** É isto que dá identidade — sem isso
o card é enfeite e as cinco doenças viram reskin com números diferentes, que é
exatamente o que ele reprovou.

| doença | dinâmica no CAMPO | pressão que cria |
|---|---|---|
| Influenza | alastra rápido e raso | volume: não dá pra descansar, mas cada abate é barato |
| E. coli | fissão binária, o foco DOBRA | prioridade: atrasar é catastrófico |
| S. aureus | o tile dela resiste à cura | custo por unidade: conter vale mais que limpar |
| Salmonella | vai ao tecido mais SADIO | posicional: defender, não caçar |
| SARS-CoV-2 | imune a indireto, exige 0.92 | você tem que ir lá, pessoalmente |

**4. Memória imunológica como conquista da fase.** JÁ DECIDIDO em 31/07
(`DECISIONS.md`: *"powerup = aprender um patógeno"*), com a condição
*"não implementar antes do movimento orgânico entrar"* — satisfeita em 01/08.
Vencer a fase da Influenza baixa permanentemente o `engulfSpeed` dela pelo resto
da run. Você não fica mais forte em geral; fica imune ÀQUILO. Isso devolve a
build dentro da run que sumiu com a tela de escolha, sem ressuscitá-la.

**Custo declarado:** o gate zera de novo, porque a estrutura da fase muda.

## Aberto com o humano

- **Escolha da paleta.** Sonda de 02/08, quatro idiomas materialmente diferentes:
  `arterial` (o de hoje), `campo-escuro` (turquesa fria de microscópio), `gram` (magenta
  do corante real) e `ambar` (fósforo de CRT). Amostras em `shots/paleta-*.png`, e
  jogáveis com `npm run dev` + `?palette=<nome>`. Só o AMBIENTE muda em cada uma —
  jogador, patógeno e colônia ficam onde estão, senão a reação não é atribuível à cor.
- **Densidade da camada da frente.** Ela existe desde 02/08 e nunca foi julgada por você.
  Mais densa dramatiza e esconde; menos densa some. É chamada de olho.
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
