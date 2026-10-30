# Bounded media process foundation

`child.ts` runs a trusted absolute executable with argument arrays, ignored stdin,
no shell, a credential-minimal environment, independent stdout/stderr capture
ceilings of 64 KiB, and at most a 30-second command deadline. Limits may be
lowered, never raised. Overflow, cancellation and deadline kill the owned Unix
process group; settlement waits for its streams to close. Expected process
failures expose typed safe errors, not raw command/output/credential payloads.
It is not a standalone sandbox or user-supplied-command API. `sandbox.ts` owns
one-job/no-queue admission, absolute lifetime, Docker identity, hard resource
limits and verified cleanup/shutdown. `toolchain.ts` verifies an explicit exact
local archive and paired read-only binaries; it never downloads or falls back.

`pins.ts` records the approved Linux AArch64 paired toolchain and the official
same-version Node24.22.1 slim ARM64 sandbox. The Node image is selected for an
absolute-deadline PID1 watchdog: a relative sleep alone cannot fence a container
whose startup was delayed. This is a bounded mechanical process, not another
backend, native conversation owner, agent, scheduler or service. The Docker
image manifest was resolved before pulling/execution; actual RepoDigests and
ARM64 identity were checked. The fixed watchdog checks the absolute deadline at
startup, so a delayed start cannot grant a fresh lifetime. The sandbox mounts
only tools/input read-only and one precreated poster file writable, with an8MiB
kernel file limit. Work tmpfs128MiB, shm1MiB, input100MiB and poster8MiB together
stay below256MiB. Memory/swap768MiB, pids64, oneCPU and CPU30s are hard container
limits; no network, capabilities, root writes or host secret/socket mounts.
Cleanup verifies captured ID, name and UUID label; an identity/cleanup failure
retains its private resource record and quarantines capacity until explicit close.
Backend composition now supplies the real verifier only with explicit qualified
local settings: MEDIA_TOOLCHAIN_DIRECTORY and absolute MEDIA_DOCKER_PATH, with
optional MEDIA_ARCHIVE_PATH. Partial/mismatched/unavailable inputs fail startup;
absent inputs leave verification unavailable. ResourceMastra extends the native
shutdown() lifecycle to close media work before storage/database disposal, with
no additional execution owner or signal loop. Cleanup uncertainty still retains
private references; forced host exit is not claimed as verified deletion.

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
proofs, not media-policy, publication or browser verification. Actual sandbox
fault tests also exercise OOM, PID exhaustion, tmpfs ENOSPC, read-only writes,
poster file limits, cancellation/deadline/shutdown and ownership-mismatch quarantine.
Dedicated controls now prove expired late startup, host-independent termination
of stalled work, actual one-CPU cgroup throttling with four busy workers, and
both output floods through the sandbox with subsequent capacity recovery.

The artifacts-owned `uploads/media-verifier.ts` applies a closed initial allowlist:
noninterlaced 8-bit RGB/RGBA PNG (IHDR/IDAT/IEND/pHYs only), baseline 8-bit
three-component yuvj420p JPEG without EXIF/ICC, and nonfragmented isom MP4 with
Constrained Baseline H264 yuv420p, square pixels, progressive constant frame rate,
optionally AAC-LC mono/stereo at8/11.025/12/16/22.05/24/32/44.1/48kHz.
All18 audio combinations and no audio have actual positive decode/poster proof.
Other variants are explicitly unqualified, not implicitly supported. Limits are
10MiB/4096square for images and100MiB/1920x1080,60fps/120s for video.
Shared byte constants coordinate transport/storage/policy/inspection; the additive
application-only SQL migration admits100MiB while retaining the10MiB image guard. Full decode must match declared frame
count and duration; generated PNG posters are separately probed, fully decoded,
CRC/structure/dimension checked and captured. No conversion service is exposed.

Positive actual synthetic PNG/JPEG/H264+AAC/poster tests and spoof/truncation,
CRC, oversized dimensions, damaged H264, snapshot-mutation, unsupported metadata
and decoder-count negatives exercise the real pinned tools. Additional H264/image
profiles remain to qualify before expanding this allowlist. Actual encoded
4096square PNG,1920x1080/60fps and120second MP4 pass;4097width,1922width,
61fps and121seconds reject under the same bounded tools.

Owned PG/S3 publication tests now use the actual verifier and native ownership:
missing-capability501 baseline, exact captured media/poster hashes, human draft
Panel/Shot uses, unchanged approval/selection, replay, staging replacement during
inspection, verifier-buffer mutation, atomic SQL rollback and final replaced-lease
rejection after actual reserved storage writes. An exact100MiB MP4 (valid free-box
padding) crosses client transfer, SQL, S3, full native decode/poster and immutable
publication/readback; one-byte-over transport/policy/storage and unchanged image
bounds have separate regressions. No external inspection/storage waits hold SQL.
Prior owner-first manual-save/lease tests remain required regressions. Built API
composition now has actual Auth/PG/S3 image/video success, replay, foreign-owner
denial, exact source bytes and measured poster access proof. Native shutdown of
active work, missing configuration, cleanup failure and actual signed GET expiry
also have controls. Browser/UI and full-suite qualification remain pending;
these proofs do not qualify production distribution, playback or R2.
