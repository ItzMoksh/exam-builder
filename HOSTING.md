# Hosting the web app (Cloudflare Pages, free)

The web app in `app/` is a static site plus two small Cloudflare Pages Functions:

- `app/functions/_middleware.js`: a password page in front of everything (questions, images, data).
- `app/functions/api/papers/[[id]].js`: saves her papers in Cloudflare KV, so they're kept online and
  survive browser cache clears and a change of computer.

Everything here fits Cloudflare's free plan. The repo stays private: Cloudflare only reads it to build.

## One-time setup (about 15 minutes)

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
  commit and push. Cloudflare rebuilds automatically and the site updates in about 2 minutes.
- **App changes:** same thing. Every push to `main` redeploys. Pushes to other branches get their own preview
  URL, which is also behind the password.

## Where her papers live

Papers she makes in the app are stored in the `PAPERS` KV namespace, not in git. You can see them in the
Cloudflare dashboard (KV → `exam-builder-papers`). Each browser also keeps a copy, and if the API is down the
app keeps working from that copy. Papers in `papers/*.yaml` (the school's past exams) are read-only in the app,
and their questions count as already given.

## Running it locally

```powershell
cd app
npm install
npm run dev                  # http://localhost:5173, no password, papers saved in the browser
npm run build
npm run preview:cloudflare   # http://localhost:8788, real password page (password: test) and KV storage
npm test                     # suggestion checks + builds ../out/web-test - paper.docx
```

Wrangler (used by `preview:cloudflare`) needs Node 22.12 or newer.

## Limits (free plan)

500 builds a month, 20,000 files per deployment, 25 MB per file, and 100,000 function requests a day. Every
page and image request passes through the password check, so a busy session might use a few hundred. The
bank currently deploys as about 320 files (54 MB).
