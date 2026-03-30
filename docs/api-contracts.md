# API Contracts

This document defines the contracts between the open-source relay server and any
hosted/commercial extension. When the repositories are split, these contracts
MUST remain stable — changes require coordinated releases.

## 1. Protocol Interfaces (`relay.protocols`)

The hosted side extends these four `Protocol` (interface) classes. Each method
signature, parameter name, and return type is part of the contract.

### 1.1 AuthProvider

```python
class AuthProvider(Protocol):
    async def authenticate_agent(self, token: str | None, headers: dict[str, str]) -> AuthResult
    async def authenticate_viewer(self, session: Session, secret: str | None, headers: dict[str, str]) -> AuthResult
    async def authenticate_admin(self, token: str | None, headers: dict[str, str]) -> AuthResult
```

**Invariants:**
- All methods MUST return an `AuthResult` (never raise for auth failures).
- `authenticate_viewer` receives the full `Session` object for tenant isolation checks.
- A failed auth MUST set `authenticated=False` and provide a human-readable `error`.
- A successful auth MAY populate `user_id`, `tenant_id`, and `metadata`.

### 1.2 SessionStore

```python
class SessionStore(Protocol):
    async def get(self, session_id: str) -> Session | None
    async def put(self, session_id: str, session: Session) -> None
    async def remove(self, session_id: str) -> Session | None
    async def exists(self, session_id: str) -> bool
    async def count(self, tenant_id: str | None = None) -> int
    async def list_for_tenant(self, tenant_id: str | None = None) -> list[Session]
    async def get_expired(self, ttl_seconds: float) -> list[str]
```

**Invariants:**
- `get` returns `None` for nonexistent sessions (never raises).
- `remove` returns the removed `Session` or `None` if not found.
- `count(tenant_id=None)` returns global count; `count(tenant_id="X")` scopes to tenant.
- `list_for_tenant(tenant_id=None)` returns all sessions; with tenant_id, scopes to tenant.
- `get_expired` returns session IDs whose `last_activity` is older than `ttl_seconds`.

**Optional methods** (detected via `hasattr` in the relay):
- `update_activity(session_id)` — persist last_activity timestamp
- `publish_trace(session_id, envelope)` — cross-instance trace forwarding
- `publish_command(session_id, envelope)` — cross-instance command forwarding

### 1.3 SessionPolicy

```python
class SessionPolicy(Protocol):
    async def can_create_session(self, user_id: str | None, tenant_id: str | None, auth_result: AuthResult) -> tuple[bool, str | None]
    def max_sessions_for_tenant(self, tenant_id: str | None, auth_result: AuthResult) -> int | None
```

**Invariants:**
- `can_create_session` returns `(True, None)` if allowed, `(False, "reason")` if denied.
- `max_sessions_for_tenant` returns `None` for unlimited, or a positive integer.

### 1.4 LifecycleHooks

```python
class LifecycleHooks(Protocol):
    async def on_session_created(self, session_id: str, user_id: str | None, tenant_id: str | None, metadata: dict[str, Any]) -> None
    async def on_session_destroyed(self, session_id: str, user_id: str | None, tenant_id: str | None, reason: str) -> None
    async def on_viewer_joined(self, session_id: str, tenant_id: str | None, viewer_count: int) -> None
    async def on_viewer_left(self, session_id: str, tenant_id: str | None, viewer_count: int) -> None
```

**Invariants:**
- All hook methods MUST NOT raise exceptions (failures are logged and swallowed).
- Hooks are called by the relay after the action has already taken effect.

## 2. Data Models (`relay.models`)

### 2.1 AuthResult

```python
@dataclass
class AuthResult:
    authenticated: bool
    user_id: str | None = None
    tenant_id: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
```

The hosted side uses `metadata` to pass plan info (e.g., `{"plan": "developer"}`).

### 2.2 Session

```python
@dataclass
class Session:
    agent_ws: WebSocket
    info: SessionInfo
    session_secret: str
    user_id: str | None = None
    tenant_id: str | None = None
    created_at: float
    last_activity: float
    viewers: set[WebSocket]
    traces: list[dict]
```

### 2.3 SessionInfo

```python
@dataclass
class SessionInfo:
    session_id: str
    agent_framework: str
    agent_name: str | None = None
    started_at: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    e2e: str | None = None  # "session_secret", "passkey", "passphrase", or None

    def to_dict(self) -> dict[str, Any]  # Returns camelCase keys for JSON
```

## 3. App Factory (`relay.relay`)

```python
@dataclass
class RelayConfig:
    auth: AuthProvider
    store: SessionStore
    policy: SessionPolicy
    hooks: LifecycleHooks

def create_app(config: RelayConfig | None = None) -> FastAPI
```

**Invariants:**
- `create_app(None)` uses OSS defaults.
- `create_app(config)` stores `config` at `app.state.relay_config`.
- The returned app has these endpoints:
  - `GET /` — redirects to `/viewer` if web client is available, else returns health
  - `GET /health` — returns `{"status": "ok", "sessions": <int>}`
  - `GET /sessions` — requires Bearer auth, returns list of session dicts
  - `WS /ws` — WebSocket relay endpoint
  - `GET /viewer/*` — static SPA (if `packages/web-client/dist/` or `relay/web-client/` exists)

## 4. HTTP API Endpoints

### GET /health
- **Auth:** None
- **Response:** `{"status": "ok", "sessions": <int>}`

### GET /sessions
- **Auth:** Bearer token (authenticated via `AuthProvider.authenticate_admin`)
- **Response 200:** `[{"sessionId": "...", "agentFramework": "...", ...}]`
- **Response 401:** `{"error": "unauthorized"}`

### WS /ws
- **Protocol:** JSON over WebSocket
- **Message kinds:** `register`, `trace`, `subscribe`, `command`, `ping`/`pong`
- **Registration flow:**
  1. Agent sends `{"kind": "register", "session": {...}, "token": "..."}`
  2. Relay authenticates, checks policy, creates session
  3. Relay responds `{"kind": "registered", "sessionId": "...", "sessionSecret": "..."}`
- **Subscribe flow:**
  1. Viewer sends `{"kind": "subscribe", "sessionId": "...", "sessionSecret": "..."}`
  2. Relay authenticates viewer, replays traces
  3. Relay forwards subsequent traces to viewer

## 5. Wire Protocol Types (TypeScript — `@axolotlai/arc-protocol`)

### ClientEnvelope
```typescript
type ClientEnvelope =
  | { kind: "register"; session: SessionInfo }
  | { kind: "trace"; event: TraceEvent }
  | { kind: "trace"; event: EncryptedField; encrypted: true }
  | { kind: "command"; command: RemoteCommand }
  | { kind: "command"; command: EncryptedField; encrypted: true }
  | { kind: "subscribe"; sessionId: string; sessionSecret: string }
  | { kind: "ping" }
  | { kind: "pong" }
```

When `encrypted: true`, the relay forwards the envelope without inspecting
the `event` or `command` field (skips type validation for encrypted commands).

### TraceEvent types
`agent_message`, `tool_call`, `tool_result`, `subagent_spawn`, `subagent_result`,
`status_change`, `error`, `stream_delta`

### RemoteCommand types
`inject_message`, `cancel`, `approve_tool`, `deny_tool`

### Allowed command types (validation whitelist)
`inject_message`, `cancel`, `approve_tool`, `deny_tool`

Max inject_message content length: 100,000 characters.
