'use strict';
const fs = require('node:fs'), path = require('node:path');
const samePath = (left, right) => path.toNamespacedPath(path.resolve(left)).toLowerCase() === path.toNamespacedPath(path.resolve(right)).toLowerCase();
module.exports = { async activate(context) {
  const spec = JSON.parse(fs.readFileSync(path.join(context.root, 'owned-run.json'), 'utf8'));
  const report = { schema: 1, runId: spec.runId, targetId: spec.targetId, startedAt: new Date().toISOString(), status: 'failed' };
  let sessionId;
  try {
    if (!/^adapter-[a-f0-9-]{36}$/.test(spec.runId) || path.basename(spec.directory) !== spec.runId || !samePath(path.dirname(context.root), spec.directory)) throw Error('Explicit owned probe directory required');
    const state = JSON.parse(fs.readFileSync(path.join(spec.directory, 'profile/logs/manual-client.json'), 'utf8'));
    const evidence = JSON.parse(fs.readFileSync(path.join(spec.directory, 'owned-runtime-evidence.json'), 'utf8'));
    if (state.state !== 'ready' || state.runId !== spec.coordinatorRunId || evidence.coordinatorRunId !== state.runId || evidence.runId !== spec.runId ||
        evidence.targetId !== spec.targetId || !evidence.authenticated || !evidence.sandboxReady || evidence.registryScope !== spec.registryScope ||
        !samePath(state.labRoot, path.join(spec.directory, 'profile'))) throw Error('Owned ready evidence changed; reverify before probing');
    const { targetInfos } = await context.cdp.request('Target.getTargets');
    const targets = targetInfos.filter(target => target.targetId === spec.targetId);
    if (targets.length !== 1 || targets[0].type !== 'page' || targets[0].url !== 'app://-/index.html') throw Error('The verified owned Native Target is unavailable');
    ({ sessionId } = await context.cdp.request('Target.attachToTarget', { targetId: spec.targetId, flatten: true }));
    const expression = fs.readFileSync(path.join(context.root, 'probe.js'), 'utf8');
    const reply = await context.cdp.request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, { sessionId });
    if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    report.result = reply.result?.value;
    report.status = report.result?.status === 'passed' ? 'passed' : 'failed';
  } catch (error) { report.error = error.message; }
  finally {
    if (sessionId) try { await context.cdp.request('Target.detachFromTarget', { sessionId }); }
    catch (error) { report.detachError = error.message; report.status = 'failed'; }
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(context.root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}, deactivate() {} };
