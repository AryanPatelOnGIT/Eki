import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

// Scoped guard for the Node SDKs used by emulator tests. This is not an OS
// sandbox for arbitrary native code/subprocesses; all test targets are also
// explicitly validated and the emulator runner is separate from deployment.
if (!globalThis.__ekiQaNetworkGuard) {
  const state = { enabled: true, allowedConnections: 0, deniedConnections: 0 };
  const allowed = host => host === '127.0.0.1' || host === '::1' || host === '[::1]';
  const deny = () => { state.deniedConnections++; throw new Error('QA_NETWORK_DENIED: only literal loopback transport permitted'); };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof options === 'object' && options !== null ? options.host : typeof args[1] === 'string' ? args[1] : 'localhost';
    if (!allowed(host) || (typeof options === 'object' && options?.path)) deny();
    state.allowedConnections++;
    return connect.apply(this, args);
  };
  const lookup = dns.lookup;
  dns.lookup = function (host, ...args) { if (!allowed(host)) deny(); return lookup.call(this, host, ...args); };
  const promiseLookup = dns.promises.lookup;
  dns.promises.lookup = async function (host, ...args) { if (!allowed(host)) deny(); return promiseLookup.call(this, host, ...args); };
  for (const method of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveTxt', 'reverse']) {
    dns[method] = deny; dns.promises[method] = async () => deny();
  }
  globalThis.__ekiQaNetworkGuard = state;
  syncBuiltinESMExports();
}
