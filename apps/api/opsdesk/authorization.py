"""Shared account and evidence permissions for every workflow access path."""

from fastapi import HTTPException
from sqlalchemy import and_, or_, select

from .models import Order, PolicyVersion, Revision

ACCOUNT_GRANTS = {
    "employee": ("harbor", "lumen"),
    "manager": ("harbor", "lumen", "cedar"),
}


def permitted_order(db, actor, order_id, *, lock=False):
    statement = select(Order).where(
        Order.id == order_id, Order.customer_id.in_(ACCOUNT_GRANTS[actor.role])
    )
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    order = db.scalar(statement)
    if order is None:
        raise HTTPException(404, "Order not found.")
    return order


def policy_permission(actor):
    audiences = ("employee", "manager") if actor.role == "manager" else ("employee",)
    return and_(
        PolicyVersion.audience.in_(audiences),
        or_(
            PolicyVersion.customer_scope == "all",
            PolicyVersion.customer_scope.in_(ACCOUNT_GRANTS[actor.role]),
        ),
    )


def permitted_revision_evidence(db, actor, revision):
    evidence = list(
        db.scalars(
            select(PolicyVersion).where(
                PolicyVersion.id.in_(revision.evidence_ids), policy_permission(actor)
            )
        )
    )
    if len(evidence) != len(revision.evidence_ids):
        # A saved response may contain the restricted content: deny the whole record.
        raise HTTPException(404, "Workflow not found.")
    by_id = {item.id: item for item in evidence}
    return [by_id[eid] for eid in revision.evidence_ids]


def current_revision(db, workflow):
    revision = db.get(Revision, workflow.current_revision_id)
    if revision is None:
        raise HTTPException(409, "Workflow does not have a saved revision.")
    return revision
