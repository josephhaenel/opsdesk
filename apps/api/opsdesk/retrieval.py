"""PostgreSQL lexical baseline. Permission and applicability filter the ranked corpus."""
from sqlalchemy import func, literal_column, select

from .authorization import policy_permission
from .models import Policy, PolicyVersion, now


def retrieve(db, actor, order, message):
    # A materialized eligibility boundary is unnecessary for this exact six-row
    # corpus: relational predicates define the eligible ranking input. No ANN index.
    english = literal_column("'english'::regconfig")
    vector = func.to_tsvector(english, PolicyVersion.title + " " + PolicyVersion.text)
    query = func.websearch_to_tsquery(english, message + " OR delivery OR contact")
    score = func.ts_rank_cd(vector, query)
    statement = (select(PolicyVersion, score.label("score"))
                 .join(Policy, Policy.code == PolicyVersion.policy_code)
                 .where(policy_permission(actor), PolicyVersion.version == Policy.active_version,
                        PolicyVersion.effective_at <= now(),
                        PolicyVersion.applicable_statuses.contains([order.delivery_status]),
                        PolicyVersion.customer_scope.in_(("all", order.customer_id)))
                 .order_by(score.desc(), PolicyVersion.id).limit(6))
    return [(policy, float(rank)) for policy, rank in db.execute(statement)]


def evidence_dict(policy, score=0.0):
    return {"id": policy.id, "title": policy.title, "version": policy.version,
            "section": policy.section, "text": policy.text, "audience": policy.audience,
            "effective_at": policy.effective_at, "score": score}
