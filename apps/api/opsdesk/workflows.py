"""Save reviewable revisions and commit approved simulated cases atomically."""

from datetime import timedelta
import hashlib
import json
from time import perf_counter
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from .authorization import (
    current_revision,
    permitted_order,
    permitted_revision_evidence,
)
from .models import (
    Activity,
    Approval,
    Operation,
    Policy,
    Revision,
    SupportCase,
    Workflow,
    now,
)
from .retrieval import evidence_dict, retrieve

RULE_VERSION = 1


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()


def revision_payload(revision):
    return {
        key: getattr(revision, key)
        for key in (
            "response",
            "summary",
            "priority",
            "contact_name",
            "callback",
            "evidence_ids",
            "evidence_versions",
            "order_version",
            "rule_version",
        )
    }


def missing_fields(revision):
    return [
        field
        for field in ("contact_name", "callback")
        if not getattr(revision, field).strip()
    ]


def action_policy_available(order, revision, evidence):
    required = {"contact", "privacy"}
    required |= (
        {"escalation", "proof"}
        if order.delivery_status == "disputed"
        else {"missing-delivery"}
    )
    if revision.priority == "urgent":
        required.add("urgent")
    return required.issubset({policy.policy_code for policy in evidence})


def order_dict(order):
    return {
        key: getattr(order, key)
        for key in (
            "id",
            "customer_id",
            "customer_name",
            "delivery_status",
            "expected_at",
            "delivered_at",
            "proof_of_delivery",
            "items",
            "contact_name",
            "callback",
            "version",
        )
    }


def revision_dict(revision):
    return {
        key: getattr(revision, key)
        for key in (
            "id",
            "number",
            "response",
            "summary",
            "priority",
            "contact_name",
            "callback",
            "evidence_ids",
            "created_at",
        )
    }


def add_activity(db, workflow, kind, message):
    db.add(Activity(workflow_id=workflow.id, kind=kind, message=message))


def load_workflow(db, actor, workflow_id, *, lock=False):
    statement = select(Workflow).where(
        Workflow.id == workflow_id, Workflow.session_id == actor.id
    )
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    workflow = db.scalar(statement)
    if workflow is None:
        raise HTTPException(404, "Workflow not found.")
    order = permitted_order(db, actor, workflow.order_id)
    revision = current_revision(db, workflow)
    evidence = permitted_revision_evidence(db, actor, revision)
    return workflow, order, revision, evidence


def sources_current(db, order, revision, evidence, *, lock=False):
    if order.version != revision.order_version or revision.rule_version != RULE_VERSION:
        return False
    codes = sorted(policy.policy_code for policy in evidence)
    statement = select(Policy).where(Policy.code.in_(codes)).order_by(Policy.code)
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    activation = {item.code: item.active_version for item in db.scalars(statement)}
    return all(
        activation.get(policy.policy_code) == revision.evidence_versions.get(policy.id)
        and policy.effective_at <= now()
        for policy in evidence
    )


def serialize(db, actor, workflow, order=None, revision=None, evidence=None):
    order = order or permitted_order(db, actor, workflow.order_id)
    revision = revision or current_revision(db, workflow)
    evidence = (
        evidence
        if evidence is not None
        else permitted_revision_evidence(db, actor, revision)
    )
    case = db.scalar(select(SupportCase).where(SupportCase.workflow_id == workflow.id))
    activities = db.scalars(
        select(Activity)
        .where(Activity.workflow_id == workflow.id)
        .order_by(Activity.created_at, Activity.id)
    )
    missing = missing_fields(revision)
    can_approve = (
        case is None
        and action_policy_available(order, revision, evidence)
        and not missing
        and (revision.priority == "standard" or actor.role == "manager")
        and order.delivery_status != "delivered"
        and sources_current(db, order, revision, evidence)
    )
    return {
        "id": workflow.id,
        "order": order_dict(order),
        "message": workflow.message,
        "state": workflow.state,
        "revision": revision_dict(revision),
        "evidence": [
            evidence_dict(item, revision.evidence_scores.get(item.id, 0.0))
            for item in evidence
        ],
        "missing_fields": missing,
        "case": None
        if case is None
        else {
            "id": case.id,
            "priority": case.priority,
            "summary": case.summary,
            "created_at": case.created_at,
        },
        "trace_id": workflow.trace_id,
        "created_at": workflow.created_at,
        "activity": [
            {
                "id": event.id,
                "kind": event.kind,
                "message": event.message,
                "created_at": event.created_at,
            }
            for event in activities
        ],
        "generation": {
            "mode": "reference",
            "provider": None,
            "model": None,
            "input_tokens": None,
            "output_tokens": None,
            "estimated_cost_usd": None,
            "latency_ms": workflow.generation_latency_ms,
        },
        "can_approve": can_approve,
    }


def find_operation(db, actor, kind, operation_id, request_digest):
    operation = db.scalar(
        select(Operation).where(
            Operation.session_id == actor.id,
            Operation.kind == kind,
            Operation.operation_id == operation_id,
        )
    )
    if operation and operation.request_digest != request_digest:
        raise HTTPException(
            409, "Operation ID was already used with different content."
        )
    return operation


def require_operation_capacity(db, actor, settings):
    count = db.scalar(
        select(func.count())
        .select_from(Operation)
        .where(Operation.session_id == actor.id)
    )
    if count >= settings.max_operations_per_session:
        raise HTTPException(
            429,
            "This sandbox has reached its operation limit. Existing requests can be recovered; reset to start new operations.",
        )


def reference_draft(order, message, evidence):
    """A transparent deterministic draft; user input cannot grant authority."""
    if order.delivery_status == "disputed":
        response = (
            f"Thank you for reporting the delivery issue for order {order.id}. "
            "The delivery record includes a signature, and you have reported that the delivery was not received. "
            "We will include both facts in the support case for review."
        )
    elif order.delivery_status == "delivered":
        response = (
            f"The delivery record for order {order.id} is marked delivered. "
            "Please describe any discrepancy so the record can be reviewed before a new case is proposed."
        )
    else:
        response = (
            f"Thank you for reporting order {order.id} for {order.customer_name}. "
            f"Our delivery record is marked {order.delivery_status.replace('_', ' ')}. "
            "We can prepare a support case for investigation after the contact information is complete and the case is reviewed. "
            "We cannot confirm a replacement, refund, or delivery time at this stage."
        )
    if not order.callback:
        response += " Please provide a callback phone number or email."
    # Only ordinary policy citations may enter this customer-facing draft.
    citations = [
        policy.id
        for policy, _ in evidence
        if policy.audience == "employee"
        and policy.policy_code in ("missing-delivery", "contact", "proof")
    ]
    if citations:
        response += "\n\nSupporting policy references: " + ", ".join(citations) + "."
    if not evidence:
        response = (
            f"The delivery record for order {order.id} is available, but no applicable authorized "
            "policy was retrieved. Case creation is unavailable until policy evidence can be reviewed."
        )
    return response, f"Delivery report for {order.id}: {message[:900]}"


def save_revision(db, workflow, values, evidence, order, number):
    revision = Revision(
        workflow_id=workflow.id,
        number=number,
        **values,
        evidence_ids=[policy.id for policy, _ in evidence],
        evidence_versions={policy.id: policy.version for policy, _ in evidence},
        evidence_scores={policy.id: score for policy, score in evidence},
        order_version=order.version,
        rule_version=RULE_VERSION,
        payload_digest="",
    )
    revision.payload_digest = digest(revision_payload(revision))
    db.add(revision)
    db.flush()
    workflow.current_revision_id = revision.id
    workflow.state = "needs_information" if missing_fields(revision) else "needs_review"
    return revision


def create_workflow(db, actor, body, settings):
    # The API holds this visitor's session lock. It serializes operation-key claims.
    request_digest = digest({"order_id": body.order_id, "message": body.message})
    existing = find_operation(
        db, actor, "create_workflow", body.operation_id, request_digest
    )
    if existing:
        workflow, order, revision, evidence = load_workflow(
            db, actor, existing.workflow_id
        )
        return serialize(db, actor, workflow, order, revision, evidence)
    order = permitted_order(db, actor, body.order_id)
    require_operation_capacity(db, actor, settings)
    count = db.scalar(
        select(func.count())
        .select_from(Workflow)
        .where(Workflow.session_id == actor.id)
    )
    if count >= settings.max_workflows_per_session:
        raise HTTPException(
            429, "This sandbox has reached its workflow limit. Reset it to continue."
        )
    started = perf_counter()
    ranked = retrieve(db, actor, order, body.message)
    response, summary = reference_draft(order, body.message, ranked)
    workflow = Workflow(
        session_id=actor.id,
        order_id=order.id,
        message=body.message,
        state="needs_review",
    )
    db.add(workflow)
    db.flush()
    revision = save_revision(
        db,
        workflow,
        {
            "response": response,
            "summary": summary,
            "priority": "urgent"
            if order.delivery_status == "disputed" and actor.role == "manager"
            else "standard",
            "contact_name": order.contact_name,
            "callback": order.callback,
        },
        ranked,
        order,
        1,
    )
    workflow.generation_latency_ms = max(1, round((perf_counter() - started) * 1000))
    add_activity(
        db,
        workflow,
        "retrieved",
        "Authorized delivery facts and applicable policy versions retrieved.",
    )
    add_activity(
        db,
        workflow,
        "reference_generated",
        "A deterministic reference draft was saved. No model was called.",
    )
    db.add(
        Operation(
            session_id=actor.id,
            kind="create_workflow",
            operation_id=body.operation_id,
            request_digest=request_digest,
            workflow_id=workflow.id,
            result={"workflow_id": workflow.id},
        )
    )
    db.flush()
    return serialize(
        db, actor, workflow, order, revision, [policy for policy, _ in ranked]
    )


def edit_revision(db, actor, workflow_id, body, settings):
    workflow, order, revision, evidence = load_workflow(
        db, actor, workflow_id, lock=True
    )
    if workflow.state == "completed":
        raise HTTPException(409, "Completed workflows cannot be edited.")
    if revision.id != body.base_revision_id:
        raise HTTPException(
            409, "This revision changed. Reload the workflow before editing."
        )
    if body.priority == "urgent" and actor.role != "manager":
        raise HTTPException(403, "Urgent priority requires the manager demo role.")
    if revision.number >= settings.max_revisions_per_workflow:
        raise HTTPException(
            429,
            "This workflow has reached its revision limit. Reset the sandbox to continue.",
        )
    # Editing also retrieves the current permitted sources; stale versions cannot
    # be silently refreshed by approval of an old revision.
    ranked = retrieve(db, actor, order, workflow.message)
    values = body.model_dump(exclude={"base_revision_id"})
    new_revision = save_revision(
        db, workflow, values, ranked, order, revision.number + 1
    )
    add_activity(
        db,
        workflow,
        "revised",
        f"Saved immutable revision {new_revision.number}; approval must reference this revision.",
    )
    db.flush()
    return serialize(
        db, actor, workflow, order, new_revision, [policy for policy, _ in ranked]
    )


def before_case_commit(db, workflow, case):
    """Internal fault-injection seam for transaction tests; never an HTTP option."""


def approve(db, actor, workflow_id, body, settings):
    workflow, order, revision, evidence = load_workflow(
        db, actor, workflow_id, lock=True
    )
    request_digest = digest(
        {"workflow_id": workflow_id, "revision_id": body.revision_id}
    )
    operation = find_operation(db, actor, "approve", body.operation_id, request_digest)
    case = db.scalar(select(SupportCase).where(SupportCase.workflow_id == workflow.id))
    # First authorize all saved source material, then recover a committed effect.
    # Expiry or policy changes cannot undo a case already committed to PostgreSQL.
    if operation and operation.result:
        return serialize(db, actor, workflow, order, revision, evidence)
    if case:
        if case.revision_id != body.revision_id:
            raise HTTPException(
                409, "This workflow completed with a different revision."
            )
        require_operation_capacity(db, actor, settings)
        db.add(
            Operation(
                session_id=actor.id,
                kind="approve",
                operation_id=body.operation_id,
                request_digest=request_digest,
                workflow_id=workflow.id,
                result={"case_id": case.id},
            )
        )
        db.flush()
        return serialize(db, actor, workflow, order, revision, evidence)
    if revision.id != body.revision_id:
        raise HTTPException(
            409, "This revision changed. Reload and approve the current revision."
        )
    if missing_fields(revision):
        raise HTTPException(
            422, "Contact name and callback are required before approval."
        )
    if not action_policy_available(order, revision, evidence):
        raise HTTPException(
            409,
            "Required applicable authorized policies were not retrieved. Case creation is unavailable.",
        )
    if revision.priority == "urgent" and actor.role != "manager":
        raise HTTPException(403, "Urgent priority requires the manager demo role.")
    # Lock in the consistent sequence: session -> workflow -> order -> policies.
    order = permitted_order(db, actor, workflow.order_id, lock=True)
    if order.delivery_status == "delivered":
        raise HTTPException(
            409,
            "The recorded delivery requires clarification before a missing-delivery case.",
        )
    if order.delivery_status == "disputed" and actor.role != "manager":
        raise HTTPException(403, "A disputed signed delivery requires manager review.")
    if not sources_current(db, order, revision, evidence, lock=True):
        raise HTTPException(
            409, "Source records changed. Save and review a new revision."
        )
    if revision.payload_digest != digest(revision_payload(revision)):
        raise HTTPException(
            409, "Saved revision integrity check failed. Save a new revision."
        )
    require_operation_capacity(db, actor, settings)
    approval_time = now()
    db.add(
        Approval(
            workflow_id=workflow.id,
            revision_id=revision.id,
            actor_role=actor.role,
            payload_digest=revision.payload_digest,
            created_at=approval_time,
            expires_at=approval_time + timedelta(minutes=15),
        )
    )
    case = SupportCase(
        id="SIM-" + uuid4().hex[:16].upper(),
        session_id=actor.id,
        workflow_id=workflow.id,
        revision_id=revision.id,
        order_id=order.id,
        priority=revision.priority,
        summary=revision.summary,
        contact_name=revision.contact_name,
        callback=revision.callback,
    )
    db.add(case)
    workflow.state = "completed"
    add_activity(
        db,
        workflow,
        "approved",
        f"The {actor.role} demo identity approved revision {revision.number}.",
    )
    add_activity(
        db,
        workflow,
        "case_created",
        "The simulated support case and result were committed together.",
    )
    db.add(
        Operation(
            session_id=actor.id,
            kind="approve",
            operation_id=body.operation_id,
            request_digest=request_digest,
            workflow_id=workflow.id,
            result={"case_id": case.id},
        )
    )
    db.flush()
    before_case_commit(db, workflow, case)
    return serialize(db, actor, workflow, order, revision, evidence)
