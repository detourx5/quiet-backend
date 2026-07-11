// Quiet — minimal privacy-preserving search backend
//
// What this does:
//  1. Receives a query from your frontend (never exposes your API key to the browser)
//  2. Forwards it to the Serper.dev API (free tier: 2,500 searches, no card required)
//  3. Strips it down to a clean, ad-free result set
//  4. Logs nothing identifying (no IP, no query storage) — true to the "Quiet" promise
//
// Run locally:   SERPER_API_KEY=your_key node server.js
// Deploy:        Works as-is on Render, Railway, Fly.io, or as a Vercel/Netlify function

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const SERPER_API_KEY = process.env.SERPER_API_KEY; // NEVER hardcode this — set as an env var
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // for the Ask (AI chat) feature

if (!SERPER_API_KEY) {
  console.warn('⚠️  SERPER_API_KEY is not set. Search requests will fail until you set it.');
}
if (!ANTHROPIC_API_KEY) {
  console.warn('⚠️  ANTHROPIC_API_KEY is not set. The Ask (AI chat) feature will fail until you set it.');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function anthropicChat(messages) {
  return new Promise((resolve, reject) => {
    // Keep only role/content, cap history length sent per request to
    // control cost — the frontend keeps full history, we just send
    // the last chunk of it.
    const trimmed = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: trimmed,
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Anthropic API returned ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function serperSearch(query) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ q: query, num: 20 });

    const options = {
      hostname: 'google.serper.dev',
      path: '/search',
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Serper API returned ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function normalizeResults(serperData) {
  const organic = serperData.organic || [];
  // Serper's /search endpoint returns organic (unpaid) results only —
  // sponsored/ad blocks live in separate fields we simply never read,
  // so "no ads" holds architecturally, not just by filtering.
  return organic.map((r) => ({
    title: r.title,
    url: r.link,
    displayUrl: (() => {
      try {
        return new URL(r.link).hostname.replace('www.', '');
      } catch {
        return r.link;
      }
    })(),
    description: r.snippet || '',
  }));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS — restricted to the live frontend only
  res.setHeader('Access-Control-Allow-Origin', 'https://detourx5.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (parsed.pathname === '/api/search' && req.method === 'GET') {
    const query = parsed.query.q;

    if (!query || !query.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query parameter "q"' }));
      return;
    }

    // Deliberately not logging query, IP, or timestamp anywhere — this
    // is the crux of the "no tracking" promise. If you add analytics
    // later, aggregate/anonymize — never store queries tied to a user.

    try {
      const raw = await serperSearch(query);
      const results = normalizeResults(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Search backend error', detail: err.message }));
    }
    return;
  }

  if (parsed.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const parsedBody = JSON.parse(rawBody || '{}');
      const messages = Array.isArray(parsedBody.messages) ? parsedBody.messages : [];

      if (!messages.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "messages" array' }));
        return;
      }

      // Same no-logging principle as search — nothing about the
      // conversation is written anywhere on this server.

      const raw = await anthropicChat(messages);
      const reply = (raw.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat backend error', detail: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Quiet backend running on http://localhost:${PORT}`);
});
