# Windows startup bootstrap experiment

Research only, not bundled or installed with an official plugin. Uses one exact
new suspended x64 process and the reviewed 26.924.2738.0 `chrome.dll` hash. The
helper rejects wrong process creation time/image, a process older than ten
seconds, changed DLL bytes or an unexpected mapped fuse byte. It never modifies
an installed file, attaches to a daily client or adjusts OS security settings.

This proves a replacement **startup entry**, not a new traffic implementation.
The ordinary launch plugin and consumer use the existing Core source/interceptor
contracts. Core's opt-in `desktop-acceptance` executable supplies the experimental
pre-resume hook. Release Core does not implement this hook.

1. Build the matching Core acceptance binary and the official plugin bundles.
2. Run `node tests/fixtures/traffic/windows-startup-bootstrap/prepare.mjs NEW_ABSOLUTE_OUTPUT`.
3. Compile `StartupProbe.cs` into `StartupProbe.exe` in that output directory:

   ```powershell
   $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
   $parameters.GenerateExecutable = $true
   $parameters.OutputAssembly = 'ABSOLUTE_OUTPUT/StartupProbe.exe'
   $parameters.CompilerOptions = '/platform:x64 /optimize+'
   $parameters.ReferencedAssemblies.Add('System.dll') | Out-Null
   Add-Type -Path 'ABSOLUTE_OUTPUT/StartupProbe.cs' -CompilerParameters $parameters
   ```

4. Fill the absolute reviewed app and Core binary paths in `config.example.json`.
   The selected app must include its signed backend companions. Use a disposable
   Windows test environment for native first-run flows: the official client can
   request Windows sandbox setup independently of this transport experiment.
   Do not automate elevation or use an existing account/profile as the fixture.
5. Explicitly run Core's `scripts/desktop-acceptance.mjs` with that config. For a
   second run use a new `root` and `fixtureWebSocket: true`.

The helper reads/hashes the DLL as a stream, arms an exact-child debugger, changes
one mapped data byte during DLL load, restores page protection and detaches the
native debugger. After the ordinary Adapter closes its private inspector, the
fixture signals restoration of the original byte. The helper verifies the
restored byte and exits. Missing handshakes/timeouts are failures, not fallback
authorization. The lab launch wrapper also normalizes the Core resolver's
verbatim DOS path before the existing Adapter's canonical-image comparison.

Inspect `native-bootstrap.json`, `adapter-attach.json`, `fixture.jsonl` and the
last `probe.json` result. The report must show both named sources, modified
Desktop bodies, two completed modified model turns, the original byte restored,
and the inspector closed. WS must include prewarm and continuation. Original
file hash/signature and exact-child shutdown are separate checks. Generic
`verdict.json.rendered` only observes text in the native window; it is not full
GUI or sandbox acceptance. See [the research decision](../../../../docs/spec/windows-startup-bootstrap.md).
