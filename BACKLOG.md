# BACKLOG.md

O que está aberto. O que está assentado vive no `DECISIONS.md` — misturar os dois é como
log de decisão morre.

**Reescrito por inteiro em 02/08, no fim da sessão das fases.** A versão anterior descrevia
a leva A no meio do caminho, cinco doenças por vir e uma fila de oito itens que o H cortou
de propósito. `DECISIONS.md` guarda o histórico; este arquivo guarda só o presente.

---

## Aberto agora

**PORTÃO: 0 STRIKES de 3.** Conta **"não"**, não "sim" — três *não* seguidos derrubam a
tese (31/07). Zero é o melhor estado possível, não o pior. **Quatro leituras em 02/08 e
nenhum strike gasto:**

| leitura | o quê |
|---|---|
| **SIM** (core do tecido) | morreu em 85,4s, 9,9s na tela, apertou R, segunda run |
| **SIM** (formato de FASES) | morreu em 131,3s, apertou R **3,2s depois**, e na segunda fechou a fase na onda 4 |
| NULA (filho, 1º externo) | não apertou, mas o pai encerrou por compromisso dele |
| NULA (última run) | morreu por tecido em 226,3s e não apertou — mas encerrou a SESSÃO, não a partida |

Reproduzir qualquer uma com `npm run gate replays/<arquivo>.json`. Atualizar esta linha na
mesma vez que a leitura chegar — a definição está no `DECISIONS.md` (31/07), o contador
mora aqui.

**A métrica está em revisão.** Com fases, "segunda partida" mede REPETIR quando o sucesso
virou AVANÇAR. Proposta em aberto, do `DECISIONS.md` de 02/08: *"a fase seguinte, sem
ajuda"* — o jogador atravessa a fase 1 sem ninguém explicar e vai para a 2 por ato próprio;
"não" é largar dentro da fase 1 ou precisar que expliquem. **Não foi ratificada pelo H.**

## Fora do tema, a pedido do H — o deploy e o iPad (05/08)

Sessão pedida antes de retomar o relógio lento. Estado: **fechado, faltando a validação no
aparelho de verdade.**

O jogo não abria no Netlify por **`await` no topo do módulo de entrada** — impasse circular
que só existe depois do empacotamento e cujo sintoma é tela preta com console limpo. Os 92
testes, o `tsc`, o `npm run dev` e o `npm run shot` estavam todos verdes, porque nenhum
deles abre o `dist`. Detalhe e regra em `DECISIONS.md`, 05/08.

**A dívida de determinismo, aberta e FECHADA na mesma sessão.** As seis falhas de
`tests/determinism.test.ts` eram anteriores; bisseccionadas até `68fb8fd`, o pivô das fases,
que atualizou o `slice.test.ts` e esqueceu este. **99 testes verdes agora.**

O determinismo em si nunca esteve quebrado — o que apodreceu foi o registro. Por isso o
conserto não foi só trocar cinco números:

- a fixture `core-atual.json` foi **regravada**, porque depois das fases a run parou de
  morrer e ela perdeu a única coisa que a torna especial (mesmo modo de falha de 02/08);
- o `npm run rec` também estava para trás: reiniciar cai no CARD e ele só apertava `R`.
  Agora dispensa o card e **recusa** escrever fixture que não cobre morte e reinício em NODE;
- o `npm run rec` passou a verificar **browser contra node** por testemunhas (tick, hash)
  colhidas do HUD — 15 bateram;
- a **âncora ganhou teste próprio**: mexer em `tuning.json` derruba o teste na hora, com o
  remédio na mensagem. Verificado mexendo em `time.creep`.

## Rodada de DIREÇÃO, 05/08 — o H passou o volante

Ele pediu: *"assuma o controle da direção, resolva os itens acumulados"*. O que segue são
calls minhas. Todas reversíveis; a principal, num número.

**O diagnóstico é medido, não opinado** (`npm run pace`, 05/08), e refuta a hipótese com
que eu abri a sessão — eu ia argumentar que parar era dominante, e a `curandeira` morre 5/5:

| achado | evidência |
|---|---|
| o campo tinha DOIS atratores e a **seed** escolhia qual | mesma política: seed 7 fecha 3 fases a 3%; seed 99 morre a 100% |
| o patógeno **não é ameaça** | `perigo 0.0s` em 10 runs móveis; 0 mortes por toque em 15 runs |
| o dilema central **não existia** | matar limpava o campo, curar não. Parar nunca era certo |

O terceiro explica os outros dois e explica três sessões de tuning que não pegaram: enquanto
tudo que a cura faz o abate também fizer, e mais rápido, **nenhum valor** de `auraFocusHeal`
cria dilema. Era estrutura, não número.

**A resposta: NECROSE**, o ratchet. Quatro regras em `src/sim/field.ts`. A terceira cria o
dilema (só a presença desfaz cicatriz); a quarta impede que ele vire espiral (tecido morto
não pare) e transforma "deixar cicatrizar" em triagem legítima — pagar o chão para parar a
reprodução.

**Resultado medido:** a política que ALTERNA passa a ganhar. Empatava com a agressiva sem
necrose (1,8 vs 1,6 fases), abre vantagem com ela (**2,4 vs 1,6**). Run média 305s → 164s,
alvo ~120s. Caso nulo (`necroseAmount: 0`) reproduz o baseline anterior seed por seed.

### O que segue aberto DESTA rodada

- **Nada disto foi jogado por humano.** O bot mede estrutura, não sensação. É a leitura que
  falta, e é a única que decide se a rodada valeu.
- **`perigo 0.0s` continua.** Não toquei: é outro eixo, e §3.1 diz um eixo por rodada. Mas é
  a maior superfície não usada do jogo — seis doenças sem consequência de risco — e é a
  minha recomendação para a rodada seguinte.
- **`auraFocusHeal` continua 9.0**, de propósito. O H disse que traria a ideia dele.

## Tema anterior, agora respondido — a relação com o relógio lento

O H cortou todo o resto para focar aqui: *"o que estamos fazendo agora define todo o futuro
desse game"*. Memória imunológica, cor de doença na colônia, dinâmica das outras quatro
doenças, paleta por fase e regravação dos replays **saíram da fila** e não são dívida.

**A causa, medida:** matar exige VELOCIDADE, curar exige LENTIDÃO e sobretudo PRESENÇA. As
duas tarefas disputam a mesma variável em direções opostas e o mesmo corpo no mesmo lugar.
Isso produziu ponto fixo: uma run de 716,4s com 3.799 abates, três vidas intactas, campo
nem limpo nem estourado.

**A resposta escolhida (opção 1 de três):** a aura deixou de multiplicar a cura do jogador
e passou a PLANTAR um foco que trabalha sem ele. Teto de 2 focos, para plantar ser escolha.

### 1. O foco plantado é IRRELEVANTE em magnitude — primeiro item da próxima sessão

Medido no replay dele, com `scratchpad`/instrumentação do `npm run gate`:

- foco planta **~4/s** de cura contra **~867/s** de veneno entrando: **0,4%**
- a cura do jogador PARADO é **245/s** — o foco é **27x mais fraco** que simplesmente ficar
- ele plantou **12 focos** e deu **8 arrancos** em 226s, então USOU a mecânica
- focos ativos em média: **0,41** de um teto de 2

Não é que ele não percebeu: **não havia o que perceber.** `auraFocusHeal` foi escolhido
como `9.0` sem âncora nenhuma — o mesmo erro de granularidade que trocou `sourceRate` por
`poison` horas antes e derrubou a pressão da doença em 4x.

**Respondido em 05/08, e não por número.** A medição mostrou que o problema era anterior ao
valor: o foco era irrelevante porque a CURA era irrelevante — matar fazia tudo que curar
fazia, mais rápido. Com a necrose o foco passa a ser presença plantada, a única forma de
trabalhar num lugar onde você não está, e o teto de 2 vira triagem. **`auraFocusHeal`
continua 9.0**: o H disse que traria a ideia dele para esse número, e afiná-lo agora seria
decidir no lugar dele.

### 2. O mesmo botão faz duas coisas e nada na tela diz qual aconteceu

Arranco e aura saem do mesmo espaço, decididos pela velocidade, sem retorno visual que os
distinga. Candidato forte a parte da causa de "não consegui perceber a efetividade".

### 3. Não verificado por olho: pulso da pontuação e rótulos do build

Implementados e cobertos por tipo, mas a captura automatizada não os mostra — o bot não
mata e não tem poder, então os dois ficam em zero. Depois de seis defeitos visuais achados
por captura nesta sessão, isto não conta como pronto.

**Parcialmente destravado em 04/08 por `npm run olho`**, que despeja qualquer folha assada
em luminância no terminal, sem browser e sem bot. Ele mostra a ARTE; a captura mostra a
CENA. Estes dois itens são de HUD em estado de jogo, então continuam dependendo da captura
— o que mudou é que a arte deles pode ser conferida antes.

## Achados do olho, 04/08 — fora do tema, decisão do H

- **`organSheet` é assado por ninguém.** Exportado em `sprites.ts`, 6 quadros de 58x58, e
  não é chamado por `atlas.ts` nem por nada em `src/`. Ou tem uso previsto e nunca foi
  montado, ou é código morto. Não foi apagado.
- **A necrose da colônia é uma treliça regular de 4 px sobre a arena inteira.** No nível 1 o
  corte é `bayer(x, y) < 0.10`, que acende sempre as MESMAS 2 das 16 posições da célula de
  Bayer; o tile é 20x20, múltiplo de 4, então o padrão atravessa os tiles sem quebrar. Pode
  ser o dither ordenado fazendo o trabalho dele — mas é o tipo de coisa reprovada como
  xadrez em 01/08, e a captura não a mostra isolada. Ver antes de mexer.

## Vindo do ateliê e ainda NÃO trazido

O `~/development/atelie` é fonte, não fork (`DECISIONS.md`, 04/08). Entraram a régua de
distância e o olho em terminal. Ficaram em espera, nesta ordem:

- **Travas contra AUSÊNCIA.** É o `frontSprite` de 02/08 virado em regra: a folha promete
  rampas, e alguma delas tem que aparecer na tela. Três vias foram levantadas e a escolhida
  ainda não foi decidida pelo H — a recomendação é **decodificar o PNG da captura** (~70
  linhas, `node:zlib`, sem dependência nova, sem mexer no `renderer.ts`), porque a lista de
  montagem confiável é o que saiu na tela, não uma segunda descrição do que deveria sair.
  As outras duas: compor um campo indexado headless (duplica o `renderer.ts` e diverge dele)
  e trava estática de montagem (não pegaria o caso real — o `frontSprite` ERA referenciado).
- **A folha declarar o próprio contrato** (`rowSpan`, `rowMargin`, `crossRowDistinct`). Só
  passa a valer quando existir aqui uma folha cujo contrato não seja o global de hoje — por
  exemplo linha girada em runtime, que encosta na borda por PREÇO da técnica e não por
  defeito.

Fora de escopo por decisão: bancada com knob, paleta por estilo, tabela de mistura em
espaço de índice. `volume.ts` e `rig.ts` são lembrete, não fila.

## Dívida técnica

- ~~**6 testes de determinismo vermelhos.**~~ Fechado em 05/08. Este item contradizia, no
  MESMO arquivo, a seção que já dizia "99 testes verdes" — defeito de `TASTE-LOOP.md` §3b.4,
  e do tipo mais caro: prosa sobre restrição morta soa estranha, número velho lê bem.
- **O bot não usa a aura.** Ele nunca aperta o impulso parado, então `npm run pace` não
  mede nada do foco plantado. Segue aberto e ficou MAIS caro em 05/08: com a necrose, o
  foco passou a ser a única forma de trabalhar onde você não está, e é justamente isso que
  o bot não sabe fazer. A política `triagem` mede o gesto de parar, não o de plantar.
  Reproduzir tudo com `npm run pace` (05/08).

## Aberto com o humano

- **Bar do eixo "curva de tensão".** `TASTE-LOOP.md` §4 exige um padrão externo por eixo, e
  este — o que está falhando — não tem. É a dívida mais antiga do projeto. Os outros seis
  estão em `TASTE.md` §1b.
- **A métrica de portão para o formato de fases**, acima.
- **Dados epidemiológicos no card.** Ele adiou: "depois eu vejo se isso melhora o jogo".
  Regra já acordada se voltar: ordem de grandeza, com ano e fonte, nunca inventados.

## Vindo do tema, como mecânica e não como arte

- **Ciclagem de paleta além do plasma.** A máquina existe (`cycledPalette`); hoje só o
  fundo usa. Membrana pulsando por troca de tabela sai de graça.
- **A moldura maior que o H propôs e ainda não foi trabalhada:** o jogo em tempo normal é
  glóbulo contra patógeno; o jogo em tempo lento seria OUTRO, combater a dispersão do limo.
  A opção 1 é um primeiro passo nessa direção, não a resposta inteira.

## Conhecido e adiado de propósito

- **Palette swap de dano assado.** O flash usa `tint` do Pixi, a única multiplicação de cor
  do render. Assar a folha vermelha do jogador custa 192 quadros e não muda jogo nenhum.
- **Arte desenhada à mão.** O pipeline em `sprites.ts` é o ponto de troca: a interface é
  uma matriz de índices de paleta por quadro.
- **iPhone: a tela do Safari não some.** O botão de tela cheia é detectado por recurso e o
  iPhone **não implementa a Fullscreen API** (o iPad implementa), então lá ele nem aparece. O
  caminho que funciona é **Adicionar à Tela de Início** — o `apple-mobile-web-app-capable` já
  está no `index.html`, e em modo standalone a barra some e a altura útil volta a 390, o que
  sobe a escala de 2,83 para 3,25. Não há como forçar isso por código; é gesto do usuário.
- ~~**Mobile sem controle de toque.**~~ **Fechado em 05/08.** Manche flutuante na metade
  esquerda, impulso na direita, instruções trocadas por esquema de entrada, escala inteira
  contada na grade física. Verificado em iPad deitado, iPad de pé e telefone emulados, e o
  desktop está medido como inalterado. Falta a validação no aparelho de verdade — o H
  valida no iPad dele.
- **Áudio.** Nada ainda.
- **Fase 2 do harness.** Gatilho em `HARNESS.md` §7: mesmo eixo subjetivo julgado mais de
  duas vezes por semana. `npm run shot` e `npm run rec` já cobrem parte do rig de captura.
- **Empacotamento.** Tauri e Capacitor só depois do slice aprovado — `CLAUDE.md` §5.
