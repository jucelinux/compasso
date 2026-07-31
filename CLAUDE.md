# CLAUDE.md

Project instance. The method lives in `TASTE-LOOP.md`; the rig lives in `HARNESS.md`.
Only this file changes between projects.

## Session start

Read, in order: this file → `TASTE.md` → the last 20 lines of `DECISIONS.md`.
Then `TASTE-LOOP.md` and `HARNESS.md` if the session involves running a round or building
the rig. Do not write code before that.

---

## 1. The project

- **Name:** COMPASSO
- **Genre:** arena action, short run, with a roguelite layer of modifiers
- **One-line pitch:** time only moves when you move
- **Target:** web first; the build runs in desktop and mobile browsers.

Settled on 31/07 and recorded in `DECISIONS.md`. Do not reopen these without a new line
there. The details that follow from them — one verb, geometric primitives only, 0.05x
creep, three lives, 8 fixed directions, i-frames until the end of the next dash — live in
`DECISIONS.md` and are binding in the same way.

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