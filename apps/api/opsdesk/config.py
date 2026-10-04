from dataclasses import dataclass, field
import os


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv(
        "OPSDESK_DATABASE_URL", "postgresql+psycopg://opsdesk:opsdesk@localhost:5432/opsdesk"))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        x.strip().rstrip("/") for x in os.getenv(
            "OPSDESK_ALLOWED_ORIGINS", "http://localhost:8080").split(",") if x.strip()))
    cookie_secure: bool = field(default_factory=lambda: os.getenv("OPSDESK_COOKIE_SECURE", "true").lower() == "true")
    session_ttl_hours: int = 24
    max_sessions: int = 500
    max_workflows_per_session: int = 20
    max_revisions_per_workflow: int = 20
    max_operations_per_session: int = 200
    max_body_bytes: int = 16384
    rate_limits_enabled: bool = True
    trust_proxy_ip: bool = field(default_factory=lambda: os.getenv("OPSDESK_TRUST_PROXY_IP", "false").lower() == "true")

    def __post_init__(self):
        if not self.database_url.startswith("postgresql"):
            raise ValueError("OpsDesk requires PostgreSQL; no alternative persistence path is supported.")
