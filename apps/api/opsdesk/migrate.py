"""Apply explicit, numbered PostgreSQL migrations; never drop application data.

Run before starting the API: python -m opsdesk.migrate
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import Settings
from .db import Base, make_engine
from .models import SchemaVersion
from .seed import seed_corpus


def migrate(database_url=None):
    engine = make_engine(database_url or Settings().database_url)
    try:
        with engine.begin() as connection:
            # Serialize two deployment migration commands without touching other apps.
            connection.execute(text("SELECT pg_advisory_xact_lock(72706465736)"))
            Base.metadata.create_all(connection)
            with Session(bind=connection) as db:
                versions = list(db.query(SchemaVersion.version).all())
                if any(version[0] > 1 for version in versions):
                    raise RuntimeError("Database schema is newer than this API deployment.")
                if not versions:
                    seed_corpus(db)
                    db.flush()
        print("OpsDesk schema migration 1 applied; synthetic corpus ready.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    migrate()
