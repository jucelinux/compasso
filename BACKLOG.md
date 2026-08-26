# BACKLOG.md

O que está aberto. O que está assentado vive no `DECISIONS.md` — misturar os dois é como
log de decisão morre.

**Reescrito por inteiro em 02/08, no fim da sessão das fases.** A versão anterior descrevia
a leva A no meio do caminho, cinco doenças por vir e uma fila de oito itens que o H cortou
de propósito. `DECISIONS.md` guarda o histórico; este arquivo guarda só o presente.

---

## A rodada de 13/08 — a progressão trocou de formato

Chamada do H, decisão dele, trazida pronta: **o formato onda → upgrade saiu.** Não estava
funcionando. No lugar entrou um respiro de 3 segundos entre ondas, e a E. coli ganhou uma
progressão de **10 ondas** no lugar de 4. As outras cinco doenças ficaram dormentes.

O que segue é o que a rodada DEIXOU ABERTO — o que assentou está no `DECISIONS.md`.

### 1. O upgrade estava carregando a run, e ninguém sabia — PRIMEIRO ITEM

Medido, `npm run pace`, 4 políticas × 5 seeds, contra o worktree de `f7f7dcb`:

| | com recompensa (até 12/08) | sem recompensa (hoje) |
|---|---|---|
| agressiva | 1,6 ondas | 0,6 |
| ritmo | **2,4** | 0,8 |
| curandeira | 0,0 | 0,0 |
| triagem | 1,8 | 0,8 |

**Nenhuma seed de nenhuma política passa da onda 3.** O corte é de ~2/3, e ele é da
recompensa saindo — não da curva: o caso nulo (`curva: []`, fórmulas de 08/08) dá
0,8/0,8/0,0/0,6 contra 0,6/0,8/0,0/0,8 da curva. As ondas 1-3 são iguais de propósito.

**RESPONDIDO no fim do dia, no item 5:** a base afrouxou. `fissionSeconds` 3,0 → 8,0 devolve
2,0 ondas às políticas móveis — acima até do que a recompensa entregava. O upgrade não voltou;
o que substituiu a folga que ele dava foi a colônia dobrar mais devagar.

Fica registrado que os dois efeitos foram medidos SEPARADOS, em commits separados, e é só por
isso que dá para dizer qual fez o quê.

**E o bot entende menos deste jogo do que entendia:** ele nunca planta foco (dívida antiga,
mais abaixo), e desde a necrose o foco é a única forma de trabalhar onde você não está. O H
já limpou fases que o bot não limpa. O número acima é piso, não veredito.

### 2. As ondas 4 a 10 são DESENHO, não medição

Depois do rebalanceamento o bot chega à onda 3 (`fases` 2,0). Os sete degraus de cima
continuam sem rodar. A curva está travada por teste contra o defeito que dá para travar —
degrau fora de ordem, e o degrau chegando na sim — e isso não é a mesma coisa que ela estar
certa.

**A primeira leitura que vale é humana.** É a única coisa que esta rodada precisa.

### 3. O que a decisão deixou dormente, de propósito

`powers.ts`, `activeStats`, `owned`/`active`, `buildOrder` e o caminho da cápsula continuam
inteiros e sob teste. Com `drops.chance` em 0 e sem tela de escolha, **não existe mais
caminho para `owned`** — a camada roguelite do pitch está desligada.

Há teste travando isso (`conter uma onda NÃO paga poder`), e ele existe para que a sessão
que "consertar" isso saiba que está revendo uma decisão, não corrigindo um bug.

**Aberto com o H:** poder volta por outra porta, ou sai do jogo? Ele não disse, e eu não
decidi no lugar dele.

### 4. A DILATAÇÃO FOI DESLIGADA — toggle, não remoção

Chamada dele no fim do dia: `time.dilation: false`. A fórmula fica inteira, sob teste, e
ligar é trocar `false` por `true`. O toggle governa duas coisas — o `worldScale` (1 sempre) e
a penalidade de velocidade da cura, que deixa de valer. Limpar o limo passa a acontecer
**andando**, que era o pedido dele desde a primeira mensagem do dia.

Um insight que já tinha aparecido antes está no fim deste arquivo, e continua valendo para
quando ele religar.

### 5. FECHADO no mesmo dia: a pressão foi rebalanceada, e a alavanca foi a fissão

O H confirmou o diagnóstico com a leitura dele — no formato anterior, cada ausência de
comando de algumas centenas de ms já freava patógeno e limo; sem a câmera lenta o jogo opera
no tick normal e isso **evidencia a taxa real de combate**, sem um segundo relógio
amortecendo. E pediu rebalanceamento: *"nas taxas atuais é impossível jogar"*.

**`phases.0.fissionSeconds` 3,0 → 8,0.** Varrido, não escolhido:

| fissionSeconds | agressiva | ritmo | run |
|---|---|---|---|
| 3,0 (antes) | 0,0 | 0,0 | 179s |
| 6 | 0,8 | 0,8 | 207s |
| 7 | 1,6 | 1,8 | 164s |
| **8** | **2,0** | **2,0** | **165s** |
| 10 | 2,2 | 2,8 | 170s |
| 12 | 3,4 | 3,6 | 195s |

**Resultado final, 4 políticas:** 2,0 / 2,0 / 0,0 / 1,6 — melhor que a build que ele jogou
(0,6/0,8/0,0/0,8). `triagem` fecha em **128s**, o mais perto do alvo de ~120s que este projeto
já chegou. As 5 seeds continuam morrendo 5/5 em toda a faixa, e a `curandeira` morre em 49s:
parar segue inviável, que é o certo agora.

**O veneno foi testado e reprovado como alavanca**, e era o candidato óbvio:
`enemy.kinds.ecoli.poison` 21/15/12/9 pula de "morre em 179s" para IMORTAL (0/5 mortes em 6
min) com `fases` em 0,0 nos dois extremos — o ponto fixo de 02/08 outra vez. Veneno é cego;
fissão é monótona.

**Se ele quiser mais folga, é um número só:** 10 dá 2,2/2,8 e 12 dá 3,4/3,6, sem estagnação
em nenhum ponto medido.

**O que a curva de 10 ondas ganhou com isso:** as ondas 4-10 continuam sem medição, mas o bot
agora chega à 3 em vez de morrer na 1 — os degraus de cima deixaram de ser inalcançáveis por
construção.

### 6. A aura plantada é a última mecânica que ainda pede que você pare

`dash.auraBelowSpeed` continua exigindo velocidade quase nula para plantar o foco. O H não a
citou, e desligá-la junto seria decidir no lugar dele. Mas ela ficou sozinha: é a única coisa
no jogo que cobra imobilidade num jogo onde parar não compra mais nada — e o rebalanceamento
não a tocou, então ela segue exatamente como estava.

---

<details>
<summary>O diagnóstico original do desbalanço, mantido como registro</summary>

Medido, `npm run pace`, 4 políticas × 5 seeds:

| | com dilatação | sem |
|---|---|---|
| agressiva | 0,6 ondas | **0,0** |
| ritmo | 0,8 | **0,0** |
| curandeira | 0,0 | 0,0 |
| triagem | 0,8 | **0,0** |

Nenhuma seed de nenhuma política contém **uma onda sequer**. A causa é mecânica e mensurável:
todo avanço da doença — fonte, alastramento, necrose, fissão, parto — roda em
`max(field.idleProgress, worldScale) × dt`. Esse fator, medido no jogo real, era **0,55–0,58**
nas três políticas móveis. Agora é **1,000**. A doença ficou ~1,8x mais rápida.

O tuning da doença nunca foi escolhido contra 1,0 — foi afinado, sessão após sessão, contra
um mundo que corria a pouco mais da metade. Desligar o relógio não mudou um número da doença
e mudou a pressão dela toda.

**Não compensei, de propósito** (`TASTE-LOOP.md` §3.1, um eixo por rodada): mexer no balanço
no mesmo commit do toggle deixaria as duas leituras impossíveis de separar.

**A alavanca, quando ele quiser:** é uma só e não precisa de número novo — reintroduzir o
fator ~0,57 como constante do relógio da doença devolve exatamente o balanço contra o qual
tudo foi afinado. As outras vias (mexer em `sourceRate`, `fissionSeconds`, `spreadSeconds`
separados) são o erro de 02/08 outra vez: três números onde o problema é um.

**Efeito colateral no rig:** com `fases 0,0` em todas as políticas, o bot perdeu a métrica
que usava para comparar direção. Ele ainda mede duração, infecção e cicatriz, mas "quantas
ondas essa política contém" virou zero em todas — e zero não distingue nada.

**Nota de fechamento:** a recomendação acima — reintroduzir o 0,57 como constante do relógio
da doença — NÃO foi o caminho escolhido. Ela devolveria o balanço antigo escondendo a taxa
real atrás de um multiplicador, e é justamente a taxa real que o H disse querer ver. A
varredura mostrou que uma alavanca só, no número que já existia e diz o que faz, chega mais
longe. A intuição estava certa na magnitude e errada no lugar.

</details>

---

## Aberto agora

**PORTÃO: 0 STRIKES de 3** — *"a dilatação é lida sem explicação"*, escolha do H em 08/08.
Conta **"não"**, não "sim": zero é o melhor estado possível. Definição no `CLAUDE.md`.

> **SUSPENSO desde 13/08, por construção — e isto precisa de decisão dele.**
>
> O portão mede se um estranho lê a dilatação jogando. A dilatação está **desligada**
> (`time.dilation: false`), então não há o que ler: um jogador externo hoje não pode produzir
> "sim" nem "não", porque a linha que o portão pergunta não está no jogo.
>
> Isso **não é um strike** e não pode virar um. Strike é "jogou e não entendeu"; aqui é
> "não havia o que entender", que é nulo pela mesma regra de 02/08. Contar como "não" seria
> matar a tese com um número que mede a ausência dela.
>
> **O contador congela em 0 de 3 enquanto o toggle estiver desligado.** Ele volta a andar no
> dia em que o relógio voltar. A alternativa — trocar a régua por outra enquanto isso — é
> chamada do H e não minha: em 08/08 ele reabriu o conceito inteiro justamente porque a régua
> anterior tinha sido invenção do modelo sob delegação.

Leitura só existe quando **alguém de fora joga sem ninguém explicar**. "Não" = encerrou sem
entender que o tempo responde ao movimento, ou precisou que explicassem. Nula continua sendo
parada por motivo externo. **Em dia sem jogador externo não há nada a conferir aqui** — isso
é do desenho, não descuido.

**Substitui a régua ratificada em 05/08** (*"a fase seguinte, sem ajuda"*), que era chamada
do modelo sob delegação. Em 08/08 o H reabriu o conceito inteiro, considerou removê-lo, e
escolheu esta entre duas propostas. O critério que decidiu: **um portão só se paga se puder
SURPREENDER quem é dono da decisão de matar** — e a régua de 05/08 falha nisso, porque o H
produz aquela leitura sozinho e já sabe a resposta.

Contador zerado. As duas evidências que sobrevivem como CONTEXTO, não como strike: o filho em
02/08 não leu a dilatação (seria "não" hoje), e a esposa leu — mas assistindo, não jogando.

## A publicação no itch.io — 26/08

Chamada do H: o jogo vai para o itch.io, e para isso o TEXTO DE TELA passou a ser inglês
(código e log continuam em português). O que assentou está no `DECISIONS.md`; a página, com
tagline, campos do formulário e corpo pronto para colar, está no `ITCH.md`.

**O que a rodada deixou aberto:**

1. **A tagline do projeto não descreve o build, e a página teve que dizer outra coisa.** O
   pitch é *"time only moves when you move"* e `time.dilation` está `false` desde 13/08 —
   pôr a frase na loja venderia uma mecânica que o jogador não encontra. A página foi escrita
   sobre o que EXISTE (mover é atacar, curar é atravessar, conter é vencer), e a versão com a
   dilatação ligada está pronta no fim do `ITCH.md` para o dia em que o toggle voltar.
   **Ligar ou não é chamada dele.**
2. **Publicar não destrava o portão.** Ele mede a dilatação sendo lida, e a dilatação não
   está no jogo: visitante do itch hoje produz nulo pela mesma regra de 02/08. O que a
   publicação abre é o CANAL — estranhos jogando sem ninguém explicar, que é o insumo que o
   método não consegue fabricar. Ele passa a valer no dia em que o relógio voltar.
3. **Falta a capa 630x500 e um GIF curto.** O itch exige capa para a listagem e nenhuma
   captura de `shots/` está nessa proporção. Sem elas a página sobe, mas não aparece bem.

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

## INSIGHT para o relógio lento, 13/08 — a pedido dele

Ele pediu que eu traga função importante para a dilatação quando eu achar uma. Achei uma
enquanto construía o respiro, e ela vem de um defeito que eu mesmo criei.

**O respiro é o único momento do jogo em que o tempo NÃO responde ao movimento.** São 3
segundos em que o tabuleiro está montado, visível e congelado, e você não pode fazer nada. É
o oposto exato da tese, e ele foi introduzido sem que ninguém decidisse isso.

Isso abre a via mais direta que já apareceu para o portão — *"a dilatação é lida sem
explicação"*. Hoje o creep é 0.05 e o jogo nunca para, então **um jogador de fora nunca vê o
contraste**: ele vê tudo devagar, acha que o jogo é devagar, e nada denuncia que a
lentidão é dele. O respiro é o primeiro estado do jogo com tempo VERDADEIRAMENTE parado — e
um estado parado ao lado de um estado que anda é o que torna a regra legível.

**A proposta concreta, para ele decidir:** em vez de a contagem correr sozinha, ela corre no
RELÓGIO DO MUNDO — o jogador pode se mexer durante o respiro, e mexer-se faz a contagem
andar. Parado, ela quase congela; a toda, ela passa em 3 segundos. O jogador aprende a regra
inteira num lugar sem risco, sem texto e sem ninguém explicando: *ele quer começar, e
descobre que só começa se andar.*

**Não implementei.** Três razões, nesta ordem: o H disse que mantém a dilatação como está por
enquanto; a contagem que eu entreguei é a que ele pediu, literalmente ("contagem de 3
segundos"); e mudar isto anula a garantia de que o respiro é de graça, que é o que faz ele
ser respiro. É proposta, não pendência.

**Custo declarado se ele topar:** perde-se o "os 3 segundos duram o mesmo para todo mundo" (há
teste travando exatamente isso, e ele cairia de propósito), e o respiro passa a ter uma
decisão dentro — o que é ganho ou perda dependendo do que ele quer que o respiro seja.

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

## Conferido OLHANDO, 13/08 — e o que a captura pegou

A tela do respiro é código novo, e o `TASTE.md` §2b diz que os meus defeitos visuais são de
POSIÇÃO E ORDEM — a classe que passa por revisão de código e por teste verde. Passou mesmo:
124 verdes e dois defeitos na primeira captura.

1. **Três textos empilhados no mesmo ponto.** O aviso flutuante `FASE N CONTIDA` disparava
   ao virar a onda. Até 12/08 a onda virava quando você CONFIRMAVA a recompensa, então ele
   flutuava por cima do jogo já recomeçado; com o respiro, a onda vira no instante da
   contenção e o aviso passou a nascer em cima da tela do intervalo. O texto saiu — quem
   anuncia agora é a tela, que está sempre no mesmo lugar. Os estouros de partícula ficaram.
2. **O dígito da contagem caía em cima do jogador.** Escala 4 a partir de `cy - 34` descia
   até `cy - 6`, e o corpo mora em `cy` com 20px. O bloco subiu 18px.

**Como a tela foi alcançada, e o que isso custou de honestidade:** nenhum passeio roteirado
contém onda mais — nem o do `shot`, nem o do `rec`, em três seeds. Foi preciso um
`tuning.json` de sonda (sem spawn, sem fissão, `winFraction` 0.9), aplicado e revertido. Que
o jogo esteja duro demais para os próprios roteiros do rig é dado, não detalhe: é a mesma
coisa que o bot diz, por outro instrumento.

**O que NÃO foi conferido olhando:** a contagem indo de 3 a 1 na tela. Cada `shot()` custa
mais de um segundo, então dois quadros seguidos caem em respiros diferentes e os dois
mostram "3" — eu quase li isso como "a contagem não anda". Está coberto por teste
(`o dígito da contagem faz 3, 2, 1`), que é o que aritmética merece; a composição é que
exigia olho.

---

## Itens e feedback, 13/08 — o que ficou aberto

Quatro pedidos do H numa tacada: o estalo do abate, a supressão na cor do limo, o
COMPLEMENTO (item novo), e animação ao consumir. Todos entregues; o que segue é o que eles
DEIXARAM em aberto.

### O COMPLEMENTO não foi medido em jogo, e o bot não consegue medir

Ele está travado por seis testes de regra — varre a filha, poupa a mãe, reinicia, segura,
não é cura disfarçada, carimba o evento. Nenhum deles diz se o item é **bom**.

E o bot não vai dizer: as políticas dele não sabem desviar para pegar cápsula, então elas
coletam por acidente quando a cápsula nasce no caminho. É a mesma cegueira já registrada
para a aura — `npm run pace` mede estrutura, e item é decisão.

**A leitura que vale é humana**, e é a mesma que falta para a curva das ondas 4-10.

### O `stunSeconds` é a fração mais chutada do dia

0,75 de uma duplicação está declarado na âncora com os limites em que ele deixa de funcionar
(abaixo de ~0,3 vira só "reinicia"; acima de ~1,5 o item para a onda pelo jogador). O que não
existe é medição dentro dessa faixa — a âncora diz em relação a quê, não que está certo.

### O estalo do abate não passou por captura em movimento

`npm run shot` congela um quadro, e o estalo dura ~0,2s. As três camadas foram conferidas
uma a uma no código e o anel reusa a folha do choque, que já estava em cena — mas
"conferido olhando" aqui vale menos que de costume, e o `TASTE.md` §2b diz que é
exatamente onde eu erro.

### HITSTOP fica proposto, não pendente

É o quarto ingrediente óbvio do estalo e ficou de fora por ser decisão de SIM: congelar o
mundo por alguns quadros muda o hash e, nesta cadência de abate, engasga o jogo. Se o H
quiser, o desenho é congelar só o ABATE GRANDE — a mãe, não a filha — e aí o custo se paga.

---

## O CÉREBRO e as moedas, 13/08 — o que ficou aberto

### Os upgrades ainda não existem — e isso é o pedido dele, não um corte meu

O H foi explícito: a moeda *"será usado posteriormente nessa tela inicial para upgrades
persistentes"*. Então o que entrou foi a ECONOMIA (moeda cai, é coletada, vai para o banco,
o banco aparece no hub) e não o gasto. O banco cresce e não tem onde ser gasto.

**A pergunta que o próximo passo precisa responder antes de qualquer número:** o upgrade
melhora a ESTRUTURA do glóbulo (velocidade, vidas, raio de cura) ou desbloqueia AÇÕES novas?
Ele disse "upgrades persistentes na estrutura do glóbulo branco", o que aponta para a
primeira — mas a segunda é o que costuma dar identidade a um roguelite.

### A persistência ENTRE SESSÕES não foi feita, e o custo tem nome

O banco vive na sim e some quando a aba fecha. Salvar em `localStorage` é fácil e quebra
uma coisa cara: **o mesmo replay passaria a divergir entre duas máquinas**, porque o estado
inicial deixaria de vir só da seed. O rig inteiro assume o contrário — `npm run rec` compara
browser contra node, e os cinco baselines de determinismo pressupõem que a seed basta.

A saída existe e é conhecida: tratar o saldo como ENTRADA declarada do replay, do mesmo jeito
que a seed. Não é difícil; é uma decisão sobre o formato de replay, e não cabia junto com o
resto de hoje.

### A identidade dos itens (comprimido, seringa) ficou para depois, a pedido dele

Ele mesmo adiou: *"é o nível de detalhe que mostra que o jogo foi desenvolvido com carinho"*.
Hoje os dois itens são hexágonos coloridos com halo. O pipeline aceita a troca sem mexer em
nada da sim — `dropSheet` é uma função por rampa.

### O hub não foi jogado, e o bot não pode julgá-lo

Ele atravessa o hub aceitando o vilão selecionado, porque medir a escolha exigiria uma
política de meta-jogo. É a terceira coisa da mesma família — aura, COMPLEMENTO, e agora o
hub — que só uma leitura humana resolve.

### O que aprendi hoje e vale para a próxima tela

**O `app.ticker` está parado e quem desenha é a chamada no fim do `draw`.** Qualquer atalho
que saia antes dela monta a cena e não a mostra. Custou seis diagnósticos e a resposta veio
de um retângulo magenta — quando nem ele apareceu, sobrou uma explicação só.

---

## O cérebro navegável, 13/08 — o que ficou aberto

### A leitura humana continua sendo a que falta, e agora com uma tela a mais

O hub virou um lugar que se percorre, e o bot atravessa aceitando o vilão selecionado. Nada
no rig sabe dizer se ANDAR até a órbita é um gesto bom ou uma caminhada chata — é a quarta
coisa da mesma família (aura, COMPLEMENTO, hub, e agora a navegação dele) que só uma leitura
humana resolve.

### As três fixtures humanas perderam a cobertura de morte, e isso não se recupera

`run-01` e `run-03` não saem mais do cérebro; `run-02` entra na run e o log acaba antes da
morte. Input humano não se regrava. **Toda a cobertura de morte do core atual está hoje numa
fixture só, a `core-atual.json`** — se ela parar de morrer, a suíte deixa de cobrir o fim da
run e ninguém é avisado por outro caminho. Regravar quando isso acontecer deixou de ser zelo.

O que fecharia o buraco de verdade é um replay do HUMANO no core novo, que nenhum script
grava: é o F9 na mão dele.

### O que aprendi hoje, e vale mais que a tela

**Regra que muda um gesto do jogador invalida todo instrumento que imita esse gesto.** Ao
trocar "aperte espaço" por "ande até a órbita", seis lugares do rig precisavam mudar junto,
dois não mudaram, e os dois ficaram VERDES medindo nada — a fixture de determinismo gastando
900 ticks num menu e o teste da necrose comparando dois hubs idênticos.

Nenhum dos cinco baselines denunciou. Quem denunciou foi um teste lateral: `muda o
comportamento sem editar código` parou de mudar hash ao quadruplicar o dash, porque no
cérebro não existe dash. **Teste que prova que o instrumento AINDA MEDE vale mais que teste
que compara números** — o baseline continuava batendo consigo mesmo, sobre nada.

A resposta estrutural foi tirar a regra das seis cópias e pôr numa só (`atravessa.ts`).
Sobraram duas cópias declaradas, `rec.ts` e `shot.ts`, que pilotam o browser por tecla e não
têm a sim na mão — dívida nomeada, não esquecida.
