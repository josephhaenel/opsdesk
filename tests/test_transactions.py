from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import os
from threading import Barrier
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select


def case_count(application, workflow_id):
    from opsdesk.models import SupportCase

    with application.state.session_factory() as db:
        return db.scalar(
            select(func.count()).select_from(SupportCase).where(SupportCase.workflow_id == workflow_id)
        )


def concurrent_posts(application, actor, path, bodies):
    barrier = Barrier(len(bodies))
    session_cookie = actor.client.cookies.get("opsdesk_session")

    def post(body):
        # Separate clients model separate tabs/connections with the same server identity.
        client = TestClient(
            application,
            headers={"Origin": "http://testserver", "X-CSRF-Token": actor.session["csrf_token"]},
            cookies={"opsdesk_session": session_cookie},
            raise_server_exceptions=False,
        )
        try:
            barrier.wait(timeout=10)
            return client.post(path, json=body)
        finally:
            client.close()

    with ThreadPoolExecutor(max_workers=len(bodies)) as executor:
        return list(executor.map(post, bodies))


def test_concurrent_creation_with_same_operation_has_one_workflow(employee, application):
    body = {
        "order_id": "AD-1042",
        "message": "Missing delivery reported by warehouse reception.",
        "operation_id": str(uuid4()),
    }
    responses = concurrent_posts(application, employee, "/api/workflows", [body] * 4)
    assert [response.status_code for response in responses] == [200] * 4, [r.text for r in responses]
    assert len({response.json()["id"] for response in responses}) == 1
    assert len(employee.client.get("/api/workflows").json()["workflows"]) == 1


def test_concurrent_approval_duplicate_requests_and_distinct_keys_create_one_case(employee, application):
    workflow, _ = employee.start()
    shared_operation_id = str(uuid4())
    bodies = [
        {"revision_id": workflow["revision"]["id"], "operation_id": shared_operation_id},
        {"revision_id": workflow["revision"]["id"], "operation_id": shared_operation_id},
        {"revision_id": workflow["revision"]["id"], "operation_id": str(uuid4())},
        {"revision_id": workflow["revision"]["id"], "operation_id": str(uuid4())},
    ]
    responses = concurrent_posts(application, employee, f"/api/workflows/{workflow['id']}/approve", bodies)
    assert [response.status_code for response in responses] == [200] * 4, [r.text for r in responses]
    assert len({response.json()["case"]["id"] for response in responses}) == 1
    assert case_count(application, workflow["id"]) == 1


def test_failure_before_commit_rolls_back_case_approval_and_event_then_retry_recovers(
    employee, application, monkeypatch
):
    from opsdesk import workflows
    from opsdesk.models import Approval

    workflow, _ = employee.start()
    operation_id = str(uuid4())
    original_activity = workflow["activity"]

    def fail_before_commit(db, current_workflow, case):
        raise RuntimeError("Injected test-only interruption before commit")

    with monkeypatch.context() as patch:
        patch.setattr(workflows, "before_case_commit", fail_before_commit)
        response = employee.approve(workflow, operation_id)
    assert response.status_code == 500
    assert "Injected test-only" not in response.text
    assert case_count(application, workflow["id"]) == 0
    with application.state.session_factory() as db:
        approval_count = db.scalar(
            select(func.count()).select_from(Approval).where(Approval.revision_id == workflow["revision"]["id"])
        )
    assert approval_count == 0
    rolled_back = employee.client.get(f"/api/workflows/{workflow['id']}").json()
    assert rolled_back["state"] == "needs_review"
    assert rolled_back["case"] is None
    assert rolled_back["activity"] == original_activity
    retry = employee.approve(workflow, operation_id)
    assert retry.status_code == 200
    assert retry.json()["state"] == "completed"
    assert case_count(application, workflow["id"]) == 1


def test_changed_order_version_requires_new_review(employee, application):
    from opsdesk.models import Order

    workflow, _ = employee.start()
    with application.state.session_factory() as db:
        order = db.get(Order, workflow["order"]["id"])
        original_version = order.version
        order.version += 1
        db.commit()
    try:
        response = employee.approve(workflow)
        assert response.status_code == 409
        assert case_count(application, workflow["id"]) == 0
    finally:
        with application.state.session_factory() as db:
            order = db.get(Order, workflow["order"]["id"])
            order.version = original_version
            db.commit()


def test_source_change_between_initial_read_and_execution_lock_blocks_case(employee, application, monkeypatch):
    from opsdesk import workflows
    from opsdesk.models import Order

    workflow, _ = employee.start()
    original_read = workflows.permitted_order
    changed = False
    original_version = workflow["order"]["version"]

    def change_before_execution_lock(db, actor, order_id, *, lock=False):
        nonlocal changed
        if lock and not changed:
            # An independent source writer commits after the preliminary read.
            # The approval must reload the locked record rather than use cached facts.
            with application.state.session_factory() as writer:
                order = writer.get(Order, order_id)
                order.version += 1
                writer.commit()
            changed = True
        return original_read(db, actor, order_id, lock=lock)

    try:
        with monkeypatch.context() as patch:
            patch.setattr(workflows, "permitted_order", change_before_execution_lock)
            response = employee.approve(workflow)
        assert changed, "The check must exercise a source update during execution."
        assert response.status_code == 409
        assert case_count(application, workflow["id"]) == 0
    finally:
        with application.state.session_factory() as db:
            order = db.get(Order, workflow["order"]["id"])
            order.version = original_version
            db.commit()


def test_completed_replay_recovers_committed_result_after_approval_expiry_and_source_change(employee, application):
    from opsdesk.models import Approval, Order

    workflow, _ = employee.start()
    operation_id = str(uuid4())
    completed = employee.approve(workflow, operation_id)
    assert completed.status_code == 200
    case_id = completed.json()["case"]["id"]
    with application.state.session_factory() as db:
        order = db.get(Order, workflow["order"]["id"])
        original_version = order.version
        order.version += 1
        approval = db.scalar(select(Approval).where(Approval.revision_id == workflow["revision"]["id"]))
        approval.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
    try:
        replay = employee.approve(workflow, operation_id)
        assert replay.status_code == 200
        assert replay.json()["case"]["id"] == case_id
        assert case_count(application, workflow["id"]) == 1
    finally:
        with application.state.session_factory() as db:
            order = db.get(Order, workflow["order"]["id"])
            order.version = original_version
            db.commit()


def test_repeated_migration_preserves_saved_case_and_corpus(employee, application):
    from opsdesk.migrate import migrate
    from opsdesk.models import Order, PolicyVersion

    workflow, _ = employee.start()
    completed = employee.approve(workflow)
    assert completed.status_code == 200
    case_id = completed.json()["case"]["id"]
    migrate(os.environ["TEST_DATABASE_URL"])
    migrate(os.environ["TEST_DATABASE_URL"])
    recovered = employee.client.get(f"/api/workflows/{workflow['id']}")
    assert recovered.status_code == 200
    assert recovered.json()["case"]["id"] == case_id
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Order)) == 8
        assert db.scalar(select(func.count()).select_from(PolicyVersion)) == 6


def test_operation_capacity_bounds_new_keys_without_breaking_completed_recovery(application):
    from opsdesk.main import create_app
    from opsdesk.models import Operation

    app = create_app(replace(application.state.settings, max_operations_per_session=2))
    with TestClient(app, headers={"Origin": "http://testserver"}, raise_server_exceptions=False) as client:
        session = client.post("/api/session", json={"role": "employee"}).json()
        headers = {"X-CSRF-Token": session["csrf_token"]}
        create_body = {"order_id": "AD-1042", "message": "The delivery is missing.", "operation_id": str(uuid4())}
        created = client.post("/api/workflows", json=create_body, headers=headers)
        assert created.status_code == 200
        workflow = created.json()
        approve_body = {"revision_id": workflow["revision"]["id"], "operation_id": str(uuid4())}
        path = f"/api/workflows/{workflow['id']}/approve"
        completed = client.post(path, json=approve_body, headers=headers)
        assert completed.status_code == 200
        case_id = completed.json()["case"]["id"]

        for _ in range(3):
            fresh_key = client.post(path, json={**approve_body, "operation_id": str(uuid4())}, headers=headers)
            assert fresh_key.status_code == 429
        same_key = client.post(path, json=approve_body, headers=headers)
        assert same_key.status_code == 200
        assert same_key.json()["case"]["id"] == case_id
        assert client.post("/api/workflows", json=create_body, headers=headers).status_code == 200
        assert client.post(
            "/api/workflows", json={**create_body, "operation_id": str(uuid4())}, headers=headers
        ).status_code == 429
        assert client.post(
            "/api/workflows", json={**create_body, "message": "Changed request"}, headers=headers
        ).status_code == 409
        with app.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(Operation).where(Operation.session_id == session["session_id"])) == 2
        assert case_count(app, workflow["id"]) == 1
        assert client.post("/api/reset", headers=headers).status_code == 200
