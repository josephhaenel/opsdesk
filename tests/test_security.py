from uuid import uuid4

from fastapi.testclient import TestClient
import pytest


def test_api_requires_server_session(application):
    with TestClient(application, raise_server_exceptions=False) as client:
        for path in ("/api/session", "/api/orders", "/api/workflows"):
            assert client.get(path).status_code == 401


def test_employee_scope_is_server_enforced(employee, manager):
    employee_orders = employee.client.get("/api/orders").json()["orders"]
    manager_orders = manager.client.get("/api/orders").json()["orders"]
    assert len(manager_orders) == 8
    assert 0 < len(employee_orders) < len(manager_orders)
    assert "AD-1042" in {order["id"] for order in employee_orders}
    assert "AD-2041" not in {order["id"] for order in employee_orders}
    restricted = employee.client.get("/api/orders/AD-2041")
    missing = employee.client.get("/api/orders/AD-does-not-exist")
    assert restricted.status_code == missing.status_code == 404
    assert restricted.json() == missing.json()
    assert manager.client.get("/api/orders/AD-2041").status_code == 200

    denied = employee.post(
        "/api/workflows",
        {"order_id": "AD-2041", "message": "Missing delivery", "operation_id": str(uuid4())},
    )
    assert denied.status_code == 404
    assert "Cedar" not in denied.text


def test_retrieval_and_citation_opening_repeat_permission_check(employee, manager):
    employee_workflow, _ = employee.start()
    assert employee_workflow["evidence"]
    assert all(item["audience"] == "employee" for item in employee_workflow["evidence"])
    for item in employee_workflow["evidence"]:
        opened = employee.client.get(f"/api/evidence/{item['id']}")
        assert opened.status_code == 200
        assert opened.json()["text"] == item["text"]

    manager_workflow, _ = manager.start("AD-2041")
    restricted = [item for item in manager_workflow["evidence"] if item["audience"] == "manager"]
    assert restricted, "Manager walkthrough must exercise restricted evidence."
    assert all(manager.client.get(f"/api/evidence/{item['id']}").status_code == 200 for item in restricted)

    manager.switch("employee")
    assert manager.client.get(f"/api/workflows/{manager_workflow['id']}").status_code == 404
    for item in restricted:
        assert manager.client.get(f"/api/evidence/{item['id']}").status_code == 404
    assert manager.approve(manager_workflow).status_code == 404


def test_mutating_requests_require_csrf_and_allowed_origin(employee):
    payload = {"order_id": "AD-1042", "message": "Delivery missing", "operation_id": str(uuid4())}
    assert employee.client.post("/api/workflows", json=payload).status_code == 403
    assert employee.client.post(
        "/api/workflows", json=payload, headers={"X-CSRF-Token": "wrong-token"}
    ).status_code == 403
    assert employee.client.post(
        "/api/workflows",
        json=payload,
        headers={"X-CSRF-Token": employee.session["csrf_token"], "Origin": "https://attacker.invalid"},
    ).status_code == 403
    assert employee.client.post("/api/session", json={"role": "manager"}).status_code == 403
    assert employee.client.get("/api/session").json()["role"] == "employee"
    workflow, _ = employee.start()
    revision = workflow["revision"]
    remaining_mutations = [
        ("/api/reset", None),
        (
            f"/api/workflows/{workflow['id']}/revisions",
            {
                "base_revision_id": revision["id"],
                **{key: revision[key] for key in ("response", "summary", "priority", "contact_name", "callback")},
            },
        ),
        (
            f"/api/workflows/{workflow['id']}/approve",
            {"revision_id": revision["id"], "operation_id": str(uuid4())},
        ),
    ]
    for path, body in remaining_mutations:
        assert employee.client.post(path, json=body).status_code == 403
        assert employee.client.post(
            path,
            json=body,
            headers={"X-CSRF-Token": employee.session["csrf_token"], "Origin": "https://attacker.invalid"},
        ).status_code == 403
    assert employee.client.get(f"/api/workflows/{workflow['id']}").json()["case"] is None


@pytest.mark.parametrize("completed", [False, True], ids=["pending-revision", "completed-result"])
def test_role_downgrade_denies_saved_restricted_revision_on_accessible_order(manager, completed):
    workflow, _ = manager.start("AD-1042")
    restricted = [item for item in workflow["evidence"] if item["audience"] == "manager"]
    assert restricted, "This check requires a manager source in an otherwise accessible order."
    operation_id = str(uuid4())
    if completed:
        response = manager.approve(workflow, operation_id)
        assert response.status_code == 200
    manager.switch("employee")
    assert manager.client.get("/api/orders/AD-1042").status_code == 200
    assert manager.client.get(f"/api/workflows/{workflow['id']}").status_code == 404
    assert manager.edit(workflow, summary="Use the saved manager draft").status_code == 404
    assert manager.approve(workflow, operation_id).status_code == 404
    listed = manager.client.get("/api/workflows").json()["workflows"]
    assert workflow["id"] not in {item["id"] for item in listed}
    for item in restricted:
        assert manager.client.get(f"/api/evidence/{item['id']}").status_code == 404


def test_new_session_requires_allowed_origin(application):
    with TestClient(application, raise_server_exceptions=False) as client:
        assert client.post("/api/session", json={"role": "employee"}).status_code == 403
        denied = client.post(
            "/api/session", json={"role": "employee"}, headers={"Origin": "https://attacker.invalid"}
        )
        assert denied.status_code == 403


def test_cookie_is_opaque_and_http_only(employee):
    cookie = employee.client.cookies.get("opsdesk_session")
    assert cookie and cookie != employee.session["session_id"]
    assert "employee" not in cookie
    # A fresh session returns cookie flags, and does not expose its raw token in JSON.
    with TestClient(employee.client.app, headers={"Origin": "http://testserver"}) as client:
        response = client.post("/api/session", json={"role": "employee"})
        assert "httponly" in response.headers["set-cookie"].lower()
        assert "samesite" in response.headers["set-cookie"].lower()
        assert client.cookies.get("opsdesk_session") not in response.text


def test_unexpected_authority_and_malformed_inputs_are_rejected(employee):
    assert employee.post("/api/session", {"role": "admin"}).status_code == 422
    assert employee.post(
        "/api/workflows",
        {
            "order_id": "AD-1042",
            "message": "Delivery missing",
            "operation_id": str(uuid4()),
            "role": "manager",
        },
    ).status_code == 422
    assert employee.post(
        "/api/workflows", {"order_id": "AD-1042", "message": "", "operation_id": str(uuid4())}
    ).status_code == 422
    workflow, _ = employee.start()
    assert employee.edit(workflow, priority="critical").status_code == 422
    assert employee.post(
        f"/api/workflows/{workflow['id']}/approve",
        {"revision_id": workflow["revision"]["id"], "operation_id": str(uuid4()), "summary": "Injected"},
    ).status_code == 422


def test_sandbox_isolation_and_reset(actor_factory):
    alice = actor_factory()
    bob = actor_factory()
    alice_workflow, _ = alice.start()
    bob_workflow, _ = bob.start()
    assert bob.client.get(f"/api/workflows/{alice_workflow['id']}").status_code == 404
    assert bob.approve(alice_workflow).status_code == 404
    alice_completed = alice.approve(alice_workflow)
    assert alice_completed.status_code == 200
    assert bob.client.get(f"/api/workflows/{alice_workflow['id']}").status_code == 404

    assert alice.post("/api/reset").status_code == 200
    assert alice.client.get("/api/workflows").json()["workflows"] == []
    assert bob.client.get(f"/api/workflows/{bob_workflow['id']}").status_code == 200
    assert alice.client.get("/api/orders/AD-1042").status_code == 200
