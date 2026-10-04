from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class SchemaVersion(Base):
    __tablename__ = "schema_versions"
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DemoSession(Base):
    __tablename__ = "demo_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(32), index=True)
    customer_name: Mapped[str] = mapped_column(String(120))
    delivery_status: Mapped[str] = mapped_column(String(32))
    expected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    proof_of_delivery: Mapped[str | None] = mapped_column(String(400), nullable=True)
    items: Mapped[list] = mapped_column(JSONB)
    contact_name: Mapped[str] = mapped_column(String(120))
    callback: Mapped[str] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, default=1)


class Policy(Base):
    """Activation row; approval locks this row before comparing source versions."""

    __tablename__ = "policies"
    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    active_version: Mapped[int] = mapped_column(Integer)


class PolicyVersion(Base):
    __tablename__ = "policy_versions"
    __table_args__ = (UniqueConstraint("policy_code", "version"),)
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    policy_code: Mapped[str] = mapped_column(ForeignKey("policies.code"))
    version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    section: Mapped[str] = mapped_column(String(120))
    text: Mapped[str] = mapped_column(Text)
    audience: Mapped[str] = mapped_column(String(16))
    customer_scope: Mapped[str] = mapped_column(String(32), default="all")
    applicable_statuses: Mapped[list] = mapped_column(JSONB)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Workflow(Base):
    __tablename__ = "workflows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("demo_sessions.id", ondelete="CASCADE"), index=True
    )
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    message: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(32))
    current_revision_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    trace_id: Mapped[str] = mapped_column(String(36), default=uid)
    generation_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Revision(Base):
    __tablename__ = "revisions"
    __table_args__ = (UniqueConstraint("workflow_id", "number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    response: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(16))
    contact_name: Mapped[str] = mapped_column(String(120))
    callback: Mapped[str] = mapped_column(String(200))
    evidence_ids: Mapped[list] = mapped_column(JSONB)
    evidence_versions: Mapped[dict] = mapped_column(JSONB)
    evidence_scores: Mapped[dict] = mapped_column(JSONB)
    order_version: Mapped[int] = mapped_column(Integer)
    rule_version: Mapped[int] = mapped_column(Integer, default=1)
    payload_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE")
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("revisions.id", ondelete="CASCADE"), unique=True
    )
    actor_role: Mapped[str] = mapped_column(String(16))
    payload_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SupportCase(Base):
    __tablename__ = "support_cases"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("demo_sessions.id", ondelete="CASCADE"), index=True
    )
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE"), unique=True
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("revisions.id", ondelete="CASCADE"), unique=True
    )
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    priority: Mapped[str] = mapped_column(String(16))
    summary: Mapped[str] = mapped_column(Text)
    contact_name: Mapped[str] = mapped_column(String(120))
    callback: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Operation(Base):
    __tablename__ = "operations"
    __table_args__ = (UniqueConstraint("session_id", "kind", "operation_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("demo_sessions.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(24))
    operation_id: Mapped[str] = mapped_column(String(80))
    request_digest: Mapped[str] = mapped_column(String(64))
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE")
    )
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Activity(Base):
    __tablename__ = "activity"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(String(600))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
