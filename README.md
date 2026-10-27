# Workprint

A chat-first filmmaking workspace: the assistant prepares the work; the creator directs, reviews and chooses.

## Status

Pre-implementation. This repository is being prepared with product, architecture and design references. No hosted application, model integration or runnable application/test commands are supplied yet. Reference screens are not implemented behavior.

The first implementation increment is a backend foundation: safe configuration, authenticated native conversations, independent-work recovery, shared contracts and a typed client. It is not a finished filmmaking product.

## Intended stack

TypeScript, React/Vite/React Aria, one Mastra backend, Supabase Auth/Postgres and private Cloudflare R2. Meta's Muse family is the intended application-model direction; exact models, APIs and capabilities still require qualification. The assistant and independent workflows compose one runtime, not parallel agent or scheduling systems.

## Development

Work from the repository root. Setup, dependency versions and verification commands will be documented when their owning implementation is delivered; do not assume an application scaffold exists.

Specs and sprint plans are versioned with the repository. Private research remains gitignored; obtain required source material from the maintainer before dependent work.

## Documentation

- [Implementation spec](docs/specs/implementation-spec-001.md) and [Sprint 001](docs/sprints/sprint-001.md) — current planned scope and verification, not completed implementation.
- [Architecture background](docs/architecture.md) — intended technical direction, with current-MVP precedence over earlier broad examples.
- [Product strategy litepaper](docs/litepaper.md) — longer-term vision and unvalidated hypotheses, not a release checklist.
- [Production terminology](CONTEXT.md) — canonical distinctions for planning and review.

- [Brand book](docs/design/brand-book.html) and [design guide](docs/design/design.md) — visual references with labelled media placeholders, not application code. Older Editor/Project examples are historical, not MVP scope.

## Configuration and safety

Actual credentials belong in ignored `.env`, remain server-side and must never enter browser bundles, prompts, screenshots or logs. No credential has been transferred from the earlier prototype.

Automated tests use controlled providers. Real integrations require valid configuration and qualification; credentials do not replace applicable human authorization. These runtime safeguards are not implemented yet.

## Verification approach

Start from the actual application baseline: no tests or tools were imported from the old local-skill workspace. Each test must protect observable behavior or a credible failure; prefer focused boundary proof and add small unit tests only for distinct value. Do not create duplicate layers, documentation-heading suites or arbitrary test-count/coverage targets. Useful checks become regressions for later work.

Migration verification is limited to document consistency, publication safety, meaningful ignore behavior and design-artifact checks. It is not hosted runtime or provider qualification.
