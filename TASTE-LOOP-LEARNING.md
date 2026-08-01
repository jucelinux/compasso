# TASTE-LOOP-LEARNING.md

Inputs for evolving the method. Not the method itself.

| File | Layer | Question it answers |
|---|---|---|
| `TASTE-LOOP.md` | method | How do we run a round? |
| **this file** | **method, under test** | **Where is the method wrong, and what evidence says so?** |
| `DECISIONS.md` | project | What did we decide? |
| `TASTE.md` | project | What does the human's taste look like, distilled? |
| `BACKLOG.md` | project | What is open? |

`TASTE-LOOP.md` §12 has a changelog of what already changed. This file holds the raw
material *before* it becomes a rule: cases, evidence, and proposals not yet adopted.
A change graduates from here to there when the human accepts it.

Written in English to match the method layer. Project files stay in Portuguese.

---

## 1. The thesis under test

The Taste Loop is a bet about the shape of human–AI collaboration:

> Each party has a capability surface and a taste. Neither surface is visible to the other.
> The collaboration is worth more than either party alone **only if** the work lands on the
> Pareto frontier of both surfaces — and finding that frontier is itself the hard part.

Two adjacent frameworks make the contrast clear:

- **Gauntlet Loop** asked *can the model produce good content?* It answered yes.
- **Taste Loop** asks *can the pair produce something neither would produce alone, without
  burning tokens or human attention on waste?*

Waste has two shapes, and this project produced both inside 48 hours:

| Failure | What it looks like | How it was detected here | Cost |
|---|---|---|---|
| **Bar outside the frontier** | Aiming at something unreachable | Human asked for near-photorealism | One round, spent on the wrong axis |
| **Operating inside the frontier** | Settling for less than the maximum | Human dissatisfaction, after three rounds | Three rounds of procedural texture while a stronger idiom sat unused |

Both detectors were expensive and late. **Making them cheap and early is the central
open problem of the framework.**

---

## 2. The frontier is joint, and neither side can see it alone

The human cannot see the model's capability surface. He does not know which visual idiom
the model maximizes, because that is not a fact about "AI" in general — it is a fact about
this model, this harness, and this stack, and it is not documented anywhere.

The model cannot see the human's taste. It does not know he would accept losing a smooth
look entirely in exchange for a harder, more coherent one.

So the frontier is **jointly discovered or not discovered at all**. The framework currently
has machinery for one direction only:

- **Human taste → model**: `TASTE.md` §1, `DECISIONS.md`, the bar per axis, the binary
  questions. Well developed.
- **Model capability → human**: `TASTE.md` §2 exists, but it captures *tendencies*
  ("I pull toward cutting abstraction"), not *boundaries and maxima*. Nothing in the round
  structure asks the model where its ceiling is highest for the axis at hand.

That asymmetry is the root cause of case 01 below.

---

## 3. Case 01 — the art idiom that was available for three rounds

**Question the human asked:** why did the loop not steer toward retro/pixel art, which the
model has real mastery in? He found it through dissatisfaction, not through introspection
or through the rounds.

### The evidence trail

The information was never missing. It was recorded, three times, and never acted on.

| When | Record | What it shows |
|---|---|---|
| 31/07 | `DECISIONS.md`: *arte · só primitivas geométricas · restrição vira identidade; nega a muleta de asset bonito* | A limitation stated purely as a **virtue**. Nothing marks it as a capability boundary. |
| 31/07 | `DECISIONS.md`: *arte · textura procedural, porque o modelo não desenha · arte desenhada exige alguém que desenhe* | The boundary **is** declared. Explicitly. |
| 31/07 | `textures.ts` header: *"Como eu não desenho, a saída é gerar a textura em código"* | Declared again, at implementation time. |
| 01/08 | `DECISIONS.md`: *o salto de verdade é shader WebGL, e é o que eu consigo fazer sem desenhar* | Hitting the wall a second time, still reasoning **inside the same frame**, and proposing a direction that is *further* from the model's strength, with confidence. |
| 01/08 | `DECISIONS.md`: *restrição dura faz o desenho no meu lugar · pixel art me serve porque é regida por regra, e eu obedeço melhor do que invento* | The correct insight — arriving **after** the win, retrospectively, and only because the human asked for it. |

### What actually went wrong

Not missing information. **A missing question.**

The model recorded its constraint as an *obstacle to route around* — "since I don't draw,
the way out is to generate in code" — and never as a *signal about where its ceiling is
highest*. Routing around a limitation and exploiting it are different operations, and the
loop only ever prompted the first.

The right question was never asked by either side:

> Not *"how do I get quality without drawing?"*
> but *"which visual idiom is maximized by what I actually am — a system that applies rules
> with total consistency and zero fatigue, and invents nothing?"*

Pixel art answers that question almost perfectly. Locked palette, integer grid, ordered
dithering, baked frame matrices, silhouette-fits-hitbox — every one of those is a rule to
obey rather than a judgment to make. The idiom that looks like *the hardest* for a
non-drawing model is in fact its best fit, because it converts drawing into constraint
satisfaction.

Three rounds of procedural texture were spent below the frontier. The human paid for the
discovery in disappointment.

### What the framework lacked

1. **No step derives strength from constraint.** `TASTE.md` §2 collects biases the human
   should push back on. There is no counterpart that collects *"here is what this shape of
   limitation makes me unusually good at."*
2. **The bar is set unilaterally.** `TASTE-LOOP.md` §4 makes the bar the human's job. He set
   near-photorealism. He could not have known it was outside the feasible set — that is
   precisely the information he does not have. A bar outside the frontier is not ambition;
   it is a wasted round.
3. **No cheap probe for "are we below our ceiling?"** The only detector in the loop is the
   human getting dissatisfied, which is the most expensive instrument available and fires
   several rounds late.

### What worked, and should be promoted from accident to method

The thing that finally resolved it took **one round-trip**: two binary questions, each with
a concrete rendered preview and an explicit statement of what is lost by each choice.

That is not a coincidence. A side-by-side sample transfers capability information that no
amount of self-description does. The human does not need to understand dithering to look at
two mockups and know which one he wants.

**Cheap probes beat confident self-report.** See §4 — the model's self-report was actively
wrong the one time it mattered most.

---

## 4. The caveat that keeps a capability-disclosure step honest

The obvious fix — "add a step where the model declares what it is good at" — has a failure
mode, and this project already demonstrated it.

On 01/08 the model wrote, with full confidence and in the decision log:

> *canvas 2D procedural tem teto; o salto de verdade é shader WebGL*

Wrong about the direction. The real jump was not more rendering power; it was **animation
frames**, which the game had exactly zero of. The self-assessment was fluent, plausible,
recorded as fact, and pointed away from the answer.

This matches the model's own declared bias in `TASTE.md` §2: *"Sou péssimo juiz do que
acabei de escrever. Minha confiança sobe justamente onde a verificação externa falta."*
Capability self-report is precisely such a domain — there is no external check on it.

**Therefore: a capability-disclosure step must produce artifacts, not claims.**

| Weak | Strong |
|---|---|
| "I'm good at rule-governed visual systems" | Three 30-second samples in three idioms, human picks |
| "Canvas 2D has a ceiling" | A rendered frame of each candidate approach |
| "This would take a long time" | A timed spike |

The rule: **any claim about the model's own ceiling is a hypothesis, and hypotheses go to
rung 2 or 3 of the oracle ladder, not into the decision log as fact.** That is the same
discipline the project already applies to game design — and on 01/08 it paid off there:
the model named the i-frame hole as the likely cause of the difficulty complaint, wrote a
bot to exploit it, and the measurement refuted its own hypothesis. That is the loop working.
It has never been pointed at the model's self-assessments.

---

## 5. Proposals

Raw material for `TASTE-LOOP.md`. Each needs the human's verdict before it graduates.

> **All five below were accepted on 01/08 and have graduated.** They are kept here with
> their original reasoning because the changelog in `TASTE-LOOP.md` §12 records *what*
> changed and this records *why it was ever in doubt*. New proposals go under §5b.

### P1 — Frontier probe before the first round on any axis · ADOPTED → §3.0

Before optimizing an axis, produce **2–4 materially different samples spanning the
plausible range**, cheap and disposable, and let the human pick. Not variants of one idea —
different idioms. Cost: one round-trip. It would have saved three rounds here.

Open question at the time: which axes deserve this? Doing it for everything is its own
waste. **Resolved on adoption:** probe on the *first* round of an axis only; skip on later
rounds, because by then the idiom is settled. Cheap rule, no judgement call needed.

### P2 — `TASTE.md` §2 splits in two · ADOPTED → §8, and `TASTE.md` §2a/§2b

Today §2 is "declared biases of the model". Split:

- **§2a Biases** — tendencies the human should push back on. *(exists, works)*
- **§2b Capability surface** — where the ceiling is high, where it is low, and **what shape
  of constraint raises it**. Every entry must cite an artifact that demonstrated it, not a
  self-assessment.

Seed entries from this project, each with evidence:
- *Cannot draw.* No image tool. Demonstrated 31/07.
- *Very strong at rule-governed visual systems.* Locked palette, integer grids, baked frame
  matrices, dithering. Demonstrated 01/08 — first "market quality" verdict from the human.
- *Very strong at building its own verification.* DOM-free indexed buffers made art
  testable and caught three defects unreachable by reading.
- *Bad at judging its own fresh output.* Needs to render and look. Five visual defects
  survived code review and a green suite.
- *Unreliable when self-reporting its own ceiling.* See §4.

### P3 — The bar becomes negotiated, not assigned · ADOPTED → §4

`TASTE-LOOP.md` §4 currently: the human sets the bar. Proposed: the human sets the
**direction and ambition**; the model reports **where the frontier actually is**, with
samples; the human picks a point on it. Neither party can do both halves.

### P4 — A fourth question at round close · ADOPTED → §3.9

`TASTE-LOOP.md` §3.9 asks three questions. Add: **"Did this round operate below a ceiling
either side knows about but did not name?"** Cheap to ask; it is the detector that was
missing for three rounds.

### P5 — Constraints proposed as virtues must be split · ADOPTED → §8

When either party proposes a constraint as a design virtue, state explicitly which part is
virtue and which part is limitation. *"Only geometric primitives — the restriction becomes
identity"* was both, and recording only the virtue half is what buried the question for
three rounds. Both halves are true; only one was written down.

---

## 6. Learning log

Append-only. One entry per learning, newest last.

### L1 · 01/08 · The loop recorded verdicts but never propagated them

State files (`CLAUDE.md` §1, `BACKLOG.md`) kept declaring dead constraints as binding for a
full day after the core that implied them fell. **Adopted** into `TASTE-LOOP.md` §3.8 and
§8 (log files vs state files).

### L2 · 01/08 · Confidence without a visible artifact is worth nothing

Five real visual defects survived code review and 65 passing tests. Only rendering the
output found them — including a parallax bug the model had previously read and commented on
without noticing. **Adopted** into `TASTE-LOOP.md` §10 as a named failure mode.

### L3 · 01/08 · The instrument corrected the model, and that is the loop working

The model named the i-frame hole as the likely cause of the difficulty complaint. A bot
written to exploit it died *faster* than the baseline. Hypothesis refuted; the real finding
(the game is crowded but not dangerous — 0.1s of actual danger in a 127s run) came out of
the measurement, not the reasoning. **Evidence that rung 2 pays.** No rule change needed.

### L4 · 01/08 · The capability frontier was never surfaced from the model's side

Case 01 above. **Adopted** — P1–P5 all graduated the same day. The concrete artifact is
`TASTE.md` §2b, the capability surface, which did not exist before and is the half of the
collaboration the framework had no slot for.

### L5 · 01/08 · Distilling is a debt that accrues silently

`TASTE.md` §1 was distilled on 31/07 and still described the pre-pivot game while
`DECISIONS.md` grew to 133 lines. §8 says to distill past ~30 lines; nothing *checks*.
Same class as L1 — a state file with no maintenance trigger — but a different mechanism:
L1 was a verdict that superseded a declaration, this is slow accumulation with no single
moment where it becomes wrong. **Open:** the round-close questions catch supersession, not
drift. No proposal yet.

---

## 7. Open questions

- **How much frontier-probing is worth it?** P1 costs a round-trip per axis. Some axes have
  an obvious idiom and probing them is pure waste. No criterion yet for which axes qualify.
- **Does the capability surface transfer between projects?** "Strong at rule-governed visual
  systems" may be portable. "Canvas 2D hits a ceiling" is probably about this stack. §2b
  needs a way to mark which is which, or the next project inherits false constraints.
- **Who detects that the human's bar is unreachable?** The model has to say *"that is outside
  what I can do; here is the nearest reachable point"* — the exact statement it failed to
  make on 01/08, and one it has an obvious incentive to soften.
- **Is the gate still the right single metric?** It measures direction, not whether the pair
  is operating at its joint maximum. Those are different, and only the first is instrumented.
