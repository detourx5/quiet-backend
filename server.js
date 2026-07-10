// Quiet — minimal privacy-preserving search backend
//
// What this does:
//  1. Receives a query from your frontend (never exposes your API key to the browser)
//  2. Forwards it to the Brave Search API
//  3. Strips it down to a clean, ad-free result set
//  4. Logs nothing identifying (no IP, no query storage) — true to the "Quiet" promise
//
// Run locally:   BRAVE_API_KEY=your_key node server.js
// Deploy:        Works as-is on Render, Railway, Fly.io, or as a Vercel/Netlify function
//                 (see notes at the bottom for serverless versions)

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY; // NEVER hardcode this — set as an env var

if (!BRAVE_API_KEY) {
  console.warn('⚠️  BRAVE_API_KEY is not set. Requests will fail until you set it.');
}

function braveSearch(query) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.search.brave.com',
      path: `/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Brave API returned ${res.statusCode}: ${body}`));
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
    req.end();
  });
}

function normalizeResults(braveData) {
  const webResults = (braveData.web && braveData.web.results) || [];
  return webResults
    // Brave marks paid/promoted placements with these flags — filter them out
    // so "no ads" is actually true, not just true of the design.
    .filter((r) => !r.is_sponsored && !r.sponsored && r.subtype !== 'ad')
    .map((r) => ({
      title: r.title,
      url: r.url,
      displayUrl: (() => {
        try {
          return new URL(r.url).hostname.replace('www.', '');
        } catch {
          return r.url;
        }
      })(),
      description: (r.description || '').replace(/<\/?strong>/g, ''), // strip Brave's bold markup
    }));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS — restrict this to your own domain in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

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
      const raw = await braveSearch(query);
      const results = normalizeResults(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Search backend error', detail: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Quiet backend running on http://localhost:${PORT}`);
});
