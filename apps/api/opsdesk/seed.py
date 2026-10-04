"""Synthetic fixtures: no employer records, real accounts, or customer contacts."""

from datetime import datetime, timezone


from .models import Order, Policy, PolicyVersion, SchemaVersion

EFFECTIVE_AT = datetime(2026, 9, 1, tzinfo=timezone.utc)
EXPECTED_AT = datetime(2026, 10, 2, 14, 0, tzinfo=timezone.utc)
ALL_STATUSES = ["missing", "in_transit", "delivered", "disputed"]


def seed_corpus(db):
    orders = [
        (
            "AD-1042",
            "harbor",
            "Harbor Kitchen",
            "missing",
            "Maya Chen",
            "maya@harbor.example",
            None,
        ),
        ("AD-1043", "harbor", "Harbor Kitchen", "missing", "Maya Chen", "", None),
        (
            "AD-1044",
            "harbor",
            "Harbor Kitchen",
            "delivered",
            "Maya Chen",
            "maya@harbor.example",
            "Signed by receiving desk at 14:10 UTC.",
        ),
        (
            "AD-1045",
            "harbor",
            "Harbor Kitchen",
            "in_transit",
            "Maya Chen",
            "maya@harbor.example",
            None,
        ),
        (
            "AD-1541",
            "lumen",
            "Lumen Market",
            "missing",
            "Eli Brooks",
            "eli@lumen.example",
            None,
        ),
        (
            "AD-1542",
            "lumen",
            "Lumen Market",
            "delivered",
            "Eli Brooks",
            "eli@lumen.example",
            "Signed by receiving desk at 15:05 UTC.",
        ),
        (
            "AD-2041",
            "cedar",
            "Cedar Catering",
            "disputed",
            "Sam Patel",
            "sam@cedar.example",
            "Signed by S. Patel at 14:22 UTC; customer disputes receipt.",
        ),
        (
            "AD-2042",
            "cedar",
            "Cedar Catering",
            "missing",
            "Sam Patel",
            "sam@cedar.example",
            None,
        ),
    ]
    for index, (oid, cid, name, status, contact, callback, proof) in enumerate(orders):
        if db.get(Order, oid) is None:
            db.add(
                Order(
                    id=oid,
                    customer_id=cid,
                    customer_name=name,
                    delivery_status=status,
                    expected_at=EXPECTED_AT,
                    delivered_at=EXPECTED_AT if proof else None,
                    proof_of_delivery=proof,
                    contact_name=contact,
                    callback=callback,
                    items=[
                        {
                            "name": "Pantry essentials"
                            if index % 2 == 0
                            else "Chilled produce",
                            "quantity": 12 + index,
                        }
                    ],
                    version=1,
                )
            )

    policies = [
        (
            "missing-delivery",
            "Missing delivery procedure",
            "1. Intake and review",
            "employee",
            "all",
            ["missing", "in_transit"],
            "For a missing or delayed delivery, verify the order and delivery record, collect a contact name and callback, then create a standard-priority support case after human review. Do not promise a replacement, refund, or delivery time before investigation.",
        ),
        (
            "contact",
            "Required customer contact",
            "2. Contact requirements",
            "employee",
            "all",
            ALL_STATUSES,
            "A support case requires the customer's contact name and a callback phone number or email. If either is missing, request it before creating a case. Use only the contact fields shown in the reviewed revision.",
        ),
        (
            "proof",
            "Delivery proof handling",
            "3. Signed records",
            "employee",
            "all",
            ALL_STATUSES,
            "A signed delivery record is evidence of a delivery event, not proof that a disputed report is resolved. Preserve the record, describe the discrepancy accurately, and refer a disputed signed delivery to a manager for review.",
        ),
        (
            "privacy",
            "Customer data handling",
            "4. Minimize shared data",
            "employee",
            "all",
            ALL_STATUSES,
            "Use only the authorized customer's order and contact information. Keep the customer-facing response factual and avoid internal escalation instructions. Do not share other customers' orders, personal data, or restricted internal policy text.",
        ),
        (
            "escalation",
            "Disputed delivery escalation",
            "5. Manager review",
            "manager",
            "cedar",
            ["disputed"],
            "Managers may open a support case for a disputed signed delivery after comparing the customer's report with the proof of delivery. Preserve both records and route the discrepancy to delivery operations. This instruction is internal and must not be quoted in customer-facing text.",
        ),
        (
            "urgent",
            "Urgent case authorization",
            "6. Manager authority",
            "manager",
            "all",
            ALL_STATUSES,
            "Only a manager may approve an urgent-priority support case. Urgent priority is a reviewed routing decision and does not guarantee a refund, replacement, response deadline, or particular delivery outcome. This instruction is internal.",
        ),
    ]
    for code, title, section, audience, scope, statuses, body in policies:
        if db.get(Policy, code) is None:
            db.add(Policy(code=code, active_version=1))
            db.flush()
            db.add(
                PolicyVersion(
                    id=f"POL-{code}-v1",
                    policy_code=code,
                    version=1,
                    title=title,
                    section=section,
                    text=body,
                    audience=audience,
                    customer_scope=scope,
                    applicable_statuses=statuses,
                    effective_at=EFFECTIVE_AT,
                )
            )
    if db.get(SchemaVersion, 1) is None:
        db.add(SchemaVersion(version=1))
    db.flush()
