'use strict';
// Evaluated only in the isolated no-account owned official main acceptance run.
async function checkOfficialNetwork(electron, target = 'codlet-probe.invalid', proxyUrl, progress = () => {}) {
  const checks = {};
  // The reviewed official bootstrap deliberately blocks all network while its
  // app-server requirements are loading. Await its policy, never disable it.
  const applicationNetwork = require(process.resourcesPath + '/app.asar/.vite/build/bootstrap-DK4EfNwt.js').b().applicationNetwork;
  try {
    await Promise.race([applicationNetwork.whenReady(), new Promise((_, reject) => setTimeout(() => reject(new Error('policy_timeout')), 8000))]);
    checks.applicationPolicyReady = true;
    progress(checks);
  } catch { checks.applicationPolicyReady = false; checks.policyState = applicationNetwork.state.kind; return checks; }
  checks.requestLoginEvents = 0;
  const proxy = new URL(proxyUrl);
  for (const [name, url] of [['requestHttp', `http://${target}/request-http`], ['requestHttps', `https://${target}/request-https`]]) {
    checks[name] = await new Promise(resolve => {
      const request = electron.net.request({ url, credentials: 'include' });
      const timer = setTimeout(() => { request.abort(); resolve(false); }, 2000);
      request.on('login', () => { checks.requestLoginEvents++; });
      request.on('error', error => { clearTimeout(timer); checks[`${name}Error`] = /(?:net::)?ERR_[A-Z_]+/u.exec(error.message ?? '')?.[0] ?? 'request_failed'; resolve(false); });
      request.on('response', response => { let text='';response.on('data',chunk=>{text+=chunk});response.on('end',()=>{clearTimeout(timer);checks[`${name}Status`]=response.statusCode;resolve(response.statusCode===200&&text==='owned-fixture-response')}); });
      request.end();
    });
    progress(checks);
  }
  const authWindow = new electron.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await Promise.race([authWindow.loadURL(`http://${target}/proxy-auth-fixture`), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))]);
    checks.proxyNavigation = true;
  } catch (error) { checks.proxyNavigation = false; checks.proxyNavigationError = /(?:net::)?ERR_[A-Z_]+/u.exec(error.message ?? '')?.[0] ?? 'navigation_failed'; }
  finally { authWindow.destroy(); }
  progress(checks);
  async function request(name, method, url) {
    try {
      const response = await method(url, { signal: AbortSignal.timeout(1500), credentials: 'include' });
      checks[name] = response.status === 200 && await response.text() === 'owned-fixture-response';
      checks[`${name}Status`] = response.status;
    } catch (error) { checks[name] = false; checks[`${name}Error`] = /(?:net::)?ERR_[A-Z_]+/u.exec(error.message ?? '')?.[0] ?? (error.name === 'TimeoutError' ? 'timeout' : 'request_failed'); }
  }
  await request('netHttp', electron.net.fetch.bind(electron.net), `http://${target}/net-http`);
  progress(checks);
  await request('netHttps', electron.net.fetch.bind(electron.net), `https://${target}/net-https`);
  progress(checks);
  await request('sessionHttps', electron.session.defaultSession.fetch.bind(electron.session.defaultSession), `https://${target}/session-https`);
  progress(checks);
  if (electron.app.resolveProxy) {
    const route = await electron.app.resolveProxy(`https://${target}/`);
    checks.applicationProxyConfigured = typeof route === 'string' && /PROXY 127\.0\.0\.1:\d+/u.test(route);
    checks.proxyRoute = typeof route === 'string' ? route.replace(/(?!127\.0\.0\.1)\b(?:[a-z0-9-]+\.)+[a-z]+\b/giu, '[host]') : typeof route;
  }
  const window = new electron.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await Promise.race([window.loadURL('data:text/html,<html><body>private traffic fixture</body></html>'), new Promise((_, reject) => setTimeout(() => reject(new Error('browser_fixture_timeout')), 2000))]);
    const result = await window.webContents.executeJavaScript(`(async()=>{
      const result={};
      for(const [name,url] of [['ws','ws://'+${JSON.stringify(target)}+'/browser-ws'],['wss','wss://'+${JSON.stringify(target)}+'/browser-wss']]){
        result[name]=await new Promise(resolve=>{const socket=new WebSocket(url); const timer=setTimeout(()=>{socket.close();resolve(false)},1500);socket.onopen=()=>socket.send('owned-frame');socket.onmessage=event=>{clearTimeout(timer);socket.close();resolve(event.data==='owned-frame')};socket.onerror=()=>{clearTimeout(timer);resolve(false)};});
      }
      return result;
    })()`);
    Object.assign(checks, result);
  } catch { checks.browserError = 'browser_fixture_failed'; }
  finally { window.destroy(); }
  return checks;
}
module.exports = { checkOfficialNetwork };
