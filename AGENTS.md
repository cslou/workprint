# Workprint Agent Guide

See [README.md](README.md) for orientation.

## Setup and verification

- [Development setup](README.md#development): `.agents/setup` prepares orb tools and caches; local clones use `pnpm install --frozen-lockfile` and `pnpm setup:hooks`. Use `pnpm exec node` for repository scripts to select the pinned Node runtime.
- [Verification](README.md#verification): `pnpm verify:quick`, `pnpm verify:standard`, and explicit `pnpm verify:e2e`. README covers prerequisites, hook limitations and failure cleanup.
- Follow the [issue template](.github/ISSUE_TEMPLATE/task.md) and [PR template](.github/PULL_REQUEST_TEMPLATE.md), including when supplying bodies through the CLI or API.

## Repository context

- Current approved scope supersedes older architecture and design examples.
- `docs/research/` is private and gitignored. If required source material is absent, ask the maintainer to supply it; do not infer requirements from historical architecture or mockups.
- Architecture, the litepaper, the brand book and the design guide are background only. They are not implemented capability, approved scope or approval of unseen states.
- Keep production vocabulary distinct: Narrative Scene, Shot, Storyboard Panel, Frame, candidate, exact-version approval and selection are not interchangeable. [Terminology](CONTEXT.md) is canonical.

## Product boundaries

- Use one backend/native runtime and one qualified execution owner. `apps/api/src/mastra/` owns backend composition, server and workflow adapters; `apps/api/src/agent/mastra/` owns assistant bindings. They compose one Mastra instance.
- Domains own their SQL and public interfaces and do not call peer domains. `application` coordinates them through narrow interfaces and supplied collaborators; it must not import the agent, either Mastra integration subtree or assembled bootstrap.
- Keep browser contracts and client code free of private server state. Reuse supported native interfaces instead of building another conversation store, protocol, scheduler or agent loop. Do not copy local Pi orchestration into production.
- Muse is the intended model family, not an already qualified integration. Key presence is not live-call authorization.
- Treat approval as applying to exact versions and intended uses. Assistant saves, generation and technical success do not grant human approval. Stop, observer disconnect and cancellation of independent work remain distinct.
