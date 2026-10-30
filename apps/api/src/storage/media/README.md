# Bounded media process foundation

`child.ts` runs a trusted absolute executable with argument arrays, ignored stdin,
no shell, a credential-minimal environment, independent stdout/stderr capture
ceilings of 64 KiB, and at most a 30-second command deadline. Limits may be
lowered, never raised. Overflow, cancellation and deadline kill the owned Unix
process group; settlement waits for its streams to close. Expected process
failures expose typed safe errors, not raw command/output/credential payloads.
It is not a standalone sandbox or user-supplied-command API. The mechanical
sandbox must still own one-job/no-queue admission, absolute lifetime, Docker
container identity, hard resource limits and verified cleanup/shutdown.

`pins.ts` records the approved Linux AArch64 paired toolchain and the official
same-version Node24.22.1 slim ARM64 sandbox. The Node image is selected for an
absolute-deadline PID1 watchdog: a relative sleep alone cannot fence a container
whose startup was delayed. This is a bounded mechanical process, not another
backend, native conversation owner, agent, scheduler or service. The Docker
image manifest was resolved before pulling/execution; actual RepoDigests and
ARM64 identity were checked. The watchdog/container implementation and adversarial
resource qualification are not yet enabled by these primitives.

Tool archive SHA256:
`6a601112e0d032676f2048205fabe998900d44bac2a57f7ca35619c705326002`.
The actual archive, only the regular paired binaries, original license and
provenance instructions are retained in ignored `outputs/toolchains/ffmpeg-<sha>/`.
The original `n8.1.3-9` candidate was rejected for an unfixed AAC-USAC null-pointer
issue. The explicitly approved replacement reports
`n8.1.3-23-g5c4f5744cd-20261022`, including that fix, LGPLv3-or-later,
`--enable-version3`, with GPL/nonfree encoders disabled. No global PATH fallback,
floating image/artifact or alternate version may replace these identifiers.

Upstream URL (14-day daily-release retention):
https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-22-13-06/ffmpeg-n8.1.3-23-g5c4f5744cd-linuxarm64-lgpl-8.1.tar.xz
An explicit local path to the retained exact archive is the offline acquisition
prerequisite; missing or mismatched exact bytes fail closed. No binary is committed,
uploaded, externally mirrored or placed in a shared cache. Reproducible setup and
runtime toolchain validation remain responsibilities of the complete adapter.

FFmpeg LGPLv3 incorporates GPLv3 terms. Retain notices and verify corresponding
source, build/relink and installation-information obligations plus bundled
licenses/patents before any redistribution. Source/build instructions are retained
with the cache; this is not a complete source/relink bundle or legal clearance.
Production distribution/deployment remains unqualified. No live R2 or provider
qualification is implied.

Automated child-process tests exercise actual normal output, both output floods,
stall deadline, explicit abort, process-group descendant teardown after leader
exit, literal shell metacharacters, missing executables and invalid bounds.
Existing controlled Linux qualification captured real PNG/JPEG/H264+AAC probe,
full-decode and poster shapes before any product parser. Those are normal-fixture
proofs, not the still-required sandbox fault, media-policy, publication or browser
verification. Production upload confirmation remains without a verifier until
those owning pieces are implemented and qualified.
