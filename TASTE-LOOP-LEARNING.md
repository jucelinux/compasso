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

### P6 — A stopping rule, at four different scopes

The loop optimizes *per round* and never says when to stop. The human raised this on
01/08: *"não considerei isso quando pensei no framework."* Four scopes are currently
collapsed into one, and they need different rules.

**The economic frame that ties them together:** the framework's own §1 says taste is the
scarce input. Therefore **unjudged work is inventory**, and inventory is the waste this
method exists to prevent. Tokens are not the cost; *work in flight that has not passed the
human's judgment* is.

| Scope | Proposed rule |
|---|---|
| **A round** | Ends when (a) there is an artifact the human can judge and (b) the next step needs a verdict that does not exist yet. Before (a) there is nothing to judge; after (b) you are stacking inventory. |
| **A batch** | Stop when unjudged work exceeds what ONE review can *attribute*. Roughly: one playable build and 3–5 named changes. Past that the human's reaction cannot be traced to a change — which is exactly the 31/07 failure, where too much moved at once and *"mais inimigos não virou mais dificuldade"* could not be attributed. |
| **An axis** | Retires when it clears its bar and the human's last two readings on it were positive and unprompted. A retired axis leaves the rotation. Graphics retired on 01/08. Without this rule the agent keeps polishing where returns already flattened, which is *operating below the frontier while spending*. |
| **The project** | You are at the frontier when a round produces something the human cannot distinguish from the round before. |

**Why the agent is the wrong party to hold this loosely.** The agent has no fatigue and no
diminishing sense of productivity — every round feels worth doing. The human has both. So
the stopping rule exists to protect *him*, and leaving it to the agent's discretion is
leaving it to the party with the structural incentive to continue. On 01/08 the agent did
stop before the phases system, and stopped correctly — but by judgement, not by rule, and
judgement is not a criterion.

### P7 — What the agent harness should and should not be used for

Question from the human on 01/08: would multi-agent, goals or scheduled loops optimize the
Taste Loop, or is the current setup the better cost-benefit?

**The general answer follows from P6.** Multi-agent machinery increases *production*. The
Taste Loop is bottlenecked on *validation*. Adding production to a validation-bottlenecked
system produces inventory, not value. That is the whole analysis; everything below is where
the general answer has exceptions.

| Feature | Verdict | Why |
|---|---|---|
| **Parallel subagents for building** | **No** | §5: parallelize capability, serialize coherence. This project is almost entirely coherence-coupled — on 01/08 one change to the tissue moved the art, the parallax, the HUD, the balance and the tests. A subagent optimizing the tissue art in isolation would have fought the balance work. |
| **Scheduled loops / cron** | **No, actively harmful** | They optimize unattended throughput. The loop's scarce input is attended judgment. Rounds that run while the human sleeps produce exactly the inventory P6 exists to prevent. |
| **Parallel subagents for the FRONTIER PROBE (§3.0)** | **Yes** | The one genuinely fan-out-shaped step: 2–4 materially different idioms, each independent by construction, and §9 requires the critic not know which is which. Worktree isolation fits. |
| **Blind critic as an agent (§9)** | **Not yet** | Already in the method and deliberately unbuilt. `HARNESS.md` §7 gates it on the human judging the same subjective axis more than twice a week. Building it for an axis that just retired would be apparatus without a subject. |

**And the correction that matters most:** the bottleneck the agent actually hit on 01/08 was
hand-tuning `tuning.json` against the bot — many turns of guess, run, read, guess. That is
not an agent problem. `tuning.json` is data and the bot is headless and deterministic, so a
**parameter sweep** — N configs, ranked by target metrics — solves it at rung 2/3 of the
ladder, cheaper and more reliably than any fleet. Reaching for agents there would be
climbing the ladder for a problem the rung below already catches, which is the single
failure §2 exists to prevent.

## 5b. Proposals raised after 01/08

### P8 — A reconciliation pass at the open of every cycle · ADOPTED 02/08 → §3b

Raised by the human on 02/08, mid-session, while watching the agent do it by hand.

**The case.** 01/08 ended with a deliberate handoff: the whole next round was written into
`BACKLOG.md` precisely so the next session would not need the conversation that produced it.
The content survived — a cold session reconstructed the pivot, the seven axes, the capability
surface and the full round design without asking anything. **Four navigation defects did not:**

| Defect | Why it survived |
|---|---|
| The session ordering in `CLAUDE.md` did not include `BACKLOG.md` | The handoff wrote the round into a file nobody was told to read |
| "Crowded but not dangerous" appeared struck out *and* reopened | Two edits, different turns, neither read the other |
| Two different "next rounds" declared, 14 lines apart | Same file, same day, no pass ever compares a file to itself |
| The gate counter existed only in the append-only log | Recording that it changed is not the same as recording what it is |

**The pattern.** All four are the same failure at a different layer than L1. L1 was a verdict
that superseded a declaration; this is state that is internally inconsistent, or unreachable,
or has no owner. None of them are caught by the round-close questions, because a round closes
against *what it did* and these are defects in *what was already there*.

**Why it is cheap.** A cold session has total recall of files it just read and no memory of
the conversation that produced them — the exact inverse of the human. Comparing files against
each other is the one task where that inversion is an advantage, and it costs zero human
attention. Rungs 1–3, by construction.

**It also closes L5.** The distillation-debt check is item 6 of the pass. §8 said to distill
past ~30 lines and nothing ever checked; the cycle open is the trigger that check never had.

### P9 — A devolutiva antes da construção · ABERTA, precisa do veredito dele

**The case.** On 02/08 the human asked for the white cell to be *"entre as hemácias"*. That
phrase had a cheap reading — draw order — and an expensive one — bodies occupying space. The
agent took the cheap one. Twice. The human had to reformulate three times, ending with an
analogy (*"a crowded train station"*) before the right reading landed. The expensive reading
was the one with a mechanic inside it, and that is not a coincidence: cheap readings are
cheap precisely because they change nothing structural.

Two levas were spent. Both shipped working code. Neither was what he wanted.

**What the framework lacks.** §3.0 is a frontier probe: *where can we go* — samples of the
agent's reachable set, on the agent's axis of uncertainty. Nothing covers *did I understand
what you said* — samples of the agent's **interpretation**, on the human's axis of
uncertainty. They look similar and solve opposite problems.

**Proposal.** When a request admits two implementations whose cost differs by more than the
cost of mocking both, produce the cheapest possible artifact of each reading — a still, a
sketch, five lines of pseudo-code — and let the human point. Never a paragraph asking "did
you mean A or B", because the whole failure is that the agent's paraphrase of A and B is
generated from the same misreading that produced the wrong build.

**Trigger, so it does not fire on everything:** only when the two readings differ in *what
kind of thing gets built* (data vs behaviour, render vs sim, one file vs a subsystem). Two
variants of one idea are not two readings; they are §3.0's business.

### P10 — Instrumento novo passa pelo caso nulo antes de ser usado · ADOTADA → §2

On 02/08 the agent built a pixel-difference measurement to prove the crowd of red cells was
breathing. It reported ~50% of pixels changing. The number meant nothing: run with the crowd
switched **off** and 96.6% of pixels still change, because palette cycling repaints the
background by itself. The instrument was measuring the plasma.

The oracle ladder (§2) says never to climb a rung the one below already covers. It says
nothing about whether a rung *works*. A broken instrument is worse than no instrument,
because its output is a number and numbers get believed — including by the agent that
built it.

**Rule: run a new instrument on a case where the answer is known — usually the null case,
with the thing being measured turned off. If it cannot tell the null case from the real one,
it is not an instrument.** Cost: one extra run.

### P11 — Baseline sem o comando que a reproduz é boato · ADOTADA → §3b

`BACKLOG.md` carried two different baselines for the same bot measurement — *157s/266s* in
one bullet and *75-89s* in another, fourteen lines apart. On 02/08 the agent quoted the stale
one to conclude that a change had made the game far too hard. The parameter sweep contradicted
it: the change had made runs *longer*, not shorter.

The cycle-open pass (§3b) checks for contradictions, and it had already run that morning —
and missed this, because it was looking for contradictory *claims*, not contradictory
*numbers*. Numbers rot faster than prose: prose about a dead constraint reads odd, a stale
number reads fine.

**Rule: any measured baseline written into a state file carries the command that regenerates
it and the date it was taken.** Then a suspicious number is one command away from being
checked, instead of an argument between two lines of the same file.

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

### L6 · 01/08 · The loop has no stopping rule, at any scope

Raised by the human. The method optimizes per round and never says when a round, a batch,
an axis or the project is done. The agent has been deciding by discretion — correctly so
far, and correctly is not the same as reliably. **Not yet adopted** — P6 is open.

### L7 · 01/08 · More production does not help a validation-bottlenecked loop

Raised by the human as a question about multi-agent tooling; the answer generalizes past
tooling. Anything that raises output without raising the human's capacity to judge it makes
the loop worse, not better. **Not yet adopted** — P7 is open.

### L5 · 01/08 · Distilling is a debt that accrues silently

`TASTE.md` §1 was distilled on 31/07 and still described the pre-pivot game while
`DECISIONS.md` grew to 133 lines. §8 says to distill past ~30 lines; nothing *checks*.
Same class as L1 — a state file with no maintenance trigger — but a different mechanism:
L1 was a verdict that superseded a declaration, this is slow accumulation with no single
moment where it becomes wrong. **Closed 02/08** by P8: the round-close questions catch
supersession, not drift, so the check moved to the *cycle open* instead — §3b, item 6.

### L9 · 02/08 · The reconciliation pass paid off, and the human is the one who confirmed it

He ended a session, opened a clean context, and the work continued without him re-explaining
anything: *"você conseguiu dar continuidade no trabalho"*. That is the first positive evidence
for §3b, adopted the same day, and it is worth as much as the four defects that motivated it —
a method change that is never observed working is indistinguishable from ceremony.

Worth naming precisely, because the credit is shared: §3b did not make the files correct, it
made the agent *check* them, and three of the four defects were fixed in the first ten minutes
of the session. The handoff worked because the pass ran, not because the handoff was good.

### L10 · 02/08 · The human found two causes the agent had reasoned past

Twice in one cycle, one sentence each. *"The fibrin can go to the back"* and *"in the
background the variation between red and black can be much subtler."* Both times the agent
had been reasoning about **structure** — which layer sits where — and both times the answer
was **value** — which colour is on the pixel. The agent had already rendered and looked at the
output; looking was not enough, because it looked to check whether the change worked rather
than to trace where a colour came from.

Same family as §10's *"confident about work it cannot see"*, but a distinct mechanism:
confident about **causes it has not traced**. When the symptom is perceptual — "it doesn't
fill", "it has no life" — enumerate where those pixels are actually drawn before changing
architecture. No proposal yet; P9 and P10 already cover the neighbouring ground and the
framework does not need a third rule the same day.

### L8 · 02/08 · A handoff that passed on content still failed on navigation

The 01/08 handoff was deliberate and written for a cold reader, and the cold reader did
reconstruct the project from files alone. It still shipped four defects, all of them about
finding the state rather than about the state itself — including a session ordering that
omitted the file holding the round to be run. **Adopted** as `TASTE-LOOP.md` §3b, the
reconciliation pass. Evidence: this session, `DECISIONS.md` 02/08.

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
