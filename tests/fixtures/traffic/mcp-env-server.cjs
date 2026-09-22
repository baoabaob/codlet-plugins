'use strict';
const fs = require('node:fs');
const readline = require('node:readline');
const output = process.argv[2];
const lines = readline.createInterface({ input: process.stdin });
const snapshot = { proxyRestored: process.env.HTTPS_PROXY === 'http://original.invalid:3128', trustRemoved: process.env.CODEX_CA_CERTIFICATE === undefined,
  explicitPreserved: process.env.MCP_FIXTURE_EXPLICIT === 'user-value' };
lines.on('line', line => {
  let message; try { message = JSON.parse(line); } catch { return; }
  if (message.method === 'initialize') {
    fs.writeFileSync(output, JSON.stringify(snapshot), { flag: 'wx' });
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'codlet-env-fixture', version: '1' } } }) + '\n');
  } else if (message.id != null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [], resources: [], resourceTemplates: [] } }) + '\n');
});
