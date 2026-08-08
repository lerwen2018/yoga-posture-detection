# Yoga Posture Detection

Browser-based yoga pose detection with MediaPipe (runs on-device in your webcam).  
Live site: **https://yoga.lerwenliu.org**

## Local

```bash
# from this folder
python3 -m http.server 8787
# open http://127.0.0.1:8787
```

## Deploy (Cloudflare Pages via GitHub Actions)

On every push to `main`, GitHub Actions deploys this folder to Cloudflare Pages.

### One-time setup

1. Create a Cloudflare API token  
   [Create token](https://dash.cloudflare.com/profile/api-tokens) → **Edit Cloudflare Workers** template  
   (needs Account → Cloudflare Pages → Edit, and Account → Account Settings → Read)
2. In this GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN` — the token
   - `CLOUDFLARE_ACCOUNT_ID` — `42d998688b843019809c9e00ed78abaf`
3. Push to `main` (or re-run the **Deploy** workflow)

Custom domain: `yoga.lerwenliu.org` (Cloudflare Pages project `yoga-posture-detection`).

## Stack

- MediaPipe Pose Landmarker (WASM) in the browser
- Static HTML/CSS/JS (no build step)
- Cloudflare Pages + custom domain
