"""
Agent Remote Control — Relay Server

A self-hostable WebSocket relay for agent remote control.

Quick start (OSS defaults):
    uvicorn relay.relay:app --host 0.0.0.0 --port 8600

Custom configuration (hosted version):
    from relay import create_app, RelayConfig
    from relay.protocols import AuthProvider, SessionStore, SessionPolicy, LifecycleHooks

    config = RelayConfig(
        auth=YourAuthProvider(...),
        store=YourSessionStore(...),
        policy=YourSessionPolicy(...),
        hooks=YourLifecycleHooks(...),
    )
    app = create_app(config)
"""

from relay.defaults import (
    DefaultSessionPolicy,
    InMemorySessionStore,
    NoopLifecycleHooks,
    TokenAuthProvider,
)
from relay.models import Session, SessionInfo
from relay.protocols import (
    AuthProvider,
    AuthResult,
    LifecycleHooks,
    SessionPolicy,
    SessionStore,
)
from relay.relay import RelayConfig, create_app

__all__ = [
    # Factory
    "create_app",
    "RelayConfig",
    # Models
    "Session",
    "SessionInfo",
    # Protocols
    "AuthResult",
    "AuthProvider",
    "SessionStore",
    "SessionPolicy",
    "LifecycleHooks",
    # Default implementations
    "TokenAuthProvider",
    "InMemorySessionStore",
    "DefaultSessionPolicy",
    "NoopLifecycleHooks",
]
