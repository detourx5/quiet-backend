Quiet — search, undisturbed
A minimal, private, ad-free meta-search site. No tracking, no accounts, no ads —
architecturally, not just as a claim.
How it works
Frontend (`index.html`) — a single static page. Search box, results list. No JS
frameworks, no analytics scripts, no third-party embeds.
Backend (`server.js`) — a small Node server that holds your Serper.dev API
key and proxies queries to it server-side. This is what makes it actually private:
the browser never talks to Serper directly, so Serper never sees the searcher's IP,
and your key is never exposed in browser dev tools.
Only organic (unpaid) results are read from the API response — sponsored/ad
blocks are simply never touched, so "no ads" holds architecturally.
Nothing about a query (text, IP, timestamp) is logged anywhere.
1. Get a Serper API key (free, no credit card)
Go to https://serper.dev
Sign up — no card required
Copy your API key from the dashboard. New accounts get 2,500 free search
credits (check their pricing page for current numbers, since these can change).
2. Run it locally to test
```bash
npm install    # no dependencies to install yet, but keeps things tidy
SERPER_API_KEY=your_key_here node server.js
```
Then open `index.html` in a browser. Note: opening the HTML file directly
(`file://`) will hit CORS/relative-path issues with `/api/search` — for local
testing, serve it with a simple static server too, e.g.:
```bash
npx serve .
```
3. Deploy the backend
Any of these work well for a small Node server:
Render (render.com) — free tier, connect your GitHub repo, set
`SERPER_API_KEY` as an environment variable in the dashboard, done.
Railway (railway.app) — similar, very quick.
Fly.io — good free tier, slightly more setup.
Steps (Render example):
Push this folder to a GitHub repo (e.g. `quiet-backend`).
On Render: New → Web Service → connect the repo.
Build command: (none needed) · Start command: `node server.js`
Add environment variable `SERPER_API_KEY` with your key.
Deploy. You'll get a URL like `https://quiet-backend.onrender.com`.
4. Deploy the frontend
In `index.html`, update this line near the top of the `<script>` block:
```js
   const SEARCH_ENDPOINT = 'https://quiet-backend.onrender.com/api/search';
   ```
Push `index.html` to your frontend GitHub repo (e.g. `quiet-site`) and
enable GitHub Pages (Settings → Pages → Deploy from branch → main → root).
5. Connect your domain
Once you've picked and registered a domain (e.g. `quietsearch.com`):
Point its DNS at wherever you hosted the frontend (GitHub Pages gives you
the exact DNS records to add — add a `CNAME` file to the repo root too).
Enable HTTPS (GitHub Pages does this automatically/free via Let's Encrypt).
Privacy checklist (what makes "no tracking" actually true)
[x] No cookies set by the frontend
[x] No `localStorage`/`sessionStorage` used for identifying data
[x] No analytics scripts (Google Analytics, etc.)
[x] Backend logs nothing per-query (no query text, no IP, no timestamp)
[x] Search queries proxied server-side, never sent client-side to Serper
[x] Only organic results read from the API — ad/sponsored blocks never touched
[ ] Consider adding a simple `privacy.html` page stating this plainly
Restricting CORS (do this before going live)
In `server.js`, change:
```js
res.setHeader('Access-Control-Allow-Origin', '*');
```
to your actual domain:
```js
res.setHeader('Access-Control-Allow-Origin', 'https://quietsearch.com');
```
This stops other sites from quietly using your backend/API quota.
When you outgrow the free tier
Serper's free 2,500 credits are one-time, not monthly. Once used up, cheapest
paid option is roughly $0.30 per 1,000 queries — worth checking their current
pricing page before committing.
