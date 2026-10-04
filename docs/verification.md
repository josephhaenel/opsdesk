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

## Maroon theme verification

The maroon-theme update at commit `c9a274024be50ecc7bb3374a28eb951ae6bdf33a` passed the local frontend build and [GitHub Actions](https://github.com/josephhaenel/opsdesk/actions/runs/37178590101). Only the web container was rebuilt and recreated. Public Chrome checks confirmed the served maroon button (`#8a2946`), near-white button text (`#fff4f7`), neutral graphite background (`#121214`), and updated browser theme color, with no injected preview styles. Desktop and 390-pixel mobile views had no horizontal overflow or JavaScript errors. Primary-button text contrast is 7.86:1 and hover contrast is 5.99:1. The public API health check and existing portfolio, banking, Caldera, Cadence, and SnowPro endpoints returned HTTP 200 afterward. This styling change introduced no workflow or API changes.

## UI and source cleanup verification

Recorded October 4, 2026. The UI update at `4664ea6c11921c094683efd90045eb76be6d19a4` reduced duplicate headings and empty-state decoration, made saved reports accessible on mobile, added a clear review step and save status, and collapsed technical traces behind a disclosure. It retained the maroon palette and exact-revision approval. Completed text fields remain read-only and selectable. Clicking inside policy-dialog padding no longer dismisses the dialog; Escape still closes it.

The source cleanup at `8769da39de01e0f5450a34971945c2f455523978` applied pinned Prettier and Ruff formatting, extracted presentation components, and removed unused imports. An independent comparison found the frontend state/request logic unchanged after formatting normalization and verified the extracted callbacks and accessibility attributes. The backend syntax-tree comparison found no behavioral changes beyond removing unused imports and adding module documentation. [GitHub Actions run 37181882268](https://github.com/josephhaenel/opsdesk/actions/runs/37181882268) passed formatting checks, the frontend production build, and **28 API/PostgreSQL tests in 2.53 seconds**, with the existing TestClient deprecation warning. Runtime provider and generation behavior did not change.

Live Chrome verification saved and approved revision 2 of AD-1042, creating simulated case `SIM-CE0D63CC79604721`. Refresh returned the same case; it remained recoverable after API/web deployment. AD-1043's missing contact disabled approval and linked its input to the required-information hint. Desktop, 390-pixel, and 320-pixel views had no horizontal overflow. Mobile saved-report navigation opened the completed case. The guide, source dialog, technical disclosure, and manager-role selection worked; no JavaScript errors were observed.

The API/web source release rebuilt only those OpsDesk services. The database container, volume, and shared proxy were preserved. Public health and portfolio, banking, Caldera, Cadence, and SnowPro endpoints all returned HTTP 200. A new [personal-portfolio entry](https://josephhaenel.com/#opsdesk) links the live demo and source and discloses template drafts, synthetic records, and AI assistance. Live Light/Dark checks at 1440, 390, and 320 pixels confirmed correct links, visible content, and no overflow or browser errors. These are functional and visual checks, not live-model evaluations or load tests.

A follow-up screenshot exposed pale native-menu text on a light menu background. Commit `7fbac1a1d31ef03a7e68fb8068f2aaacceb7feed` sets explicit option foreground/background colors, including a readable disabled-option color. [GitHub Actions run 37182140199](https://github.com/josephhaenel/opsdesk/actions/runs/37182140199) passed formatting, build, and all 28 API checks in 2.50 seconds. Only web was rebuilt and recreated. The live open dropdown was visually inspected; both Employee and Manager remained enabled and could be selected. Its options used `#efedf0` text on `#1b1b1e`, with no horizontal overflow.

## Guided demo verification

Recorded October 4, 2026. Commit `74a08ca2bde4dd6bd2582a70e3eac240f7e8d3e8` replaces the dense initial workspace with a guided **choose scenario → review draft → create demo case** flow. The first screen offers **Missing delivery** and **Missing contact details**. Report editing and alternative orders, supporting records, evidence, activity, technical details, and role/saved-case controls are available through expandable sections. The project explainer separates the business problem and implemented capabilities from its optional architecture details.

[GitHub Actions run 37213190685](https://github.com/josephhaenel/opsdesk/actions/runs/37213190685) passed Python/frontend formatting checks, the production frontend build, and all **28 API/PostgreSQL tests in 2.42 seconds**, with the existing TestClient warning. No live model was called; the guided UI uses the same reference-mode API and template drafts.

The public walkthrough edited AD-1042's case summary. Unsaved changes disabled approval; saving produced revision 2, collapsed the editor, returned focus to the review heading, and left the approval checkbox unchecked. Approving that revision created `SIM-7AC62A2A95484292`; refresh restored the same case and revision. AD-1043 opened the missing-contact editor with approval disabled. Adding a fictional callback address and saving revision 2 made the approval checkbox available.

The custom order menu was checked with ArrowDown, Home, End, Enter, Escape, and outside-click dismissal. Employee access showed six ordinary orders; manager access showed eight, with the disputed order described as requiring manager review. At 1280 × 800, the preparation button was fully visible (bottom 781.6 pixels). Public 320- and 390-pixel layouts had no horizontal overflow, including the space reserved for the native scrollbar. Phone users still scroll through the introduction and scenario choices.

Follow-up commit `94a83d3251d5a6f90c3989181da15fbfd233356b` restores the pending approval's workflow before an older selection and clears its recovery key only when that same workflow completes. Policy dialogs explicitly return focus to their opening control. [GitHub Actions run 37213933267](https://github.com/josephhaenel/opsdesk/actions/runs/37213933267) passed formatting, the frontend production build, and all **28 API/PostgreSQL tests in 1.99 seconds**, with the existing TestClient warning. The legacy cross-tab pending-selection edge was reviewed in source; it was not reproduced through browser storage injection.

The deployed follow-up serves the expected frontend asset. Reopening a saved case retained revision 2, and Escape from the policy dialog returned focus to the source button. Only web was recreated; API/database containers and the shared proxy were preserved. OpsDesk health and all five other shared sites returned HTTP 200.

These are recruiter-perspective visual and functional checks, not a study with recruiters or a full accessibility audit. Template mode and the absence of live AI calls remain visible on the initial and review screens.

## Evaluation and remaining verification

`eval/reference-scenarios.jsonl` contains **eight distinct scenario inputs**, all explicitly marked `scenario_only_not_model_evaluated`. They cover missing delivery, incomplete contact, restricted accounts, manager escalation, authority-changing prompt attempts, unknown facts, source instructions, and draft-only customer responses. Their structure and unique IDs were checked; no model answers or semantic scores were measured.

This report does not establish live-provider answer quality, semantic grounding, token/cost accuracy, worker recovery, real staff authentication, external ticket-system integration, comprehensive browser coverage, every TLS/proxy configuration detail, load capacity, or outage recovery. The current increment uses deterministic reference drafts and simulated support cases; no model calls have been made. Both demo roles are intentionally selectable inside each visitor's synthetic sandbox. The local browser and public deployment observations above are measured checks; the unevaluated scenarios and future model/worker capabilities remain planned work.
