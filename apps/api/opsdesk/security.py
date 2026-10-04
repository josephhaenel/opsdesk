"""Bounded request intake and opaque, expiring sandbox authentication."""
from collections import OrderedDict, deque
from contextlib import suppress
from datetime import timedelta
import hashlib
import hmac
import secrets
from http.cookies import SimpleCookie
from threading import Lock
from time import monotonic

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from starlette.responses import JSONResponse

from .models import DemoSession, now

COOKIE_NAME = "opsdesk_session"


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def session_response(actor):
    return {"session_id": actor.id, "role": actor.role, "csrf_token": actor.csrf_token,
            "company": "Alder Distribution", "generation_mode": "reference"}


def authenticate(db, request, *, lock=False, required=True):
    token = request.cookies.get(COOKIE_NAME, "")
    if len(token) > 128:
        token = ""
    statement = select(DemoSession).where(DemoSession.token_hash == token_hash(token), DemoSession.expires_at > now())
    if lock:
        statement = statement.with_for_update()
    actor = db.scalar(statement) if token else None
    if actor is None and required:
        raise HTTPException(401, "Start a demo session to continue.")
    return actor


def require_csrf(actor, request):
    supplied = request.headers.get("x-csrf-token", "")
    if not hmac.compare_digest(supplied, actor.csrf_token):
        raise HTTPException(403, "The session security token is missing or invalid. Reload the session.")


def cleanup_expired(db):
    # Foreign-key cascades remove each expired visitor's mutable demo records.
    db.execute(delete(DemoSession).where(DemoSession.expires_at <= now()))


def create_session(db, role, settings):
    cleanup_expired(db)
    # A global migration-independent lock makes the bounded public session count
    # atomic even when several visitors arrive together.
    from sqlalchemy import text
    db.execute(text("SELECT pg_advisory_xact_lock(72706465737)"))
    if db.scalar(select(func.count()).select_from(DemoSession)) >= settings.max_sessions:
        raise HTTPException(429, "The public demo is temporarily at capacity. Please return later.")
    token = secrets.token_urlsafe(32)
    actor = DemoSession(token_hash=token_hash(token), csrf_token=secrets.token_urlsafe(32),
                        role=role, expires_at=now() + timedelta(hours=settings.session_ttl_hours))
    db.add(actor)
    db.flush()
    return actor, token


class RateLimiter:
    """Single API worker limiter; state and cardinality are both bounded."""
    def __init__(self):
        self.buckets = OrderedDict()
        self.lock = Lock()

    def permitted(self, key, limit, window):
        current = monotonic()
        with self.lock:
            bucket = self.buckets.pop(key, deque())
            while bucket and bucket[0] <= current - window:
                bucket.popleft()
            allowed = len(bucket) < limit
            if allowed:
                bucket.append(current)
            self.buckets[key] = bucket
            while len(self.buckets) > 5000:
                self.buckets.popitem(last=False)
            return allowed


class SafetyMiddleware:
    def __init__(self, app, settings):
        self.app = app
        self.settings = settings
        self.limiter = RateLimiter()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {key.decode().lower(): value.decode() for key, value in scope["headers"]}
        mutation = scope["method"] in ("POST", "PUT", "PATCH", "DELETE")
        if mutation:
            origin = headers.get("origin", "").rstrip("/")
            if origin not in self.settings.allowed_origins:
                return await JSONResponse({"detail": "Request origin is not allowed."}, status_code=403)(scope, receive, send)
            address = headers.get("x-real-ip") if self.settings.trust_proxy_ip else None
            address = address or (scope.get("client") or ("unknown",))[0]
            if self.settings.rate_limits_enabled:
                if not self.limiter.permitted((address, "mutation"), 90, 60):
                    return await JSONResponse({"detail": "Too many requests. Please wait a minute."}, status_code=429)(scope, receive, send)
                cookies = SimpleCookie()
                with suppress(Exception):
                    cookies.load(headers.get("cookie", ""))
                token = cookies.get(COOKIE_NAME)
                if token and not self.limiter.permitted((token_hash(token.value), "sandbox"), 60, 60):
                    return await JSONResponse({"detail": "This sandbox is receiving too many requests. Please wait a minute."}, status_code=429)(scope, receive, send)
                if scope["path"] == "/api/session" and not self.limiter.permitted((address, "session"), 30, 3600):
                    return await JSONResponse({"detail": "Too many session requests. Please return later."}, status_code=429)(scope, receive, send)
            # Read at most the configured body size, including chunked requests.
            body = bytearray()
            while True:
                event = await receive()
                if event["type"] == "http.disconnect":
                    return
                chunk = event.get("body", b"")
                if len(body) + len(chunk) > self.settings.max_body_bytes:
                    return await JSONResponse({"detail": "Request body exceeds the demo size limit."}, status_code=413)(scope, receive, send)
                body.extend(chunk)
                if not event.get("more_body", False):
                    break
            sent = False
            original_receive = receive

            async def bounded_receive():
                nonlocal sent
                if not sent:
                    sent = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await original_receive()
            receive = bounded_receive
        async def secure_send(event):
            if event["type"] == "http.response.start":
                event["headers"] = list(event.get("headers", [])) + [
                    (b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff")]
            await send(event)
        await self.app(scope, receive, secure_send)
