# OpsDesk reference increment verification

Recorded October 3, 2026, using America/Chicago dates. Checks used the real FastAPI HTTP interface and a dedicated PostgreSQL QA database containing synthetic records. The test harness requires an explicit `TEST_DATABASE_URL` naming `opsdesk*_test`; it never defaults to the public demo database. The deployment migration prepared this database.

## Measured test results

The final full run passed **28 checks in 94.91 seconds**, with no failures or skips:

```text
PYTHONPATH=apps/api python -m pytest tests -q
```

On Windows, set `PYTHONPATH` to the absolute `apps/api` directory in the shell and run `python -m pytest tests -q`. Supply the test database through the environment without printing its URL or committing credentials.

Before that final run, the initial full suite passed 25 checks in 85.61 seconds. Review found an unbounded operation-record path: retries of a completed case using fresh operation IDs could keep inserting rows. A persisted operation cap was added, and its focused regression passed 1 check in 8.65 seconds. Another focused run passed 5 checks in 16.66 seconds after policy validation, citations, and database timeout changes. The final 28-case run includes those added regressions and validates the completed backend together.

Each run emitted one Starlette TestClient deprecation warning about its httpx adapter; no test failed because of it. These wall times include HTTP testing and database round trips. They are not public request latency measurements.

[GitHub Actions run 37176587090](https://github.com/josephhaenel/opsdesk/actions/runs/37176587090) verified commit `be5145d06983d3c3cd0fdb6a9b1149985c0eebb1`: both API and frontend jobs passed. The separate CI PostgreSQL/API suite passed all 28 tests in 2.39 seconds, with the same TestClient warning; the frontend installation and production build passed. CI used its disposable PostgreSQL service and no provider credentials. The shorter CI test time reflects a different environment and database connection path, not a public application speed claim.

| Boundary | Observed result |
| --- | --- |
| Account scope | An employee cannot read or draft against a manager-only order; missing and unauthorized order lookups return the same response shape. |
| Evidence scope | Employee retrieval returns ordinary policies, citation opening repeats permission checks, and a role downgrade denies an entire saved restricted draft or completed result even when its order remains accessible. |
| Visitor isolation | A second visitor cannot read or approve another visitor's workflow. Reset affects only the caller's mutable data. |
| Request security | Mutation endpoints reject missing CSRF tokens and disallowed origins. New sessions require an allowed origin, inputs reject extra authority fields, and session cookies are opaque and HttpOnly. |
| Review integrity | Missing callback data blocks approval; an edit creates a new saved revision without altering the old one; stale edits and approvals fail; employee urgent priority is denied. |
| Recovery | Stable operation IDs recover the existing workflow/case. Reusing a key with changed content conflicts. A committed case remains recoverable after approval expiry and source-version change, subject to current access. |
| Concurrency | Four simultaneous approvals, using duplicate and distinct operation keys, returned one persisted case. Four duplicate workflow-creation requests returned one workflow. |
| Rollback | An injected exception immediately before commit left no case, approval, or completion event; retrying the same key afterward created one case. |
| Source freshness | Changing the source version before approval, or between preliminary read and execution lock, blocked case creation. |
| Persisted growth | New operation IDs stop at the configured cap, including retries of completed cases; existing same-key recovery still succeeds at capacity. |
| Policy and citations | Missing required action policy blocks case creation even when other evidence exists. Reference customer responses cite returned ordinary evidence without manager-policy IDs. |
| Migration | Repeating the deployment migration preserved the existing case and the eight-order/six-policy corpus. |
| Generation metadata | Reference mode reports no provider, model, tokens, or cost. |

The lost-response check discards the first successful response and retries its logical operation ID. The rollback check injects a Python exception before transaction commit. They demonstrate persisted-effect recovery and transaction rollback; they do not simulate a physical network outage or forcibly kill the API process.

## Focused backend review

The finalized request path rechecks server-side role and account scope for orders, workflows, saved evidence, approvals, and result recovery. Mutations hold the visitor's session lock; approval then locks the workflow, source order, and policy activation rows. Locked reads refresh SQLAlchemy's cached objects. Database uniqueness constraints provide a final duplicate guard. The approval, simulated case, operation result, and activity events commit in one transaction.

Public state is bounded to **500 sessions**, **20 workflows per session**, **20 revisions per workflow**, and **200 persisted operation keys per session**. Sessions expire after 24 hours; expired state is removed through foreign-key cascades. Request bodies are limited to 16 KiB in the API, and process-local rate buckets have bounded cardinality. The rate limiter is intended for the current single API worker. These are resource controls, not a measured denial-of-service guarantee.

The reviewed middleware checks mutation origins before body parsing, validates explicit CSRF tokens, bounds chunked request bodies, and sets response cache/security headers. API errors return generic detail strings. Application log statements record exception classes rather than request bodies, cookies, database URLs, or credential values. The source corpus is fictional; arbitrary visitor text remains visitor-supplied content and should not be treated as business authority.

Database connections, statements, lock waits, and pool checkout now have time limits. These configuration bounds were reviewed, and the affected approval/concurrency checks were repeated; an actual database outage was not induced.

Deployment review notes for the hosting owner: the compose command overrides the Dockerfile command, so access logging must be configured in compose if it is to be disabled. Forwarded client IP safety depends on the public proxy sanitizing external forwarding headers and the API remaining private. Public page operation was checked separately below; this backend review did not establish every proxy behavior or resistance to abusive traffic.

A final public proxy probe supplied documentation-only fake `X-Forwarded-For` and `X-Real-IP` addresses. The API access log recorded the probe and did not use either spoofed address. This checks that request path's forwarding behavior; it does not establish general resistance to abusive traffic.

## Browser and public deployment checks

A local Chrome walkthrough verified AD-1042 through source-dialog opening, editing and saving revision 2, approval of the saved revision, and browser refresh returning the same simulated case ID. The AD-1043 walkthrough kept approval blocked while its callback was missing. Manager role selection worked. A 390-pixel mobile viewport had no horizontal overflow; this was a browser viewport check, not a native iPhone application test.

The public demo was deployed to the existing VM at [opsdesk.josephhaenel.com](https://opsdesk.josephhaenel.com) over HTTPS. The live Chrome walkthrough opened sources, edited and saved revision 2, then approved it and produced simulated case `SIM-C45737CD2D814B89`. Refresh recovered that same case ID. Reference mode remained visible, there was no horizontal overflow, and no JavaScript errors were observed. The public health endpoint returned HTTP 200 with PostgreSQL and reference generation mode. TLS, HSTS, and Content Security Policy were checked. These observations verify a public reference-mode happy path and the stated response/security properties; they are not load, outage, or live-model evaluation results.

## Evaluation and remaining verification

`eval/reference-scenarios.jsonl` contains **eight distinct scenario inputs**, all explicitly marked `scenario_only_not_model_evaluated`. They cover missing delivery, incomplete contact, restricted accounts, manager escalation, authority-changing prompt attempts, unknown facts, source instructions, and draft-only customer responses. Their structure and unique IDs were checked; no model answers or semantic scores were measured.

This report does not establish live-provider answer quality, semantic grounding, token/cost accuracy, worker recovery, real staff authentication, external ticket-system integration, comprehensive browser coverage, every TLS/proxy configuration detail, load capacity, or outage recovery. The current increment uses deterministic reference drafts and simulated support cases; no model calls have been made. Both demo roles are intentionally selectable inside each visitor's synthetic sandbox. The local browser and public deployment observations above are measured checks; the unevaluated scenarios and future model/worker capabilities remain planned work.
