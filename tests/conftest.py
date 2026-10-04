"""Integration fixtures that only connect to an explicitly named test database."""

from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url


@dataclass
class Actor:
    client: TestClient
    session: dict

    def post(self, path: str, body: dict | None = None):
        return self.client.post(
            path,
            json=body,
            headers={"X-CSRF-Token": self.session["csrf_token"]},
        )

    def switch(self, role: str):
        response = self.post("/api/session", {"role": role})
        assert response.status_code == 200, response.text
        self.session = response.json()
        return self.session

    def start(self, order_id: str = "AD-1042", **overrides):
        body = {
            "order_id": order_id,
            "message": "Our delivery has not arrived. Please check its status and help us open a support case.",
            "operation_id": str(uuid4()),
        }
        body.update(overrides)
        response = self.post("/api/workflows", body)
        assert response.status_code == 200, response.text
        return response.json(), body

    def approve(self, workflow: dict, operation_id: str | None = None):
        return self.post(
            f"/api/workflows/{workflow['id']}/approve",
            {
                "revision_id": workflow["revision"]["id"],
                "operation_id": operation_id or str(uuid4()),
            },
        )

    def edit(self, workflow: dict, **changes):
        revision = workflow["revision"]
        body = {
            "base_revision_id": revision["id"],
            **{
                key: revision[key]
                for key in ("response", "summary", "priority", "contact_name", "callback")
            },
        }
        body.update(changes)
        return self.post(f"/api/workflows/{workflow['id']}/revisions", body)


@pytest.fixture(scope="session")
def application():
    raw_url = os.environ.get("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated OpsDesk PostgreSQL test database.")
    parsed = make_url(raw_url)
    database = parsed.database or ""
    if parsed.get_backend_name() != "postgresql" or not (
        database.startswith("opsdesk") and database.endswith("_test")
    ):
        pytest.fail("Refusing database access: TEST_DATABASE_URL must name opsdesk*_test on PostgreSQL.")

    # Imports occur after the explicit database guard. No deployment defaults are used.
    from opsdesk.config import Settings
    from opsdesk.main import create_app
    from opsdesk.migrate import migrate

    migrate(raw_url)
    app = create_app(
        Settings(
            database_url=raw_url,
            allowed_origins=("http://testserver",),
            cookie_secure=False,
            rate_limits_enabled=False,
        )
    )
    yield app
    app.state.engine.dispose()


@pytest.fixture
def actor_factory(application):
    actors: list[Actor] = []

    def make(role="employee"):
        client = TestClient(
            application,
            base_url="http://testserver",
            headers={"Origin": "http://testserver"},
            raise_server_exceptions=False,
        )
        response = client.post("/api/session", json={"role": role})
        assert response.status_code == 200, response.text
        actor = Actor(client, response.json())
        actors.append(actor)
        return actor

    yield make
    for actor in actors:
        # Each test creates its own sandbox. Reset removes its mutable records only.
        actor.post("/api/reset")
        actor.client.close()


@pytest.fixture
def employee(actor_factory):
    return actor_factory("employee")


@pytest.fixture
def manager(actor_factory):
    return actor_factory("manager")
