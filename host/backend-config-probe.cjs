'use strict';
// Serialized into a fixed --eval helper under Codlet's pinned Node. Input and
// output use pipes, not argv; stderr from the original backend is never forwarded.
function runConfigProbe() {
  const fs = require('node:fs'), { spawn } = require('node:child_process'), { createInterface } = require('node:readline');
  let child, lines, emitted = false;
  const finish = value => { if (emitted) return; emitted = true; clearTimeout(deadline); process.stdout.write(JSON.stringify(value)); lines?.close(); child?.kill(); };
  const deadline = setTimeout(() => finish({ error: 'backend_config_timeout' }), 3500);
  try {
    const bytes = fs.readFileSync(0); if (bytes.length > 256 * 1024) throw new Error();
    const plan = JSON.parse(bytes);
    child = spawn(plan.executable, [...plan.configArguments, '-c', 'analytics.enabled=false', 'app-server', '--stdio'], { env: plan.environment, cwd: plan.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', () => {}); child.on('error', () => finish({ error: 'backend_config_unavailable' }));
    child.stdin.on('error', () => finish({ error: 'backend_config_unavailable' }));
    child.once('exit', () => { if (!emitted) finish({ error: 'backend_config_unavailable' }); });
    let buffer = '', count = 0;
    child.stdout.on('data', chunk => {
      count += chunk.length; if (count > 2 * 1024 * 1024) { finish({ error: 'backend_config_too_large' }); return; }
      buffer += chunk.toString(); let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) { finish({ error: 'backend_config_unavailable' }); return; }
          child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
          child.stdin.write(JSON.stringify({ id: 2, method: 'config/read', params: { cwd: plan.cwd, includeLayers: false } }) + '\n');
        } else if (message.id === 2) {
          if (message.error || !message.result?.config) { finish({ error: 'backend_config_unavailable' }); return; }
          const config = message.result.config;
          finish({ shellPolicy: config.shell_environment_policy ?? {}, mcpServers: config.mcp_servers ?? {}, features: config.features ?? {}, codeModeHost: config.code_mode_host_path ?? null });
        }
      }
    });
    child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'codlet-launch-policy', version: '1' }, capabilities: { experimentalApi: true } } }) + '\n');
  } catch { finish({ error: 'backend_config_unavailable' }); }
}
module.exports = { runConfigProbe };
