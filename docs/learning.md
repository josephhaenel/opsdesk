# OpsDesk learning guide

The goal is to implement, change, debug, and defend the project in interviews. Cover all areas from first principles, while connecting them to the enterprise work documented in the résumé. Practical experience is a starting point; explanation and debugging exercises establish understanding.

## Starting assessment

The résumé provides evidence of hands-on experience with APIs, retrieval, production operations, approval flows, and monitoring. It does not establish how independently each design can be explained or implemented, so there is no assumed advanced proficiency or score.

In the initial timeout exercise, Joseph correctly identified that the backend could already have created a case and that a frontend retry could repeat the request. The proposed “double check before” needs an atomic concurrency boundary: two requests can both see no case and both insert. Begin by making that race visible, then preventing it with a stable operation ID, a database uniqueness constraint, and a transaction that persists the case and result together. A retry must recover an earlier success even when the caller never saw the response.

## How each increment will be taught

For each small change, explain the problem, trace one request, read the important code together, compare one reasonable alternative, identify failure modes, and run meaningful verification. Finish with a short teach-back and a small independent change. Document which parts were generated, reviewed, modified, and verified. Correct gaps directly without treating a passing test as proof that the design is understood.

## Glossary

| Concept | First-principles explanation | OpsDesk example |
| --- | --- | --- |
| Authentication | Establishing who a request represents | Resolve a server-issued demo session; production identity would require a real identity provider. |
| Authorization | Deciding which operation and data that identity may access | An employee cannot look up an unassigned customer's order, even using the API directly. |
| Retrieval | Selecting evidence relevant to a question | Rank only policies the actor is permitted to see and that apply to the order. |
| Embedding | A numeric representation used to compare meaning | Compare the delivery report to policy passages; similarity does not establish truth or applicability. |
| Hybrid retrieval | Combining lexical and semantic rankings | Preserve exact policy terms while finding paraphrases; evaluate whether this improves evidence selection. |
| Grounding | Constraining claims to supplied facts and evidence | A response cites the actual applicable policy rather than inventing a refund rule. |
| Abstention | Declining to assert or act when evidence is insufficient | Ask for a missing callback number or expose a policy conflict. |
| Tool contract | A declared input/output structure for an operation | The case function accepts a typed order ID and fixed category, not arbitrary executable instructions. |
| Transaction | Database changes that commit together or roll back together | Approval, case, result, and completion event are one atomic commit. |
| Unique constraint | A database rule rejecting duplicate key values | Only one simulated case can reference the same approved action. |
| Idempotency | Repeating one logical operation preserves the same effect | Retrying the same approved revision recovers the original case. |
| Concurrency | Multiple operations progressing at overlapping times | Two approval requests arrive before either finishes. |
| State machine | Explicit allowed states and transitions | A proposal requiring missing information cannot transition to completed. |
| Immutable revision | A saved version whose content cannot be edited in place | Editing case priority creates a revision that needs its own approval. |
| Preconditions | Facts that must still be true when an action happens | The order version and actor's permission still match the approved action. |
| Lease | A temporary claim that can expire if a worker disappears | Another worker recovers a job after its lease expires. |
| Trace | Recorded steps and timing across an operation | Follow order lookup, retrieval, generation, validation, review, and execution using a trace ID. |
| Evaluation | Repeatable checks against known expectations | Compare model drafts on fixed synthetic reports and publish failures. |

## Learning checklist

- [ ] Trace a browser request through identity, validation, API, database, and response.
- [ ] Explain authentication versus authorization and find every data access boundary.
- [ ] Reproduce the check-then-insert race and demonstrate the database fix.
- [ ] Explain a transaction rollback and a lost-response retry using persisted rows.
- [ ] Explain why a disabled UI button cannot enforce permission or approval.
- [ ] Demonstrate why editing creates a new revision and invalidates earlier approval.
- [ ] Add one synthetic policy and inspect applicability and retrieval ranking.
- [ ] Distinguish citation membership from citation support.
- [ ] Explain what structured output validates and what it cannot prove.
- [ ] Show that prompt injection cannot expand the model's authority.
- [ ] Inspect a trace to distinguish failed retrieval from failed generation.
- [ ] Explain bounded retries, lease expiry, and late-worker result rejection.
- [ ] Compare two retrieval/model configurations with fixed evaluation inputs.
- [ ] Report unknown usage and model failures without hiding them.
- [ ] Change a tool safely by updating its schema, permissions, rules, revision handling, and evaluation cases.
- [ ] Explain deployment and rollback without exposing credentials.
- [ ] Describe personal contributions and AI assistance accurately.

## Short exercises and interview prompts

First exercise: draw two approval requests that both find no existing case. Identify the precise database rule that stops the second insertion. Then explain why generating a new operation ID on every retry defeats request recovery.

Approval exercise: revision 1 creates a standard case; revision 2 changes it to urgent. Explain why approval of revision 1 cannot authorize revision 2, and what happens if the actor loses manager permission before execution.

Retrieval exercise: a manager-only policy is the closest vector match. Explain why relevance cannot grant access, how to prove it never entered the employee's prompt, and why opening the citation needs its own check.

Debugging exercise: a response is confidently wrong. Inspect the authorized source facts, retrieved passage IDs, policy versions, model result, validator result, and trace timings. Determine whether the failure belongs to source data, retrieval, prompting, or a missing rule before changing the model.

Interview questions to practice:

- Why choose one database and a modular application for this scope?
- What breaks first under load: provider latency, database locks, job throughput, or UI polling, and how would you measure it?
- How do permissions prevent leakage through retrieval, old drafts, citations, and traces?
- What exactly was approved, and how is that enforced during concurrent edits?
- Why does retry safety inside PostgreSQL not guarantee the same behavior for an external ticket API?
- How do you know a model improved rather than becoming more confident or more expensive?

The first milestone is understood when Joseph can explain its request flow without the generated notes, reproduce a concurrency failure, interpret its activity trail, and safely modify one validation rule.
