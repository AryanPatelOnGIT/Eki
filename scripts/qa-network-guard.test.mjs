import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('isolated Node transport guard catches sockets TLS HTTP2 and DNS before external traffic', () => {
  const script = `
    import assert from 'node:assert/strict';
    import net from 'node:net'; import tls from 'node:tls'; import http2 from 'node:http2'; import dns from 'node:dns';
    for(const operation of [()=>net.connect({host:'example.invalid',port:443}),
      ()=>tls.connect({host:'192.0.2.1',port:443}), ()=>http2.connect('https://example.invalid'),
      ()=>dns.lookup('example.invalid',()=>{})]) assert.throws(operation,/QA_NETWORK_DENIED/);
    await assert.rejects(dns.promises.lookup('example.invalid'),/QA_NETWORK_DENIED/);
    const server=net.createServer(socket=>socket.end('local'));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const client=net.connect({host:'127.0.0.1',port:server.address().port});
    client.resume();
    await new Promise(resolve=>client.on('close',resolve));
    await new Promise(resolve=>server.close(resolve));
    console.log(JSON.stringify(globalThis.__ekiQaNetworkGuard));
  `;
  const result = execFileSync(process.execPath, ['--import', new URL('./qa/network-guard.mjs', import.meta.url).href,
    '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  const state = JSON.parse(result.trim());
  assert.equal(state.deniedConnections, 5); assert.equal(state.allowedConnections, 1);
});
