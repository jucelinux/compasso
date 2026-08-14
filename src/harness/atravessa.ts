import type { InputFrame, SimState, Tuning } from "../sim/types.ts"
import { EMPTY_INPUT, unpackInput } from "../input/frame.ts"

/**
 * COMO SE ATRAVESSA UMA TELA. Um lugar só, e este é o motivo.
 *
 * Em 13/08 o cérebro virou navegável: sair dele deixou de ser "aperte espaço" e
 * passou a ser ANDAR até a órbita dos patógenos. Nesse dia seis lugares diziam
 * como atravessar tela — `slice.test.ts`, `necrose.test.ts`, `makeSmoke.ts`,
 * `bot.ts`, `rec.ts`, `shot.ts` — e cada cópia que ficasse para trás pararia de
 * atravessar.
 *
 * Duas ficaram, e o modo de falha das duas foi o pior que existe: **verde e
 * medindo nada.** A fixture `smoke.json` passou a gastar os 900 ticks dentro do
 * cérebro, e quatro testes de determinismo continuaram passando sobre ela; o
 * `necrose.test.ts` passou a rodar 2400 ticks de hub e os dois casos do
 * interruptor deram o mesmo hash — que é a MESMA armadilha que o comentário
 * dentro dele já descrevia, escrito depois de cair nela em 05/08.
 *
 * Por isso a regra deixou de ser copiada. As duas que não podem usar este módulo
 * são `rec.ts` e `shot.ts`, que pilotam o browser por tecla e só enxergam a fase
 * pelo HUD — elas têm cópia própria, declarada, e é o preço de não ter a sim na
 * mão.
 *
 * Nada aqui pode virar atalho. Teleportar o glóbulo ou forçar a fase faria o
 * aparelho medir um caminho que nenhum jogador percorre.
 */

/** As fases que NÃO são jogo. */
export const ehTela = (fase: string): boolean =>
  fase === "hub" ||
  fase === "select" ||
  fase === "painel" ||
  fase === "card" ||
  fase === "intervalo" ||
  fase === "closed"

const NADA = EMPTY_INPUT
const ACAO = unpackInput(16)
const VOLTA = unpackInput(32)

/**
 * O input que atravessa a tela em que a sim está.
 *
 * `intervalo` não aceita tecla — ele corre sozinho, e passar NONE é o certo.
 *
 * Fora de tela devolve NADA, e isto é guarda e não conveniência: a versão que
 * caía no `cardLock === 0 ? ACAO` por omissão apertava a ação em TODO tick de
 * jogo, e um chamador desatento mediria uma run com o impulso encravado.
 * `dead` também sai por aqui — reiniciar tem tecla própria desde 31/07, e
 * atravessar a morte por reflexo é justamente o que o gate não pode medir.
 */
export function atravessaTela(s: SimState, tuning: Tuning): InputFrame {
  if (!ehTela(s.phase)) return NADA
  if (s.phase === "intervalo") return NADA
  if (s.phase === "hub") {
    // Anda na direção da órbita. Duas casas de folga para não ficar oscilando
    // em torno do centro sem nunca entrar.
    const dx = tuning.hub.orbitX - s.player.x
    const dy = tuning.hub.orbitY - s.player.y
    return {
      ...NADA,
      up: dy < -2,
      down: dy > 2,
      left: dx < -2,
      right: dx > 2,
    }
  }
  /*
   * `painel` sai pela tecla de VOLTAR, e o aparelho nunca deveria chegar aqui:
   * ele anda reto até a órbita e o caminho não encosta em porta nenhuma.
   *
   * Está escrito assim mesmo porque a geometria do cérebro é `tuning.json`, e
   * mover uma porta um dia pode pôr uma no caminho. Sem esta linha o rig ficaria
   * presos numa tela que ele não sabe que abriu — que é a forma mais silenciosa
   * de o aparelho parar de medir, e já aconteceu duas vezes hoje.
   */
  if (s.phase === "painel") return VOLTA
  if (s.phase === "select") return ACAO
  return s.cardLock === 0 ? ACAO : NADA
}
