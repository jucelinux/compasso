# HARNESS.md

Round zero: the deterministic core. Roughly one day of work, genre-independent, reusable
across any 2D game project.

**What this is:** the minimum that makes testing, A/B comparison, and debugging possible
at all.

**What this is not:** the judging apparatus. Clip capture, perceptual diff, and automated
critic packets are phase 2 and are deferred on purpose — see section 7. Before a playable
vertical slice exists, the judge is the human, playing, and there is nothing to automate.

---

## 1. Architecture prerequisites

Non-negotiable. Each one exists so that iteration stays cheap.

1. **Sim and rendering are separate.** `src/sim/` never imports the renderer. The sim runs
   headless in Node, under test, with no canvas.
2. **Fixed timestep at 60Hz.** The sim advances in `1/60` steps; rendering interpolates. No
   logic depending on a variable `deltaTime`.
3. **Seeded RNG.** One injected source with an explicit seed. `Math.random()` is forbidden
   in `src/sim/`.
4. **Input is a log.** Each frame produces a serializable input record. A whole run is
   `{ seed, inputs[] }` — deterministic replay for free.
5. **Every tuning number lives in `tuning.json`.** No magic constants. This is also the
   cheapest A/B mechanism there is: two files, same code.
6. **Determinism is tested.** If the determinism test breaks, stop and fix it before
   anything else.

### Layout

```
src/
  sim/          # pure, deterministic logic — the core
  render/       # renderer, interpolation, camera
  input/        # capture and logging
  harness/      # headless runner, replay
tuning.json     # every number
replays/        # committed replays: regression fixtures
```

---

## 2. Sim contract

```ts
export interface SimSnapshot { tick: number; hash: string }

export interface Sim {
  step(input: InputFrame): void      // advances exactly 1/60s
  snapshot(): SimSnapshot
  serialize(): unknown               // full state, for debugging
}

export function createSim(seed: number, tuning: Tuning): Sim
```

- Same seed + same input sequence always yields the same hash sequence.
- `hash` covers all gameplay-relevant state, cheap to compute (FNV-1a over a packed buffer).
- No wall clock, no `Math.random()`, no DOM, no `performance.now()` inside the sim.

---

## 3. Replay format

```jsonc
{
  "version": 1,
  "seed": 12345,
  "tuningHash": "a1b2c3",
  "gitSha": "abc1234",
  "label": "boss-01",
  "inputs": ["0", "1", "5", "5", "4"]
}
```

Input is bit-packed per frame; replays get committed, so keep them small. A `tuningHash`
mismatch is a warning, not an error — replaying an old input log against new tuning is
exactly how comparison works.

---

## 4. Components

### 4.1 Headless runner — `npm run replay <file>`

Runs the sim in Node with no renderer. Prints the final hash and writes
`out/<label>/metrics.csv` with `tick,simMs,entityCount`.

### 4.2 Recorder — `F9` in the dev build

Buffers every `InputFrame` while playing; `F9` dumps the last 30 seconds as a replay JSON.
This is how fixtures get authored: play until something interesting happens, press a key.

### 4.3 Determinism tests

```ts
it("is deterministic", () => {
  expect(runReplay("replays/smoke.json").finalHash)
    .toBe(runReplay("replays/smoke.json").finalHash)
})

it("matches the committed baseline", () => {
  expect(runReplay("replays/smoke.json").finalHash).toBe("known-hash")
})
```

The second makes every behavior change a conscious act.

---

## 4.4 The perception channel — `npm run olho`

Added here on 08/08, importing `TASTE-LOOP.md` v0.7 §3c and `HARNESS.md` §3 of the package.
It was already built; what was missing was it being named as **part of round zero** rather
than as a tool that happened to appear.

The rule: **the agent must be able to perceive its own output with no human and no browser
in the path.** Visual → text dump; audio → envelope; data → shape. Without that channel
there is no loop on a perceptual axis — only generation plus syntax checks. Here the channel
is `npm run olho`, which dumps any baked sheet as luminance in the terminal in under a
second, and `npm run shot`, which shows the composed scene.

The two are not interchangeable and neither replaces the other. **`olho` shows the ART;
`shot` shows the SCENE** — only what the bot reaches, which is why the score pulse and the
build labels are still unverified. Both are instruments and both fall under section 8.

---

## 5. Acceptance

Validate against a throwaway scene — a square that moves and collides with another square.
Delete it when the real game arrives.

- [ ] `npm run test` passes, including both determinism tests
- [ ] `npm run replay replays/smoke.json` prints a stable hash across runs
- [ ] `F9` downloads a replay the headless runner can consume
- [ ] changing a value in `tuning.json` changes behavior with no code edit
- [ ] one bench-loop turn — change a tunable, regenerate, look — is fast enough that the
  agent keeps experimenting. **The loop's latency is a design decision, not an
  optimization**: half a second is known to change, and worsen, what gets tried. Today
  `npm run olho` is well under a second and the full suite is ~1.8s, so this passes; it is
  written down so it stays a budget rather than an accident.

Then stop. Go build the vertical slice.

---

## 6. Commands

```bash
npm run dev        # dev server with HMR
npm run test       # headless sim + determinism
npm run replay     # run a replay, print final hash, write metrics.csv
npm run build      # production web build
```

---

## 7. Phase 2 — deferred until after the vertical slice

Do not build any of this before there is a playable game whose quality is worth judging.
Listed here so the design is not lost, not so it gets built early.

**Status as of 01/08.** Part of the first item exists and is no longer deferred: Playwright
is a devDependency, `src/harness/drive.ts` drives the real build in a real browser, and two
entry points sit on top of it — `npm run shot` (stills of the current build) and `npm run
rec` (drives the game to death and restart, then dumps a replay through shift+F9). It was
built early, against the rule below, for a reason the rule did not anticipate: five real
visual defects had just survived code review and a green test suite, so the agent had no
way to check its own work on that axis at all. That is a capability gap, not a judging
apparatus, which is why it does not count as breaking the trigger.

Still deferred, and still correctly so:

- **Capture rig** — Playwright drives the build from a replay, tick-by-tick, emits a ~3s
  clip plus `frameMs` / `inputLatencyMs`. Needed because stills show none of hitstop,
  input latency, or animation weight.
- **Pair builder** — same replay against two `tuning.json` variants, side-by-side output,
  A/B order randomized with a hidden mapping.
- **Perceptual diff** — SSIM over key frames, to catch unintended visual drift.
- **Critic packet** — assembles clips + metrics + `TASTE.md` into the template in
  `TASTE-LOOP.md` section 9.

**Trigger:** build these when the human is being asked to judge the same subjective axis
more than twice a week. Until then, they are apparatus without a subject.
---

## 8. Instruments, and the rule that governs all of them

Imported on 08/08 from `TASTE-LOOP.md` §2 and the package's `HARNESS.md` §5. Everything this
rig produces is an instrument, and instruments are the method's blind spot: their output is a
number or an image, and both get believed — including by whoever built them.

**A new instrument runs a case whose answer is known before its output is trusted**, usually
with the measured thing switched off. If it cannot separate that from the real case, its
number is worse than no number.

**Instrument defects are not random in direction. They flatter.** This project has the
cleanest evidence of it on record: the three defects `npm run olho` was born with in 04/08 —
inverted luminance ladder, a 3:1 reduction that made the player's eight directions look
identical, and a strip assuming equal frame sizes — were all inherited conventions from
another project, and **all three made the instrument approve what it exists to denounce**.

Two corollaries, each with its own scar here:

- **A visual instrument catches what is WRONG, never what is ABSENT.** A layer that never
  reaches the screen leaves no trace in a capture, so the capture approves it — `frontSprite`,
  02/08. Against absence the check is counting the assembly list, which is now a lock:
  `tests/montagem.test.ts`.
- **An instrument that reduces or samples hides exactly the difference it exists to show.**
  Check the reduction against a case where two inputs are known to differ.

**A lock needs margin, not equality.** Equality passes on a one-pixel difference — that is
how a 4-phase cycle that was really 2 phases got approved in the atelier, and why the
phase-copy ruler here is a ≥5% distance with an absolute floor of 3, not a `join(",")`.

Locks in place, and what each covers:

| lock | covers | blind to |
|---|---|---|
| `tests/determinism.test.ts` | hash drift, fixture provenance, death → restart → card → play | whether a fixture still exercises anything |
| `tests/necrose.test.ts` | the ratchet: scarring, and that only presence undoes it | whether the dilemma *feels* like one — no bot measures that |
| `tests/montagem.test.ts` | producer in `sprites.ts` never assembled (`organSheet`) | the `frontSprite` class — assembled but never staged |
| `tests/ancoras.test.ts` | a magnitude number changed without declaring its new fraction | whether the fraction is the *right* one |
| `tests/pixelart.test.ts` | locked palette, frame distance, silhouette inside the hitbox | composition — who covers whom, who touches whom |

The last row is the family named in `TASTE.md` §2b — six defects in one day, all of position
and order. By `TASTE-LOOP.md` §3.8 that family owed a single lock at its third occurrence.
It is owed, deliberately not written yet, and is the first thing to build the next time this
project touches visuals: writing it today would mean guessing the invariants against no live
defect, which is precisely how `olho.ts` was born wrong.
