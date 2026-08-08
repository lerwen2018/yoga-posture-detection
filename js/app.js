/**
 * Yoga Posture Detection — browser app
 * Uses MediaPipe Pose Landmarker (WASM) entirely on-device via the webcam.
 */
import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";

import { POSES, SKELETON_EDGES } from "./poses.js";
import {
  computeAngles,
  matchPoses,
  recommendNext,
  buildCoachingFeedback,
  JOINT_LANDMARK,
  ScoreSmoother,
} from "./poseLogic.js";

// Prefer local model (good for offline / CF static assets), fall back to CDN
const LOCAL_MODEL = "/models/pose_landmarker_lite.task";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const PREFER_CDN_MODEL = true;
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const el = {
  video: document.getElementById("video"),
  canvas: document.getElementById("canvas"),
  videoWrap: document.getElementById("videoWrap"),
  overlayEmpty: document.getElementById("overlayEmpty"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  modeAutoBtn: document.getElementById("modeAutoBtn"),
  modePracticeBtn: document.getElementById("modePracticeBtn"),
  mirrorToggle: document.getElementById("mirrorToggle"),
  statusBadge: document.getElementById("statusBadge"),
  fpsLabel: document.getElementById("fpsLabel"),
  errorText: document.getElementById("errorText"),
  poseName: document.getElementById("poseName"),
  poseSanskrit: document.getElementById("poseSanskrit"),
  scoreValue: document.getElementById("scoreValue"),
  scoreFill: document.getElementById("scoreFill"),
  poseDifficulty: document.getElementById("poseDifficulty"),
  formLevelPill: document.getElementById("formLevelPill"),
  coachSummary: document.getElementById("coachSummary"),
  coachList: document.getElementById("coachList"),
  jointMeters: document.getElementById("jointMeters"),
  recName: document.getElementById("recName"),
  recDesc: document.getElementById("recDesc"),
  recTips: document.getElementById("recTips"),
  matchList: document.getElementById("matchList"),
  poseSelect: document.getElementById("poseSelect"),
  cyclePoseBtn: document.getElementById("cyclePoseBtn"),
  practiceHint: document.getElementById("practiceHint"),
};

// Live banner over the video
const coachBanner = document.createElement("div");
coachBanner.className = "coach-banner";
coachBanner.innerHTML = "<strong></strong><span></span>";
el.videoWrap.appendChild(coachBanner);
const coachBannerTitle = coachBanner.querySelector("strong");
const coachBannerDetail = coachBanner.querySelector("span");

const state = {
  poseLandmarker: null,
  stream: null,
  running: false,
  mode: "auto", // auto | practice
  practicePose: POSES[0],
  mirror: true,
  smoother: new ScoreSmoother(12),
  lastVideoTime: -1,
  rafId: 0,
  fps: 0,
  lastFpsTs: performance.now(),
  frames: 0,
  lastJointErrors: {},
};

const ctx = el.canvas.getContext("2d");

function setStatus(kind, text) {
  el.statusBadge.textContent = text;
  el.statusBadge.className = `badge badge-${kind}`;
}

function showError(msg) {
  el.errorText.hidden = !msg;
  el.errorText.textContent = msg || "";
  if (msg) setStatus("error", "Error");
}

function populatePoseSelect() {
  el.poseSelect.innerHTML = "";
  for (const p of POSES) {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.difficulty})`;
    el.poseSelect.appendChild(opt);
  }
  el.poseSelect.value = state.practicePose.name;
}

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

  const tryModel = async (path) => {
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: path,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  };

  if (PREFER_CDN_MODEL) {
    try {
      return await tryModel(CDN_MODEL);
    } catch (err) {
      console.warn("CDN model failed, trying local", err);
      return tryModel(LOCAL_MODEL);
    }
  }
  try {
    return await tryModel(LOCAL_MODEL);
  } catch (err) {
    console.warn("Local model failed, falling back to CDN", err);
    return tryModel(CDN_MODEL);
  }
}

function resizeCanvasToVideo() {
  const w = el.video.videoWidth || 640;
  const h = el.video.videoHeight || 480;
  if (el.canvas.width !== w || el.canvas.height !== h) {
    el.canvas.width = w;
    el.canvas.height = h;
  }
}

function jointColor(error) {
  if (error == null) return "rgba(0, 200, 255, 0.95)";
  if (error < 10) return "rgba(94, 228, 168, 0.95)";
  if (error < 20) return "rgba(240, 180, 41, 0.95)";
  return "rgba(240, 113, 120, 0.95)";
}

function boneColor(errA, errB) {
  const e = Math.max(errA ?? 0, errB ?? 0);
  if (e < 10) return "rgba(94, 228, 168, 0.9)";
  if (e < 20) return "rgba(240, 180, 41, 0.9)";
  return "rgba(240, 113, 120, 0.85)";
}

/** Landmark index → worst joint error touching that landmark */
function landmarkErrorMap(jointErrors) {
  const map = {};
  for (const [joint, err] of Object.entries(jointErrors || {})) {
    const idx = JOINT_LANDMARK[joint];
    if (idx == null) continue;
    map[idx] = Math.max(map[idx] ?? 0, err);
  }
  return map;
}

function drawSkeleton(landmarks, jointErrors = {}) {
  const w = el.canvas.width;
  const h = el.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const errMap = landmarkErrorMap(jointErrors);

  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const [i, j] of SKELETON_EDGES) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.4 || (b.visibility ?? 1) < 0.4) continue;
    ctx.strokeStyle = boneColor(errMap[i], errMap[j]);
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    if ((p.visibility ?? 1) < 0.4) continue;
    const x = p.x * w;
    const y = p.y * h;
    const err = errMap[i];
    const r = err != null && err >= 15 ? 7 : 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = jointColor(err);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(10, 20, 16, 0.8)";
    ctx.stroke();
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
}

function updateScoreUI(score) {
  const s = Math.round(score);
  el.scoreValue.textContent = `${s}%`;
  el.scoreFill.style.width = `${Math.min(100, s)}%`;
  el.scoreFill.classList.remove("warn", "bad");
  if (s < 50) el.scoreFill.classList.add("bad");
  else if (s < 75) el.scoreFill.classList.add("warn");

  const color =
    s >= 75 ? "var(--good)" : s >= 50 ? "var(--warn)" : "var(--bad)";
  el.scoreValue.style.color = color;
}

function formLevelLabel(level) {
  switch (level) {
    case "excellent":
      return "Excellent form";
    case "good":
      return "Good form";
    case "fair":
      return "Fair — keep adjusting";
    case "needs_work":
      return "Needs work";
    default:
      return "—";
  }
}

function renderCoaching(coaching) {
  if (!coaching) {
    el.coachSummary.textContent =
      "Start the camera and hold a pose — we’ll coach joint by joint.";
    el.formLevelPill.textContent = "—";
    el.formLevelPill.className = "pill pill-form";
    el.coachList.innerHTML = `
      <li class="coach-item coach-idle">
        <span class="coach-step">1</span>
        <div>
          <strong>Stand in full view</strong>
          <p>Head to feet visible, good lighting, face the camera.</p>
        </div>
      </li>
      <li class="coach-item coach-idle">
        <span class="coach-step">2</span>
        <div>
          <strong>Hold still for a second</strong>
          <p>Let the score settle, then follow the top cue.</p>
        </div>
      </li>`;
    el.jointMeters.hidden = true;
    el.jointMeters.innerHTML = "";
    coachBanner.classList.remove("visible", "good");
    return;
  }

  el.coachSummary.textContent = coaching.summary;
  el.formLevelPill.textContent = formLevelLabel(coaching.formLevel);
  el.formLevelPill.className = `pill pill-form ${coaching.formLevel}`;

  el.coachList.innerHTML = coaching.cues
    .map((c, i) => {
      const cls = c.priority || "medium";
      const step =
        c.priority === "good"
          ? "✓"
          : c.priority === "tip"
            ? "i"
            : String(i + 1);
      const errHtml =
        c.error > 0
          ? `<span class="coach-err">~${Math.round(c.error)}° off</span>`
          : "";
      return `
        <li class="coach-item ${cls}">
          <span class="coach-step">${step}</span>
          <div>
            <strong>${escapeHtml(c.title)}</strong>
            <p>${escapeHtml(c.detail)}</p>
            ${errHtml}
          </div>
        </li>`;
    })
    .join("");

  // Joint meters (top offenders + good ones)
  const joints = (coaching.joints || []).slice(0, 6);
  if (joints.length) {
    el.jointMeters.hidden = false;
    el.jointMeters.innerHTML = joints
      .map((j) => {
        const pct = Math.min(100, (j.error / 40) * 100);
        const level = j.error < 10 ? "ok" : j.error >= 22 ? "bad" : "";
        return `
          <div class="joint-meter ${level}">
            <span>${escapeHtml(j.label)}</span>
            <div class="bar"><i style="width:${pct}%"></i></div>
            <span class="deg">${Math.round(j.error)}°</span>
          </div>`;
      })
      .join("");
  } else {
    el.jointMeters.hidden = true;
  }

  // Banner: primary cue on video
  const top = coaching.cues[0];
  if (top) {
    coachBannerTitle.textContent = top.title;
    coachBannerDetail.textContent = top.detail;
    coachBanner.classList.add("visible");
    coachBanner.classList.toggle("good", top.priority === "good");
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateUI(analysis) {
  if (!analysis) {
    el.poseName.textContent = "No person";
    el.poseSanskrit.textContent = "Step into full body view";
    updateScoreUI(0);
    el.poseDifficulty.textContent = "—";
    el.matchList.innerHTML = `<li class="muted">Waiting for pose…</li>`;
    renderCoaching(null);
    state.lastJointErrors = {};
    return;
  }

  const { matches, best, recommendation, score, coaching, jointErrors } =
    analysis;
  state.lastJointErrors = jointErrors || {};
  updateScoreUI(score);
  renderCoaching(coaching);

  if (state.mode === "practice") {
    const target = state.practicePose;
    el.poseName.textContent = target.name;
    el.poseSanskrit.textContent = target.sanskrit;
    el.poseDifficulty.textContent = target.difficulty;
    el.recName.textContent = target.name;
    el.recDesc.textContent = target.description;
    el.recTips.innerHTML = target.tips.map((t) => `<li>${t}</li>`).join("");
  } else if (best) {
    el.poseName.textContent = best.pose.name;
    el.poseSanskrit.textContent = best.pose.sanskrit;
    el.poseDifficulty.textContent = best.pose.difficulty;
    if (recommendation) {
      el.recName.textContent = recommendation.name;
      el.recDesc.textContent = recommendation.description;
      el.recTips.innerHTML = recommendation.tips
        .map((t) => `<li>${t}</li>`)
        .join("");
    }
  } else {
    el.poseName.textContent = "Hold a pose…";
    el.poseSanskrit.textContent = "Align your body";
    el.poseDifficulty.textContent = "—";
  }

  if (matches?.length) {
    el.matchList.innerHTML = matches
      .slice(0, 5)
      .map(
        (m) =>
          `<li>${m.pose.name} <span class="pct">${Math.round(m.score)}%</span></li>`
      )
      .join("");
  }
}

function analyzeLandmarks(landmarks) {
  const angles = computeAngles(landmarks);
  if (!Object.keys(angles).length) {
    return null;
  }
  const matches = matchPoses(angles);
  let best = matches[0] && matches[0].score >= 25 ? matches[0] : null;
  let score = 0;
  let focusMatch = best;

  if (state.mode === "practice") {
    const m = matches.find((x) => x.pose.name === state.practicePose.name);
    score = m ? m.score : 0;
    focusMatch = m || {
      pose: state.practicePose,
      score: 0,
      jointErrors: {},
      jointDeltas: {},
    };
    best = m || best;
  } else {
    score = best ? best.score : matches[0]?.score ?? 0;
    focusMatch = best || matches[0];
  }

  const smoothed = state.smoother.push(score);
  const recommendation = recommendNext(best, matches);
  const coaching = buildCoachingFeedback(focusMatch);

  return {
    matches,
    best,
    recommendation,
    score: smoothed,
    angles,
    coaching,
    jointErrors: focusMatch?.jointErrors || {},
  };
}

function tick() {
  if (!state.running || !state.poseLandmarker) return;

  const video = el.video;
  if (video.readyState >= 2) {
    resizeCanvasToVideo();

    if (video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = video.currentTime;
      const nowMs = performance.now();
      const result = state.poseLandmarker.detectForVideo(video, nowMs);

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        const analysis = analyzeLandmarks(landmarks);
        drawSkeleton(landmarks, analysis?.jointErrors || {});
        updateUI(analysis);
      } else {
        clearCanvas();
        updateUI(null);
      }

      state.frames += 1;
      const elapsed = nowMs - state.lastFpsTs;
      if (elapsed >= 500) {
        state.fps = (state.frames * 1000) / elapsed;
        el.fpsLabel.textContent = `${state.fps.toFixed(0)} FPS`;
        state.frames = 0;
        state.lastFpsTs = nowMs;
      }
    }
  }

  state.rafId = requestAnimationFrame(tick);
}

async function startCamera() {
  showError("");
  setStatus("loading", "Loading model…");
  el.startBtn.disabled = true;

  try {
    if (!state.poseLandmarker) {
      state.poseLandmarker = await createLandmarker();
    }

    setStatus("loading", "Starting camera…");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    state.stream = stream;
    el.video.srcObject = stream;
    await el.video.play();

    state.running = true;
    state.lastVideoTime = -1;
    state.smoother.reset();
    el.overlayEmpty.classList.add("hidden");
    el.stopBtn.disabled = false;
    setStatus("live", "Live");
    state.rafId = requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    el.startBtn.disabled = false;
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      showError(
        "Camera permission denied. Allow camera access for this site in the browser, then try again."
      );
    } else if (name === "NotFoundError") {
      showError("No camera found on this device.");
    } else {
      showError(err?.message || "Could not start camera / model.");
    }
  }
}

function stopCamera() {
  state.running = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;

  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
    state.stream = null;
  }
  el.video.srcObject = null;
  clearCanvas();
  el.overlayEmpty.classList.remove("hidden");
  el.startBtn.disabled = false;
  el.stopBtn.disabled = true;
  setStatus("idle", "Idle");
  el.fpsLabel.textContent = "— FPS";
  updateUI(null);
}

function setMode(mode) {
  state.mode = mode;
  state.smoother.reset();
  el.modeAutoBtn.classList.toggle("active", mode === "auto");
  el.modePracticeBtn.classList.toggle("active", mode === "practice");
  const practiceOn = mode === "practice";
  el.poseSelect.disabled = !practiceOn;
  el.cyclePoseBtn.disabled = !practiceOn;
  el.practiceHint.textContent = practiceOn
    ? "Coaching now targets only the selected pose. Follow the top cue until score rises."
    : "Auto mode coaches the pose we detect. Use Practice to lock one shape.";
}

// Events
el.startBtn.addEventListener("click", () => startCamera());
el.stopBtn.addEventListener("click", () => stopCamera());
el.modeAutoBtn.addEventListener("click", () => setMode("auto"));
el.modePracticeBtn.addEventListener("click", () => setMode("practice"));
el.mirrorToggle.addEventListener("change", () => {
  state.mirror = el.mirrorToggle.checked;
  el.videoWrap.classList.toggle("no-mirror", !state.mirror);
});
el.poseSelect.addEventListener("change", () => {
  state.practicePose =
    POSES.find((p) => p.name === el.poseSelect.value) || POSES[0];
  state.smoother.reset();
});
el.cyclePoseBtn.addEventListener("click", () => {
  const idx = POSES.findIndex((p) => p.name === state.practicePose.name);
  state.practicePose = POSES[(idx + 1) % POSES.length];
  el.poseSelect.value = state.practicePose.name;
  state.smoother.reset();
});

// Secure context check (camera requires localhost or HTTPS)
if (!window.isSecureContext) {
  showError(
    "Camera needs a secure context. Open via http://localhost (not a raw file path)."
  );
}

populatePoseSelect();
setMode("auto");
setStatus("idle", "Idle");

// Optional: DrawingUtils available if we want official connectors later
void DrawingUtils;
