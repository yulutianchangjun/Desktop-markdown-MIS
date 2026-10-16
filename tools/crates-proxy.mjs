// Plain-HTTP crates.io proxy.
//
// Why this exists: under the DSH sandbox the Windows Schannel credential provider is
// unavailable to confined processes, so Cargo's (libcurl + Schannel) TLS handshake fails
// with SEC_E_NO_CREDENTIALS. Node's bundled TLS stack works, so Cargo talks plain HTTP to
// this loopback proxy, which does the HTTPS fetching and streams bytes back untouched.
//
//   GET /index/<sparse-index-path>  -> https://index.crates.io/<sparse-index-path>
//   GET /dl/<path>                  -> https://static.crates.io/crates/<path>
//
// Cargo is pointed here via $CARGO_HOME/config.toml:
//   [source.crates-io]
//   replace-with = "dsh-proxy"
//   [source.dsh-proxy]
//   registry = "sparse+http://127.0.0.1:8791/index/"
import http from 'node:http';

const PORT = Number(process.env.PROXY_PORT ?? 8791);
const HOST = '127.0.0.1';
const INDEX_ORIGIN = 'https://index.crates.io';
const DL_ORIGIN = 'https://static.crates.io/crates';
const SELF = `http://${HOST}:${PORT}`;

// Upstream hosts, tried in order per request.
const INDEX_BASES = [INDEX_ORIGIN, 'https://mirrors.ustc.edu.cn/crates.io-index'];
const DL_BASES = [DL_ORIGIN, 'https://mirrors.ustc.edu.cn/crates.io/crates'];

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

/** Parse a sparse index body and repoint every `dl` at this proxy (protocol-agnostic). */
function rewriteConfig(body) {
  try {
    const cfg = JSON.parse(body.toString('utf8'));
    cfg.dl = `${SELF}/dl`;
    delete cfg.api; // never used during a build; avoiding it stops cargo from trying HTTPS
    return Buffer.from(JSON.stringify(cfg));
  } catch {
    return body;
  }
}

async function proxyJsonRes(res, bases, relPath, { rewrite = false } = {}) {
  let lastErr;
  for (const base of bases) {
    const url = `${base}${relPath}`;
    try {
      const upstream = await fetch(url, { redirect: 'follow' });
      if (upstream.status === 404) { lastErr = new Error('404'); continue; }
      if (!upstream.ok) { lastErr = new Error(`HTTP ${upstream.status}`); continue; }

      let body = Buffer.from(await upstream.arrayBuffer());
      if (rewrite) body = rewriteConfig(body);

      res.writeHead(200, {
        'content-type': relPath === '/config.json' ? 'text/plain' : 'application/octet-stream',
        'content-length': body.length,
      });
      res.end(body);
      return true;
    } catch (e) {
      lastErr = e;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end(`upstream miss: ${relPath} (${lastErr?.message ?? 'unknown'})`);
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const p = url.pathname;

  try {
    if (p === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }

    if (p.startsWith('/index/')) {
      const rel = p.slice('/index'.length); // keeps the leading slash
      const rewrite = rel === '/config.json';
      return void (await proxyJsonRes(res, INDEX_BASES, rel, { rewrite }));
    }

    if (p.startsWith('/dl/')) {
      const rel = p.slice('/dl'.length);
      return void (await proxyJsonRes(res, DL_BASES, rel));
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`proxy error: ${e.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`crates proxy listening on ${SELF}`);
  console.log(`  index -> ${INDEX_BASES.join(', ')}`);
  console.log(`  dl    -> ${DL_BASES.join(', ')}`);
});
