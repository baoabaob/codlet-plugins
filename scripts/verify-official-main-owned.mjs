// Explicit opt-in, no-account developer acceptance. Never copies a user profile.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import diagnostics from 'node:diagnostics_channel';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const options = {};
for (let i = 2; i < process.argv.length; i += 2) options[process.argv[i]] = process.argv[i + 1];
if (options['--run-owned'] !== 'yes' || process.platform !== 'win32') throw new Error('explicit_windows_owned_test_required');
const executable = options['--executable'], backend = options['--backend'], core = options['--core'];
if (![executable, backend, core].every(value => path.isAbsolute(value ?? ''))) throw new Error('absolute_test_paths_required');
const { createTrafficRuntime } = require(path.join(core, 'runtime/host-traffic-bundle.cjs'));
const adapter = require('../bundled/codex-desktop-adapter/host.cjs');
const { WebSocketServer } = require('../frontend/node_modules/ws');
const powershell = path.join(process.env.SYSTEMROOT, 'System32/WindowsPowerShell/v1.0/powershell.exe');
function ps(script, env = {}) {
  return execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: 10000 }).trim();
}
function snapshot() {
  const text = ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{n='Created';e={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress");
  return text ? JSON.parse(text) : [];
}
const before = snapshot(), lifetime = new AbortController(), owned = new Map();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codlet-official-main-'));
let child, runtime, ingress, ws, server, inspectorUrl, rootIdentity;
const report = { schema: 1, kind: 'official-main-owned-no-auth', installed: false, originalProcessesUnchanged: false, fixture: { http: 0, websocket: 0 }, externalRequestsForwarded: 0, cleanup: false };
function capture() {
  const processes = snapshot();
  const current = new Map(processes.map(value => [value.ProcessId, value]));
  if (!child) return processes;
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (owned.has(process.ProcessId)) continue;
      if (process.ProcessId === child.pid) {
        if (rootIdentity && rootIdentity.Created !== process.Created) continue;
      } else {
        const parent = owned.get(process.ParentProcessId);
        if (!parent || current.get(parent.ProcessId)?.Created !== parent.Created) continue;
      }
      if (before.some(old => old.ProcessId === process.ProcessId && old.Created === process.Created)) continue;
      owned.set(process.ProcessId, process); changed = true;
    }
  }
  return processes;
}
try {
  const [cert, key, ca] = await Promise.all(['cert.pem', 'key.pem', 'ca.pem'].map(name => fs.readFile(path.join(core, 'tests/fixtures/process-traffic', name), 'utf8')));
  server = http.createServer(); ws = new WebSocketServer({ server });
  ws.on('connection', socket => socket.on('message', (data, binary) => socket.send(data, { binary })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  runtime = createTrafficRuntime({ rootSignal: lifetime.signal, makeError: (code, message) => Object.assign(new Error(message), { code }),
    coreRequest: async (method, params) => {
      if (method === 'host.network.authorizeChannel') return {};
      if (method === 'host.network.authorizeForward' && params.url === `ws://127.0.0.1:${server.address().port}/fixture`) return { url: params.url };
      throw Object.assign(new Error('fixture_only'), { code: 'permission_denied' });
    },
  });
  ingress = await runtime.openProcessIngress({}, {
    http(request) { report.fixture.http++; const name = ['net-http', 'net-https', 'session-https'].find(value => new URL(request.url).pathname === '/' + value) ?? 'other'; (report.fixture.routes ??= {})[name] = ((report.fixture.routes ?? {})[name] ?? 0) + 1; return { status: 200, headers: [['content-type', 'text/plain'], ['access-control-allow-origin', '*']], body: 'owned-fixture-response' }; },
    webSocket(request, exchange) { report.fixture.websocket++; return exchange.forward({ url: `ws://127.0.0.1:${server.address().port}/fixture`, clientToServer: frame => frame, serverToClient: frame => frame }); },
  }, { origins: ['http://codlet-probe.invalid', 'https://codlet-probe.invalid', 'http://localhost:32101', 'https://localhost:32102', 'http://api.openai.com', 'https://api.openai.com', 'https://chatgpt.com'], certificateFor: () => ({ cert, key }) });
  diagnostics.channel('http.server.request.start').subscribe(({ request }) => { if (request.socket.localPort === Number(new URL(ingress.proxyUrl).port)) { report.fixture.rawHttp = (report.fixture.rawHttp ?? 0) + 1; report.fixture.authPresent = (report.fixture.authPresent ?? 0) + (request.headers['proxy-authorization'] ? 1 : 0); } });
  const trustDirectory = path.join(directory, 'process-trust-fixture'); await fs.mkdir(trustDirectory);
  const bundlePath = path.join(trustDirectory, 'ca.pem'); await fs.writeFile(bundlePath, ca);
  const patch = { set: Object.fromEntries(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].map(name => [name, ingress.proxyUrl])), removeCaseInsensitive: ['http_proxy', 'https_proxy', 'all_proxy', 'codex_ca_certificate'] };
  patch.set.CODEX_CA_CERTIFICATE = bundlePath;
  const traffic = { proxyUrl: ingress.proxyUrl, bundlePath, environmentPatch: patch, trust: { launchCaPem: ca, outputs: ['CODEX_CA_CERTIFICATE'] } };
  const originalEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|USERDOMAIN|USERNAME)$/iu.test(name)));
  for (const [name, relative] of Object.entries({ CODEX_ELECTRON_USER_DATA_PATH: 'user-data', CODEX_HOME: 'codex-home', CODEX_SQLITE_HOME: 'sqlite', HOME: 'home', USERPROFILE: 'home', APPDATA: 'home/AppData/Roaming', LOCALAPPDATA: 'home/AppData/Local', TEMP: 'temp', TMP: 'temp' })) {
    originalEnvironment[name] = path.join(directory, relative); await fs.mkdir(originalEnvironment[name], { recursive: true });
  }
  Object.assign(originalEnvironment, { CODEX_CLI_PATH: backend, BUILD_FLAVOR: 'dev', CODEX_SPARKLE_ENABLED: 'false', CODEX_ELECTRON_PRIMARY_RUNTIME_UPDATE_MODE: 'manual',
    CODEX_ELECTRON_DESKTOP_FEATURE_OVERRIDES: JSON.stringify({ externalBrowserUseAllowed: false, externalBrowserUse: false, inAppBrowserUseAllowed: false, inAppBrowserUse: false, browserExtensions: false, browserPane: false, computerUse: false, computerUseAutoInstall: false, computerUseNodeRepl: false, browserUseTinysky: false, appshotsEnabled: false, quickChat: false, sites: false, autoAuthForSites: false, control: false, skysight: false, recordAndReplay: false }) });
  await fs.writeFile(path.join(originalEnvironment.CODEX_HOME, 'config.toml'), 'cli_auth_credentials_store="file"\nsandbox_mode="read-only"\n[analytics]\nenabled=false\n[mcp_servers.codex_app]\ncommand=""\nenabled=false\n');
  const prepared = await adapter.prepareClientLaunch({ traffic, originalEnvironment, signal: lifetime.signal });
  child = spawn(executable, [...prepared.arguments, `--user-data-dir=${originalEnvironment.CODEX_ELECTRON_USER_DATA_PATH}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', '--disable-background-networking', '--no-first-run', '--disable-default-apps'], {
    env: { ...originalEnvironment, ...patch.set }, cwd: directory, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerReady = new Promise((resolve, reject) => {
    let bytes = ''; const timer = setTimeout(() => reject(Object.assign(new Error('inspector_not_listening'), { code: 'inspector_not_listening' })), 8000);
    child.once('error', () => { clearTimeout(timer); reject(Object.assign(new Error('spawn_failed'), { code: 'spawn_failed' })); });
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      for (const code of ['backend_config_unavailable','backend_config_timeout','code_mode_start_timeout','code_mode_build_unverified','backend_launch_not_observed','backend_tool_environment_unsupported','SyntaxError','ReferenceError','TypeError','Error:']) if (text.includes(code)) (report.startupErrorKinds ??= {})[code] = true;
      if (inspectorUrl) return;
      bytes = (bytes + chunk.toString()).slice(-16384);
      const match = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]{36})/u.exec(bytes);
      if (match) { inspectorUrl = match[1]; clearTimeout(timer); resolve(); }
    });
    child.once('exit', () => { clearTimeout(timer); if (!inspectorUrl) reject(Object.assign(new Error('owned_client_exited'), { code: 'owned_client_exited' })); });
  });
  capture(); rootIdentity = owned.get(child.pid);
  if (!rootIdentity || rootIdentity.ExecutablePath?.toLowerCase() !== executable.replaceAll('/', '\\').toLowerCase()) throw Object.assign(new Error('spawn_identity_mismatch'), { code: 'spawn_identity_mismatch' });
  await debuggerReady;
  report.inspectorListening = true;
  let result;
  if (options['--protocols'] === 'yes' || options['--diagnose'] === 'yes') {
    const { build } = await import('../frontend/node_modules/esbuild/lib/main.js');
    const main = await build({ entryPoints: [path.join(root, 'host/electron-main.cjs')], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node24' });
    const { checkOfficialNetwork } = require('../tests/fixtures/traffic/official-network-check.cjs');
    const acceptancePath = path.join(directory, 'network-result.json');
    const introspection = `function describe(value){return {own:Object.getOwnPropertyNames(value??{}).slice(0,250),prototype:Object.getOwnPropertyNames(Object.getPrototypeOf(value??{})??{}).slice(0,250)}};function inspect(electron,owned){let network;try{network=require(process.resourcesPath+'/app.asar/.vite/build/bootstrap-DK4EfNwt.js').b().applicationNetwork}catch{};return {...owned.inspect(),apiNames:{exports:Object.keys(electron),app:describe(electron.app),session:describe(electron.session.defaultSession),net:describe(electron.net),applicationNetwork:describe(network)}}}`;
    const source = main.outputFiles[0].text + (options['--diagnose'] === 'yes'
      ? `\n${introspection};const install=module.exports.installElectronTraffic;module.exports.installElectronTraffic=(electron,config)=>{const owned=install(electron,config);return {...owned,inspect:()=>inspect(electron,owned)}};`
      : `\nconst install=module.exports.installElectronTraffic;module.exports.installElectronTraffic=(electron,config)=>{const owned=install(electron,config);return {...owned,async ready(){const state=await owned.ready();setTimeout(()=>{(${checkOfficialNetwork.toString()})(electron,${JSON.stringify(options['--target'] ?? 'codlet-probe.invalid')},config.proxyUrl).then(acceptance=>{require('node:fs').writeFileSync(${JSON.stringify(acceptancePath)},JSON.stringify({...acceptance,proxyLogins:owned.inspect().proxyLogins,certificateEvents:owned.inspect().certificateEvents,loginEvents:owned.inspect().loginEvents,requestWrappers:owned.inspect().requestWrappers,requestHookInstalled:owned.inspect().requestHookInstalled,lastLoginShape:owned.inspect().lastLoginShape}))},error=>{require('node:fs').writeFileSync(${JSON.stringify(acceptancePath)},JSON.stringify({verificationError:/^[a-z_]{1,80}$/.test(error.code)?error.code:'verification_failed'}))})},0);return state}}};`);
    const { attachElectronTrafficBeforeEntry } = require('../host/electron-bootstrap.cjs');
    result = await attachElectronTrafficBeforeEntry({ inspectorUrl, expectedPid: child.pid, executable, signal: lifetime.signal, mainSource: source,
      configuration: { proxyUrl: traffic.proxyUrl, caPem: traffic.trust.launchCaPem, environmentPatch: patch, originalEnvironment, runtimeExecutable: process.execPath, privateDirectory: directory, originalProxy: { mode: 'system' } } });
    const deadline = Date.now() + 20000;
    while (true) {
      try { report.acceptance = JSON.parse(await fs.readFile(acceptancePath, 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT' || Date.now() >= deadline) throw Object.assign(new Error('verification_timeout'), { code: 'verification_timeout' }); await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    if (!['netHttp', 'netHttps', 'sessionHttps', 'ws', 'wss'].every(name => report.acceptance[name] === true)) process.exitCode = 1;
  } else result = await adapter.attachClientLaunch({ inspectorUrl, expectedPid: child.pid, executable, traffic, originalEnvironment, signal: lifetime.signal });
  Object.assign(report, result);
  capture();
} catch (error) {
  report.reason = /^[a-z_]{1,80}$/u.test(error.code ?? '') ? error.code : 'owned_acceptance_failed';
  if (error.details) report.details = error.details;
  if (child?.pid) report.window = ps("$p=Get-Process -Id ([int]$env:OWNED_PID) -ErrorAction SilentlyContinue; if($p) { [pscustomobject]@{responding=$p.Responding;hasWindow=($p.MainWindowHandle -ne 0);javascriptError=($p.MainWindowTitle -like '*JavaScript*');titleEmpty=($p.MainWindowTitle.Length -eq 0)} | ConvertTo-Json -Compress }", { OWNED_PID: String(child.pid) });
  process.exitCode = 1;
} finally {
  lifetime.abort();
  if (child && rootIdentity) {
    capture();
    const identities = [...owned.values()];
    for (const process of identities.reverse()) {
      ps("$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$env:OWNED_PID); if($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $env:OWNED_CREATED) { Stop-Process -Id ([int]$env:OWNED_PID) -ErrorAction Stop }", { OWNED_PID: String(process.ProcessId), OWNED_CREATED: process.Created });
    }
  }
  await ingress?.close(); runtime?.closeAll(); if (ws) { for (const socket of ws.clients) socket.terminate(); ws.close(); } await new Promise(resolve => server ? server.close(resolve) : resolve());
  const after = snapshot();
  report.originalProcessesUnchanged = before.filter(value => /\\(?:ChatGPT|Codex)\.exe$/iu.test(value.ExecutablePath ?? '')).every(value => after.some(current => current.ProcessId === value.ProcessId && current.Created === value.Created));
  report.ownedRemaining = [...owned.values()].filter(value => after.some(current => current.ProcessId === value.ProcessId && current.Created === value.Created)).length;
  if (report.ownedRemaining === 0) {
    try {
      ps("$p=[IO.Path]::GetFullPath($env:OWNED_TEST_DIR); if([IO.Path]::GetDirectoryName($p) -ne [IO.Path]::GetTempPath().TrimEnd('\\') -or [IO.Path]::GetFileName($p) -notlike 'codlet-official-main-*') { throw 'invalid_test_directory' }; $long='\\\\?\\'+$p; $all=@(Get-Item -LiteralPath $long -Force -ErrorAction Stop)+@(Get-ChildItem -LiteralPath $long -Recurse -Force -ErrorAction Stop); if(@($all | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count) { throw 'test_directory_reparse' }; Remove-Item -LiteralPath $long -Recurse -ErrorAction Stop", { OWNED_TEST_DIR: directory });
      report.cleanup = true;
    } catch { report.cleanupError = 'private_directory_cleanup_failed'; report.retainedTestDirectory = directory; }
  }
  await fs.mkdir(path.join(root, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, '.artifacts', 'official-main-owned-result.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.details?.owned?.apiNames) await fs.writeFile(path.join(root, '.artifacts', 'official-main-apis.json'), JSON.stringify({ runtime: report.details.runtime, apiNames: report.details.owned.apiNames }, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
}
