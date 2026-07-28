# Market Desk

Your personal trading dashboard, ready to deploy as a real website.

## What changed from the Claude artifact version
The artifact used a Claude-only storage API (`window.storage`). This version
uses standard browser `localStorage` instead, so your API key, watchlist,
and portfolio holdings save right in your own browser on your own site —
same idea, just using a normal web technology instead of a Claude-specific one.

## Deploy it (free, ~15–20 minutes)

### 1. Put the code on GitHub
1. Go to [github.com](https://github.com) and create a free account if you don't have one.
2. Click the **+** in the top right → **New repository**. Name it `market-desk`, keep it Public, click **Create repository**.
3. On the new repo page, click **uploading an existing file** and drag in *all* the files and folders from this project (keep the folder structure — `src/` should stay a folder).
4. Commit the files (there's a green **Commit changes** button at the bottom).

### 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign up — choose **Continue with GitHub** so the two are connected automatically.
2. Click **Add New → Project**.
3. Find and select your `market-desk` repo, click **Import**.
4. Vercel will auto-detect it's a Vite project — leave all settings as-is.
5. Click **Deploy**. Wait ~1 minute.
6. You'll get a free live URL like `market-desk-yourname.vercel.app` — that's your site!

### 3. Use it
1. Open your new URL.
2. Click "Use simulated data now," or paste your real Finnhub API key to try live data —
   now that it's running on your own domain instead of Claude's sandbox, the live
   Finnhub connection should actually work (no more CSP block).

## Making changes later
Come back to this Claude chat any time, and I'll edit `src/MarketDesk.jsx` for you.
After I hand you the updated file, just re-upload it to the same spot in your
GitHub repo (GitHub will ask "replace this file?" — say yes), and Vercel
automatically redeploys within a minute or two. No need to repeat the setup steps.
