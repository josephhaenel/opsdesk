# PostgreSQL integration checks

These checks exercise the HTTP boundary and the real PostgreSQL transaction path. They require an **isolated test database** explicitly supplied as `TEST_DATABASE_URL`; no deployment or application database is selected automatically. The database name must start with `opsdesk` and end with `_test`. The fixture runs the deployment migration to create the schema and seed only fictional reference records. Each test creates a separate visitor sandbox and resets its own mutable records afterward.

Install the API's development dependencies, put `apps/api` on `PYTHONPATH`, set `TEST_DATABASE_URL`, and run `pytest tests`. Do not set this variable to a public demo database. Rate limits are disabled in the injected test settings so concurrency checks can inspect transaction behavior directly; public rate limiting needs its own deployment verification.

The suite covers server-enforced account scope, evidence permission checks, role downgrades, sandbox isolation, CSRF and Origin protection, strict request validation, incomplete contact data, priority authority, immutable revisions, stale review, idempotency conflicts, concurrent duplicate requests, rollback before commit, committed-result recovery, a source write during approval, persisted operation capacity, customer-facing citation scope, and missing action policy. The fault seams are patched inside the Python process and have no HTTP switch or public fault-injection endpoint.

Reference-mode generation metadata is checked for absent provider, model, token, and cost values. No test measures model quality or live inference performance. The initial JSONL scenarios in `eval/` are future review/evaluation inputs, not measured answer-quality results. Record executed test counts and results only after running this suite against PostgreSQL.

The October 3, 2026 execution record and its limits are in `docs/verification.md`.
