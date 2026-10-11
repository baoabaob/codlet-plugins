// Capture one verified process group, then verify normal shutdown identities.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(process.argv[2] ?? ''), mode = process.argv[3];
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'owned-runtime-evidence.json'), 'utf8'));
if (directory !== path.join(repo, '.artifacts/adapter-native', evidence.runId) || !['capture', 'closed'].includes(mode)) throw Error('Explicit owned retirement mode required');
const state = JSON.parse(fs.readFileSync(path.join(directory, 'profile/logs/manual-client.json'), 'utf8'));
if (state.runId !== evidence.coordinatorRunId) throw Error('Owned coordinator changed');
const pids = [state.managerPid, state.hostPid, state.backendPid, state.desktopPid];
if (mode === 'capture' && pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) throw Error('Owned process identities missing');
const powershell = path.join(process.env.SYSTEMROOT ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const ps = source => JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', source], { encoding: 'utf8', windowsHide: true }).trim());
const beforeFile = path.join(directory, 'retirement-' + state.runId + '.before.json');
const factsSource = ids => `$adapterFacts=@(foreach($adapterPid in @(${ids.join(',')})) { $adapterProcess=Get-Process -Id $adapterPid -ErrorAction SilentlyContinue; if($adapterProcess) { [pscustomobject]@{pid=$adapterProcess.Id;created=$adapterProcess.StartTime.ToUniversalTime().ToString('o');image=$adapterProcess.Path} } }); ConvertTo-Json -InputObject $adapterFacts -Compress`;
if (mode === 'capture') {
  if (state.state !== 'ready') throw Error('Capture requires the same ready owned run');
  const source = `$adapterAll=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId); $adapterOwned=[System.Collections.Generic.HashSet[int]]::new(); @(${pids.join(',')}) | ForEach-Object { [void]$adapterOwned.Add($_) }; do { $adapterChanged=$false; foreach($adapterRow in $adapterAll) { if($adapterOwned.Contains([int]$adapterRow.ParentProcessId) -and $adapterOwned.Add([int]$adapterRow.ProcessId)) { $adapterChanged=$true } } } while($adapterChanged); ` + factsSource(pids).replace(`@(${pids.join(',')})`, '$adapterOwned');
  const processes = ps(source);
  for (const pid of pids) {
    const actual = processes.find(value => value.pid === pid), expected = evidence.processes.find(value => value.pid === pid);
    if (!actual || !expected || Date.parse(actual.created) !== Date.parse(expected.created) ||
        path.toNamespacedPath(actual.image).toLowerCase() !== path.toNamespacedPath(expected.image).toLowerCase()) throw Error('Owned process identity changed');
  }
  const report = { runId: evidence.runId, coordinatorRunId: state.runId, capturedAt: new Date().toISOString(), processes };
  fs.writeFileSync(beforeFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ runId: report.runId, coordinatorRunId: state.runId, processes: processes.length }) + '\n');
} else {
  if (state.state !== 'closed') throw Error('Owned coordinator has not closed');
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  if (before.runId !== evidence.runId || before.coordinatorRunId !== state.runId) throw Error('Retirement capture differs');
  const live = ps(factsSource(before.processes.map(value => value.pid)));
  const remaining = live.filter(actual => before.processes.some(expected => actual.pid === expected.pid && Date.parse(actual.created) === Date.parse(expected.created)));
  const report = { runId: evidence.runId, coordinatorRunId: state.runId, checkedAt: new Date().toISOString(), coordinatorState: state.state,
    capturedProcesses: before.processes.length, remainingOwnedProcesses: remaining, reusedPids: live.filter(value => !remaining.includes(value)).map(value => value.pid) };
  fs.writeFileSync(path.join(directory, 'retirement-' + state.runId + '.closed.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  if (remaining.length) throw Error('Owned process identities remain after coordinator closed');
  process.stdout.write(JSON.stringify({ runId: report.runId, coordinatorState: state.state, capturedProcesses: report.capturedProcesses, remainingOwnedProcesses: 0 }) + '\n');
}
