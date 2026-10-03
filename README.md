# Yoga Posture Detection

Browser-based yoga pose detection with MediaPipe (runs on-device in your webcam).
Live site: **https://yoga.lerwenliu.org**

## Local

```bash
python3 -m http.server 8787
# open http://127.0.0.1:8787
```

## How production works

**https://yoga.lerwenliu.org** is a **Cloudflare Worker** (`yoga-posture-detection`)
that serves the static site from this project's `web/public` directory using
**Workers Static Assets**, deployed with **Wrangler**. The pose model ships with
the assets, so detection works offline too.

Deploy from the main project folder:

```bash
./deploy.sh
# or: cd web && npx wrangler deploy
```

`web/public/_headers` sets security and cache headers; `web/src/worker.js` is the
Worker entry point.

> Pose detection always runs in the user's browser. The Worker only serves files.

## About this repo

This repository is a mirror of the deployed static output (`index.html`, `css/`,
`js/`). The canonical source and Wrangler config live in the main
`yoga-posture-detection` project (`web/`).

## Stack

- MediaPipe Pose Landmarker (WASM) in the browser
- Static HTML/CSS/JS (no build step)
- Cloudflare Workers + Wrangler (custom domain)
