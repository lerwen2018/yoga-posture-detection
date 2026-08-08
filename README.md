# Yoga Posture Detection

Browser-based yoga pose detection with MediaPipe (runs on-device in your webcam).  
Live site: **https://yoga.lerwenliu.org**

## Local

```bash
# from this folder
python3 -m http.server 8787
# open http://127.0.0.1:8787
```

## How production works

**https://yoga.lerwenliu.org** is a Cloudflare Worker that serves files **live from this GitHub repo** (`main` branch via `raw.githubusercontent.com`).

Update the site by pushing to `main` — no separate deploy step required (allow ~1 minute for cache).

```bash
git add -A && git commit -m "Update yoga app" && git push
```

### Optional: Cloudflare Pages + GitHub Actions

If you prefer Pages CI instead of the Worker proxy, add a workflow (needs `workflow` scope on your `gh` token) and secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` = `42d998688b843019809c9e00ed78abaf`

Example command:

```bash
npx wrangler pages deploy . --project-name=yoga-posture-detection --branch=main
```

## Stack

- MediaPipe Pose Landmarker (WASM) in the browser
- Static HTML/CSS/JS (no build step)
- Cloudflare Pages + custom domain
