# OpsDesk API

This increment uses synthetic records, permission-filtered PostgreSQL full-text
retrieval, a deterministic reference draft, and a reviewed simulated case. It
does not call a model or contact an external ticketing system.

Set `OPSDESK_DATABASE_URL` to a PostgreSQL SQLAlchemy URL using the psycopg driver,
`OPSDESK_ALLOWED_ORIGINS` to comma-separated exact browser origins, and
`OPSDESK_COOKIE_SECURE=true` for HTTPS. Development over HTTP requires
`OPSDESK_COOKIE_SECURE=false`. Database credentials belong in private deployment
configuration, never source control.

From this directory, install `requirements.txt`, explicitly apply migration 1
with `python -m opsdesk.migrate`, then run
`uvicorn opsdesk.main:app --host 0.0.0.0 --port 8000`. Migrations are repeatable
and preserve existing workflows. Startup refuses an unprepared or newer schema.
The migration implementation is intentionally small; future schema changes
require another numbered migration rather than editing migration 1.
Connections and pool checkout time out after five seconds. PostgreSQL statements
time out after fifteen seconds and row-lock waits after five seconds; failed
transactions roll back instead of leaving a blocked browser request indefinitely.

The browser API lives under `/api`. Session cookies are opaque, HttpOnly,
SameSite Strict, expire after 24 hours, and identify one isolated sandbox.
Changing demo roles retains that sandbox. Mutation requests require an allowed
Origin and, after session creation, the returned `X-CSRF-Token`. No request may
supply account grants or tool arguments beyond the strict contract.

One API worker enforces bounded in-memory mutation limits per IP and session.
Its trusted client address must be normalized by the private proxy deployment;
`OPSDESK_TRUST_PROXY_IP` is false by default. Do not enable it when arbitrary
clients can reach the API directly. Multiple API workers would require a shared
rate-limit mechanism. Request bodies are limited to 16 KiB, including chunked
requests. Persistent defaults cap the deployment at 500 active visitor sessions,
20 workflows per visitor, 20 revisions per workflow, and 200 operation keys per
visitor. Existing committed operation keys recover their result at capacity.
Expired visitor data is removed by foreign-key cascades during new session
creation and a ten-minute cleanup task. Reset removes only that visitor's
mutable workflows, cases, revisions, approvals, events, and operation keys.

An approval locks session, workflow, order, and policy activation rows. It reads
the immutable revision saved by the server, rechecks authority and source
versions, then stores approval, one simulated case, result, and events in the
same transaction. A session-scoped request key detects changed retry content;
unique workflow and revision case constraints guard the persisted effect.
Completed retries validate access before recovering their result and do not
apply fresh-execution source or approval-expiry checks. This guarantee applies
to the simulator sharing PostgreSQL; it does not establish external API
idempotency or exactly-once model calls.

Tests in the repository's `tests/` directory exercise the actual PostgreSQL
transaction and API boundaries. `opsdesk.workflows.before_case_commit` is an
internal test seam for rollback; it has no public request switch.
