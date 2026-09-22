// Opt-in research against an unmodified official backend. No account or proxy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { zstdDecompressSync, gunzipSync } from 'node:zlib';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { WebSocketServer } = require('../frontend/node_modules/ws');
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => i % 2 ? pairs : [...pairs, [value, all[i + 1]]], []));
if (process.platform !== 'win32' || options['--run-owned'] !== 'yes' || !path.isAbsolute(options['--backend'] ?? '')) throw Error('explicit_windows_backend_required');
const executable = await fs.realpath(options['--backend']);
const expectedHash = 'bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226';
assert.equal(createHash('sha256').update(await fs.readFile(executable)).digest('hex'), expectedHash, 'review a new backend before running this fixture');
const report = { schema: 1, backendSha256: expectedHash, transport: 'provider-endpoint', proxyConfigured: false, certificateConfigured: false, cases: [] };
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codlet-plaintext-'));
const originLog = [];
const sockets = new Set();
let sequence = 0, activeCase, expectedAuthorization;
function responseEvents(text, id) {
  const item = { id: `item-${id}`, type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] };
  return [
    { type: 'response.created', response: { id, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text },
    { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
  ];
}
// Separate local upstream: proves that request edits are actually dispatched.
const upstream = http.createServer(async (request, response) => {
  let text = ''; for await (const chunk of request) text += chunk;
  const body = JSON.parse(text);
  activeCase.upstreamRequests = (activeCase.upstreamRequests ?? 0) + 1;
  activeCase.requestRewrite = body.model === 'codlet-upstream-fixture' && Array.isArray(body.input);
  (activeCase.destinations ??= []).push(request.url);
  if (activeCase.completedTurns === 1) { response.writeHead(503, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'synthetic-upstream-error' })); return; }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(responseEvents('upstream-plaintext', `response-${++sequence}`)));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
async function dispatch(body) {
  const response = await fetch(`http://127.0.0.1:${upstream.address().port}/provider-${activeCase.completedTurns % 2 ? 'b' : 'a'}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, model: 'codlet-upstream-fixture' }), signal: AbortSignal.timeout(3000),
  });
  if (response.status === 503) { activeCase.errorResponseRepaired = true; await response.body.cancel(); return responseEvents('upstream-plaintext', `repaired-${++sequence}`); }
  return response.json();
}
const server = http.createServer(async (request, response) => {
  const chunks = []; let size = 0;
  for await (const chunk of request) { chunks.push(chunk); size += chunk.length; if (size > 4 * 1024 * 1024) { request.destroy(); return; } }
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.endsWith('/responses')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(url.pathname.endsWith('/models') ? { models: [], data: [] } : {})); return;
  }
  let bytes = Buffer.concat(chunks);
  const encoding = request.headers['content-encoding'] ?? 'identity';
  if (encoding === 'zstd') bytes = zstdDecompressSync(bytes, { maxOutputLength: 4 * 1024 * 1024 });
  if (encoding === 'gzip') bytes = gunzipSync(bytes, { maxOutputLength: 4 * 1024 * 1024 });
  const body = JSON.parse(bytes.toString('utf8'));
  (activeCase.requestEncodings ??= []).push(encoding);
  originLog.push({ protocol: 'http', path: url.pathname, model: body.model, inputPresent: Array.isArray(body.input), inputItems: body.input?.length, previousResponseIdPresent: typeof body.previous_response_id === 'string', expectedAuthentication: request.headers.authorization === expectedAuthorization });
  const current = activeCase;
  current.httpRequests++;
  // An endpoint adapter sees the final wire request before dispatching a
  // modified copy to the separate local upstream above.
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  if (current.hold) {
    response.write('event: response.created\ndata: ' + JSON.stringify({ type: 'response.created', response: { id: 'held', status: 'in_progress', output: [] } }) + '\n\n');
    response.on('close', () => { current.cancelClosed = true; }); return;
  }
  const events = await dispatch(body);
  for (const event of events) {
    const encoded = JSON.stringify(event).replaceAll('upstream-plaintext', 'codlet-response-modified');
    const frame = `event: ${event.type}\ndata: ${encoded}\n\n`;
    // Deliberately split SSE frames across writes; the backend must reassemble.
    const cut = Math.floor(frame.length / 2);
    response.write(frame.slice(0, cut));
    await new Promise(resolve => setTimeout(resolve, 5));
    response.write(frame.slice(cut));
  }
  response.end();
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
const websocket = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  activeCase.wsHandshakes++;
  if (!activeCase.websockets) { socket.end('HTTP/1.1 426 Upgrade Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
  websocket.handleUpgrade(request, socket, head, connection => websocket.emit('connection', connection, request));
});
websocket.on('connection', (socket, request) => {
  socket.on('message', async data => {
    const body = JSON.parse(data.toString());
    const current = activeCase;
    current.wsFrames++;
    originLog.push({ protocol: 'websocket', path: new URL(request.url, 'http://localhost').pathname, model: body.model, inputPresent: Array.isArray(body.input), inputItems: body.input?.length, previousResponseIdPresent: typeof body.previous_response_id === 'string', type: body.type, prewarm: body.generate === false, expectedAuthentication: request.headers.authorization === expectedAuthorization });
    if (current.hold) { socket.send(JSON.stringify({ type: 'response.created', response: { id: 'held', status: 'in_progress', output: [] } })); socket.on('close', () => { current.cancelClosed = true; }); return; }
    for (const event of await dispatch(body)) socket.send(JSON.stringify(event).replaceAll('upstream-plaintext', 'codlet-response-modified'));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/iu.test(key)));
let child, lines;
const pending = new Map(), notifications = [];
const powershell = path.join(process.env.SYSTEMROOT, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const owned = new Map();
function ps(script, env = {}) { return execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: 10000 }).trim(); }
function snapshot() { return JSON.parse(ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{n='Created';e={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress")); }
const original = snapshot();
function capture() {
  const values = snapshot(), live = new Map(values.map(value => [value.ProcessId, value]));
  for (let changed = true; changed;) { changed = false; for (const value of values) {
    if (owned.has(value.ProcessId) || original.some(item => item.ProcessId === value.ProcessId && item.Created === value.Created)) continue;
    const parent = owned.get(value.ParentProcessId);
    if ((value.ProcessId === child?.pid && value.ExecutablePath?.toLowerCase() === executable.toLowerCase()) || (parent && live.get(parent.ProcessId)?.Created === parent.Created)) { owned.set(value.ProcessId, value); changed = true; }
  } }
}
async function closeChild() {
  for (const call of pending.values()) { clearTimeout(call.timer); call.reject(Error('fixture_closed')); }
  pending.clear(); lines?.close();
  capture();
  for (const value of [...owned.values()]) ps("$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$env:CODLET_OWNED_PID); if($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $env:CODLET_OWNED_CREATED) { try { Stop-Process -Id ([int]$env:CODLET_OWNED_PID) -ErrorAction Stop } catch { if($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId*') { throw } } }", { CODLET_OWNED_PID: String(value.ProcessId), CODLET_OWNED_CREATED: value.Created });
  child?.stdin?.destroy(); child?.stdout?.destroy(); child?.stderr?.destroy();
  child = undefined;
}
async function waitFor(predicate, label, timeout = 12000) {
  const until = Date.now() + timeout;
  while (!predicate()) { if (Date.now() >= until) throw Error(`fixture_timeout:${label}`); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function run(kind, websockets) {
  const state = { kind, websockets, httpRequests: 0, wsHandshakes: 0, wsFrames: 0, requestRewrite: false, responseRewrite: false, completedTurns: 0, cancelled: false };
  activeCase = state; report.cases.push(state); notifications.length = 0;
  const home = path.join(directory, `${kind}-${websockets}`); await fs.mkdir(home);
  const config = [
    'cli_auth_credentials_store="file"', 'sandbox_mode="read-only"', 'approval_policy="never"', 'model="gpt-5.4"',
    `chatgpt_base_url=${JSON.stringify(endpoint + '/backend-api/')}`, `openai_base_url=${JSON.stringify(endpoint + '/v1')}`,
    'model_provider="' + (kind === 'custom' ? 'codlet_fixture' : 'openai') + '"',
    '[analytics]', 'enabled=false', '[features]', 'code_mode_host=false', 'remote_models=false', 'remote_plugin=false',
    'responses_websockets=' + websockets, 'responses_websockets_v2=' + websockets,
    '[mcp_servers.codex_app]', 'command=""', 'enabled=false',
    ...(kind !== 'custom' ? [] : ['[model_providers.codlet_fixture]', 'name="Fixture"', 'wire_api="responses"', 'supports_websockets=' + websockets, 'request_max_retries=0', 'stream_max_retries=0', `base_url=${JSON.stringify(endpoint + '/v1')}`, 'requires_openai_auth=false']),
  ].join('\n') + '\n';
  await fs.writeFile(path.join(home, 'config.toml'), config);
  const jwt = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000) + 3600, email: 'synthetic@example.invalid', 'https://api.openai.com/auth': { chatgpt_account_id: 'codlet-fixture', chatgpt_user_id: 'codlet-fixture', chatgpt_plan_type: 'plus' } })).toString('base64url') + '.fixture';
  await fs.writeFile(path.join(home, 'auth.json'), JSON.stringify(kind === 'chatgpt' ? { auth_mode: 'chatgpt', tokens: { id_token: jwt, access_token: jwt, refresh_token: 'never-use-this-synthetic-token', account_id: 'codlet-fixture' }, last_refresh: new Date().toISOString() } : { OPENAI_API_KEY: 'codlet-local-fixture' }));
  expectedAuthorization = kind === 'custom' ? undefined : 'Bearer ' + (kind === 'chatgpt' ? jwt : 'codlet-local-fixture');
  const env = { ...environment, CODEX_HOME: home, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TEMP: home, TMP: home, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'protocol.allow', GIT_CONFIG_VALUE_0: 'never' };
  child = spawn(executable, ['app-server', '--stdio', '-c', `sqlite_home=${JSON.stringify(home)}`], { env, cwd: home, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  capture();
  child.stderr.on('data', chunk => { const text = chunk.toString(); for (const tag of ['401 Unauthorized', 'error sending request', 'invalid configuration']) if (text.includes(tag)) (state.errorKinds ??= []).push(tag); });
  lines = createInterface({ input: child.stdout });
  lines.on('line', text => {
    let message; try { message = JSON.parse(text); } catch { return; }
    const call = pending.get(message.id);
    if (call) { clearTimeout(call.timer); pending.delete(message.id); message.error ? call.reject(Error(`rpc_failed:${call.method}:${message.error.code}:${message.error.message}`)) : call.resolve(message.result); }
    else if (message.method && notifications.length < 1000) notifications.push(message);
  });
  let requestId = 0;
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { method, resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(Error(`rpc_timeout:${method}`)); }, 12000) });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await rpc('initialize', { clientInfo: { name: 'codlet-plaintext-fixture', version: '1' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const started = await rpc('thread/start', { cwd: home, approvalPolicy: 'never', sandbox: 'read-only', baseInstructions: 'This is a local synthetic transport fixture.', ephemeral: true });
    state.threadProvider = started.modelProvider;
    for (let index = 0; index < 2; index++) {
      const turn = await rpc('turn/start', { threadId: started.thread.id, input: [{ type: 'text', text: 'local synthetic request', text_elements: [] }] });
      await waitFor(() => notifications.some(value => value.method === 'turn/completed' && value.params.turn.id === turn.turn.id), 'turn_completed');
      const completion = notifications.find(value => value.method === 'turn/completed' && value.params.turn.id === turn.turn.id);
      if (completion.params.turn.status !== 'completed') { state.turnError = completion.params.turn.error; throw Error('turn_not_completed'); }
      state.completedTurns++;
    }
    state.responseRewrite = notifications.some(value => value.method === 'item/agentMessage/delta' && value.params.delta === 'codlet-response-modified');
    {
      state.hold = true;
      const before = state.httpRequests + state.wsFrames;
      const turn = await rpc('turn/start', { threadId: started.thread.id, input: [{ type: 'text', text: 'local cancel fixture', text_elements: [] }] });
      await waitFor(() => state.httpRequests + state.wsFrames > before, 'held_response');
      await rpc('turn/interrupt', { threadId: started.thread.id, turnId: turn.turn.id });
      await waitFor(() => notifications.some(value => value.method === 'turn/completed' && value.params.turn.id === turn.turn.id && value.params.turn.status === 'interrupted'), 'cancel_completed');
      await waitFor(() => state.cancelClosed === true, 'cancel_closed');
      state.cancelled = true;
      delete state.hold;
      const resumed = await rpc('turn/start', { threadId: started.thread.id, input: [{ type: 'text', text: 'local post-cancel fixture', text_elements: [] }] });
      await waitFor(() => notifications.some(value => value.method === 'turn/completed' && value.params.turn.id === resumed.turn.id), 'post_cancel_turn');
      assert.equal(notifications.find(value => value.method === 'turn/completed' && value.params.turn.id === resumed.turn.id).params.turn.status, 'completed');
      state.completedTurns++;
      state.continuedAfterCancel = true;
    }
    assert(state.requestRewrite && state.responseRewrite && state.errorResponseRepaired && state.continuedAfterCancel);
    assert(state.destinations.includes('/provider-a') && state.destinations.includes('/provider-b'));
    assert(websockets ? state.wsFrames > 0 : state.httpRequests >= 2);
    state.passed = true;
  } catch (error) { state.passed = false; state.failure = error.message.slice(0, 500); }
  finally { await closeChild(); for (const socket of websocket.clients) socket.terminate(); console.log(JSON.stringify(state)); }
}
try {
  for (const kind of ['custom', 'builtin', 'chatgpt']) for (const websockets of [false, true]) await run(kind, websockets);
} finally {
  await closeChild(); websocket.close(); for (const socket of sockets) socket.destroy();
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => upstream.close(resolve));
  try {
    ps("$p=[IO.Path]::GetFullPath($env:CODLET_FIXTURE_DIRECTORY); if([IO.Path]::GetDirectoryName($p) -ne [IO.Path]::GetTempPath().TrimEnd('\\') -or [IO.Path]::GetFileName($p) -notlike 'codlet-plaintext-*') { throw 'bad_fixture_path' }; $p='\\\\?\\'+$p; $items=@(Get-ChildItem -LiteralPath $p -Recurse -Force -ErrorAction Stop); if(@($items | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count) { throw 'fixture_reparse' }; foreach($item in $items) { $item.Attributes=$item.Attributes -band (-bnot ([IO.FileAttributes]::ReadOnly -bor [IO.FileAttributes]::Hidden)) }; Remove-Item -LiteralPath $p -Recurse -ErrorAction Stop", { CODLET_FIXTURE_DIRECTORY: directory });
    report.cleanup = true;
  } catch { report.cleanup = false; report.retainedDirectory = directory; }
  const after = snapshot();
  report.originalClientIdentitiesUnchanged = original.filter(value => /\\(?:ChatGPT|Codex)\.exe$/iu.test(value.ExecutablePath ?? '')).every(value => after.some(item => item.ProcessId === value.ProcessId && item.Created === value.Created));
  report.ownedRemaining = [...owned.values()].filter(value => after.some(item => item.ProcessId === value.ProcessId && item.Created === value.Created)).length;
  report.observed = originLog;
  report.authenticationPreserved = originLog.every(value => value.expectedAuthentication);
  await fs.mkdir(new URL('../.artifacts/request-chain/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../.artifacts/request-chain/backend-plaintext.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (report.cases.some(value => !value.passed) || !report.cleanup || report.ownedRemaining || !report.originalClientIdentitiesUnchanged || !report.authenticationPreserved) process.exitCode = 1;
}
