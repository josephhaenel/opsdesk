"""Same-origin API routes for the isolated reference-mode sandbox."""

import asyncio
from contextlib import asynccontextmanager, suppress
import logging

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.exc import DBAPIError, TimeoutError as PoolTimeout
from sqlalchemy.orm import sessionmaker

from .authorization import (
    ACCOUNT_GRANTS,
    current_revision,
    permitted_order,
    permitted_revision_evidence,
    policy_permission,
)
from .config import Settings
from .db import make_engine
from .models import (
    Order,
    Policy,
    PolicyVersion,
    SchemaVersion,
    Workflow,
    now,
)
from .retrieval import evidence_dict
from .schemas import ApprovalInput, RevisionInput, SessionInput, WorkflowInput
from .security import (
    COOKIE_NAME,
    SafetyMiddleware,
    authenticate,
    cleanup_expired,
    create_session,
    require_csrf,
    session_response,
)
from . import workflows

logger = logging.getLogger("opsdesk")


def create_app(settings=None):
    settings = settings or Settings()
    engine = make_engine(settings.database_url)
    session_factory = sessionmaker(engine, expire_on_commit=False)

    async def cleanup_loop():
        while True:
            await asyncio.sleep(600)
            try:

                def run():
                    with session_factory.begin() as db:
                        cleanup_expired(db)

                await asyncio.to_thread(run)
            except DBAPIError:
                logger.warning("Sandbox cleanup unavailable; will retry later.")

    @asynccontextmanager
    async def lifespan(app):
        # Migrations are an explicit deployment step, never a destructive startup.
        with session_factory() as db:
            if (
                db.scalar(
                    select(SchemaVersion.version)
                    .order_by(SchemaVersion.version.desc())
                    .limit(1)
                )
                != 1
            ):
                raise RuntimeError(
                    "Apply the OpsDesk schema migration before starting this API."
                )
        task = asyncio.create_task(cleanup_loop())
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        engine.dispose()

    app = FastAPI(
        title="OpsDesk synthetic reference demo",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.settings = settings
    app.add_middleware(SafetyMiddleware, settings=settings)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        return JSONResponse(
            {"detail": "Invalid request fields or values."}, status_code=422
        )

    @app.exception_handler(DBAPIError)
    @app.exception_handler(PoolTimeout)
    async def database_error(request, exc):
        logger.warning("Database request failed: %s", type(exc).__name__)
        return JSONResponse(
            {"detail": "The demo database is temporarily unavailable."}, status_code=503
        )

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        logger.error("Unexpected request failure: %s", type(exc).__name__)
        return JSONResponse(
            {
                "detail": "The request could not be completed. Reload to recover the saved state."
            },
            status_code=500,
        )

    @app.get("/api/health")
    def health():
        with session_factory() as db:
            db.execute(text("SELECT 1"))
            version = db.scalar(
                select(SchemaVersion.version)
                .order_by(SchemaVersion.version.desc())
                .limit(1)
            )
            if version != 1:
                raise HTTPException(503, "Database schema is not ready.")
        return {
            "status": "ok",
            "database": "postgresql",
            "generation_mode": "reference",
        }

    @app.get("/api/session")
    def get_session(request: Request):
        with session_factory() as db:
            return session_response(authenticate(db, request))

    @app.post("/api/session")
    def post_session(body: SessionInput, request: Request, response: Response):
        with session_factory.begin() as db:
            actor = authenticate(db, request, lock=True, required=False)
            if actor:
                require_csrf(actor, request)
                actor.role = body.role
            else:
                actor, token = create_session(db, body.role, settings)
                response.set_cookie(
                    COOKIE_NAME,
                    token,
                    max_age=settings.session_ttl_hours * 3600,
                    secure=settings.cookie_secure,
                    httponly=True,
                    samesite="strict",
                    path="/api",
                )
            return session_response(actor)

    @app.post("/api/reset")
    def reset(request: Request):
        with session_factory.begin() as db:
            actor = authenticate(db, request, lock=True)
            require_csrf(actor, request)
            db.execute(delete(Workflow).where(Workflow.session_id == actor.id))
        return {"ok": True}

    @app.get("/api/orders")
    def orders(request: Request):
        with session_factory() as db:
            actor = authenticate(db, request)
            records = db.scalars(
                select(Order)
                .where(Order.customer_id.in_(ACCOUNT_GRANTS[actor.role]))
                .order_by(Order.id)
            )
            return {"orders": [workflows.order_dict(order) for order in records]}

    @app.get("/api/orders/{order_id}")
    def order(order_id: str, request: Request):
        with session_factory() as db:
            actor = authenticate(db, request)
            return workflows.order_dict(permitted_order(db, actor, order_id))

    @app.get("/api/workflows")
    def list_workflows(request: Request):
        with session_factory() as db:
            actor = authenticate(db, request)
            records = db.scalars(
                select(Workflow)
                .where(Workflow.session_id == actor.id)
                .order_by(Workflow.created_at.desc())
            )
            results = []
            for workflow in records:
                try:
                    order = permitted_order(db, actor, workflow.order_id)
                    revision = current_revision(db, workflow)
                    evidence = permitted_revision_evidence(db, actor, revision)
                    results.append(
                        workflows.serialize(
                            db, actor, workflow, order, revision, evidence
                        )
                    )
                except HTTPException as exc:
                    if exc.status_code != 404:
                        raise
            return {"workflows": results}

    @app.get("/api/workflows/{workflow_id}")
    def get_workflow(workflow_id: str, request: Request):
        with session_factory() as db:
            actor = authenticate(db, request)
            record = workflows.load_workflow(db, actor, workflow_id)
            return workflows.serialize(db, actor, *record)

    @app.post("/api/workflows")
    def new_workflow(body: WorkflowInput, request: Request):
        with session_factory.begin() as db:
            actor = authenticate(db, request, lock=True)
            require_csrf(actor, request)
            return workflows.create_workflow(db, actor, body, settings)

    @app.post("/api/workflows/{workflow_id}/revisions")
    def revise(workflow_id: str, body: RevisionInput, request: Request):
        with session_factory.begin() as db:
            actor = authenticate(db, request, lock=True)
            require_csrf(actor, request)
            return workflows.edit_revision(db, actor, workflow_id, body, settings)

    @app.post("/api/workflows/{workflow_id}/approve")
    def approval(workflow_id: str, body: ApprovalInput, request: Request):
        with session_factory.begin() as db:
            actor = authenticate(db, request, lock=True)
            require_csrf(actor, request)
            return workflows.approve(db, actor, workflow_id, body, settings)

    @app.get("/api/evidence/{evidence_id}")
    def evidence(evidence_id: str, request: Request):
        with session_factory() as db:
            actor = authenticate(db, request)
            item = db.scalar(
                select(PolicyVersion).where(
                    PolicyVersion.id == evidence_id, policy_permission(actor)
                )
            )
            if item is None or item.effective_at > now():
                raise HTTPException(404, "Evidence not found.")
            policy = db.get(Policy, item.policy_code)
            if policy.active_version != item.version:
                # Archived editions are visible only if this visitor has an
                # authorized saved revision that actually references the edition.
                records = db.scalars(
                    select(Workflow).where(Workflow.session_id == actor.id)
                )
                authorized_reference = False
                for workflow in records:
                    try:
                        _, _, revision, _ = workflows.load_workflow(
                            db, actor, workflow.id
                        )
                        authorized_reference |= evidence_id in revision.evidence_ids
                    except HTTPException as exc:
                        if exc.status_code != 404:
                            raise
                if not authorized_reference:
                    raise HTTPException(404, "Evidence not found.")
            return evidence_dict(item)

    return app


app = create_app()
