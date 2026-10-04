from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
OperationId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")]
Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SessionInput(StrictInput):
    role: Literal["employee", "manager"]


class WorkflowInput(StrictInput):
    order_id: Identifier
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    operation_id: OperationId


class RevisionInput(StrictInput):
    base_revision_id: Identifier
    response: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]
    priority: Literal["standard", "urgent"]
    contact_name: ShortText
    callback: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class ApprovalInput(StrictInput):
    revision_id: Identifier
    operation_id: OperationId
