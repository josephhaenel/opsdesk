# OpsDesk first hosted increment API contract

This contract is for the initial implementation. All records are synthetic. Reference mode uses deterministic drafts and reports no model usage. Policy retrieval and all permission/approval rules execute on the server. Live provider integration and worker recovery remain separate increments.

## Session and security

All paths are same-origin under `/api`. An opaque HttpOnly cookie identifies a per-visitor sandbox session. Switching between the predefined `employee` and `manager` roles preserves the sandbox but changes server-side authority. Every mutation after session creation requires `X-CSRF-Token`; browser mutations also require an allowed Origin. No role or account grant is trusted from an order/proposal request.

- `GET /api/health`: `{status: "ok", database: "postgresql", generation_mode: "reference"}`.
- `GET /api/session`: current session response, or 401.
- `POST /api/session` body `{role: "employee" | "manager"}`: creates or switches the server session. Existing-session switches require CSRF.
- Session response: `{session_id, role, csrf_token, company: "Alder Distribution", generation_mode: "reference"}`.
- `POST /api/reset`: clears this visitor's workflows/cases; seeded data remains. Returns `{ok: true}`.

## Records and workflows

- `GET /api/orders`: `{orders: Order[]}` filtered to the actor's account grants.
- `GET /api/orders/{id}`: one Order, or a non-revealing 404.
- `GET /api/workflows`: `{workflows: Workflow[]}` filtered to authorized source material.
- `POST /api/workflows`: body `{order_id, message, operation_id}`; returns Workflow. Stable operation IDs replay the same workflow; changed content under an existing key returns 409.
- `GET /api/workflows/{id}`: Workflow including current Revision, Evidence, case and activity; refresh/reconnect recovery.
- `POST /api/workflows/{id}/revisions`: body `{base_revision_id, response, summary, priority: "standard" | "urgent", contact_name, callback}`; saves a new immutable revision, returns Workflow. Completed workflows cannot be edited. Stale base revisions return 409.
- `POST /api/workflows/{id}/approve`: body `{revision_id, operation_id}`; atomically records approval, creates the simulated case and completion event, returns Workflow. Requires current revision, complete contact fields, permitted priority, unchanged source versions. A completed logical operation replays its existing result after access validation.
- `GET /api/evidence/{id}`: authorized Evidence, or 404. Evidence must also belong to the visitor sandbox/current accessible corpus.

Order: `{id, customer_id, customer_name, delivery_status, expected_at, delivered_at: string|null, proof_of_delivery: string|null, items: [{name, quantity}], contact_name, callback, version}`.

Revision: `{id, number, response, summary, priority, contact_name, callback, evidence_ids: string[], created_at}`.

Evidence: `{id, title, version, section, text, audience: "employee"|"manager", effective_at, score: number}`. Evidence IDs are fixed policy-version IDs for this tiny corpus. Applicability and role filtering happen before lexical ranking.

Workflow: `{id, order: Order, message, state: "needs_information"|"needs_review"|"completed"|"failed", revision: Revision, evidence: Evidence[], missing_fields: string[], case: null|{id, priority, summary, created_at}, trace_id, created_at, activity: [{id, kind, message, created_at}], generation: {mode: "reference", provider: null, model: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null, latency_ms: number}, can_approve: boolean}`.

Errors: `{detail: string}` with 401 unauthenticated, 403 forbidden/CSRF/priority, 404 missing or unauthorized records, 409 stale revision/operation content conflict, 422 invalid input, and 503 unavailable database. No tracebacks or restricted source content in responses.

## Synthetic walkthroughs

AD-1042: accessible missing delivery, populated contact, normal successful case.
AD-1043: accessible missing delivery, callback missing; employee must supply it before approval.
AD-2041: manager-only account, disputed signed delivery; manager escalation evidence and urgent case permission demonstrate the role boundary.

The complete corpus contains eight orders across Harbor Kitchen, Lumen Market, and Cedar Catering. Employee grants cover Harbor and Lumen; manager grants cover all three. Six versioned policies include ordinary missing-delivery, contact, delivery-proof and data handling policies, plus manager escalation policies. Every visitor's mutable workflows/cases are isolated; roles remain intentionally selectable within that visitor's synthetic demo.
