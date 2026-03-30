"""
Beta relay entrypoint — OSS relay + Redis session persistence.

Uses RedisSessionStore for session metadata persistence across restarts,
but no auth/billing/Postgres (those are hosted-only).

Usage:
    REDIS_URL=redis://... python -m relay.beta_app
    # or: uvicorn relay.beta_app:app --host 0.0.0.0 --port 8600
"""

from __future__ import annotations

import logging
import os
import sys

log = logging.getLogger("relay.beta")


def create_beta_app():
    """Create the relay app with Redis session store and prefix token auth."""
    import redis.asyncio as aioredis

    from relay.defaults import DefaultSessionPolicy, NoopLifecycleHooks, TokenAuthProvider
    from relay.relay import RelayConfig, create_app

    # Import RedisSessionStore from hosted (it has no other hosted dependencies)
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from hosted.backend.store import RedisSessionStore

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=False)

    agent_token = os.environ.get("AGENT_TOKEN", "")
    max_trace_log = int(os.environ.get("MAX_TRACE_LOG", "2000"))
    max_sessions = int(os.environ.get("MAX_SESSIONS", "100"))

    store = RedisSessionStore(redis=redis_client, max_trace_log=max_trace_log)
    auth = TokenAuthProvider(agent_token=agent_token)
    policy = DefaultSessionPolicy(max_sessions=max_sessions, store=store)
    hooks = NoopLifecycleHooks()

    config = RelayConfig(auth=auth, store=store, policy=policy, hooks=hooks)
    app = create_app(config)

    log.info("Beta relay with Redis session persistence")
    return app


app = create_beta_app()

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8600"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
