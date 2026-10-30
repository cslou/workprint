# Private object storage

This module owns S3 transport/signing and bounded mechanical object operations,
not conversation ownership, upload policy, approval or version publication.
`artifacts` owns upload state and publication; composition supplies collaborators.
The same AWS SDK adapter is intended for local SeaweedFS and later R2. Local
qualification is not cloud/R2 acceptance. No media verifier is supplied here;
production upload confirmation must remain unavailable until real verification
is installed by its owning slice. No URL or successful PUT is usable work.

## Adapter boundaries

`createPrivateObjectStorage` accepts backend-only endpoint/region/bucket and
credentials. HTTP endpoints must be loopback; HTTPS permits later authorized R2
configuration without another adapter. It exposes staging-only `presignPut`,
private `read`, conditional immutable `publish`, mechanical `remove`, and `close`.
It does not load browser configuration or expose credentials.

Hard caps are 64 MiB per object, two active operations and ten seconds per
operation (including streamed response bodies); callers may lower, never raise,
these bounds. Excess concurrency is rejected, not queued. SDK automatic retries
are disabled. HEAD and GET metadata/ETag and actual streamed length must agree;
reads return a bounded byte snapshot and SHA-256. Publication copies that snapshot
inside the capacity guard and uses `If-None-Match: *` on separate published/poster
keys. Signing fixes the original issue/expiry times, signs type and exact length,
and permits at most 300 seconds. Raw SDK requests/errors are never retained in
public errors; only typed failure, safe source name and HTTP status survive.
Domain policy must authorize every operation and retain cleanup references before
storage writes; a mechanical delete is not a permanent no-late-write guarantee.

The owned test service proves readiness with a bounded write/delete, not just an
open S3 port. Its initial single-node cluster can defer volume-ID allocation
around fifteen seconds; the 30-second startup-write bound is separate from the
product ten-second I/O ceiling. Failures include bounded, credential-redacted
owned-container diagnostics before verified teardown.

## Dependency and service qualification

- Exact `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` **3.1156.0**,
  both published 2026-10-22, over seven days before selection on 2026-10-30.
  Normal pnpm resolution was used: no release-age bypass, exclusion or override.
  The official SDK avoids bespoke SigV4, XML and response/error transport, and
  supplies the same supported client/presigner for both storage targets.
- Separate before/after audits found only the same inherited moderate
  `@hono/node-server` GHSA-rmxm-3fg6-px4f and low `deepmerge`
  GHSA-gcqx-w48m-w2h4. Both remain NON-PASS; no new advisory was introduced.
- Owned fixture: `test/object-storage.ts`. Before first service execution, the
  Docker Hub 4.51 OCI index was resolved, pulled by digest and its local
  `RepoDigests` checked:
  `chrislusf/seaweedfs:4.51@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8`.
  Each run has private generated credentials, bucket-scoped identities, a unique
  bucket/container label, a dynamic **host-loopback-only** S3 port and verified
  owned teardown. CORS is set through SDK v3 `PutBucketCors`, not a wildcard or
  an alternate server/API. Shared Supabase and other containers are untouched.

## Real response shapes observed before adapter parsing

Observed 2026-10-30 with the pinned SDK and authenticated emulator. Values below
are redacted shapes; request IDs, credentials, bucket keys and signed query values
are deliberately omitted. SDK metadata contains `httpStatusCode`, string
`requestId`, optional/undefined `extendedRequestId`/`cfId`, `attempts: 1` and
`totalRetryDelay: 0`.

| Operation | Observed SDK shape/outcome |
| --- | --- |
| `PutBucketCors` | metadata HTTP 200 |
| `GetBucketCors` | `CORSRules` array, metadata HTTP 200 |
| `PutObject` | string `ETag`, metadata HTTP 200 |
| `HeadObject` | numeric `ContentLength`, string `ContentType`/`ETag`/`AcceptRanges`, Date `LastModified`, object `Metadata`, HTTP 200 |
| `GetObject` | same metadata plus `Body: IncomingMessage` with `transformToByteArray`, HTTP 200 |
| Range GET | `ContentRange` string, exact range `ContentLength`, HTTP 206 and exact byte slice |
| Missing HEAD | SDK `NotFound`, `$fault: client`, metadata HTTP 404 |
| Missing GET | SDK `NoSuchKey`, `Code: NoSuchKey`, `$fault: client`, HTTP 404 |
| Foreign credential GET | SDK `AccessDenied`, `Code: AccessDenied`, `$fault: client`, HTTP 403 |
| Conditional existing-key PUT | SDK `PreconditionFailed`, `Code: PreconditionFailed`, HTTP 412; old bytes unchanged |
| `DeleteObject` | metadata HTTP 204 |

An actual presigned PUT signed `content-length;content-type;host`. Wrong length
and content type each returned 403. Exact-origin preflight returned 200 with
that origin and PUT/GET/HEAD; a different origin returned 403 without an allowed
origin. Unsigned access returned 403. Two valid PUTs before the three-second
probe expiry succeeded, then the same capability returned 403 after expiry.
These are actual bearer-capability replay semantics, **not single-use URLs**.
Account/scope changes do not revoke an issued URL. A transfer admitted before
expiry can finish later, so cleanup references must survive late completion.
Mutable staging and immutable published keys must remain separate, and only the
verified byte snapshot may be published. Verification/confirmation policy and
cleanup coordination are not implied by these mechanical SDK observations.

The repeatable `test/storage.security.test.ts` qualifies those local transport
properties with synthetic bytes, including replayed staging PUT leaving a
separate conditional immutable object unchanged. It is not a media decoder,
working product upload, Artifact publication or R2 qualification claim.
