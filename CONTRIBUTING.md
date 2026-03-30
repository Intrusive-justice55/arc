# Contributing to ARC

Thanks for your interest in contributing to ARC (Agent Remote Control).

## Getting Started

```bash
# Clone the repo
git clone https://github.com/axolotl-ai-cloud/arc.git
cd arc

# Install Python dependencies (relay server)
pip install -e ".[dev]"

# Install Node dependencies (protocol, CLI, web client, adapters)
npm install

# Run all tests
npm test                           # runs Python + Node tests
python -m pytest tests/ -v         # Python only
node --test packages/protocol/tests/test-*.mjs  # Node only
```

## Project Structure

| Directory | Language | What it does |
|-----------|----------|-------------|
| `relay/` | Python | OSS WebSocket relay server |
| `packages/protocol/` | TypeScript | Wire protocol types + helpers |
| `packages/cli/` | TypeScript | `arc` CLI tool |
| `packages/web-client/` | React/TS | Browser-based viewer |
| `packages/adapter-hermes/` | TypeScript | Hermes Agent adapter |
| `packages/adapter-deepagent/` | TypeScript | DeepAgent adapter |
| `packages/adapter-openclaw/` | TypeScript | OpenClaw adapter |
| `hosted/` | Python + React | Hosted version (WorkOS, Stripe, Postgres) |
| `tests/` | Python | Integration + contract tests |

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run tests: `npm test`
4. Submit a PR

## Code Style

- Python: standard library conventions, type hints, `async/await`
- TypeScript: strict mode, no `any` types
- No unnecessary abstractions — three similar lines beats a premature helper
- No feature flags or backwards-compat shims — just change the code

## Adding a New Adapter

1. Create `packages/adapter-yourframework/`
2. Implement `AgentAdapter` from `@axolotlai/arc-protocol`
3. Add a skill template in `packages/cli/src/skill-installer.ts`
4. Add detection logic in `detectAllFrameworks()`
5. Add tests

## Security

If you find a security vulnerability, please report it privately rather than opening a public issue. Email the maintainers directly.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
