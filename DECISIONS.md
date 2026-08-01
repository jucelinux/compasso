# DECISIONS.md

Append-only. Uma linha por julgamento. Data · eixo · o que ganhou · motivo curto.
Sem prosa. Se precisar de parágrafo, é decisão de arquitetura e vai pro `CLAUDE.md`.

---

- 31/07 · gênero · ação em arena com camada roguelite · escolhido pelo gosto do modelo, com rigor de medição aumentado em compensação
- 31/07 · arte · só primitivas geométricas · restrição vira identidade; nega a muleta de asset bonito
- 31/07 · verbo · dash único, mover = atacar · um verbo força caráter vir do tempo, não da quantidade de sistemas
- 31/07 · dilatação · creep a 0.05x, nunca zero · H escolheu pressão constante sobre puzzle; custo aceito: bot precisa de política de quando decidir
- 31/07 · vidas · três toques · H escolheu legibilidade sobre tensão máxima
- 31/07 · mira · 8 direções fixas · H; efeito colateral bom: ramificação 8 devolve a mensurabilidade que o creep tirou
- 31/07 · i-frames · do impacto até o fim do próximo dash · timer em tempo de mundo daria ~10s reais de invulnerabilidade durante creep; regra sem número é candidata nº1 a A/B
- 31/07 · gate · taxa de segunda partida voluntária · única métrica de direção; três "não" seguidos derrubam a tese
- 31/07 · procedência · git init · replays/ são fixtures de regressão; sem repo, gitSha null e baseline sem código associado
- 31/07 · escopo · CLAUDE.md §1 preenchido do DECISIONS.md · TBD era lacuna de atualização, não gênero reaberto; linhas de 31/07 seguem vigentes
- 31/07 · deps · vite 7 + vitest 4 + @types/node · o par 6/2 trazia advisory crítico via esbuild; audit agora zerado
- 31/07 · recorder · shift+F9 dumpa a run inteira além dos 30s do F9 · janela de 30s recomeça da seed no meio da run e não reproduz o que foi visto
- 31/07 · rodada zero · aceita, 4/4 caixas · H rodou o round-trip do F9; veredito "cru e básico, mas funcional" — cru era o esperado, a cena de dois quadrados é descartável por projeto
- 31/07 · escopo do slice · inclui a camada de modificadores · resolvido pelo TASTE.md §2 sem consultar H; slice sem ela mede só se o dash é gostoso, que é o modo de falha declarado passando de aprovado
- 31/07 · dash · duração fixa + recuperação, encadeia se a direção seguir pressionada · sem a recuperação o mundo fica em 1.0x o tempo todo e a dilatação some
- 31/07 · dilatação · implementada dentro da sim, não na taxa do laço · mudar ticks/segundo faria replay de run com creep não reproduzir; determinismo morreria em silêncio
- 31/07 · rng · rejection sampling no nextInt · módulo puro enviesa sorteio de 3 entre 6 modificadores
- 31/07 · gate · PASSOU · replay de 7,6 min: morreu com 150 kills, escolheu modificador, iniciou segunda run voluntária até 212 kills
- 31/07 · feel do dash · aprovado · H: "o dash ficou bom"; primeiro eixo a sair da fila de dúvidas
- 31/07 · legibilidade · três vidas + i-frames legíveis para o escopo atual · H; revisitar se o jogo ficar mais denso
- 31/07 · dificuldade · fácil, e por teto e não por rampa · minSpawnIntervalSeconds encostado no kill ~60 de 362; spawn é o único eixo existente
- 31/07 · tensão · vem de encolher a folga, não de somar inimigos · H: "te dei tempo para entender seu movimento, mas seja rápido"; creep e recuperação viram curva
- 31/07 · tema · célula imunológica defendendo o organismo · H escolheu sobre a versão micróbio-sobrevivente; mesmo ambiente, herói invertido, mas esta rende progressão
- 31/07 · tema · arte adiada, decisão registrada · primitivas geométricas fazem o tema custar quase nada depois; sistema de recompensa ainda não está medido
- 31/07 · ondas · cota de kills, nunca temporizador · o tempo é do jogador; temporizador é estalável a 5% de creep, cota exige dashar e dashar é o que dá tempo ao inimigo
- 31/07 · modificadores · perde tudo na morte, arco dentro da run · H sobre manter entre runs; custo aceito e conhecido: o carrinho entre runs foi o que produziu a segunda partida, gate precisa ser remedido
- 31/07 · inimigo · velocidade constante entre ondas · tensão vem de encolher a folga, não de buffar inimigo; buffar seria o eixo que o H recusou
- 31/07 · corte · direcional, não aura · CHAMADA MINHA, sujeita a veto: aura fazia o dash ser imunidade e a folga encolhendo deixava o jogador intocável 90% dos ticks — a curva de tensão invertia; veto custa `dash.killArc: -1`
- 31/07 · i-frames · toque durante o dash vale até o fim do PRÓXIMO · consequência do corte direcional; sem isso, apanhar dashando daria dois ticks de invulnerabilidade
- 31/07 · onda · abre com inimigos em campo · medido: tabuleiro vazio fazia a onda 1 durar 78s esperando spawn
- 31/07 · ritmo · cota 16 +6 por onda · medido com bot em 4 configurações; 16/6 dá onda de 11→29s e morte entre a onda 12 e 20, contra escolha a cada 7s nas cotas baixas
- 31/07 · gate · NÃO (1 de 3) · run-02: 5 min, 10 ondas limpas, 10 escolhas, morreu na onda 11 e não quis recomeçar; ritmo bateu com o bot, o problema não é o ritmo
- 31/07 · tédio · diagnóstico do H: recompensa não é perceptível · 10 modificadores tomados em 5 min e ele diz "poucas powerups"; o que falta não é quantidade, é a escolha não mudar nada visível
- 31/07 · defeito · o toque não é perceptível · "na primeira vida que perdi, nem percebi que perdi"; perder vida sem feedback é bug de comunicação, não falta de polimento
- 31/07 · defeito · glitch visual entre dashes · suspeita: render pareia inimigos por índice e usa bornTick como chave, mas a abertura da onda nasce 3 no mesmo tick — chave não é única
- 31/07 · bar · folga encolhendo não tem bar · H não tem referência externa; por TASTE-LOOP §11 este eixo é humano-only até aparecer uma, e não entra em rodada de loop
- 31/07 · camada visual · H pediu, e por isso não é o viés · TASTE.md §2 alerta contra EU propor feel antes do sistema medido; aqui é o inverso — a recompensa é invisível, então torná-la perceptível É medir o sistema
- 31/07 · gate · o input do gate é reflexo, não intenção · replay mostra espaço apertado 2,9s após a morte, mas H diz que não quis; mesma tecla que ele apertou a cada 20s por 5 min — tecla separada + trava
- 31/07 · pool · 7 modificadores para 10 escolhas · ofertas até equilibradas (3–5 cada); "poucas powerups" é variedade, medida à parte de visibilidade
- 31/07 · tema · aplicado agora, H sobrepôs "arte adiada" · "gostaria de ver a forma do jogo para decidir se está valendo a pena" é chamada de direção dele; primitivas continuam valendo