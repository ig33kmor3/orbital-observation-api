---
name: stack-spec-workflow
description:
    Organize and deliver ideas through single-file specs with locked requirements and mutable delivery plans, for features, fixes,
    refactors, infrastructure, or documentation. Use whenever the user wants a feature spec drafted with explicit clarification questions, locked requirements in
    `docs/specs`, a persistent phased implementation plan, or a "do the next chunk then check in" implementation loop.
---

# Spec Workflow Skill

## Purpose

Keep one stable delivery spec per initiative as the source of truth for its scope, deliverables, and acceptance criteria. Apply the workflow
to software, infrastructure, design, or documentation work. Get user approval before execution. Report progress at phase boundaries; stop
there when the user approved a single phase or explicitly requested check-ins. Documentation requests authorize documentation only, not
implementation of their proposed features.

Keep requirements and execution state in one spec file, separated by a horizontal rule (`---`).

- **Requirements = what to deliver** — locked scope, deliverables, constraints, and acceptance criteria for the initiative
- **Delivery plan = how** — mutable phases, tasks, validation results, and blockers derived from the requirements

## Working with other skills

Other skills may execute tasks within the active delivery plan. Keep progress, validation, and blockers in that plan; do not create
competing execution plans or additional approval gates. Follow the approved phase boundaries and report deferred work before claiming
completion.

Keep the combined spec in the established delivery-workflow location. Reference supporting requirements and deliverables without
duplicating them or treating their folders as the delivery-workflow location. Surface conflicts with referenced requirements before affected
work, and use the Spec Change Escalation rule when locked scope or constraints must change.

## When to Use

- Spec-first workflow for a new feature
- Stable requirements document driving phased implementation
- "Do only the next phase" loop
- Locked requirements with explicit user approval gates

Typical trigger phrases:

- `Spec: build ...`
- "create a spec for this feature"
- "implement the next phase"
- "use the spec as locked requirements"
- "set this up in docs/specs"

Do not use for trivial one-off edits unless the user explicitly asks for the workflow.

## Canonical Layout

For new work, keep requirements and the delivery plan in one file under `docs/specs/` (or the established specs folder):

```text
docs/
  specs/
    010_task-management.spec.md
```

Continue existing separate spec/plan files without migrating them unless requested. If consolidation is requested, preserve requirement and
task IDs, approval state, validation evidence, and links; update references to the combined file.

If `CLAUDE.md` exists in the repository, treat it as an additional instruction source alongside `AGENTS.md`.

## Naming

File names: `<id>_<slug>.spec.md`. Use one numeric prefix and stable slug for the initiative.

Examples: `010_task-management`, `011_user-invitations`, `012_billing-webhooks`

To choose the next prefix, inspect specs and any legacy plans, including reserved pending slices, and select the next unused prefix. Do not use
vague slugs like `stuff`, `misc`, or `new-feature`.

## Spec File

`docs/specs/<id>_<slug>.spec.md` must contain:

```md
# <Feature Title>

## Current Status

- Requirements: draft / locked
- Delivery: not planned / in progress / blocked / complete
- Active phase: <phase or none>
- Next step: <next action>

## Overview

## Scope / Non-Scope

### In Scope

### Out of Scope

## Requirements

## Acceptance Criteria

## What This Touches

- ...

---

## Delivery Plan

Not planned yet. Replace this placeholder with the phases below after requirements are locked.
```

### Keep specs concise

Keep the requirements portion readable. Scale its length to the feature; aim for about one page for a small feature, without
cutting necessary behavior or constraints to meet a word limit.

- Keep the Overview to one or two sentences explaining the feature and its purpose.
- Use short scope bullets to define boundaries. Do not repeat the full requirements under In Scope.
- Write one requirement per bullet with a stable ID such as `R1`. State who or what acts, the required behavior, and any condition that
  changes the outcome. Prefer plain language and concrete verbs over vague terms such as “robust” or “seamless.”
- Include error behavior, permissions, limits, and contracts only when they affect correctness or acceptance. Keep technical constraints
  that are actual requirements; move implementation choices, task breakdowns, file inventories, and validation commands to the plan.
- Make acceptance criteria observable checks tied to requirement IDs. Use them to show how success is recognized, rather than repeating each
  requirement verbatim.
- Keep What This Touches to a few affected areas or surfaces. Put the detailed ownership and file list from the holistic audit in the plan.
- State each rule once. Link to existing contracts or supporting references instead of copying long explanations. Omit background essays,
  speculative future work, and sections beyond the template unless needed to resolve a concrete ambiguity.

Example requirement and acceptance check:

```md
## Requirements

- R1: Only the task owner can delete a task.

## Acceptance Criteria

- R1: An owner can delete their task; another user's attempt is denied and leaves the task unchanged.
```

Before presenting the spec, remove repetition and implementation detail, then confirm that the remaining requirements are clear and
testable. Concision must not hide unresolved questions or omit necessary constraints.

When drafting, mark unresolved material product, contract, permission, or architectural decisions inline:

```
[NEEDS CLARIFICATION: <specific question>]
```

Examples:

```
- Users receive an email on assignment [NEEDS CLARIFICATION: should this also fire for reassignment?]
- Auth method not specified [NEEDS CLARIFICATION: email/password, SSO, or OAuth?]
```

Ask about material decisions the request and repository do not resolve. For minor implementation details, follow established patterns and
document consequential assumptions without inventing unnecessary blockers. Resolve all marked clarification questions before locking the
spec.

After writing a new spec, always output a summary card:

```
Spec:    <id>_<slug>.spec.md
Plan:    Delivery Plan section in the same file (not planned or created)
Branch:  <actual branch, only when relevant; otherwise omit>
Summary: <one-sentence description of the feature>
Open Questions: <count of [NEEDS CLARIFICATION] markers>
```

## Delivery Plan Section

Keep one delivery plan below the horizontal rule in the spec. Use ordered phases for distinct execution tracks and record dependencies in
their tasks and gates; do not create separate plan files for new work. Update Current Status as work progresses so the next action is easy
to find. Current Status and Delivery Plan remain mutable after requirements are locked.

Use this structure under `## Delivery Plan`, repeating the phase section as needed:

```md
### Phase 1 - <Outcome>

#### Tasks

- [ ] `P1.T1` <small, reviewable task>
- [ ] `P1.T2` <small, reviewable task>

#### Expected Files

- `path/to/file.ts`

#### Validation

- <command or manual check>: not run

#### Gate

- <observable completion condition>: not verified

### Blockers

- None currently.
```

Keep completed phases compact while retaining task IDs, outcomes, and validation evidence. Record concise results rather than running logs.

Keep the plan execution-oriented. Refine ambiguous or oversized tasks before coding: clarify wording, split tasks, and update file lists,
checks, or gates. Preserve existing task IDs when possible and assign new IDs to added tasks. Record blockers and concise validation
evidence as work progresses.

If code has drifted from the plan but still matches the spec, update the plan to reflect reality before continuing. Do not hide requirement
changes inside plan refinements. Reconcile affected phases whenever an authorized requirements revision occurs.

## Keep changes small and measured

Plan each phase around one clear outcome that is easy to explain and review. Small tasks alone are not enough: their combined change must
also be understandable.

- Preserve existing patterns. Keep unrelated cleanup, restructuring, and new abstractions out of the phase.
- Separate mechanical refactoring from behavior changes when practical so each diff has a clear purpose.
- Split a phase when its combined diff becomes difficult to understand. Update the plan before expanding the work; keep completed task IDs
  and validation evidence.
- Keep each phase working and independently verifiable using earlier completed work. Keep tightly coupled changes together when splitting
  them would leave broken code or an unverifiable result; do not use arbitrary file or line limits.
- When a larger change is necessary, explain why it must stay together and how it will be validated before undertaking it. Use the existing
  phase approval and scope-change rules rather than adding another approval gate.

## Independent Feature Slices

For larger initiatives, prefer small slices with usable, independently verifiable outcomes over broad UI-only or API-only programs. UI-first
delivery remains valid when the user prefers it: define temporary behavior and its replacement boundary rather than requiring an unfinished
backend to pass the gate.

In separate repositories, keep each slice's combined spec local, with independent numbering and prerequisites. Respect the user's linking
preference: local links plus plain-language **API next** / **UI next** handoffs suffice when cross-repository links are unwanted. State the
next capability, its contract, and what is already usable; never imply another repository was implemented or validated.

For placeholder UI, identify live operations, synthetic reads, and console-only writes separately. Substitute at an existing service/route
boundary without parallel preview architecture unless requested. Specify normalized intent and fields temporarily omitted from transport. Do
not show persistence success for console-only actions or imply placeholder values came from the server.

For UI slices, consider loading, empty, error, mutation pending, field validation, notifications, cancellation/navigation, and mobile/tablet
presentation. Define relevant outcomes using existing patterns; mark unnecessary states not applicable instead of adding every mechanism
automatically.

Before locking an architectural choice, explain the simplest adequate approach and its limitations. Jobs, polling, replay/idempotency
storage, outboxes, and defensive locking need a concrete requirement or integrity invariant, not hypothetical scale. Preserve necessary
correctness protections without universalizing project-specific preferences.

## Inserting or Superseding Slices

When authorized work inserts, renumbers, or replaces pending slices, update local links, prerequisites, execution order, and handoffs.
Preserve requirement/task IDs and completed validation evidence where possible. Identify superseded work; do not discard incomplete tasks or
rewrite historical completion evidence. Update completed handoffs without implying newly added features were previously delivered.

## Holistic Validation Pass

Run this before drafting, revising, or executing a spec or plan:

1. **Surface audit** — find every symbol, config key, route, UI string, contract, and behavior the spec touches. Identify all impacted
   layers — app, UI, API, data, infrastructure, tests, docs — not just files already named.

2. **Scope consistency** — check for contradictions between Overview, Scope, Requirements, and Acceptance Criteria. If an acceptance
   criterion requires changing an out-of-scope layer, narrow the criterion or bring the layer into scope.

3. **Phase executability** — verify each planned phase can be validated using only work from that phase and earlier. Reorder phases when
   later-phase work is a prerequisite. Check that each phase has one clear outcome and an understandable combined diff; split oversized
   phases using the small-change guidance above.

4. **Explicit ownership** — name every caller, consumer, adapter, handler, test, doc, and config that must change. Do not leave high-risk
   coupling as implied cleanup.

5. **Contract boundaries** — distinguish product, application, storage, integration, and infrastructure behavior. State clearly when a
   change affects one boundary but intentionally leaves another unchanged.

Present findings in order: contradictions → missing surface → phase/ordering risks → test gaps → doc fixes.

## Workflow

### Stage 1: Create or refine the spec

1. Gather context from the repo and the user request.
2. Run the holistic validation pass.
3. Draft the spec in `docs/specs/` (or the repo's established location). Mark unresolved material decisions with
   `[NEEDS CLARIFICATION: <specific question>]`; reuse established behavior for minor implementation details.
4. Output the summary card.
5. After outputting the summary card, print all `[NEEDS CLARIFICATION]` markers as a numbered list so the user can answer them without
   opening the file. The spec is not locked while markers remain.

When a spec already exists, treat it as the source of truth and run the holistic validation pass before accepting it as execution-ready.

### Stage 2: Generate the phased plan

Once requirements are locked, create or revise the Delivery Plan section below the horizontal rule. Keep execution state there so work can
resume across sessions. For an existing separate plan, continue using that file until consolidation is requested.
Read the spec and current code or design/documentation artifacts before defining phases.

Break the work into ordered, reviewable phases. For each phase, define:

- the outcome and spec requirements it satisfies
- atomic tasks with stable IDs such as `P1.T1`, checkboxes, and expected files or surfaces to change
- validation commands or manual checks appropriate to the change
- a gate: observable conditions that must pass before the phase is complete

Run the phase executability check against this plan. Each phase must be verifiable using its own work and earlier phases. Include
documentation updates when behavior or workflows change.

Present the phase outline and identify the next phase for user approval. Treat an explicit instruction to execute a presented phase as
approval; do not ask again for the same work.

An instruction to implement multiple named phases or all phases authorizes that range, not deployment, database writes, dependency changes,
or separately gated operations. Honor target restrictions and existing permissions; request only missing authority when necessary.

When resuming, read the requirements and delivery plan in the active spec (or its legacy separate plan) and compare them with
the current code and relevant deliverable artifacts. Reconcile completed work and remaining tasks in the plan without changing requirements. Select the earliest phase whose tasks, validation, or gate remain
incomplete, even if all its task checkboxes are checked. If the plan is missing, generate the Delivery Plan section before implementing.

### Stage 3: Implement and review approved phases

Before implementation, inspect the working tree and follow repository branch rules. Preserve unrelated changes and do not create or switch
branches without appropriate authorization. Do not require a `dev-*` name when the repository uses another convention. Read-only review
requires no branch creation.

Use the locked spec as requirements and execute each approved phase:

1. Name the spec, active plan, phase, and task IDs. Implement unchecked tasks in order, keeping changes scoped to the phase. Mark each task
   `[x]` in the plan immediately after its implementation work is complete.
2. Review the combined diff for the phase against its intended outcome. Remove unrelated edits and split remaining oversized work in the
   plan before continuing. Run the planned validation and required repository checks. Broaden testing when shared behavior or regression
   risk warrants it; a full suite is not required for every phase unless repository instructions require it.
3. Record validation commands and results and the gate status in the plan. A phase is complete only when its tasks are done, validation
   passes, and the gate is satisfied.
4. Report completed task IDs, files changed, checks and results, gate status, any requirement edits, and remaining blockers.
   Update Current Status and confirm that the plan is updated.
5. With single-phase approval, stop for feedback or instruction to continue. With explicit multi-phase/all-phase approval, proceed to the
   next approved phase after its predecessor's gate passes, keeping progress updates concise. New user direction, failed gates, missing
   authority, or material scope changes still require resolution. Address feedback and rerun affected checks before continuing.

If validation fails or a task is blocked, keep the phase incomplete and record the cause in the plan’s Blockers section. Report whether it
is a plan issue or requires a spec change; do not silently skip to a later task. Fix regressions within scope; do not weaken tests or
acceptance criteria to obtain a pass. Escalate required scope changes using the Spec Change Escalation rule. Do not skip a failed or blocked
phase to start later work.

### Stage 4: Verify feature completion

After the final phase, compare the implementation against every spec acceptance criterion. Report each criterion as met, unmet, or
unverified, with supporting checks or evidence. Record remaining gaps and completion status in the plan and state whether the feature is
ready for review or needs further work. For legacy specs with multiple plans, verify all referenced plans before reporting feature completion.
Completed phases alone do not establish feature completion.

## Evidence and Final Reviews

Record unit/component tests, real database integration tests, CDK synthesis/bundling, browser checks, and deployed authentication/cloud
checks as distinct evidence. Local passes do not satisfy cloud-only criteria. Record the relevant revision/change context, target, outcome,
and limitations concisely; rerun affected checks after fixes. Live systems are not test fixtures without authorization.

When the user requests review agents, plan sequential reviews in this order unless their specified process differs:

1. **Simplicity:** unnecessary mechanisms, duplication, abstraction, and readability.
2. **Defect review:** correctness, regressions, failures, and integrity.
3. **Spec/plan compliance:** requirements, task/gate evidence, and truthful completion.

Use available repository-specific agents/skills; this workflow neither requires particular names nor authorizes delegation by itself.
Resolve findings or record explicitly accepted/deferred outcomes, rerun affected checks, and revisit earlier reviews when fixes materially
change their conclusions. No findings is an outcome, not proof of acceptance. If a requested reviewer is unavailable, report the incomplete
gate rather than presenting a substitute as that agent.

## Spec Lock Rule

Treat the requirements portion—from Overview through What This Touches—as locked once the user approves it or asks for implementation
without requesting requirement changes. Current Status and the Delivery Plan remain editable; task progress must never silently change
approved requirements. References to a locked spec mean its requirements portion.

Do not start implementation while any `[NEEDS CLARIFICATION]` markers remain. Resolve them first, then treat the cleaned spec as the
lockable source of truth.

During implementation, the user may change direction. Use judgment to decide whether the change is small or large:

**Small change** — absorb the user's requested change. Update the spec inline, report the affected requirement and any phase impact, and
continue. A change is small if it:

- doesn't invalidate work already completed
- doesn't change the core approach or architecture
- can be absorbed into the current or next phase without restructuring

**Large change** — stop and escalate before touching anything. A change is large if it:

- invalidates completed work
- significantly expands or restructures scope
- changes the core approach or introduces new surfaces

Do not silently absorb a large change by treating it as a small one.

If the agent discovers a requirement change that the user has not requested, use the escalation rule before editing the locked spec, even if
the change seems small.

## Spec Change Escalation

When a change is too large to absorb inline, say so explicitly before proceeding. Present:

1. What the user is asking for
2. Why it is a large change (what it invalidates or restructures)
3. Proposed spec revision
4. Revised implementation approach

Wait for user approval before editing the spec or continuing implementation.

## Choosing the Active Spec and Plan

Determine the active spec and its Delivery Plan section (or legacy referenced plan) in this order:

1. Explicit user-provided file or feature ID
2. Files referenced in the current task context
3. Files matching the current branch or active feature name
4. The only matching spec in the repository

If multiple candidates remain, ask the user which to use.

## Guardrails

- Advance only through authorized phases; explicit approval for all phases is sufficient without repeated approval requests.
- Do not silently change locked requirements by editing the spec during implementation.
- Do not guess which spec or plan is active when multiple candidates exist.
- Keep execution state in Current Status and Delivery Plan; keep it out of the locked requirements portion.
- Separate requirements from Delivery Plan with a horizontal rule, and keep both in the same file for new work.
