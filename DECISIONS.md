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