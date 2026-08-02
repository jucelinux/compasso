# CLAUDE.md

Project instance. The method lives in `TASTE-LOOP.md`; the rig lives in `HARNESS.md`.
Only this file changes between projects.

## Session start

Read, in order: this file → `TASTE.md` → the last 20 lines of `DECISIONS.md` →
`BACKLOG.md`. Then `TASTE-LOOP.md` and `HARNESS.md` if the session involves running a round
or building the rig, and `TASTE-LOOP-LEARNING.md` if it involves the method itself. Do not
write code before that.

`BACKLOG.md` was added to this list on 02/08: the round being handed off lives there, and a
session that skipped it would never read the work it was supposed to do.

**The gate — the project's single direction metric.** Voluntary second-run rate; three
consecutive "no" kill the thesis (`DECISIONS.md`, 31/07). Counter reset on 01/08 when the
core changed. **Standing at 0 of 3 as of 02/08** — no reading taken against the tissue core.
Current count is kept at the top of `BACKLOG.md`; update it there the same turn a reading
comes in.

---

## 1. The project

- **Name:** COMPASSO
- **Genre:** arena action, short run, with a roguelite layer of temporary powers
- **One-line pitch:** time only moves when you move
- **Target:** web first; the build runs in desktop and mobile browsers.

Settled on 31/07 and recorded in `DECISIONS.md`. Do not reopen these without a new line
there.

**Binding details, as of 01/08.** These are the ones that survive; each is a line in
`DECISIONS.md` and is binding in the same way.

- **One verb.** Moving *is* attacking. The dash is a resource with a cooldown, not the verb.
- **Speed is the world clock.** Standing still, the world runs at `time.creep` (0.05);
  at full speed, at 1.0. The player always moves in real time. That asymmetry *is* the game.
- **Contact resolves by speed.** Fast enough engulfs, too slow hurts, and the threshold is
  per pathogen (`engulfSpeed`).
- **Three lives**, and i-frames with **no timer** — they drop on the first pathogen you
  engulf by contact.
- **The field is the organism.** The arena is tissue with per-tile infection, not empty
  space. Infection spreads in *world* time; healing runs in *real* time and falls with your
  speed. Pathogens are born from infected tissue, so a phase can converge. A phase ends
  **contained** — infection under the threshold and no pathogen alive — not by a kill quota.
- **Pixel art, native 640x360, locked palette.** No runtime rotation, integer positions
  only, a round sprite fits inside the hitbox the sim collides with.

**Dead — do not restore from old notes.** The 31/07 core fell at the gate after three
negative readings, and these went with it: geometric primitives only, 8 fixed directions,
dash+creep as the core, i-frames until the end of the next dash, and the between-waves
pick screen. `DECISIONS.md` still carries those lines because it is an append-only log;
superseded is not the same as wrong-at-the-time.

The rig in `HARNESS.md` is genre-independent, which is why round zero came first.

---

## 2. Build order

1. **Round zero — `HARNESS.md`.** Deterministic sim, input log, headless replay, F9
   recorder, determinism tests. About a day. Genre-independent, so it can be built while
   the genre is still being decided.
2. **Vertical slice.** Ordinary collaboration, not the loop. Cheap, fast, disposable. The
   only question that matters here is whether the thing is fun, and no rig answers that —
   the human plays it.
3. **Phase 2 of the harness**, only if judging becomes the bottleneck. Trigger and scope in
   `HARNESS.md` section 7.
4. **Taste Loop rounds**, pointed at two or three axes that matter.
5. **Packaging.** Tauri for desktop, Capacitor for mobile — only after the slice is
   approved. Do not configure either before that.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Everything is text; no editor round-trips |
| Rendering | PixiJS | Fast, WebGL, no opinion about game architecture |
| Build | Vite | Instant HMR |
| Tests | Vitest | Deterministic sim testable without a browser |
| Capture | Playwright | Clips and frames for the blind critic |

**No engine on top of Pixi.** The game loop, the ECS, and the state machines are ours and
sized exactly to what the game needs. Do not introduce Phaser, a third-party ECS, or a
physics library without proposing it first and getting approval.

Architecture rules — sim/render split, fixed timestep, seeded RNG, `tuning.json` — are in
`HARNESS.md` section 1. They are prerequisites of the rig, not preferences.

---

## 4. The human

Jucelinux. Software engineer, comfortable with the code, deliberately learning this stack.

He is the tie-breaker and the one who sets the bar — not an inspector. Rules for when and
how to call him are in `TASTE-LOOP.md` section 7. The short version: binary questions, in
batches, never for something a test resolves.

---

## 5. Project-specific don'ts

- Do not add a dependency without proposing it first.
- Do not configure Tauri or Capacitor before the vertical slice is approved.
- Do not start game content while round zero is incomplete.