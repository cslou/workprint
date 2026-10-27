# Workprint

A chat-first filmmaking workspace: the assistant prepares the work; the creator directs, reviews and chooses.

## Status

Pre-implementation. This repository is being prepared with product, architecture and design references. No hosted application, model integration or runnable application/test commands are supplied yet. Reference screens are not implemented behavior.

The first implementation increment is a backend foundation: safe configuration, authenticated native conversations, independent-work recovery, shared contracts and a typed client. It is not a finished filmmaking product.

## Intended stack

TypeScript, React/Vite/React Aria, one Mastra backend, Supabase Auth/Postgres and private Cloudflare R2. Meta's Muse family is the intended application-model direction; exact models, APIs and capabilities still require qualification. The assistant and independent workflows compose one runtime, not parallel agent or scheduling systems.

## Development

Work from the repository root. Setup, dependency versions and verification commands will be documented when their owning implementation is delivered; do not assume an application scaffold exists.

Public product/architecture references will be added in the next migration chunk, followed by the design/brand-book bundle last. Local specs, sprints and selected research are intentionally gitignored and are not included in public clones. Maintainers must supply those files separately before dependent implementation; Git is not their backup.

## Configuration and safety

The tracked `.env.example` contains only safe configuration notes. Actual credentials belong in ignored `.env`, remain server-side and must never enter browser bundles, prompts, screenshots or logs. No credential has been transferred from the earlier prototype.

`AI_MODE=off` is the intended default. Controlled test providers are nonproduction-only; live inference and paid media calls require explicit enablement, qualified integrations and applicable human authorization. Adding a key alone enables nothing. This repository does not yet implement those runtime safeguards.

## Verification approach

Start from the actual application baseline: no tests or tools were imported from the old local-skill workspace. Each test must protect observable behavior or a credible failure; prefer focused boundary proof and add small unit tests only for distinct value. Do not create duplicate layers, documentation-heading suites or arbitrary test-count/coverage targets. Useful checks become regressions for later work.

Migration verification is limited to document consistency, publication safety, meaningful ignore behavior and design-artifact checks. It is not hosted runtime or provider qualification.
