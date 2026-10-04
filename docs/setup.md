# OpsDesk setup and hosting

The first increment uses real PostgreSQL, real permission-filtered lexical retrieval, immutable revisions, and transactional simulated case creation. Draft text is a deterministic reference template, labelled in the interface. No provider is called, and no model quality or cost result is claimed.

## Run the complete application locally

Install Docker with Compose. Create a private environment file outside the source checkout, set `OPSDESK_DB_PASSWORD` to a new random password, and use the other local values in `.env.example`.

```powershell
docker compose --env-file C:\private\opsdesk.env up --build -d
```

Open `http://localhost:4329`. The API applies migration 1 before serving; later runs preserve the existing synthetic cases. PostgreSQL and the API have no host-published ports. The web port is bound to loopback.

Choose **Missing delivery** and select **Prepare a support case**. Review the suggested reply and case, open supporting evidence as needed, then confirm the saved version and select **Create demo case**. Editing the reply or case details creates a new revision when saved; save before approving. **Missing contact details** demonstrates AD-1043's required callback.

Expand **Explore permissions & saved cases** to switch to the manager identity or reopen saved work. To investigate AD-2041 and its escalation evidence, choose Manager, then expand **Edit report or choose another order** and select that order. These are intentionally selectable demo identities, not verified staff accounts. Each visitor's workflow and case records are isolated.

## Develop and test

Use Python 3.12 and Node 22. Install `apps/api/requirements-dev.txt` in a virtual environment and install the frontend lockfile dependencies with `npm ci` in `apps/web`. The API image installs only `requirements.txt`; formatting tools stay in development.

From the repository root, run `python -m ruff format apps/api/opsdesk` to format Python and `python -m ruff check apps/api/opsdesk` to check unused imports and variables. In `apps/web`, run `npm run format` to format the frontend or `npm run format:check` to check it. CI checks both formatters before the existing API tests and production build. Editor settings and formatter versions are checked in so future edits keep the same style.

Frontend session state, requests, and recovery stay in `App.tsx`. `DemoNavigation` renders the demo/project navigation, `ReportComposer` presents the guided scenarios and optional report editing, and `DemoControls` provides role selection, saved cases, and reset. These components render supplied state and call supplied callbacks. `SelectField` is the shared keyboard-accessible custom selection menu. `WorkspacePanels` handles order details, evidence, activity, and revision review. On the backend, `main.py` defines HTTP routes, `authorization.py` checks access, `retrieval.py` selects policies, and `workflows.py` manages revisions and transactional case creation.

```powershell
docker compose -f compose.test.yaml up -d
$env:TEST_DATABASE_URL = 'postgresql+psycopg://opsdesk_test:isolated-local-test-only@127.0.0.1:54329/opsdesk_test'
$env:PYTHONPATH = 'apps/api'
python -m pytest tests -q
```

The test-only password is for a disposable loopback database and is never the deployed password. The fixture refuses a database whose name is not `opsdesk*_test`. Tests create independent visitor sandboxes and preserve unrelated records. Never set the test URL to the deployed database.

For local browser development, point `OPSDESK_DATABASE_URL` at an isolated development database, set `OPSDESK_ALLOWED_ORIGINS` to `http://127.0.0.1:5173,http://localhost:5173`, and set `OPSDESK_COOKIE_SECURE=false`. Apply `python -m opsdesk.migrate`, then start `uvicorn opsdesk.main:app --host 127.0.0.1 --port 8000`. Start `npm run dev` in `apps/web`; Vite proxies `/api` to the local API.

The initial verification used an isolated PostgreSQL QA container on the VM through an SSH loopback tunnel because the Windows Docker engine did not respond. Application development and browser checks ran locally. No existing application database was used.

## Dedicated VM deployment

The authorized public address is `https://opsdesk.josephhaenel.com`. OpsDesk uses its own Compose project, network, volume, and containers. The web container binds only `127.0.0.1:4329`. The shared Caddy proxy imports a dedicated `opsdesk.caddy` route; other site definitions are preserved.

Deployment layout:

| Purpose | Location |
| --- | --- |
| Versioned source release | `/opt/opsdesk/releases/` |
| Active release symlink | `/opt/opsdesk/current` |
| Private Compose environment | `/etc/opsdesk/app.env`, root-owned mode 600 |
| Dedicated HTTPS route | `/etc/caddy/opsdesk.caddy` |
| Persistent synthetic database | Compose volume `opsdesk_opsdesk-data` |

Production environment uses a dedicated random database password, `OPSDESK_ALLOWED_ORIGINS=https://opsdesk.josephhaenel.com`, `OPSDESK_COOKIE_SECURE=true`, and port 4329. No model key or financial credentials are involved. The API runs as a non-root container user. Resource and demo growth limits bound this single-worker reference increment.

For each release, test locally, stage the sanitized source, build only the OpsDesk Compose services, validate the candidate Caddy configuration before a reload, verify HTTPS and the case workflow, and check the existing sites. Do not run broad Docker stop/prune commands or restart the VM.

## Recovery and limitations

Browser retries reuse a stable operation ID. A saved case can be recovered after a lost response; no new action is created. Editing creates a new revision and approval checks the current one. A case, its approval, result, and completion activity commit together. Refreshing reads database state rather than assuming a frontend success.

For a later code rollback, preserve the previous release and restore its symlink, then rebuild only the compatible OpsDesk application services. Check schema compatibility before changing versions. Never remove the database volume as a code rollback. The current schema is migration 1; it is an explicit bootstrap migration, not yet an Alembic migration history.

Expired visitor records are removed after 24 hours. A reset removes only the current visitor's mutable sandbox records. In-memory request limiting assumes one API worker; a distributed limit and a durable generation worker are future work. Hybrid retrieval, live generation, model cost measurement, asynchronous approval expiry, and semantic/model-quality evaluation are not implemented in this increment.
