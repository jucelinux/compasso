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

1. **Narrow the axis.** One axis per round. "Make it better" is too vague to produce a
   gradient — the lead agent decomposes the goal into separately judgeable pieces.
2. **Two materially different variants**, A and B. Not one and a fine-tune of it.
3. **Climb rungs 1–3** on both. A variant that fails is discarded and redone, not judged.
4. **Blind critic**, if and only if the axis is subjective.
5. **Clear margin → apply and continue. Tie or direction call → hold for the human.**
6. **Human review in batches**, never per round.
7. **Record the verdict** in the same turn it is given.

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

### `TASTE.md` — distilled rubric, ~15 lines max

Once `DECISIONS.md` passes ~30 lines, distill recurring patterns into rules. The history
stays for auditing; what enters the critic's prompt is the distillate. A rubric that does
not fit is a rubric that gets ignored.

### `BACKLOG.md` stays separate

Backlog is what is open. Decisions are what is settled. Mixing them is how decision logs
die.

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