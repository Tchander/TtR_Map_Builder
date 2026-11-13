import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { chromium } from 'playwright';
import path from 'node:path';

// A portable NSIS launcher does not relay the inspector's stderr. Use explicit
// loopback debug ports to test the actual portable executable and its child app.
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function waitForJson(url) {
  let last;
  for (let i = 0; i < 90; i++) {
    try { const response = await fetch(url); if (response.ok) return await response.json(); }
    catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Portable debug endpoint unavailable: ${url}`, { cause: last });
}
export async function launchPortable(executable, env) {
  const inspectPort = await freePort(), browserPort = await freePort();
  const child = spawn(executable, [`--inspect=127.0.0.1:${inspectPort}`, `--remote-debugging-port=${browserPort}`], {
    env, cwd: path.dirname(executable), windowsHide: true, stdio: 'ignore',
  });
  child.on('error', error => console.error(error));
  let browser, socket;
  try {
    const inspectors = await waitForJson(`http://127.0.0.1:${inspectPort}/json/list`);
    socket = new WebSocket(inspectors[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const pending = new Map(); let id = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    async function evaluate(fn, arg) {
      const request = ++id;
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(request); reject(new Error('Main inspector timed out')); }, 10_000);
        pending.set(request, result => { clearTimeout(timer); resolve(result); });
      });
      socket.send(JSON.stringify({ id: request, method: 'Runtime.evaluate', params: {
        expression: `Promise.resolve((${fn.toString()})(process.getBuiltinModule('module').createRequire(process.execPath)('electron'), ${JSON.stringify(arg) ?? 'undefined'}))`,
        awaitPromise: true, returnByValue: true,
      } }));
      const response = await result;
      if (response.error || response.result?.exceptionDetails) throw new Error(JSON.stringify(response.error ?? response.result.exceptionDetails));
      return response.result?.result?.value;
    }
    await waitForJson(`http://127.0.0.1:${browserPort}/json/version`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
    console.log('Connected to portable EXE; runtime extracted and window loaded.');
    return {
      evaluate,
      async firstWindow() {
        for (let i = 0; i < 60; i++) {
          const page = browser.contexts()[0]?.pages()[0]; if (page) return page;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Portable window did not appear');
      },
      async close() {
        socket.close(); await browser.close().catch(() => {});
        if (child.exitCode === null) child.kill();
      },
    };
  } catch (error) {
    socket?.close(); await browser?.close().catch(() => {}); child.kill(); throw error;
  }
}
