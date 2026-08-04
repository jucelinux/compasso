# COMPASSO

**Time only moves when you move.**

A short-run arena action game with a roguelite layer of temporary powers. You are a white
blood cell inside infected tissue: moving *is* attacking, the world runs at 5% speed while
you stand still, and a phase ends when the disease is **contained** — not when a kill quota
is met.

Web first. Runs in desktop and mobile browsers. Native 640x360 pixel art, locked palette.

> The project documents (`DECISIONS.md`, `TASTE.md`, `BACKLOG.md`, `TASTE-LOOP.md`) are
> written in Portuguese, as is the in-game text. This README is the English entry point.

---

## Running it

Requires **Node 22.18+** — the rig's scripts execute `.ts` directly, with no build step.

```bash
npm install
npm run dev        # http://localhost:5173
```

Useful dev URL parameters: `?seed=1234` pins the seed, `?palette=<name>` switches the color
variant (the **P** key cycles through them keeping the same seed).

## Controls

| key | what |
|---|---|
| **WASD** / arrows | move — and moving is attacking |
| **space** | impulse: a dash while moving, an aura while still |
| **R** / Enter | restart after dying (its own key, on purpose) |
| **F9** | dump the last 30s as a replay JSON |
| **shift+F9** | dump the whole run |
| **P** | next palette, same seed |

The impulse has a cooldown and **two verbs decided by context**: above the speed threshold
it is reach, below it plants a healing focus that works without you (cap of 2). `R` is a
separate key from `space` because the project's gate measures the intent to replay, and a
restart bound to the action button becomes a reflex.

---

## The rules that don't move

Each one is a line in `DECISIONS.md` and only falls with another line there.

- **One verb.** Moving is attacking. The impulse is a resource with a cooldown, not the
  core verb.
- **Speed is the world clock.** Standing still, the world runs at `time.creep` (0.05); at
  full speed, at 1.0. You always move in real time. That asymmetry *is* the game.
- **Contact resolves by speed.** Fast enough engulfs, too slow hurts. The threshold is per
  pathogen (`engulfSpeed`).
- **Three lives**, and i-frames with **no timer** — they drop on the first pathogen you
  engulf.
- **The field is the organism.** The arena is tissue with per-tile infection. Infection
  spreads in *world* time; healing runs in *real* time and falls with your speed. Pathogens
  are born from infected tissue, so a phase can converge.
- **Native pixel art, locked palette.** No runtime rotation, integer positions only, a round
  sprite that fits inside the hitbox the sim collides with.

Pathogens are real diseases, and morphology decides behavior: E. coli does run-and-tumble
and splits by binary fission, influenza hunts you, and so on (`tuning.json` →
`enemy.kinds`). The powers are immunological — CITOCINA, FEBRE, ANTICORPO, MACRÓFAGO,
HISTAMINA, INTERFERON, ENZIMA, SURTO, MEMBRANA, PLAQUETA.

---

## Architecture

```
src/
  sim/          # pure, deterministic logic — the core
  render/       # renderer, interpolation, pixel-art atlas
  input/        # capture and input logging
  harness/      # headless runner, replay, bot, capture
tests/          # determinism, slice, harness, pixel art
tuning.json     # EVERY number in the game
replays/        # committed replays: regression fixtures
```

Non-negotiable prerequisites, detailed in `HARNESS.md` §1:

1. **Sim and rendering are separate.** `src/sim/` never imports the renderer or the DOM.
2. **Fixed timestep at 60Hz.** No logic depending on a variable `deltaTime`.
3. **Seeded RNG.** `Math.random()` is forbidden in `src/sim/`.
4. **Input is a log.** A whole run is `{ seed, inputs[] }` — deterministic replay for free.
5. **Every tuning number lives in `tuning.json`.** It is also the cheapest A/B there is.
6. **Determinism is tested.** If the determinism test breaks, stop and fix it first.

## The rig

```bash
npm run test                       # headless sim + determinism
npm run typecheck                  # tsc --noEmit
npm run build                      # production build
npm run replay <file.json>         # run a replay, print the hash, write out/<label>/metrics.csv
npm run gate <file.json>           # gate reading: after the run ended, did another one start?
npm run pace                       # pacing bot — a constant player, measures wave and run length
npm run sweep <path> <v1> <v2>     # sweep one tuning parameter and rank by metric
npm run shot [seed]                # stills of the current build, into shots/
npm run palettes [seed]            # stills of every palette variant
npm run rec [name] [seed]          # record a synthetic fixture of the current build
npm run smoke                      # regenerate replays/smoke.json
```

`shots/` and the `f9-*.json` dumps at the root are gitignored: capture is a reading tool,
not a project artifact. The fixtures that stay live in `replays/`.

## Stack

| layer | choice | why |
|---|---|---|
| language | TypeScript (strict) | everything is text; no editor round-trips |
| rendering | PixiJS | fast, WebGL, no opinion about game architecture |
| build | Vite | instant HMR |
| tests | Vitest | deterministic sim testable without a browser |
| capture | Playwright | frames and clips of the real build |

**No engine on top of Pixi.** The game loop, the ECS, and the state machines are ours and
sized exactly to what the game needs.

---

## The documents

This repository is half game, half method. The `.md` files are not documentation of the
code — they are the state of the project, and the next session starts by reading them.

| file | what |
|---|---|
| `CLAUDE.md` | project instance: genre, binding decisions, build order, don'ts |
| `TASTE.md` | the human's taste distilled, the bar per axis, the model's biases and ceiling |
| `DECISIONS.md` | append-only decision log. Superseded ≠ wrong-at-the-time |
| `BACKLOG.md` | the present only: what is open, and the gate counter |
| `HARNESS.md` | the rig — sim contracts, replay format, acceptance, phase 2 |
| `TASTE-LOOP.md` | the method: how a round runs and when to call the human |
| `TASTE-LOOP-LEARNING.md` | input for evolving the method itself |

**The gate** is the project's direction metric, and it counts *strikes*, not successes —
zero is the best possible state. The current count lives at the top of `BACKLOG.md`, the
definition in `DECISIONS.md`. The metric is **under revision** as of 02/08: with the phase
format, "a second run" measures repeating when success became advancing. The standing
proposal is *"the next phase, unaided"*, and it has not been ratified.

## Project don'ts

- Do not add a dependency without proposing it first.
- Do not configure Tauri or Capacitor before the vertical slice is approved.
- Do not reopen the binding decisions without a new line in `DECISIONS.md`.
- Do not restore anything marked dead in `CLAUDE.md` — the log is append-only and still
  carries what fell.
