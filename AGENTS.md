# Workprint Agent Guide

Work from the repository root and start with [README.md](README.md). This is a fresh hosted-application repository, not a copy of the former local Pi-skill workspace. Do not assume application code, inherited tests or executable setup commands exist.

## Context and authority

- Read the current approved task before changing anything. Planning approval alone does not authorize implementation, deployment, new infrastructure or live/paid calls.
- When present locally, read `docs/specs/implementation-spec-001.md` for current scope/contracts and the assigned file under `docs/sprints/` for its stories and verification. These folders and `docs/research/` are intentionally gitignored, but explicit file reads still work. Normal Git-aware search may omit them. Do not force-add or publish them.
- A public clone or another worktree will not contain ignored planning material. If required context is absent, ask the maintainer to supply it; do not infer requirements from historical architecture or mockups. Back up local planning separately and transfer it explicitly to authorized workspaces.
- Public architecture documents explain technical background; the litepaper expresses product vision, not implemented capability or a release checklist. Current approved scope supersedes older prototype examples. Design reference screens are not product behavior or automatic approval of unseen states.
- Keep production vocabulary distinct: Narrative Scene, Shot, Storyboard Panel, Frame, candidate, exact-version approval and selection are not interchangeable.

## Architecture

- Follow the spec's incremental structure; create a folder only when it owns real work. No empty future-domain scaffolding or generic framework for hypothetical replacements.
- Use one backend/native runtime and one qualified execution owner. `apps/api/src/mastra/` owns backend composition/server/workflow adapters; `apps/api/src/agent/mastra/` owns assistant bindings. They do not create separate Mastra instances.
- Domains own their SQL and public interfaces and do not call peer domains. `application` coordinates them through narrow interfaces and supplied collaborators; it must not import the agent, either Mastra integration subtree or assembled bootstrap. Mechanical utilities do not import product features.
- Keep browser contracts/client code free of private server state. Reuse supported native interfaces instead of building another conversation store, protocol, scheduler or agent loop. Do not copy local Pi orchestration into production.

## Verification

- Design proof before executable changes: name the observable behavior, credible failure, test boundary and pass condition. Run relevant existing regressions; do not weaken or silently skip them.
- Prefer the cheapest effective independent check. Integration tests are important where identity, persistence, native execution or process recovery crosses boundaries; unit/static checks are appropriate when they protect a distinct contract. Do not duplicate equivalent proof across layers or create prose-presence/folder-inventory tests.
- Run the real commands documented in README once delivered, not imagined commands. Keep verbose logs temporary or ignored and report command/result/revision. Descriptive-only changes use editorial evidence and justified functional/regression N/A.

## Safety and publication

- Muse is the intended model family, not an already qualified integration. Credentials stay in the documented server-only environment mechanism; never print values or put them in command arguments. Key presence is not live-call authorization.
- Treat approval as applying to exact versions and intended uses. Assistant saves/generation/technical success do not grant human approval. Stop, observer disconnect and cancellation of independent work remain distinct.
- This repository is public. Stage explicit task-owned paths; preserve unrelated changes. Never commit secrets, ignored planning, generated/private material or assets without redistribution rights. Keep generated work under ignored `outputs/` and retain honest placeholder/provenance labels in design references.
- Use feature branches and PR delivery; never push directly to the target branch or rewrite published review history. Ignoring sprint/spec records does not silently waive any delivery procedure requiring them: resolve that planning/delivery mismatch before implementation rather than force-publishing private documents.

## Public references

Use [production terminology](CONTEXT.md), [architecture background](docs/architecture.md) and [product vision](docs/litepaper.md) for their stated purposes. Use the [brand book](docs/design/brand-book.html) for visual reference and [design guide](docs/design/design.md) for approved values and rules. Respect migration notes and placeholder limitations; older discovery/Editor/Project examples do not widen MVP scope. Do not start the application sprint as part of this documentation migration.
