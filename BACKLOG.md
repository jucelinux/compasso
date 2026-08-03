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

## O ÚNICO tema aberto — a relação com o relógio lento

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
`poison` horas antes e derrubou a pressão da doença em 4x. **Proposta: ancorar numa fração
do `healRate` do jogador (245), não em valor solto.** Ele tem uma ideia própria e vai
trazer; não afinar antes de ouvi-la.

### 2. O mesmo botão faz duas coisas e nada na tela diz qual aconteceu

Arranco e aura saem do mesmo espaço, decididos pela velocidade, sem retorno visual que os
distinga. Candidato forte a parte da causa de "não consegui perceber a efetividade".

### 3. Não verificado por olho: pulso da pontuação e rótulos do build

Implementados e cobertos por tipo, mas a captura automatizada não os mostra — o bot não
mata e não tem poder, então os dois ficam em zero. Depois de seis defeitos visuais achados
por captura nesta sessão, isto não conta como pronto.

## Dívida técnica

- **6 testes de determinismo vermelhos.** As fixtures foram gravadas antes do card e não
  jogam mais: o input delas nunca dispensa a apresentação, então elas não jogam em vez de
  jogarem diferente. Trocar o hash esconderia isso. Os replays humanos de 02/08 continuam
  válidos contra o build `73f423d`, que é por isso que carregam gitSha. Regravar quando a
  mecânica do relógio lento assentar.
- **O bot não usa a aura.** Ele nunca aperta o impulso parado, então `npm run pace` não
  mede nada do que foi construído no fim de 02/08. Os 274/305/208s de lá descrevem um jogo
  sem foco plantado.

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
- **Mobile sem controle de toque.** O alvo inclui mobile; o slice só tem teclado.
- **Áudio.** Nada ainda.
- **Fase 2 do harness.** Gatilho em `HARNESS.md` §7: mesmo eixo subjetivo julgado mais de
  duas vezes por semana. `npm run shot` e `npm run rec` já cobrem parte do rig de captura.
- **Empacotamento.** Tauri e Capacitor só depois do slice aprovado — `CLAUDE.md` §5.
