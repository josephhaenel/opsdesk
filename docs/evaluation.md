# OpsDesk evaluation plan

Evaluation will answer two different questions: whether the application obeys its rules, and whether the model produces useful, supported suggestions. This plan defines future verification; no scenarios have been executed and there are no measured results yet.

## Deterministic verification

Code and database checks must enforce authorization, tool schemas, state transitions, required inputs, immutable approvals, expiry, stale data handling, and idempotency regardless of model behavior. Use pytest/API tests and real PostgreSQL integration tests. Browser tests verify the displayed revision matches what is submitted and that refresh/reconnect recovers status.

The first milestone covers the eight acceptance criteria in the project plan. It includes concurrent duplicate requests, a lost response after commit, and a failure before commit. Worker restart tests become required when a durable worker is introduced. Assertions check persisted cases and events, not only HTTP status codes.

Later deterministic checks include citation membership in the authorized evidence set, access when opening a citation, restricted content in saved revisions, manager-only action priority, stale order/policy rejection, finite retry counts, lease recovery, and malformed tool outputs. Verify that an authorized retry returns a committed result even after its approval expires, while a new execution with expired approval is rejected. A citation ID matching a real document does not prove the document supports the model's claim.

## Model quality and retrieval evaluations

First create eight representative smoke scenarios: a normal missing delivery, unknown order, missing callback, conflicting policies, unsupported draft claim, unauthorized document, retrieved prompt injection, and provider refusal/incomplete output. These are a small development set, not a benchmark that establishes broad reliability.

Evaluate retrieval separately against annotated relevant and applicable policy versions. Measure evidence recall at the selected cutoff and irrelevant evidence inclusion for each role. Then compare lexical retrieval with exact-vector/hybrid retrieval on the same frozen scenarios. Keep generation prompts fixed when testing retrieval changes, and keep retrieved evidence fixed when testing generation changes.

Expand toward this planned 72-scenario suite:

| Scenario family | Planned count | Primary expectation |
| --- | ---: | --- |
| Correct answer and action | 12 | Accurate facts, applicable evidence, appropriate case suggestion |
| Missing information | 8 | Ask for needed details; do not invent them |
| Conflicting or stale policies | 8 | Expose ambiguity or request review rather than choose convenient text |
| Citation support | 8 | Each material policy claim is supported by its cited passage |
| Unauthorized access | 10 | No restricted data in retrieval, draft, citations, results, or public trace |
| Prompt injection in evidence | 8 | No authority change; record whether the draft follows malicious instructions |
| Malformed tool/model outputs | 4 | Reject invalid contracts and preserve recoverable status |
| Unavailable services | 6 | Bound retries and expose failure without executing an unapproved action |
| Duplicate submissions and recovery | 8 | Stable logical results and one case per approved action |
| Total | 72 | Planned cases only |

Some families test infrastructure rather than model intelligence. Report deterministic outcomes separately from semantic quality; do not publish one blended accuracy percentage that hides security or recovery failures. The security boundary must hold even if a model follows malicious retrieved instructions.

## Dataset and scoring

Each scenario will store a stable ID, category, synthetic input, actor/grants, order/policy snapshot, expected evidence, allowed action or required abstention, expected state, prohibited claims, and failure injection if applicable. All business data and policies are independently invented. Keep sibling/paraphrase cases together when splitting development and held-out data. Proposed split: 48 development and 24 held-out scenarios, with the smoke cases inside development.

Deterministic invariants have explicit pass/fail checks. Semantic scoring covers factual correctness, citation entailment, missing-information handling, conflict handling, and usefulness of the response. Store the rubric and human annotations before comparing models. A schema-valid suggestion can still be wrong.

Use model judging only as an aid. A judge can reward confident prose, overlook unsupported claims, and share failure patterns with the evaluated model. Calibrate it on human-labelled examples, review security cases and failures manually, publish disagreements, and disclose judge model, prompt, and rubric. Never let a judge replace an authorization assertion or database duplicate check.

## Reproducible result publication

Record repository commit, dataset/corpus hashes, dependency lockfiles, model ID and returned version information, embedding model, prompts, tool schemas, generation settings, retrieval settings, UTC run time, and number of repeated runs. Record seeds only where actually supported; a seed does not guarantee reproducibility. For model scenarios, begin with three runs and report per-scenario variation. Held-out results stop being held out after they are used to tune the system; disclose that and create a new holdout when needed.

Publish counts and denominators by category, raw redacted outputs, retrieval metrics, quality scores, latency, available token usage, estimated cost using dated prices, and every failure with an explanation. Distinguish service time from queue wait. Preserve provider errors and unavailable usage rather than dropping them or filling them with invented values.

CI should run deterministic checks without provider credentials. Live quality runs use injected secrets and record the chosen model and run budget. No live call is required for milestone 1.

All deterministic permission/approval/duplicate checks must pass before publication. Choose semantic release thresholds after establishing a baseline and inspecting errors. Report the baseline even when weak; do not claim production readiness, employer adoption, or business savings from this synthetic benchmark.
