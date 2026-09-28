# Windows transparent traffic: replacement startup entry

Status: **working research prototype, not enabled in production**. The Windows
26.924.2738.0 package disables Node's CLI inspector fuse, so the shipped traffic
launcher still cannot attach. The proposal restores the existing entry briefly
in the newly owned process; it does not add a second traffic engine.

## Evidence

Experiments used the signed unpacked Windows x64 package, synthetic credentials,
loopback upstreams, an isolated Codlet registry and a newly owned official backend.
The existing registered package supplied package identity. No new MSIX was
installed and the daily client was unchanged.

The exact `chrome.dll` SHA-256 is
`b6f5c2323c642c3ad3dfdc3501aa94482970f88b4c12db0875ce593aece75c16`.
Its v1 fuse wire is `010011001`. The prototype streamed the complete hash, checked
the PE image and reviewed wire, and changed only the `nodeCliInspect` byte in the
new process's mapped data during its DLL-load event. It used no executable-memory
allocation or remote code payload. This **does temporarily override a runtime
security setting** in that one owned client; it is not merely passive observation.

The native debugger detached, and the ordinary Adapter then verified the paused
Node peer, installed its existing hooks and closed the private inspector. The
helper restored the original byte and page protection and exited. Original DLL
hash and OpenAI Authenticode signature remained unchanged/valid. The helper ran
without administrator elevation. Windows debugging is still subject to the
target process's access checks; see [DebugActiveProcess](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-debugactiveprocess).

| Controlled case | Observed result |
| --- | --- |
| Desktop normal fetch and upload-progress branch | Both request bodies and final response bodies changed at the existing source |
| Model HTTP/SSE | Two turns completed with rewritten model requests and rewritten assistant replies; WS 426 fallback preserved |
| Model WebSocket | Prewarm plus two turns: 3 outgoing and 15 incoming frames transformed; second turn carried continuation |
| Source readiness | `desktop-main-http` and `owned-backend-provider` both activated; no unsupported sources |
| Retirement | Original memory byte restored, native debugger detached, private inspector confirmed closed; helper and owned client exited |

Three optimized helper samples took **369–574 ms** to validate and arm/patch the
native startup. The helper's complete lifetime, including waiting for the existing
Adapter handshake, was **3.3–3.6 s**, with **23.4–23.8 MiB** peak working set and
no helper remaining afterward. These are local warm-cache observations, not a
benchmark of total launch delay or other computers. Request processing still
uses the existing Core path; this prototype adds no forwarding hop per request.

The initial fixture copied only `codex.exe`, causing the official first-run flow
to show a missing `codex-windows-sandbox-setup.exe` dialog. That is a staging defect,
not evidence that the network hook failed. The harness now checks signatures and
copies the backend's sandbox/setup, service, command-runner and code-mode-host
companions. Copies were checked without repeating OS sandbox initialization.
Native sandbox setup and complete GUI/installer behavior are not accepted by
these traffic experiments. Some earlier runs had a loading-only native window;
model/HTTP assertions alone must not be reported as GUI acceptance.

## Alternatives and decision

| Route | Capability and cost | Decision |
| --- | --- | --- |
| Brief native startup bootstrap | Reuses both existing source paths, including model WS; requires reviewed Windows image data and a tightly owned debugger lifecycle | Recommended Windows direction, subject to production hardening |
| Supervised backend executable/stdio wrapper | Can cover local model HTTP/SSE/WS and task configuration; misses Desktop main-process HTTP and its session/auth behavior | Useful separate integration, not an equivalent replacement |
| Renderer/CDP-only hooks | Can observe renderer APIs; do not themselves reach the Rust backend's sockets or all `ApplicationNetwork` callers | Insufficient for current coverage |
| Patched on-disk client/fuses | Changes official bytes/signature and creates update/copy maintenance | Do not use for this design |

Preserving the two current sources means retaining their existing limits too:
Desktop redirect handling exposes the initial request and final response, not
intermediate 3xx bodies. Browser/Realtime/WebRTC/remote-backend coverage does not
appear just because the main-process entry works.

## Core and Adapter boundary

Core should expose a bounded **before-resume phase of the existing owned-client
launch lifecycle**. It supplies the exact retained process identity, controls
resume, enforces the provider generation/authorization/deadline and performs
failure cleanup. It must never select an existing process from a name or accept
an arbitrary user/plugin-supplied PID as the owned client.

The ordinary launch-provider plugin chooses the bootstrap strategy and owns the
version-specific DLL hash, PE/fuse interpretation and native helper asset. Core
must not import those profiles, depend on an official plugin ID or recognize
Codex fuse offsets. The same phase and grants must be available to any authorized
provider. Existing `host.process` and `cdp.raw` are high-trust prerequisites;
bootstrap is not an authority borrowed by traffic-consuming plugins.

The test's `startupHelper` path/environment variable is **not** the proposed
production API. Production must load a helper from the provider's immutable,
validated package generation and supervise it under the same bounded launch
operation. Activation requires both the normal source receipt and confirmed
bootstrap retirement/restoration. No helper stays alive to process traffic.

The original HTTP/SSE/WS Core pipeline, origin grants, sensitive-header grants,
cancellation and plugin registration remain unchanged. A consumer uses exactly
the same API. When no traffic consumer requests attachment, this bootstrap is
not involved in ordinary startup.

## Work before shipping

1. Replace the lab-only hook with the generation-bound launch phase; validate
   helper path/digest, same-child identity and cleanup at every handoff.
2. Handle already enabled fuses, unsupported image hashes and partial source
   readiness explicitly. Never silently bypass a requested interceptor.
3. Normalize equivalent Windows executable path spellings in the Adapter's peer
   comparison. The experiment exposed `\\?\X:\...` versus `X:\...`; preserve
   canonical file identity rather than disabling the identity check.
4. Test cancellation at DLL load, handshake rejection, helper crash, Core exit,
   DLL mismatch and restoration failure. Recheck the same process creation time,
   not just its recyclable PID. Do not weaken OS protections on refusal.
5. Run full installer/update and normal signed-in UI acceptance on the target
   machine; test the helper's distribution/signing and Windows protection behavior.
   The local non-elevated success is not a guarantee for every managed device.
6. Investigate macOS independently. Apple's [debugging entitlement rules](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.debugger)
   restrict acquiring task ports even for an entitled debugger. Windows memory
   debugging does not establish a working Mac solution; disabling SIP is not part
   of this plan. Existing accepted Mac builds keep their established source path.

[Reproducible opt-in fixture](../../tests/fixtures/traffic/windows-startup-bootstrap/README.md).
The fixture is not part of the installer or any released plugin bundle.
