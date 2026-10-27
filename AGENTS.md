# Workprint Agent Guide

Work from the repository root and start with [README.md](README.md). Shared engineering rules live in the global agent guide; this file covers only Workprint.

This is a fresh hosted-application repository, not a copy of the former local Pi-skill workspace. Do not assume application code, inherited tests or executable setup commands exist.

## Repository context

- Specs and sprint plans are versioned under `docs/specs/` and `docs/sprints/`. Current approved scope supersedes older architecture and design examples.
- `docs/research/` is private and gitignored. If required source material is absent, ask the maintainer to supply it; do not infer requirements from historical architecture or mockups.
- Architecture explains technical background, and the litepaper expresses product vision. Neither is implemented capability or a release checklist.
- Design references are not product behavior or approval of unseen states. Older Editor/Project examples do not widen current scope.
- Keep production vocabulary distinct: Narrative Scene, Shot, Storyboard Panel, Frame, candidate, exact-version approval and selection are not interchangeable. [Terminology](CONTEXT.md) is canonical.

## Product boundaries

- Use one backend/native runtime and one qualified execution owner. `apps/api/src/mastra/` owns backend composition, server and workflow adapters; `apps/api/src/agent/mastra/` owns assistant bindings. They compose one Mastra instance.
- Domains own their SQL and public interfaces and do not call peer domains. `application` coordinates them through narrow interfaces and supplied collaborators; it must not import the agent, either Mastra integration subtree or assembled bootstrap.
- Keep browser contracts and client code free of private server state. Reuse supported native interfaces instead of building another conversation store, protocol, scheduler or agent loop. Do not copy local Pi orchestration into production.
- Muse is the intended model family, not an already qualified integration. Credentials stay server-side in ignored `.env`; never print values or put them in command arguments. Key presence is not live-call authorization.
- Treat approval as applying to exact versions and intended uses. Assistant saves, generation and technical success do not grant human approval. Stop, observer disconnect and cancellation of independent work remain distinct.

## References

Use [architecture](docs/architecture.md), [product vision](docs/litepaper.md), the [brand book](docs/design/brand-book.html) and [design guide](docs/design/design.md) for their stated purposes. Respect placeholder and provenance limitations.
