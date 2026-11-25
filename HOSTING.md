# Hosting the web app (free, on Vercel or Cloudflare)

The web app in `app/` is a static site plus two small server pieces, written once in `app/server/` and wired
up for both hosts:

| | Vercel | Cloudflare Pages |
|---|---|---|
| Password page in front of everything | `app/middleware.js` | `app/functions/_middleware.js` |
| Saved papers | `app/api/papers/` and Upstash Redis | `app/functions/api/papers/` and KV |

Both fit the free plans. The repo stays private: the host only reads it to build. Use **one** of them.

## Option A: Vercel (about 10 minutes)

1. **Push the repo** to GitHub (private).
2. In Vercel, go to **Add New… → Project → Import Git Repository**. If the repo isn't listed, use *Adjust
   GitHub App Permissions* and give Vercel access to **only** `exam-builder`. Then press **Import**.
3. On the configure screen:
   - **Root Directory** → Edit → choose `app`. Framework shows **Vite**; the build settings come from
     `app/vercel.json`.
   - **Environment Variables**: add `SITE_PASSWORD` with a password she can type easily, but not guessable.
   - Press **Deploy**. It takes 1-2 minutes.
4. **Storage for her papers:** go to the project → **Storage** tab → **Create Database** → **Upstash for
   Redis** (free plan). Pick the region nearest to her (e.g. Mumbai), create it, and **Connect** it to this
   project for all environments. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables.
5. **Redeploy** so the storage is used: Deployments → the latest one → ⋯ → Redeploy.
6. **The link** is under *Domains* on the project page, e.g. `https://exam-builder.vercel.app`. Open it,
   check the password page appears, enter the password once on her computer (remembered for a year), and
   bookmark it.

Notes:
- If the build fails with "index.json not found", go to Settings → Build and Deployment → Root Directory
  and make sure *Include files outside the root directory in the Build Step* is on.
- Without step 4 the app still works, but papers are saved only in that browser.
- Vercel's own "Deployment Protection" only covers preview links. The password page is what protects the
  real address.
- Vercel's free Hobby plan is meant for personal, non-commercial use.

## Option B: Cloudflare Pages (about 15 minutes)

1. **Push the repo** to GitHub (private).
2. **Make a Cloudflare account** at dash.cloudflare.com (free plan, no card needed for Pages).
3. **Create the project.** Go to Workers & Pages → Create → Pages → *Connect to Git*. When GitHub asks,
   give the Cloudflare app access to **only** `exam-builder`. Pick the repo, then set:
   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | None |
   | Root directory (advanced) | `app` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Environment variable | `NODE_VERSION` = `22` |
   Then Save and Deploy. The first build takes 1-2 minutes. Until the next step is done, the site shows
   "The site password is not set", which is safe: nothing is visible.
4. **Set the password.** Go to the project → Settings → Variables and Secrets → Add. Type *Secret*, name
   `SITE_PASSWORD`, and value: a password she can type easily, but not guessable. Add it for **Production**,
   and also for **Preview** if you'll use preview branches.
5. **Create storage for her papers.** Go to Workers & Pages → KV → Create a namespace called
   `exam-builder-papers`. Then go to the project → Settings → Bindings → Add → KV namespace, with variable
   name `PAPERS` and the namespace you just made.
6. **Redeploy** so steps 4-5 take effect: Deployments → the latest one → ⋯ → Retry deployment.
7. Open `https://<project-name>.pages.dev`. You should see the password page. On her computer, open it,
   enter the password once (it's remembered for a year), and **bookmark it** or pin it to the taskbar.

Optional: Custom domains, if you'd like a nicer address than `*.pages.dev`.

## Updating

- **New questions:** ingest with Claude Code (`/ingest`), run `.venv/Scripts/python tools/eb.py index`,
  commit and push. Vercel or Cloudflare rebuilds automatically and the site updates in about 2 minutes.
- **App changes:** same thing. Every push to `main` redeploys. Pushes to other branches get their own preview
  URL, which is also behind the password.

## Where her papers live

Papers she makes in the app are stored online, not in git: in Upstash Redis on Vercel (one hash called
`exam-builder:papers`), or in the `PAPERS` KV namespace on Cloudflare. Each browser also keeps a copy, and if the API is down the
app keeps working from that copy. Papers in `papers/*.yaml` (the school's past exams) are read-only in the app,
and their questions count as already given.

## Running it locally

```powershell
cd app
npm install
npm run dev                  # http://localhost:5173, no password, papers saved in the browser
npm run build
npm run preview:cloudflare   # http://localhost:8788, real password page (password: test) and KV storage
npm test                     # suggestion checks, password/API checks, builds ../out/web-test - paper.docx
```

Wrangler (used by `preview:cloudflare`) needs Node 22.12 or newer.

## Limits (free plans)

Vercel Hobby: 100 GB bandwidth and 1 million edge requests a month, which is far more than needed.
Cloudflare: 500 builds a month, 20,000 files per deployment, 25 MB per file, and 100,000 function requests a day. Every
page and image request passes through the password check, so a busy session might use a few hundred. The
bank currently deploys as about 320 files (54 MB).
