# TASTE-LOOP.md

**Version 0.8 — 08/08/2026.** Distilled: every rule keeps its case in **one line**; the
full incident, evidence and validation status live in the package's `CHANGELOG.md`
(append-only; only the *Validated* column of past entries may be filled in).

A method for driving an agent toward exceptional quality without burning the scarce
resource: human judgment. **This file is domain-neutral and must stay so** — the projects
and vivid incidents behind each rule live in the package's `CHANGELOG.md`, which never
enters a project repo: a case that reads like a requirement gets copied as one (v0.6).

**Ceiling: 350 lines, currently at it.** A new rule costs a merge or a retirement
(§3b.6): a method that does not fit a session's attention is remembered selectively, and
that is where rules die (the null-case rule, in writing and not run — v0.4 ⚠️).

---

## 1. What it optimizes

Tokens are abundant. Rounds are abundant. **Taste is the scarce input — and there are two
of them:**

- **The human's taste** — what the thing should *be*. Extracted in binary questions,
  distilled into `TASTE.md` §1, never lost once spent.
- **The agent's side** — where its ceiling is, what constraint shape raises it, what it
  pulls toward. Recorded in `TASTE.md` §2. The frontier is joint: the human cannot see
  where the agent's ceiling is highest, and the agent is an unreliable reporter of it.
  (Three rounds below a known ceiling — CHANGELOG v0.3.)

**A spent verdict stays spent by compiling.** Prose evaporates by the next session. An
aesthetic choice compiles into a **knob** (a parameter); a rule compiles into a **lock**
(an assertion that trips on its own); only the continuous residue stays prose in the
rubric. The loop ends not when an artifact passes a bar but when the judgment that passed
it has become structure — and **the critic that gets calibrated is the lock set**; the
LLM critic (§9) is the niche for what will not become a count. (A full project ran the
loop on 266 locks and zero LLM verdicts — v0.5.)

**Two loops, one method.**

| Loop | Who | One turn |
|---|---|---|
| **The round** (§3) | agent + human | axis → variants → ladder → verdict → compile |
| **The bench loop** (§3c) | agent alone | author → look → name the defect → knob or lock |

The bench loop runs dozens of times per round, spending compiled judgment, not the human's.

---

## 2. The oracle ladder

Never climb a rung if the one below still catches the problem. LLM judgment is the most
expensive and least reliable oracle — last resort, not first.

| # | Oracle | Cost | Catches |
|---|---|---|---|
| 1 | Compiler, linter, build | ~zero | Mechanical errors |
| 2 | Deterministic tests, **locks** | ~zero | Behavior, regressions, compiled taste |
| 3 | Automated diff against a baseline | low | Unintended drift |
| 4 | Blind critic (LLM) | high | The continuous residue of subjective axes |
| 5 | Human, 30 seconds | highest | Direction, taste, "this isn't the thing" |

**Nothing reaches rung 5 without clearing rungs 1–3.** Rung 2 holds most of the value: it
is where mechanical properties live *and* where verdicts land when they compile. In a
discrete, locked space half of taste becomes counting (§8); the rest is the upper rungs'.

**Instruments flatter.** Everything that measures is an instrument, and its defects are
not random in direction. Three rules:

1. **A new instrument passes the null case first.** Run it with the measured thing off;
   if it cannot tell that from the real case, its number is worse than no number. (An
   instrument reported massive change with its subject off — v0.4 ✅✅, then ⚠️ skipped.)
2. **A lock needs margin, not equality — calibrated both ways against desired behaviour.**
   Equality passes on a trivial difference; a 100% rule fails a deliberate pause. (A
   four-state cycle collapsed to two and passed a byte-equality lock — v0.5.)
3. **Inherited convention is not verified convention.** A port carries assumptions in
   silence; the null case is how they surface. (Three inherited defects, all flattering —
   v0.4.)

---

## 3. One round

0. **Probe the frontier — first round on an axis only.** 2–4 cheap disposable samples in
   *different idioms*, and the spread **brackets**: one sample deliberately overshoots.
   (Two binary questions beat three rounds of reasoning — v0.3 ✅; a mid-range probe
   wasted its round — v0.5.)
1. **Narrow the axis, and name what is absent.** One axis per round; "make it better" is
   not a diagnosis — the defect is almost never in the parameter you want to touch.
   (Five cosmetic fixes tried first, five failures — v0.5.)
2. **Two materially different variants**, A and B. Not one and a fine-tune of it.
3. **Climb rungs 1–3** on both. A variant that fails is discarded and redone, not judged.
4. **Blind critic** (§9), only if a subjective residue remains after the locks speak.
5. **Clear margin → apply and continue. Tie or direction call → hold for the human.**
6. **Human review in batches, bounded by attributability** — as much as one sitting can
   attribute, no more, never per round. (Seven changes, untraceable reaction; then the
   opposite failure, accumulation — v0.5.)
7. **Record the verdict the same turn — then compile it.** Choice → knob; rule → lock;
   residue → prose. If it supersedes a state file, fix that file now (§8). (Prose
   judgments evaporated overnight — v0.5.)
8. **Third occurrence of a defect class → stop patching.** The fix is at the wrong level:
   write the pattern in the log, generalize the lock so the family trips as one. (Two
   families, four occurrences each — v0.5.)
9. **Close the round, out loud:** any direction reading — gate or other — or none? ·
   what did the loop itself get
   wrong? · did we operate below a named ceiling? · does this file need to change? (§12)

---

## 3b. Cycle open — the reconciliation pass

A round has a close; a **cycle** — any session from cold context — has an open. Costs no
human attention; lives on rungs 1–3. (A handoff passed on content, failed on navigation —
v0.4 ✅.) The agent's total recall of files it just read beats yesterday's memory here.

1. **Rungs 1–3 first.** Build, tests, numbers — reconstruct against a working tree.
2. **Reconstruct out loud from the files alone.** What you know but cannot point to a
   file for is a hole in the files — fix the file.
3. **Reading order complete?** Every state file reachable from `CLAUDE.md`'s ordering. A
   file nobody is told to read does not exist.
4. **Contradictions inside state files.** Settled-and-open at once; two "next"s; binding
   lists with no *as of* date; one measurement, two values. Every baseline carries **the
   command that regenerates it and its date** — without both it is a rumour. (One was
   quoted into a conclusion a sweep contradicted — v0.4 ○.)
5. **State living in a log.** Changing numbers need an owner in a state file;
   `DECISIONS.md` records that they changed, never what they are.
6. **Distillation debt.** `DECISIONS.md` ~30 lines past the last `TASTE.md` §1
   distillation → distill. Same for this file: near the ceiling → merge or retire (§12).
7. **Instrument debt.** Any instrument created or changed since the last open: show its
   null-case run, or mark its output untrusted. (This item *runs* the rule that was
   skipped — v0.4 ⚠️ → v0.5.)
8. **Validation debt.** Any `CHANGELOG.md` rule still ○ after ~2 weeks, or ⚠️: into the
   human's next batch, binary — keep or retire. (v0.5.)

**Output:** every defect fixed same-turn or named open; one `LOOP` line in `DECISIONS.md`;
direction calls batched with the round's opening ask.

---

## 3c. The bench loop

The agent's inner cycle, between human calls: **author → look → name the defect →
compile.** Authoring is the cheapest step; looking cannot be skipped; naming decides
whether the fix is real or cosmetic; compiling is what stops the defect returning.

- **The agent must have a channel to perceive its own output** — no human, no browser in
  the path: visual → text dump, audio → envelope, data → shape. Without it there is no
  loop, only generation plus syntax checks. Built at round zero (`HARNESS.md` §3). (Five
  defects behind 65 green tests — v0.2 ✅; a blank output behind 266 — v0.5.)
- **Looking catches what is wrong, not what is absent.** Against absence, **count**:
  re-read the assembly list; lock that what is produced reaches the output. (A layer
  updated 60×/s, never staged — v0.2 ✅; four assembly locks — v0.5.)
- **The loop's latency is a design decision.** A half-second turn produces worse
  judgments than a 20 ms turn — it changes what the agent dares to try. Budget in
  `HARNESS.md` §4. (500 ms → 7 ms — v0.5.)
- **Derived numbers survive the loop; hand-calibrated numbers do not.** The loop is made
  of knob turns; a magic constant breaks on the first one. (v0.5.)

---

## 4. Judge artifacts, never source

The critic — LLM or human — evaluates the *output*, as a real user would meet it. Source
access converts a judge into a reviewer, and reviewers rate effort.

Three questions define a domain before the loop can run (worked table in `HARNESS.md`
§1): **Core** — what re-runs identically? **Sample** — what artifact carries the axis in
under a minute? **Bar** — what external thing sets the standard, *per axis*? One bar per
axis; a general "be as good as X" gives no gradient.

**The bar is negotiated, not assigned.** The human supplies direction and ambition; the
agent reports the reachable set **with samples**; the human picks the point. A bar
outside the reachable set is a wasted round. (An unreachable bar was set while a stronger
reachable idiom sat unused — v0.3 ○.)

**Agent self-report is a hypothesis.** It goes to rungs 1–3 like any claim; samples are
evidence, paragraphs are not. (The agent recorded its guessed frontier as fact — fluent,
confident, wrong about the direction — v0.3 ✅.)

---

## 5. Parallelize capability, serialize coherence

Parallel sub-agents on axes that **interact** produce a soup: every axis maximized, the
whole incoherent. Parallelize independent subsystems that meet at an interface; serialize
— one agent, human in the loop — whatever composes into one perceived impression. Test:
if improving A alone could make B feel worse, they do not parallelize.

**Corollary.** Multi-agent machinery raises *production*; this loop is bottlenecked on
*validation* — added production is inventory. The one fan-out step is the probe (§3.0).

---

## 6. Late and narrow

Do not run the loop from scratch — polishing architecture that will still change buys
nothing. Reach a vertical slice through ordinary collaboration, then point the loop at
the two or three axes worth it. Round zero is only the deterministic core **plus the
perception channel** (`HARNESS.md`); the judging apparatus comes after the slice —
building the judge before the artifact is the same mistake in better clothes.

---

## 7. The human

Not an inspector. The one who sets the bar and breaks ties — and the method's most
sensitive instrument, in two roles:

**Director — when choosing.** Binary, batched: "A or B?", both samples attached, one line
on what differs. Call when: direction call · critic tie · slice complete · 2–3 judged
pairs waiting. Do not call when: a test answers it · `TASTE.md` settles it · rungs 1–3
not cleared. Never synchronous per round — interruption trains rubber-stamping.

**Sensor — when something feels off.** The imprecise report ("something odd about the
back") is the highest-sensitivity, lowest-resolution instrument in the building: near
perfect on *that*, almost never right on *where*. Treat it as raw data and hunt the root
— never as a work order on the symptom. (Three root fixes from three non-technical
phrases, each cause three levels from its symptom — v0.5.)

**"I know what I want but cannot express it" → translate, do not offer a menu.** He will
name external references; follow them. A menu only helps when the right answer is on it.
(Every option declined, two references named, answer got better — v0.5.)

---

## 8. The taste files

The calibration targets. Human taste compiles into the distillate; verdicts into knobs
and locks; what cannot compile lives below. Templates in `templates/`.

**`DECISIONS.md`** — append-only, one line per verdict: `DATE · AXIS · WINNER · reason`.
Failures enter with the same weight as wins — defect *families* only become visible
because first occurrences were written (§3.8). Never prose, never edited.

**`TASTE.md`** — three sections. **§1 human taste**: ~15 lines, rewritten whole at each
distillation — a rubric that does not fit gets ignored. **§2a agent biases**: standing
for the human to ask *"is this you going where you like again?"*. **§2b capability
surface**: where the ceiling is high and low and **what constraint shape raises it**;
every entry cites a demonstrating artifact (§4) and is marked **portable or stack** — an
unmarked surface is the next project's inherited superstition. (§2b's absence cost three
rounds; its entries then redirected review — v0.3 ✅.)

**`BACKLOG.md`** — what is open. Decisions are settled; mixing them kills both.

**Log vs state — opposite maintenance rules.** Logs (`DECISIONS.md`, learning file,
`CHANGELOG.md`): append-only; a superseded line is not a wrong line. State (`CLAUDE.md`
§1, `BACKLOG.md`, `TASTE.md`, this file): **re-derived** when a verdict supersedes it —
appending to a log never flags a stale state file, hence §3.7's propagate. **A pivot
invalidates a batch, not a line**; hunt the cluster. State lists carry *as of DATE*.
(Three dead constraints binding for a day, believed by every session — v0.2 ✅.)

**A constraint proposed as a virtue records both halves** — virtue and limitation. The
flattering half alone buries "what does this limitation make us best at?". (A restriction
sold as identity was cover for a capability gap — v0.3 ○.)

**Loosening a constraint: declared, priced, chosen by looking.** Same samples through
the strict path and the loosened path, side by side, cost written next to result — never
in silence. (v0.5.)

**Hard constraint is what makes taste verifiable.** A closed vocabulary, a fixed grid, a
hard budget convert *making* into *satisfying constraints*: in continuous space "is it
better?" is unanswerable; in discrete locked space half of taste becomes a count. (v0.5,
generalizing v0.3.)

**Disagreement outranks agreement.** Critic picks A, human picks B, reason recorded —
worth more than ten agreements. Do not soften the critic's pick.

---

## 9. Critic packet — the rung-4 niche

For the residue that stays subjective after the locks speak. Template in
`templates/CRITIC-PACKET.md`; the complete input: axis, reference bar, `TASTE.md`
rubric, variants A and B with samples and metrics, task line. Nothing else.

- **The critic never learns which variant is new.** Recency bias is the primary failure
  mode of LLM-as-judge: randomize order, hide the mapping.
- **"Neither" is a valid verdict.** A loop that must produce a winner will manufacture
  one — and drift sideways for ten rounds while appearing to improve.

Rung 4 is **unexercised** to date: taste has compiled to rung 2 before an LLM critic was
needed. Trigger stands — the same subjective axis judged more than twice a week; if no
project ever fires it, this is the section that retires.

---

## 10. Failure modes

| Symptom | Cause |
|---|---|
| Costs a lot, improves little | Rung 4–5 used where rung 2 would do |
| Everything looks good, feels wrong | Coherence axes were parallelized |
| Human exhausted by round 5 | Called synchronously, or for things tests resolve |
| Critic always picks the newer variant | Ordering not randomized |
| Improvement stalls after passing the bar | Bar too general, or no "neither" option |
| New session repeats settled arguments | Verdicts not written the same turn |
| Polish that gets thrown away | Loop started before the vertical slice |
| New session works from dead constraints | Verdict logged, never propagated to state |
| Backlog describes a dead product | Pivot invalidated a batch; nobody swept |
| The thing improves, the loop never does | No round close; method never under review |
| Agent confident about work it cannot see | No perception channel on that axis (§3c) |
| Fresh session picks up the wrong work | No cycle open (§3b) |
| A measurement is convincing and false | Instrument never ran the null case (§2) |
| Same defect fixed for the fourth time | Family never generalized into one lock (§3.8) |
| Last week's judgment is gone | It stayed prose — never compiled (§3.7) |

---

## 11. Porting to a new domain

Answer §4's three questions **in writing** — core, sample, bar; whichever has no answer
is the first thing to build. Then round zero — `HARNESS.md`: deterministic core plus
perception channel, before any content.

**A gate, before anything else.** One reading that says whether the thesis is alive,
taken from *behaviour*, with the number of consecutive negatives that kills it. A project
that cannot fail is being decorated, not steered. The counter has an owner in a state
file (§3b.5); when the core changes the gate usually changes with it, and a replacement
that cannot kill is not a replacement.

**A gate must be able to SURPRISE the person who owns the kill decision** — otherwise it is
a commitment device wearing a sensor's clothes, and it costs attention every session to
tell that person what they already knew. Test it by asking who can produce the reading: if
the owner produces it alone, by using the thing, it is not a gate. Prefer a reading only an
outsider can generate; then its attention cost on ordinary days is zero, which is what
keeps a gate from pulling every session toward itself. (A gate counted three judgments its
owner had said out loud, was removed for pulling focus, and was replaced the same day by an
outsider reading — v0.7 ○.)

**Install: copy `core/` — and only `core/` — into the new repo.** The package's
`CHANGELOG.md` and `examples/` stay home: evidence and instances read as requirements to
a cold session, and a project inherited another domain's residue exactly this way (v0.6).
**Then the first session runs cycle zero — `INTAKE.md`** — which fills the brackets:
direction, constraints, the pleasure boundary, the collaboration contract, the gate.
Declared taste enters as `[declared]`, outranked by any later verdict on a sample (v0.7 ○).

---

## 12. Evolving the loop

This file is under the same regime as the product: a verdict each round.

- **Round close (§3.9), every round, out loud.** Loop verdicts → `DECISIONS.md`, `LOOP`
  axis — decisions about how the project decides: dearest to get wrong, cheapest to forget.
- **Raw material in `TASTE-LOOP-LEARNING.md`**: cases, evidence, numbered proposals. A
  change graduates only with the human's verdict, same turn: edit here, entry in
  `CHANGELOG.md`, line in `DECISIONS.md` — §8's log/state split applied to the method.
- **`CHANGELOG.md` carries the burden of proof.** Every rule: dated entry, incident,
  *Validated* status. ○ is a hypothesis wearing the formatting of a result — on purpose.
  §3b.8 keeps the column alive; the ceiling is enforced at §3b.6.

### Known gaps, as of v0.5

- **No stopping rule at any scope** — round, batch, axis, project. The agent has no
  fatigue; "when are we done" cannot be left to the party with the incentive to continue.
  (P6, unratified.)
- **No per-request check that the agent understood.** Cycle zero's readings check covers
  day zero (`INTAKE.md`); the per-request half of P9 stays open.
- **No criterion for which axes deserve a frontier probe**, and **rung 4 still has zero
  observations** (§9) — retirement is on the table.
- **The gate measures direction, not joint maximum.** Only the first is instrumented.
