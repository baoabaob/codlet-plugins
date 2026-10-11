'use strict';
const fs = require('node:fs'), path = require('node:path');
const samePath = (left, right) => path.toNamespacedPath(path.resolve(left)).toLowerCase() === path.toNamespacedPath(path.resolve(right)).toLowerCase();
let running, owned;
async function probe(context) {
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
    if (spec.screenshot) {
      const screenshot = await context.cdp.request('Page.captureScreenshot', { format: 'png' }, { sessionId });
      fs.writeFileSync(path.join(context.root, 'native-shell.png'), Buffer.from(screenshot.data, 'base64'));
    }
    if (spec.asyncProbe) {
      if (typeof spec.controlKey !== 'string' || !spec.controlKey.startsWith('codlet.adapter.native.probe.' + spec.runId + '.')) throw Error('Owned probe control identity required');
      owned = { sessionId, controlKey: spec.controlKey };
      const key = JSON.stringify(spec.controlKey);
      const start = `(()=>{const key=Symbol.for(${key});if(globalThis[key])throw Error('Owned probe already running');const state={abort:new AbortController(),done:false,phase:'starting'};globalThis[key]=state;Promise.resolve(${expression}).then(result=>{state.result=result;state.done=true;},error=>{state.error=error.message;state.done=true;});return true;})()`;
      if (spec.measureRendererTasks) await context.cdp.request('Performance.enable', {}, { sessionId });
      const started = await context.cdp.request('Runtime.evaluate', { expression: start, returnByValue: true }, { sessionId });
      if (started.exceptionDetails) throw Error(started.exceptionDetails.exception?.description ?? started.exceptionDetails.text);
      const expires = Date.now() + 120000, samples = [];
      while (true) {
        const reply = await context.cdp.request('Runtime.evaluate', { expression: `(()=>{const state=globalThis[Symbol.for(${key})];return state&&{done:state.done,phase:state.phase,result:state.done?state.result:undefined,error:state.error};})()`, returnByValue: true }, { sessionId });
        if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
        const state = reply.result?.value;
        if (!state) throw Error('Owned Native probe state disappeared');
        if (spec.measureRendererTasks) {
          const snapshot = await context.cdp.request('Performance.getMetrics', {}, { sessionId });
          const metrics = Object.fromEntries(snapshot.metrics.filter(item => ['Timestamp', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize', 'Nodes', 'Documents'].includes(item.name)).map(item => [item.name, item.value]));
          samples.push({ phase: state.phase, metrics });
        }
        if (state.done) { if (state.error) throw Error(state.error); report.result = state.result; break; }
        if (Date.now() > expires) {
          await context.cdp.request('Runtime.evaluate', { expression: `globalThis[Symbol.for(${key})]?.abort.abort()`, returnByValue: true }, { sessionId });
          throw Error('Owned Native probe deadline exceeded');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (spec.measureRendererTasks) report.rendererTaskSamples = samples;
      await context.cdp.request('Runtime.evaluate', { expression: `delete globalThis[Symbol.for(${key})]`, returnByValue: true }, { sessionId });
    } else {
      const reply = await context.cdp.request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, { sessionId });
      if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
      report.result = reply.result?.value;
    }
    report.status = report.result?.status === 'passed' ? 'passed' : 'failed';
  } catch (error) { report.error = error.message; }
  finally {
    if (sessionId && spec.measureRendererTasks) try { await context.cdp.request('Performance.disable', {}, { sessionId }); } catch {}
    if (sessionId) try { await context.cdp.request('Target.detachFromTarget', { sessionId }); }
    catch (error) { report.detachError = error.message; report.status = 'failed'; }
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(context.root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    owned = null;
  }
}
module.exports = { activate(context) { running = probe(context); }, async deactivate(cleanup) {
  if (owned && cleanup?.cdp) try {
    await cleanup.cdp.request('Runtime.evaluate', { expression: `globalThis[Symbol.for(${JSON.stringify(owned.controlKey)})]?.abort.abort()`, returnByValue: true }, { sessionId: owned.sessionId });
  } catch {}
  await running;
} };
