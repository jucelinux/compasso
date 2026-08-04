# TASTE.md

Três seções, três funções. A primeira é destilada do `DECISIONS.md` e cresce com o projeto.
As duas últimas descrevem o modelo — uma o que ele puxa, outra o que ele consegue — e
existem porque a sessão de amanhã não lembra de nada disto.

---

## 1. Gosto do humano

_Destilado do `DECISIONS.md`. Máximo ~15 linhas. Reescreva por inteiro quando destilar;
não vá acumulando. **Redestilado em 02/08**, contra 171 linhas de log._

- Dificuldade vem de **encolher a folga**, não de somar inimigos. Corolário medido em
  01/08: mais coisa na tela não virou mais dificuldade, e ele apontou isso sem ver o número.
- Recusa teto. Um número que satura e para de subir é bug de design, não balanceamento.
- Legibilidade acima de tensão máxima quando os dois brigam. Prefere **regra sem número**:
  três vidas, i-frames sem timer, o corte que cai no primeiro abate.
- Pressão constante acima de puzzle. O creep nunca chega a zero.
- Recompensa em ondas, com arco — não gotejada nem só no fim.
- **Quer que o gráfico seja instrumento de direção**, não enfeite: "consigo perceber a
  dinâmica evoluindo, isso me ajuda a direcionar". Rodada sem incremento visível ele lê
  como rodada sem avanço, mesmo quando houve.
- Tema não é decoração: sugere mecânica. Morfologia real do patógeno virou comportamento.
- **Perda tem que ser visível como acúmulo, não como ausência.** Célula que some lê como
  "nada ali", e nada ali parece seguro; a doença cresce POR CIMA do leito, que continua.
- **O jogo acontece DENTRO do cenário, e "dentro" é OCUPAÇÃO DE ESPAÇO, não ordem de
  desenho.** Ele pediu três vezes — "a batalha acontece acima", "parallax descolado",
  "amontoado entre as hemácias" — e eu li camada as três. O que ele quer é atravessar
  empurrando, como numa estação de trem lotada. Quando ele disser "entre", pergunte.
- Elogia **decisão recorrente**, não feel. "Achei isso ouro" foi para a cura por região
  forçar a escolha mover-ou-parar — a primeira mecânica que ele elogiou, e não era polimento.
- Tolera cru, mas **não tolera estagnado**. "Cru e básico, mas funcional" não era queixa;
  "de tão pequeno esse incremento, não quis jogar de novo" era.
- Dá feedback em design, não em sintoma: chega com proposta de mecanismo.
- **Decide contra a minha recomendação quando o custo está nomeado**, e aceita o custo.
  Aconteceu duas vezes; nas duas ele estava exercendo direção, não discordando de técnica.
- Julga o método junto com o produto. Pediu revisão do próprio framework a cada rodada.

---

## 1b. Bar por eixo

_Um bar geral não dá gradiente. Desde 01/08 o bar é **negociado**: ele dá direção e
ambição, eu reporto o alcançável com amostra, ele escolhe o ponto — `TASTE-LOOP.md` §4._

| eixo | bar | quem declarou |
|---|---|---|
| ideia central (dilatação) | SUPERHOT | modelo, 31/07 |
| motivo de rejogar | Vampire Survivors | modelo, 31/07 |
| feel do movimento | Hyper Light Drifter | modelo, 31/07 |
| escalada em run curta | Devil Daggers | modelo, 31/07 |
| escalada de recompensa | Candy Crush | **H**, 31/07 |
| primor técnico da arte | os melhores jogos de SNES | **H**, 01/08 |
| curva de tensão | **VAZIO** | — |

**O eixo que está falhando é o único sem bar.** É a dívida mais antiga aberta com ele, e
`TASTE-LOOP.md` §4 diz o que acontece sem isso: o loop degrada para "perguntar toda rodada".

Aposentado: *primitiva como identidade / Geometry Wars* — a restrição caiu em 31/07 e a
arte virou pixel art em 01/08.

---

## 2a. Vieses declarados do modelo

Não é curiosidade: é aviso. O humano tem o direito de apontar qualquer item desta lista e
perguntar "isso é você indo pro que você gosta de novo?" — e a resposta honesta pode ser sim.

- Puxo para cortar abstração. Geralmente certo, ocasionalmente cedo demais.
- Puxo para investir em feedback antes de estrutura. Screenshake, hitstop, easing, flash.
- **Subestimo sistematicamente a necessidade de razão para rejogar.** Modo de falha previsto
  do projeto: primeiros 30 segundos ótimos, minuto 5 sem motivo pra existir.
- Sou péssimo juiz do que acabei de escrever. Minha confiança sobe justamente onde a
  verificação externa falta.
- **Trato limitação como obstáculo a contornar, não como sinal de onde meu teto é mais
  alto.** Custou três rodadas em 01/08 — ver §2b.

- **Uso limitação declarada como ESCUDO, não só como obstáculo.** Aleguei "não desenho"
  para justificar um emblema geométrico inventado — e o glóbulo já era desenhado com o
  poder aplicado em jogo. Pedir preview não era pedir arte, era pedir para eu olhar o que
  já existia. É pior que §2b: lá o erro é contornar a limitação, aqui foi me esconder atrás
  dela. _02/08, card de recompensa._
- **Invento número novo sem âncora, e o número muda o jogo.** Duas vezes no mesmo dia:
  troquei `sourceRate` 21 por `poison` 5.0 achando que só mudava de lugar (derrubou a
  pressão da doença em 4x), e escolhi `auraFocusHeal` 9.0 sem referência (saiu 27x mais
  fraco que a cura que ele já tinha, e a mecânica ficou imperceptível). _02/08, medido._

**Consequência operacional:** quando eu propuser polimento de feel antes do sistema estar
medido, isso é o viés falando. Recuse sem cerimônia.

**Segunda consequência operacional, de 02/08:** número novo nasce ancorado num número que
já existe no `tuning.json`, e eu digo em qual. Número solto é chute com aparência de
decisão.

**Terceira:** quando ele descrever COMPORTAMENTO de um organismo, checar a biologia real
antes de classificar como licença poética. Aconteceu duas vezes no mesmo dia — ele chegou a
corrida-e-cambalhota e depois a quimiotaxia por raciocínio de jogo, e as duas são a
locomoção documentada da E. coli. O que ele oferecia como concessão era fidelidade.

---

## 2b. Superfície de capacidade do modelo

_Onde o teto é alto, onde é baixo, e **que formato de restrição o levanta**. Criada em
01/08 (`TASTE-LOOP.md` §8). Toda entrada cita o artefato que a demonstrou — autoavaliação
minha não vale, porque já errei a direção com confiança total._

| | Capacidade | Evidência |
|---|---|---|
| ⛔ | **Não desenho.** Sem ferramenta de imagem. Arte à mão exige outra pessoa. | 31/07, `DECISIONS` |
| ⛔ | **Não sou juiz confiável do meu próprio teto.** Registrei "o salto é shader WebGL" como fato; o salto era animação, que o jogo tinha em quantidade zero. | 01/08, `DECISIONS` |
| ⛔ | **Não julgo o que acabei de produzir sem olhar.** 5 defeitos visuais passaram por revisão de código e 65 testes verdes. | 01/08, capturas |
| ⛔ | **Meus defeitos visuais são de POSIÇÃO e ORDEM, quase nunca de lógica.** Seis achados por captura em 02/08 e todos do mesmo tipo: véu da tela errada, moldura desenhada na frente do bicho que ela apresentava, pontuação colidindo com as vidas, aura vazando para o painel vizinho, painel translúcido deixando o jogador aparecer por dentro, glifo inexistente descartado em silêncio. Nenhum era regra errada. **Consequência:** revisar composição — quem cobre quem, quem encosta em quem — é onde olhar rende mais, e é o que código nunca denuncia. | 02/08, seis capturas |
| ⛔ | **Olhar pega o que está ERRADO, não o que está AUSENTE.** Uma camada inteira foi assada, atualizada 60x por segundo e nunca posta em cena; ela não deixa rastro na captura, então a captura a aprovou. Contra ausência, a verificação é reler a lista de montagem — não a imagem. | 02/08, `frontSprite` |
| ⛔ | **O instrumento de olhar tem os MESMOS defeitos que eu, e mente na direção mais cara.** Os três do `npm run olho`: escada de luminância invertida (contorno saía branco, buraco saía marcado — vazio parecia corpo), redução de 3:1 que fazia as OITO direções do jogador aparecerem idênticas, e tira que supunha quadros do mesmo tamanho. Nenhum era de lógica, todos de amostragem e composição, e os três faziam o olho APROVAR o que ele existe para denunciar. **Consequência:** instrumento novo de verificação se verifica contra um caso onde já se sabe a resposta, antes de acreditar nele. Convenção herdada de outro projeto não é convenção verificada. | 04/08, `olho.ts` |
| ✅ | **Sistema visual regido por regra é onde meu teto é mais alto.** Paleta travada, grade inteira, dither ordenado, matriz de quadros, silhueta dentro da hitbox — converte desenho em satisfação de restrição. | 01/08, primeiro veredito de "qualidade de mercado" |
| ✅ | **Construo a minha própria verificação bem.** Buffer indexado sem DOM fez a arte inteira rodar sob teste e pegou 3 defeitos que leitura não pegaria. | 01/08, `pixelart.test.ts` |
| ✅ | **Instrumento derruba a minha própria hipótese sem dó.** Apontei o buraco dos i-frames como causa da dificuldade; escrevi o bot que o explora; ele morreu mais rápido. | 01/08, `bot.ts` |
| ✅ | **Volume mecânico sem fadiga.** 456 quadros assados, fonte bitmap com acento composto, 71 testes. Consistência não cansa. | 01/08 |

**Como usar isto:** quando um eixo travar, a pergunta não é *"como contorno minha
limitação?"* — é *"que idioma deste eixo é maximizado pelo formato da minha limitação?"*.
Foi não fazer essa pergunta que deixou pixel art parada por três rodadas.

**Portabilidade:** as linhas de ✅ provavelmente valem em outros projetos. "Não desenho" é
do modelo. Qualquer coisa sobre canvas 2D ou Pixi é desta stack e não deve ser herdada.

---

## 3. Regra de bordo

Fracasso é resultado, não culpa. Vira linha no `DECISIONS.md` do mesmo jeito que acerto.
