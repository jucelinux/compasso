# TASTE-LOOP.md

A method for driving an agent toward exceptional quality without burning the scarce
resource, which is human judgment.

Domain-agnostic. Nothing here is specific to games, to a stack, or to a project. The
domain-specific machinery lives in a harness file; the project itself lives in `CLAUDE.md`.

---

## 1. What it optimizes

Tokens are abundant. Rounds are abundant. **Taste is the scarce input.** Every part of this
design exists to spend as little of it as possible and to never lose what was spent.

The loop does not end when an artifact passes a bar. It ends when the cheap critic has
learned to judge the way the human does. Each recorded verdict makes the next round
cheaper — that is the whole mechanism.

---

## 2. The oracle ladder

Never climb a rung if the one below still catches the problem. LLM judgment is the most
expensive and least reliable oracle in the cycle — it is the last resort, not the first.

| # | Oracle | Cost | Catches |
|---|---|---|---|
| 1 | Compiler, linter, build | ~zero | Mechanical errors |
| 2 | Deterministic tests | ~zero | Behavior and performance regressions |
| 3 | Automated diff against a baseline | low | Unintended drift |
| 4 | Blind critic (LLM) | high | Genuinely subjective axes only |
| 5 | Human, 30 seconds | highest | Direction, taste, "this isn't the thing" |

**Nothing reaches rung 5 without clearing rungs 1–3.** Burning fresh human attention on a
mechanical error is the most expensive waste available.

Rung 2 holds most of the value and is the rung almost nobody builds. Whatever the domain,
ask: what property of the artifact can be asserted mechanically and re-checked forever?

---

## 3. One round

0. **Probe the frontier — first round on an axis only.** Before optimizing, produce 2–4
   cheap, disposable samples spanning *different idioms*, not variants of one idea, and let
   the human pick. This exists because neither party can see the frontier alone: the human
   cannot see where the agent's ceiling is highest, and the agent is an unreliable reporter
   of its own ceiling (§4). Skip on later rounds of the same axis — the idiom is settled.
1. **Narrow the axis.** One axis per round. "Make it better" is too vague to produce a
   gradient — the lead agent decomposes the goal into separately judgeable pieces.
2. **Two materially different variants**, A and B. Not one and a fine-tune of it.
3. **Climb rungs 1–3** on both. A variant that fails is discarded and redone, not judged.
4. **Blind critic**, if and only if the axis is subjective.
5. **Clear margin → apply and continue. Tie or direction call → hold for the human.**
6. **Human review in batches**, never per round.
7. **Record the verdict** in the same turn it is given.
8. **Propagate it.** Recording is not the same as applying. If the verdict supersedes
   something a *state* file still declares, fix that file now — see section 8.
9. **Close the round.** Answer four questions out loud, in the same turn:
   *Did this round produce a gate reading, or not?* · *What did the loop itself get wrong?*
   · ***Did this round operate below a ceiling either side knows about but did not name?*** ·
   *Does anything in this file need to change?* See section 12.

---

## 4. Judge artifacts, never source

The critic evaluates the *output*, in the form a real user would encounter it — never the
code, the diff, the commit message, or the filenames. Source access converts a judge into
a reviewer, and reviewers rate effort instead of results.

Every domain needs three things defined before the loop can run:

| | Question | Example (2D game) |
|---|---|---|
| **Core** | What can be made deterministic and re-run identically? | Seeded fixed-timestep sim |
| **Sample** | What artifact captures the axis in seconds? | 3s clip from a replay |
| **Bar** | What external, real-world thing sets the standard? | Celeste, for movement |

If any of the three is missing, the loop degrades into "ask the human every round."

One bar per axis, not one bar overall. A general "be as good as X" gives no gradient.

### The bar is negotiated, not assigned

Neither party can set it alone, and assigning it to the human wastes rounds. He knows what
the thing should *be*; he does not know what is reachable, because the agent's capability
surface is invisible to him and is not a fact about "AI" in general — it is specific to this
model, this harness and this stack.

| Who | Supplies |
|---|---|
| Human | Direction and ambition level — *what this should feel like, and how far to push* |
| Agent | Where the frontier actually is, **with samples** — *here is the reachable set* |
| Human | Picks a point on it |

A bar outside the reachable set is not ambition; it is a wasted round. On 01/08 this project
spent one asking for near-photorealism, which no amount of effort was going to reach, while
a stronger reachable idiom sat unused for three rounds.

**Agent self-report does not count as the frontier.** It is a hypothesis, and it goes to
rungs 1–3 of the ladder like any other. The same day the agent wrote *"the real jump is a
WebGL shader"* into the decision log as fact, and it was wrong about the direction — the
real jump was animation, of which the game had exactly zero frames. Fluent, confident,
recorded, and pointing away from the answer. Samples are evidence; paragraphs are not.

---

## 5. Parallelize capability, serialize coherence

Sub-agents working in parallel on axes that **interact** produce a soup where every
individual axis is maximized and the whole is incoherent.

- **Parallelize:** independent subsystems that meet at an interface.
- **Serialize, in a single agent, with the human in the loop:** anything where the axes
  compose into a single perceived impression.

The test: if improving axis A alone could make axis B feel worse, they do not parallelize.

---

## 6. Late and narrow

Do not run the loop from scratch. Polishing architecture that is still going to change is
the most common way to spend a lot for nothing.

Reach a working vertical slice through ordinary collaboration, which is cheap. Only then
point the loop at the two or three axes that are worth it.

This applies to the harness too, and it is easy to get wrong. Round zero is only the
**deterministic core** — the thing that makes runs re-runnable. The judging apparatus that
turns runs into samples is built *after* the slice exists, when there is finally something
whose quality is worth judging. Building the judge before the artifact is the same mistake
as running the loop before the slice, wearing better clothes.

---

## 7. The human

Not an inspector. **The one who sets the bar and breaks ties** — the only one who knows
what the thing is supposed to be.

**Call when:**
- there is a direction call (kill or continue; is this about X or about Y)
- the critic ties on a subjective axis
- a slice is complete
- 2–3 judged pairs have accumulated

**Do not call when:**
- a test would answer it
- it is already settled in `TASTE.md`
- rungs 1–3 have not been cleared

**Format: binary.** "A or B?" extracts taste fast and with no effort. "What do you think?"
produces a paragraph that will be misread. One question at a time, both samples attached,
one line on what differs.

**Never synchronous per round.** Being interrupted every iteration destroys the human's
day and trains them to rubber-stamp without looking.

---

## 8. The taste files

The purpose of the human loop is to **calibrate the cheap oracle**, not to replace it.

### `DECISIONS.md` — append-only, one line per verdict

```
DATE · AXIS · WINNER · short reason
```

Never edit old lines. Never write prose — a decision log that becomes an essay is a
decision log nobody rereads, including the agent.

### `TASTE.md` — three sections, and they are not the same kind of thing

**§1 Human taste** — distilled rubric, ~15 lines max. Once `DECISIONS.md` passes ~30 lines,
distill recurring patterns into rules. The history stays for auditing; what enters the
critic's prompt is the distillate. A rubric that does not fit is a rubric that gets ignored.
Rewrite it whole when distilling; never accumulate.

**§2a Agent biases** — tendencies the human should push back on. Its purpose is to give him
standing to ask *"is this you going where you like again?"* and get an honest yes.

**§2b Agent capability surface** — where the ceiling is high, where it is low, and **what
shape of constraint raises it**. This is the half that was missing until 01/08, and its
absence cost three rounds: the constraint *"the model does not draw"* was recorded as an
obstacle to route around and never as a question about where the ceiling is highest. The
answer — rule-governed pixel art, which converts drawing into constraint satisfaction — was
available the entire time.

**Every §2b entry must cite an artifact that demonstrated it.** Not a self-assessment. See
section 4 on why the agent's word about its own ceiling is worth nothing on its own.

### `BACKLOG.md` stays separate

Backlog is what is open. Decisions are what is settled. Mixing them is how decision logs
die.

### Log files vs state files — the distinction that was missing

This split was added on 01/08, after the loop failed at exactly this seam. Every file the
project keeps is one of two kinds, and they have opposite maintenance rules:

| Kind | Files | Rule | Failure if ignored |
|---|---|---|---|
| **Log** | `DECISIONS.md` | Append only. Never edit. A superseded line is not a wrong line. | Grows; that is fine |
| **State** | `CLAUDE.md` §1, `BACKLOG.md`, `TASTE.md` | Must be **re-derived** whenever a verdict supersedes them | Silently declares dead constraints as binding |

A log is self-maintaining. A state file is not, and nothing about appending to the log
tells you a state file went stale. That is why section 3 has a separate *propagate* step.

**A pivot invalidates a batch, not a line.** When a core falls, it takes a cluster of
dependent constraints with it, and each one has to be hunted down by hand. On 01/08 the
`dash+creep` core fell; `CLAUDE.md` §1 kept declaring *geometric primitives only*, *8 fixed
directions* and *i-frames until the end of the next dash* as binding for a full day after
all three were dead. Nobody noticed, because every new session read that file first and
took it at its word.

State files should say **as of DATE** on any list they call binding. A date is the cheapest
possible staleness signal: it does not prove the list is current, but it makes "when was
this last checked" answerable without archaeology.

### A constraint proposed as a virtue must be split

When either party proposes a constraint and argues it as a design virtue, record **both
halves**: which part is virtue, and which part is limitation.

> *"Only geometric primitives — the restriction becomes identity; it denies the crutch of
> pretty assets."* — 31/07

That was true. It was also a cover story for *the agent cannot draw*, and only the flattering
half reached the decision log as the headline. Recording one half buried the question
"what else does this limitation make us good at?" for three rounds.

Both halves are usually true. The virtue half is the one that feels like insight, which is
exactly why it is the one that gets written down alone.

### Disagreement outranks agreement

A round where the critic picks A, the human picks B, and the reason is recorded teaches
more than ten rounds of agreement. Do not soften the critic's pick toward the expected
answer — that makes the loop dumber.

---

## 9. Critic packet

The complete input to the blind critic. Nothing else.

```md
# Judgment: <axis>

## Reference bar
<external reference for this axis>
Why this is the bar: <one line>

## Rubric
<contents of TASTE.md>

## Variant A
<sample>
<objective metrics, if any>

## Variant B
<sample>
<objective metrics, if any>

## Task
Judge only <axis>. Ignore everything else present in the samples.
Pick A or B, or declare a tie. State the single most important reason in one sentence.
If neither clears the reference bar, say so — a winner is not required.
```

Two rules keep this honest:

- **The critic never learns which variant is new.** Recency bias is the primary failure
  mode of LLM-as-judge. Randomize order; keep the mapping in a file the critic cannot see.
- **"Neither" is a valid verdict.** A loop that must produce a winner will manufacture one,
  and that is how a project drifts sideways for ten rounds while appearing to improve.

---

## 10. Failure modes

| Symptom | Cause |
|---|---|
| Costs a lot, improves little | Rung 4 used where rung 2 would do |
| Everything looks good, feels wrong | Coherence axes were parallelized |
| Human is exhausted by round 5 | Called synchronously, or for things tests resolve |
| Critic always picks the newer variant | Ordering not randomized |
| Improvement stalls after passing the bar | Bar too general, or no "neither" option |
| New session repeats settled arguments | Verdicts not written down the same turn |
| Polish that gets thrown away | Loop started before the vertical slice |
| New session works from constraints that are dead | Verdict recorded in the log but never propagated to the state files |
| Backlog describes a game that no longer exists | Same cause; a pivot invalidates a batch and nothing sweeps for it |
| Rounds improve the thing, the loop never improves | No round-close step; the method is never itself under review |
| Agent is confident about work it cannot see | Axis has no artifact the agent can actually inspect — see section 12 |

---

## 11. Porting to a new domain

Before the first round, answer the three questions in section 4. Concretely:

- **Core** — what is the deterministic, re-runnable unit? If nothing can be re-run
  identically, build that first; there is no cheap loop without it.
- **Sample** — what can a judge consume in under a minute that actually contains the axis?
  If the axis only shows up over twenty minutes of engagement, either find a proxy or
  accept that this axis is human-only.
- **Bar** — what real-world artifact plays the role of the standard, per axis?

Then build the harness that produces samples automatically. That harness is round zero,
and it comes before any content.
---

## 12. Evolving the loop

This document is not settled. It is the first iteration of a method, and it has already
been wrong twice in two days. Treat it as the project treats the game: something that gets
a verdict each round.

**Rule: the loop is reviewed at the close of every round**, in the same turn, out loud.
Three questions, and the answers are cheap:

1. **Did this round produce a gate reading?** If not, say so plainly. A round that
   improved something real but measured nothing is not a failed round — but it is a round
   where the gate counter does not move, and pretending otherwise is how a project drifts
   sideways while appearing to advance.
2. **Where did the loop itself fail?** Not the work — the method. A rule that was followed
   and still let something through is worth more than a rule that was skipped.
3. **Does this file need to change?** If yes, change it in the same turn, and log it below.

Loop verdicts go in `DECISIONS.md` like any other, on the `LOOP` axis. They are decisions
about how the project decides, which makes them the most expensive ones to get wrong and
the cheapest ones to forget.

**Raw material lives in `TASTE-LOOP-LEARNING.md`.** Cases, evidence and proposals go there
first; a change graduates into this file only when the human accepts it. Keeping the two
apart is what stops this document from turning into a diary of half-tested ideas — and it
is the same log-versus-state split as section 8, applied to the method itself.

### Changelog

| Date | What changed | What went wrong that caused it |
|---|---|---|
| 31/07 | Bar per axis, not one bar overall (§4) | A general "be as good as X" gave no gradient; the dash was approved with no bar declared and it did not scale to the next axis |
| 31/07 | Restart must use its own key, not the action key | The gate measured a reflex instead of an intention: the human pressed the shared key 2.9s after dying and did not mean to continue |
| 01/08 | Log vs state files, and the *propagate* step (§3.8, §8) | Three constraints stayed declared as binding for a day after the core that implied them fell |
| 01/08 | Round close, and this section (§3.9, §12) | The method was never itself under review; every round improved the game and none improved the loop |
| 01/08 | "Agent is confident about work it cannot see" as a named failure mode (§10) | Five real visual defects survived code review and a green test suite; only rendering the output found them. If an axis has no artifact the agent can inspect, the agent's confidence on that axis is worth nothing |
| 01/08 | Frontier probe as step 0 (§3) | The agent's strongest visual idiom sat unused for three rounds; the human discovered it by dissatisfaction, which is the most expensive detector available |
| 01/08 | The bar becomes negotiated (§4) | The human set a bar outside the reachable set, because the agent's capability surface is invisible to him and undocumented |
| 01/08 | Agent self-report is a hypothesis, not a fact (§4) | "The real jump is a WebGL shader" went into the decision log as fact and was wrong about the direction |
| 01/08 | `TASTE.md` §2 splits into biases and capability surface (§8) | §2 collected tendencies but never boundaries or maxima, so nothing ever asked where the ceiling was highest |
| 01/08 | Fourth round-close question: did we operate below a named ceiling? (§3.9) | Nothing in the loop detected three rounds spent below the frontier |
| 01/08 | Constraints proposed as virtues must be split (§8) | "Only geometric primitives — the restriction becomes identity" was virtue and limitation; only the virtue half was recorded |
