from uuid import uuid4
import re


def test_missing_contact_blocks_case_until_reviewed_revision(employee):
    original, _ = employee.start("AD-1043")
    assert original["state"] == "needs_information"
    assert "callback" in original["missing_fields"]
    assert original["can_approve"] is False
    denied = employee.approve(original)
    assert denied.status_code == 422
    assert employee.client.get(f"/api/workflows/{original['id']}").json()["case"] is None

    edited = employee.edit(original, callback="+1 314 555 0186")
    assert edited.status_code == 200
    current = edited.json()
    assert current["state"] == "needs_review"
    assert current["can_approve"] is True
    assert current["revision"]["id"] != original["revision"]["id"]
    assert employee.approve(original).status_code == 409
    completed = employee.approve(current)
    assert completed.status_code == 200
    assert completed.json()["case"] is not None


def test_revision_edit_is_immutable_and_stale_edit_and_approval_conflict(employee, application):
    from opsdesk.models import Revision

    original, _ = employee.start()
    first_revision_id = original["revision"]["id"]
    changed_summary = "Customer confirmed that reception checked every delivery entrance."
    edited = employee.edit(original, summary=changed_summary)
    assert edited.status_code == 200
    current = edited.json()
    assert current["revision"]["number"] == original["revision"]["number"] + 1
    assert current["revision"]["summary"] == changed_summary
    assert current["revision"]["id"] != first_revision_id
    with application.state.session_factory() as db:
        first = db.get(Revision, first_revision_id)
        assert first.summary == original["revision"]["summary"]
    assert employee.edit(original, summary="Stale tab overwrote this.").status_code == 409
    assert employee.approve(original).status_code == 409
    refreshed = employee.client.get(f"/api/workflows/{original['id']}").json()
    assert refreshed["revision"]["summary"] == changed_summary
    completed = employee.approve(refreshed)
    assert completed.status_code == 200
    assert completed.json()["case"]["summary"] == changed_summary
    assert employee.edit(refreshed, summary="Change completed case").status_code == 409


def test_employee_cannot_create_urgent_case_but_manager_can(employee, manager):
    ordinary, _ = employee.start()
    attempted = employee.edit(ordinary, priority="urgent")
    assert attempted.status_code == 403
    refreshed = employee.client.get(f"/api/workflows/{ordinary['id']}").json()
    assert refreshed["revision"]["priority"] == "standard"
    assert refreshed["case"] is None

    escalation, _ = manager.start("AD-2041")
    edited = manager.edit(escalation, priority="urgent")
    assert edited.status_code == 200
    completed = manager.approve(edited.json())
    assert completed.status_code == 200
    assert completed.json()["case"]["priority"] == "urgent"


def test_workflow_operation_replays_and_changed_payload_conflicts(employee):
    original, payload = employee.start()
    replay = employee.post("/api/workflows", payload)
    assert replay.status_code == 200
    assert replay.json()["id"] == original["id"]
    assert replay.json()["revision"]["id"] == original["revision"]["id"]
    assert employee.post("/api/workflows", {**payload, "message": "Changed customer report"}).status_code == 409
    assert employee.post("/api/workflows", {**payload, "order_id": "AD-1043"}).status_code == 409
    workflows = employee.client.get("/api/workflows").json()["workflows"]
    assert [item["id"] for item in workflows] == [original["id"]]


def test_completed_result_survives_refresh_and_lost_response_retry(employee):
    workflow, _ = employee.start()
    operation_id = str(uuid4())
    # Treat this first response as lost; the browser knows only its request key.
    first = employee.approve(workflow, operation_id)
    assert first.status_code == 200
    case_id = first.json()["case"]["id"]
    replay = employee.approve(workflow, operation_id)
    assert replay.status_code == 200
    assert replay.json()["case"]["id"] == case_id
    recovered = employee.client.get(f"/api/workflows/{workflow['id']}")
    assert recovered.status_code == 200
    assert recovered.json()["state"] == "completed"
    assert recovered.json()["case"]["id"] == case_id
    # A new request key cannot create a second case for the approved revision.
    retried = employee.approve(workflow)
    assert retried.status_code == 200
    assert retried.json()["case"]["id"] == case_id


def test_approval_operation_payload_conflict(employee):
    first_workflow, _ = employee.start()
    second_workflow, _ = employee.start()
    operation_id = str(uuid4())
    assert employee.approve(first_workflow, operation_id).status_code == 200
    conflict = employee.approve(second_workflow, operation_id)
    assert conflict.status_code == 409
    assert employee.client.get(f"/api/workflows/{second_workflow['id']}").json()["case"] is None


def test_reference_mode_reports_no_model_usage(employee):
    workflow, _ = employee.start()
    generation = workflow["generation"]
    assert generation["mode"] == "reference"
    for key in ("provider", "model", "input_tokens", "output_tokens", "estimated_cost_usd"):
        assert generation[key] is None
    assert generation["latency_ms"] >= 0
    assert workflow["trace_id"]
    assert workflow["activity"]


def test_recorded_delivery_cannot_be_approved_as_missing_without_clarification(employee):
    workflow, _ = employee.start("AD-1044")
    assert workflow["order"]["delivery_status"] == "delivered"
    assert workflow["order"]["proof_of_delivery"]
    assert workflow["can_approve"] is False
    assert employee.approve(workflow).status_code == 409
    assert employee.client.get(f"/api/workflows/{workflow['id']}").json()["case"] is None


def test_reference_customer_response_cites_only_ordinary_returned_evidence(manager):
    workflow, _ = manager.start("AD-2041")
    evidence = workflow["evidence"]
    permitted_citations = {item["id"] for item in evidence if item["audience"] == "employee"}
    internal = {item["id"] for item in evidence if item["audience"] == "manager"}
    assert internal, "The check must include internal manager sources."
    cited = set(re.findall(r"POL-[a-z-]+-v\d+", workflow["revision"]["response"]))
    assert cited
    assert cited <= permitted_citations
    assert cited.isdisjoint(internal)


def test_missing_required_action_policy_blocks_case(employee, monkeypatch):
    from opsdesk import workflows

    original_retrieve = workflows.retrieve

    def unavailable_action_policy(db, actor, order, message):
        return [
            (policy, score)
            for policy, score in original_retrieve(db, actor, order, message)
            if policy.policy_code != "missing-delivery"
        ]

    with monkeypatch.context() as patch:
        patch.setattr(workflows, "retrieve", unavailable_action_policy)
        workflow, _ = employee.start()
    assert workflow["evidence"], "Unrelated authorized sources should still be available."
    assert workflow["can_approve"] is False
    assert employee.approve(workflow).status_code == 409
    assert employee.client.get(f"/api/workflows/{workflow['id']}").json()["case"] is None
