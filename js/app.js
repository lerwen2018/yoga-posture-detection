/**
 * Yoga Posture Detection — browser app
 * -------------------------------------
 * MediaPipe Pose Landmarker (WASM) runs entirely on-device via the webcam.
 * This file wires detection to a mobile-first UI with selectable modes:
 *   auto      — detect whatever pose you hold ("Free Flow")
 *   practice  — lock one pose and master it
 *   rush      — timed game: hold poses for points + combos
 *   flow      — sequence game: follow a calm flow
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
import { PoseGame, GAME_PRESETS, FLOW_PRESETS } from "./games.js";
import { loadStats, recordSession, resetStats } from "./storage.js";

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */
const LOCAL_MODEL = "/models/pose_landmarker_lite.task";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const PREFER_CDN_MODEL = true;
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
const IS_NARROW = window.matchMedia("(max-width: 760px)").matches;

const MODES = {
  auto: {
    id: "auto",
    name: "Free Flow",
    short: "Flow",
    icon: "🌊",
    tag: "Detect",
    desc: "We recognise whatever pose you hold and coach you live.",
    emoji: "🧘",
    emptyTitle: "Ready when you are",
    emptyText:
      "Allow camera access and step back so your whole body is visible. Detection runs locally — nothing is uploaded.",
  },
  practice: {
    id: "practice",
    name: "Practice",
    short: "Practice",
    icon: "🎯",
    tag: "Focus",
    desc: "Lock a single pose and perfect its alignment.",
    emoji: "🎯",
    emptyTitle: "Practice a pose",
    emptyText:
      "Pick a target pose, then let the coach guide each joint until your form matches.",
  },
  rush: {
    id: "rush",
    name: "Pose Rush",
    short: "Rush",
    icon: "⚡",
    tag: "Game",
    desc: "Beat the clock — hold each pose for points and combos.",
    emoji: "⚡",
    emptyTitle: "Pose Rush",
    emptyText:
      "Hold each pose that appears. Faster clears give bigger time bonuses and combos.",
  },
  flow: {
    id: "flow",
    name: "Zen Flow",
    short: "Zen",
    icon: "🧘",
    tag: "Game",
    desc: "Follow a calm sequence and build a streak.",
    emoji: "🧘",
    emptyTitle: "Zen Flow",
    emptyText:
      "Move through a short sequence at your own pace. Hold each shape to advance.",
  },
};

const isGameMode = (m) => m === "rush" || m === "flow";

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"),
  topStatus: $("topStatus"),
  soundBtn: $("soundBtn"),
  brandBtn: $("brandBtn"),

  modeGrid: $("modeGrid"),
  quickStats: $("quickStats"),
  libraryGrid: $("libraryGrid"),
  difficultyFilter: $("difficultyFilter"),
  statsContent: $("statsContent"),
  tabbar: $("tabbar"),

  // live
  video: $("video"),
  canvas: $("canvas"),
  videoWrap: $("videoWrap"),
  overlayEmpty: $("overlayEmpty"),
  emptyEmoji: $("emptyEmoji"),
  emptyTitle: $("emptyTitle"),
  emptyText: $("emptyText"),
  startBtn: $("startBtn"),
  errorText: $("errorText"),
  backBtn: $("backBtn"),
  statusBadge: $("statusBadge"),
  modeBadge: $("modeBadge"),
  fpsLabel: $("fpsLabel"),
  mirrorBtn: $("mirrorBtn"),
  flipBtn: $("flipBtn"),
  gestureBtn: $("gestureBtn"),
  gestureBar: $("gestureBar"),
  gestureTargets: $("gestureTargets"),
  gestureHint: $("gestureHint"),
  gameStrip: $("gameStrip"),
  gameTime: $("gameTime"),
  gameScore: $("gameScore"),
  gameCombo: $("gameCombo"),
  targetChip: $("targetChip"),
  targetPoseName: $("targetPoseName"),
  holdFill: $("holdFill"),
  poseName: $("poseName"),
  poseSanskrit: $("poseSanskrit"),
  scoreValue: $("scoreValue"),
  scoreRing: $("scoreRing"),
  ringFg: document.querySelector(".score-ring .ring-fg"),
  coachBanner: $("coachBanner"),
  gameIntro: $("gameIntro"),
  introEmoji: $("introEmoji"),
  introTitle: $("introTitle"),
  introText: $("introText"),
  introStartBtn: $("introStartBtn"),
  introSkipBtn: $("introSkipBtn"),
  resultsOverlay: $("resultsOverlay"),
  resultEmoji: $("resultEmoji"),
  resultTitle: $("resultTitle"),
  resultSub: $("resultSub"),
  resultGrid: $("resultGrid"),
  resultBest: $("resultBest"),
  replayBtn: $("replayBtn"),
  resultsHomeBtn: $("resultsHomeBtn"),
  liveSheet: $("liveSheet"),
  sheetHandle: $("sheetHandle"),
  modeSwitch: $("modeSwitch"),
  liveScreen: $("screen-live"),
  nextPoseBtn: $("nextPoseBtn"),
  paneTabs: $("paneTabs"),
  formLevelPill: $("formLevelPill"),
  coachSummary: $("coachSummary"),
  coachList: $("coachList"),
  jointMeters: $("jointMeters"),
  detailPoseName: $("detailPoseName"),
  detailPoseSanskrit: $("detailPoseSanskrit"),
  poseDifficulty: $("poseDifficulty"),
  matchTop: $("matchTop"),
  recName: $("recName"),
  recDesc: $("recDesc"),
  recTips: $("recTips"),
  matchList: $("matchList"),
  poseSelect: $("poseSelect"),
  cyclePoseBtn: $("cyclePoseBtn"),
  practiceHint: $("practiceHint"),
  stopBtn: $("stopBtn"),
  toast: $("toast"),
};

const coachBannerTitle = el.coachBanner.querySelector("strong");
const coachBannerDetail = el.coachBanner.querySelector("span");
const ctx = el.canvas.getContext("2d");

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
const state = {
  screen: "home",
  mode: "auto",
  difficulty: "all",
  pane: "coach",
  sound: true,

  poseLandmarker: null,
  stream: null,
  running: false,
  mirror: true,
  facingMode: "user", // user (front) | environment (back)
  multiCam: false,
  switching: false,

  gesture: false, // hands-free control
  gestureActions: {},
  gestureRects: [],
  gestureWrapRect: null,
  gestureRectsTs: 0,
  gestureHover: null,
  gestureHoverMs: 0,
  gestureCooldownUntil: 0,
  gestureFraction: 0,
  gestureHasHand: false,
  gestureMissingMs: 0,
  lastGestureTs: 0,

  smoother: new ScoreSmoother(10),
  lastVideoTime: -1,
  rafId: 0,
  lastDetectTs: 0,
  detectInterval: IS_NARROW ? 42 : 30, // ms between inferences (perf knob)
  fps: 0,
  lastFpsTs: 0,
  frames: 0,

  practicePose: POSES[0],
  flowName: Object.keys(FLOW_PRESETS)[0],

  game: null,
  gameLastTs: 0,

  stats: loadStats(),

  sessionStartTs: 0,
  sessionPeak: 0,
  lastJointErrors: {},
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */
const show = (node) => node && (node.hidden = false);
const hide = (node) => node && (node.hidden = true);

function setStatus(kind, text) {
  el.statusBadge.textContent = text;
  el.statusBadge.className = `badge badge-${kind}`;
  if (el.topStatus) {
    el.topStatus.textContent = text;
    el.topStatus.className = `badge badge-${kind}`;
  }
}

function showError(msg) {
  el.errorText.hidden = !msg;
  el.errorText.textContent = msg || "";
  if (msg) setStatus("error", "Error");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

let toastTimer = 0;
function toast(text, kind = "") {
  el.toast.textContent = text;
  el.toast.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.className = `toast ${kind}`;
  }, 1400);
}

/* ------------------------------------------------------------------ *
 * Sound (tiny WebAudio blips — created lazily after a user gesture)
 * ------------------------------------------------------------------ */
let audioCtx = null;
function blip(freq, dur = 0.08, type = "sine", gain = 0.05, delay = 0) {
  if (!state.sound) return;
  try {
    audioCtx =
      audioCtx ||
      new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* audio is a nice-to-have */
  }
}
const sfx = {
  grab: () => blip(560, 0.06, "triangle", 0.035),
  clear: () => {
    blip(660, 0.1, "sine", 0.06);
    blip(990, 0.14, "sine", 0.05, 0.08);
  },
  end: () => {
    blip(520, 0.16, "sine", 0.05);
    blip(392, 0.2, "sine", 0.05, 0.14);
    blip(294, 0.28, "sine", 0.05, 0.3);
  },
  tap: () => blip(440, 0.04, "sine", 0.03),
};

/* ------------------------------------------------------------------ *
 * Home / library / stats rendering
 * ------------------------------------------------------------------ */
function renderModeGrid() {
  el.modeGrid.innerHTML = Object.values(MODES)
    .map(
      (m) => `
      <button class="mode-card" data-mode="${m.id}" type="button">
        <span class="mode-icon" aria-hidden="true">${m.icon}</span>
        <span class="mode-body">
          <span class="mode-title-row">
            <h3>${m.name}</h3>
            <span class="mode-tag ${
              m.tag === "Game" ? "game" : m.tag === "Focus" ? "focus" : ""
            }">${m.tag}</span>
          </span>
          <p>${m.desc}</p>
        </span>
        <span class="mode-arrow" aria-hidden="true">→</span>
      </button>`
    )
    .join("");
}

function renderModeSwitch() {
  el.modeSwitch.innerHTML = Object.values(MODES)
    .map(
      (m) =>
        `<button class="btn btn-chip" data-mode="${m.id}" type="button">${m.icon} ${
          m.short || m.name
        }</button>`
    )
    .join("");
}

function renderQuickStats() {
  const s = state.stats;
  const tiles = [
    { n: s.totalSessions, l: "Sessions" },
    { n: s.posesCleared, l: "Poses cleared" },
    { n: s.highScores.rush || 0, l: "Rush high" },
    { n: s.highScores.flow || 0, l: "Flow high" },
  ];
  el.quickStats.innerHTML = tiles
    .map(
      (t) =>
        `<div class="stat-tile"><strong>${t.n}</strong><span>${t.l}</span></div>`
    )
    .join("");
}

function renderLibrary() {
  const list =
    state.difficulty === "all"
      ? POSES
      : POSES.filter((p) => p.difficulty === state.difficulty);
  el.libraryGrid.innerHTML = list
    .map(
      (p) => `
      <article class="pose-card">
        <div class="pose-card-top">
          <div>
            <h3>${escapeHtml(p.name)}</h3>
          </div>
          <span class="pill">${escapeHtml(p.difficulty)}</span>
        </div>
        <p class="sanskrit">${escapeHtml(p.sanskrit)}</p>
        <p class="desc">${escapeHtml(p.description)}</p>
        <ul class="tips">${p.tips
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>
        <button class="btn btn-primary" data-pose="${escapeHtml(
          p.name
        )}" type="button">Practice this pose</button>
      </article>`
    )
    .join("");
}

function renderStats() {
  const s = state.stats;
  const totals = `
    <div class="stats-hero">
      <div class="stat-big"><strong>${s.totalSessions}</strong><span>Sessions</span></div>
      <div class="stat-big"><strong>${Math.round(
        s.totalTimeMs / 60000
      )}<small>m</small></strong><span>Time moving</span></div>
      <div class="stat-big"><strong>${s.posesCleared}</strong><span>Poses cleared</span></div>
      <div class="stat-big"><strong>${s.bestCombo}×</strong><span>Best combo</span></div>
    </div>
    <div class="stats-hero" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat-big"><strong>${s.highScores.rush || 0}</strong><span>⚡ Rush high score</span></div>
      <div class="stat-big"><strong>${s.highScores.flow || 0}</strong><span>🧘 Flow high score</span></div>
    </div>`;

  const history = s.history.length
    ? `<ul class="history-list">${s.history
        .slice(0, 12)
        .map((h) => {
          const icon =
            h.mode === "rush" ? "⚡" : h.mode === "flow" ? "🧘" : h.mode === "practice" ? "🎯" : "🌊";
          const when = new Date(h.ts).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return `<li class="history-item">
            <span class="h-icon" aria-hidden="true">${icon}</span>
            <span class="h-body">
              <strong>${escapeHtml(h.label || h.mode)}</strong>
              <span>${when} · ${formatClock(h.durationMs)} · ${h.cleared} cleared</span>
            </span>
            <span class="h-score">${h.score}</span>
          </li>`;
        })
        .join("")}</ul>`
    : `<div class="empty-state">No sessions yet — start a mode and your progress will show up here.</div>`;

  el.statsContent.innerHTML = `${totals}
    <div class="section-head" style="margin-top:1.4rem">
      <h2 style="font-size:1.2rem">Recent sessions</h2>
    </div>
    ${history}
    <div style="margin-top:1.2rem">
      <button class="btn btn-ghost" id="resetStatsBtn" type="button">Reset stats</button>
    </div>`;

  const resetBtn = $("resetStatsBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.stats = resetStats();
      renderStats();
      renderQuickStats();
      toast("Stats cleared");
    });
  }
}

/* ------------------------------------------------------------------ *
 * Navigation & mode selection
 * ------------------------------------------------------------------ */
function showScreen(name) {
  if (!["home", "library", "stats", "live"].includes(name)) name = "home";
  const prev = state.screen;
  state.screen = name;
  for (const s of document.querySelectorAll(".screen")) {
    s.classList.toggle("is-active", s.id === `screen-${name}`);
  }
  document.body.classList.toggle("in-live", name === "live");
  for (const tab of el.tabbar.querySelectorAll("[data-screen]")) {
    tab.classList.toggle("is-active", tab.dataset.screen === name);
  }
  if (name === "library") renderLibrary();
  if (name === "stats") renderStats();
  if (name === "home") renderQuickStats();
  if (name === "live") window.scrollTo(0, 0);
  // Leaving the camera should release it (and the camera light).
  if (prev === "live" && name !== "live" && state.running) stopCamera();
}

function setPane(pane) {
  state.pane = pane;
  for (const t of el.paneTabs.querySelectorAll("[data-pane]")) {
    t.classList.toggle("is-active", t.dataset.pane === pane);
  }
  $("pane-coach").classList.toggle("is-active", pane === "coach");
  $("pane-details").classList.toggle("is-active", pane === "details");
}

function updateEmptyState() {
  const m = MODES[state.mode];
  el.emptyEmoji.textContent = m.emoji;
  el.emptyTitle.textContent = m.emptyTitle;
  el.emptyText.textContent = m.emptyText;
  el.startBtn.textContent = isGameMode(state.mode)
    ? "Start camera & play"
    : state.mode === "practice"
      ? "Start camera & practice"
      : "Start camera";
}

function updateModeChrome() {
  const m = MODES[state.mode];
  el.modeBadge.textContent = `${m.icon} ${m.name}`;
  for (const b of el.modeSwitch.querySelectorAll("[data-mode]")) {
    b.classList.toggle("active", b.dataset.mode === state.mode);
  }
  const practiceOn = state.mode === "practice";
  el.poseSelect.disabled = !practiceOn;
  el.cyclePoseBtn.disabled = !practiceOn;
  el.nextPoseBtn.hidden = !practiceOn;
  el.practiceHint.textContent = practiceOn
    ? "Coaching targets only the selected pose."
    : isGameMode(state.mode)
      ? "Switch to Practice to drill one pose at your own pace."
      : "Auto mode coaches the pose we detect.";
  updateEmptyState();
  renderGestureBar();
  updateGestureVisibility();
}

function selectMode(mode) {
  if (!MODES[mode]) mode = "auto";
  state.mode = mode;
  state.smoother.reset();
  state.sessionPeak = 0;
  state.game = null;
  state.gameLastTs = 0;
  hide(el.resultsOverlay);
  hide(el.gameIntro);
  updateModeChrome();
  showScreen("live");
  if (isGameMode(mode)) {
    if (state.running) showGameIntro();
  }
  updateGameHud();
  sfx.tap();
}

function practiceThisPose(name) {
  const p = POSES.find((x) => x.name === name);
  if (p) {
    state.practicePose = p;
    if (el.poseSelect) el.poseSelect.value = p.name;
  }
  selectMode("practice");
}

/* ------------------------------------------------------------------ *
 * Practice pose select
 * ------------------------------------------------------------------ */
function populatePoseSelect() {
  el.poseSelect.innerHTML = POSES.map(
    (p) =>
      `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${p.difficulty})</option>`
  ).join("");
  el.poseSelect.value = state.practicePose.name;
}

/* ------------------------------------------------------------------ *
 * Model + camera
 * ------------------------------------------------------------------ */
async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const tryModel = (path) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: path, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

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

function applyMirror() {
  el.videoWrap.classList.toggle("no-mirror", !state.mirror);
  el.mirrorBtn.classList.toggle("is-on", state.mirror);
}

function getUserMediaStream() {
  const wantBack = state.facingMode === "environment";
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: wantBack ? { ideal: "environment" } : { ideal: "user" },
      width: { ideal: IS_NARROW ? 640 : 1280 },
      height: { ideal: IS_NARROW ? 480 : 720 },
    },
    audio: false,
  });
}

async function refreshCameraButtons() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.multiCam =
      devices.filter((d) => d.kind === "videoinput").length > 1;
  } catch {
    state.multiCam = false;
  }
  el.flipBtn.hidden = !state.multiCam;
}

async function restartStream() {
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
  }
  const stream = await getUserMediaStream();
  state.stream = stream;
  el.video.srcObject = stream;
  await el.video.play();
  state.lastVideoTime = -1;
  state.lastDetectTs = 0;
  state.smoother.reset();
}

async function switchCamera() {
  if (state.switching) return;
  const next = state.facingMode === "user" ? "environment" : "user";

  if (!state.running) {
    state.facingMode = next;
    state.mirror = next === "user";
    applyMirror();
    toast(next === "user" ? "Front camera" : "Back camera");
    return;
  }

  const prev = { facing: state.facingMode, mirror: state.mirror };
  state.facingMode = next;
  // Selfie mirror only makes sense for the front camera.
  state.mirror = next === "user";
  applyMirror();
  state.switching = true;
  el.flipBtn.classList.add("busy");
  try {
    await restartStream();
    toast(next === "user" ? "Front camera" : "Back camera");
  } catch (err) {
    console.error(err);
    state.facingMode = prev.facing;
    state.mirror = prev.mirror;
    applyMirror();
    toast("Could not switch camera", "bad");
  } finally {
    state.switching = false;
    el.flipBtn.classList.remove("busy");
  }
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
    const stream = await getUserMediaStream();

    state.stream = stream;
    el.video.srcObject = stream;
    await el.video.play();

    state.running = true;
    state.lastVideoTime = -1;
    state.lastDetectTs = 0;
    state.lastFpsTs = performance.now();
    state.frames = 0;
    state.smoother.reset();
    state.sessionStartTs = performance.now();
    state.sessionPeak = 0;
    applyMirror();
    el.overlayEmpty.classList.add("hidden");
    el.stopBtn.disabled = false;
    setStatus("live", "Live");
    refreshCameraButtons();
    renderGestureBar();
    updateGestureVisibility();

    if (isGameMode(state.mode)) showGameIntro();

    state.rafId = requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    el.startBtn.disabled = false;
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      showError(
        "Camera permission denied. Allow camera access for this site, then try again."
      );
    } else if (name === "NotFoundError") {
      showError("No camera found on this device.");
    } else {
      showError(err?.message || "Could not start camera / model.");
    }
  }
}

function recordCurrentSession() {
  if (!state.running || !state.sessionStartTs) return;
  if (isGameMode(state.mode)) return; // games are recorded when they finish
  const durationMs = performance.now() - state.sessionStartTs;
  if (durationMs < 3000) return;
  state.stats = recordSession({
    mode: state.mode,
    label: MODES[state.mode].name,
    score: Math.round(state.sessionPeak),
    durationMs,
  });
}

function stopCamera() {
  if (state.running) recordCurrentSession();
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
  hide(el.gameIntro);
  hide(el.resultsOverlay);
  setStatus("idle", "Idle");
  el.fpsLabel.textContent = "— FPS";
  updateUI(null);
  updateGameHud();
  renderGestureBar();
  updateGestureVisibility();
}

/* ------------------------------------------------------------------ *
 * Detection loop
 * ------------------------------------------------------------------ */
function tick(ts) {
  if (!state.running || !state.poseLandmarker) return;

  const video = el.video;
  const ready = video.readyState >= 2;
  const timeChanged = video.currentTime !== state.lastVideoTime;
  const due = ts - state.lastDetectTs >= state.detectInterval;

  if (ready && timeChanged && due) {
    state.lastVideoTime = video.currentTime;
    state.lastDetectTs = ts;
    resizeCanvasToVideo();

    let analysis = null;
    try {
      const result = state.poseLandmarker.detectForVideo(video, ts);
      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        analysis = analyzeLandmarks(landmarks);
        drawSkeleton(landmarks, analysis?.jointErrors || {});
        updateGesture(landmarks, ts);
        drawGesturePointer(landmarks);
      } else {
        clearCanvas();
        updateGesture(null, ts);
      }
    } catch (err) {
      console.warn("detect error", err);
    }

    onFrame(analysis, ts);
  }

  state.rafId = requestAnimationFrame(tick);
}

function onFrame(analysis, ts) {
  // FPS
  state.frames += 1;
  const elapsed = ts - state.lastFpsTs;
  if (elapsed >= 500) {
    state.fps = (state.frames * 1000) / elapsed;
    el.fpsLabel.textContent = `${state.fps.toFixed(0)} FPS`;
    state.frames = 0;
    state.lastFpsTs = ts;
  }

  const score = analysis ? analysis.score : 0;
  state.sessionPeak = Math.max(state.sessionPeak, score);

  updateScoreRing(score);
  updateUI(analysis);

  // Games
  if (state.game && state.game.status === "playing") {
    const dt = state.gameLastTs ? ts - state.gameLastTs : 0;
    state.gameLastTs = ts;
    const events = state.game.update(score, dt);
    for (const ev of events) handleGameEvent(ev);
    updateGameHud();
  }
}

/* ------------------------------------------------------------------ *
 * Pose analysis
 * ------------------------------------------------------------------ */
function targetPose() {
  if (state.mode === "practice") return state.practicePose;
  if (isGameMode(state.mode) && state.game) return state.game.target;
  return null;
}

function analyzeLandmarks(landmarks) {
  const angles = computeAngles(landmarks);
  if (!Object.keys(angles).length) return null;

  const matches = matchPoses(angles);
  const target = targetPose();

  let focusMatch;
  let score;
  if (target) {
    const m = matches.find((x) => x.pose.name === target.name);
    focusMatch =
      m || { pose: target, score: 0, jointErrors: {}, jointDeltas: {} };
    score = m ? m.score : 0;
  } else {
    const best = matches[0] && matches[0].score >= 25 ? matches[0] : null;
    focusMatch = best || matches[0];
    score = best ? best.score : matches[0]?.score ?? 0;
  }

  // Games want a responsive (unsmoothed) score; other modes smooth gently.
  const smoothed = isGameMode(state.mode) ? score : state.smoother.push(score);

  const recommendation = recommendNext(focusMatch, matches);
  const coaching = buildCoachingFeedback(focusMatch);

  return {
    matches,
    best: focusMatch,
    recommendation,
    score: smoothed,
    rawScore: score,
    angleCount: Object.keys(angles).length,
    coaching,
    jointErrors: focusMatch?.jointErrors || {},
    focusMatch,
  };
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */
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

  ctx.lineWidth = Math.max(2, (w / 640) * 3);
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
    const r = (err != null && err >= 15 ? 7 : 4.5) * Math.max(1, w / 640);
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

/* ------------------------------------------------------------------ *
 * Hands-free gesture control
 * Point at an on-screen button with a hand (tracked via the pose wrists)
 * and hold to activate. Dwell feedback is drawn on the canvas.
 * ------------------------------------------------------------------ */
const DWELL_MS = 900;
const MODE_ORDER = ["auto", "practice", "rush", "flow"];

function cycleMode() {
  const i = MODE_ORDER.indexOf(state.mode);
  selectMode(MODE_ORDER[(i + 1) % MODE_ORDER.length]);
}

function cyclePose() {
  const idx = POSES.findIndex((p) => p.name === state.practicePose.name);
  state.practicePose = POSES[(idx + 1) % POSES.length];
  el.poseSelect.value = state.practicePose.name;
  state.smoother.reset();
}

function gestureActions() {
  const running = state.running;
  const gameWaiting =
    isGameMode(state.mode) && (!state.game || state.game.status !== "playing");

  const primary = !running
    ? { icon: "▶", label: "Start", run: () => startCamera() }
    : gameWaiting
      ? { icon: "▶", label: "Play", run: () => beginGame() }
      : { icon: "■", label: "Stop", run: () => stopCamera() };

  const actions = [
    { id: "primary", ...primary },
    { id: "mode", icon: "🔀", label: "Mode", run: () => cycleMode() },
  ];
  if (state.mode === "practice") {
    actions.push({ id: "next", icon: "⏭", label: "Next pose", run: () => cyclePose() });
  }
  actions.push({
    id: "mirror",
    icon: "⇄",
    label: "Mirror",
    run: () => {
      state.mirror = !state.mirror;
      applyMirror();
    },
  });
  if (running) {
    actions.push({
      id: "home",
      icon: "⌂",
      label: "Home",
      run: () => {
        stopCamera();
        showScreen("home");
      },
    });
  }
  return actions;
}

function renderGestureBar() {
  const actions = gestureActions();
  state.gestureActions = {};
  el.gestureTargets.innerHTML = actions
    .map((a) => {
      state.gestureActions[a.id] = a;
      return `<button class="gesture-target" data-gesture="${a.id}" type="button">
        <span class="gt-icon" aria-hidden="true">${a.icon}</span>
        <span class="gt-label">${a.label}</span>
        <span class="gt-dwell"></span>
      </button>`;
    })
    .join("");
  state.gestureRectsTs = 0;
  state.gestureRects = [];
  state.gestureHover = null;
  state.gestureHoverMs = 0;
}

function updateGestureVisibility() {
  el.gestureBtn.classList.toggle("is-on", state.gesture);
  el.gestureBar.hidden = !(state.gesture && state.running);
}

function triggerGesture(id) {
  const a = state.gestureActions[id];
  if (a && typeof a.run === "function") {
    try {
      a.run();
    } catch (err) {
      console.error("gesture action failed", err);
    }
  }
}

function getGesturePointer(landmarks) {
  const wrists = [15, 16];
  let best = null;
  for (const i of wrists) {
    const p = landmarks[i];
    if (!p) continue;
    if ((p.visibility ?? 1) < 0.5) continue;
    if (!best || p.y < best.y) best = p; // prefer the raised hand
  }
  return best;
}

/** Normalised landmark → pixels within an element, honouring object-fit: cover + mirror. */
function landmarkToElement(landmark, rect) {
  const vw = el.video.videoWidth || 640;
  const vh = el.video.videoHeight || 480;
  const scale = Math.max(rect.width / vw, rect.height / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (rect.width - dispW) / 2;
  const offY = (rect.height - dispH) / 2;
  const x = state.mirror ? 1 - landmark.x : landmark.x;
  return { x: offX + x * dispW, y: offY + landmark.y * dispH };
}

function refreshGestureRects(ts) {
  const wrapRect = el.videoWrap.getBoundingClientRect();
  state.gestureWrapRect = wrapRect;
  state.gestureRects = [...el.gestureTargets.querySelectorAll(".gesture-target")].map(
    (node) => {
      const r = node.getBoundingClientRect();
      return {
        id: node.dataset.gesture,
        el: node,
        left: r.left - wrapRect.left,
        top: r.top - wrapRect.top,
        right: r.right - wrapRect.left,
        bottom: r.bottom - wrapRect.top,
      };
    }
  );
  state.gestureRectsTs = ts;
}

function clearGestureVisuals() {
  for (const t of state.gestureRects) {
    t.el.classList.remove("hover");
    const bar = t.el.querySelector(".gt-dwell");
    if (bar) bar.style.width = "0%";
  }
}

function updateGesture(landmarks, ts) {
  state.gestureFraction = 0;
  if (!state.gesture || !state.running) return;

  const pointer = landmarks ? getGesturePointer(landmarks) : null;
  if (!pointer) {
    const dt = state.lastGestureTs ? Math.min(ts - state.lastGestureTs, 200) : 0;
    state.lastGestureTs = ts;
    state.gestureHasHand = false;
    state.gestureMissingMs += dt;
    if (state.gestureMissingMs > 400) {
      state.gestureHover = null;
      state.gestureHoverMs = 0;
      clearGestureVisuals();
      el.gestureHint.textContent = "🖐 Show your hand to control";
    }
    return;
  }

  state.gestureHasHand = true;
  state.gestureMissingMs = 0;
  const dt = state.lastGestureTs ? Math.min(ts - state.lastGestureTs, 200) : 0;
  state.lastGestureTs = ts;

  if (!state.gestureRects.length || ts - state.gestureRectsTs > 250) {
    refreshGestureRects(ts);
  }

  const wrapRect = state.gestureWrapRect || el.videoWrap.getBoundingClientRect();
  const ep = landmarkToElement(pointer, wrapRect);

  let hit = null;
  for (const t of state.gestureRects) {
    if (ep.x >= t.left && ep.x <= t.right && ep.y >= t.top && ep.y <= t.bottom) {
      hit = t;
      break;
    }
  }

  if (hit) {
    if (state.gestureHover === hit.id) state.gestureHoverMs += dt;
    else {
      state.gestureHover = hit.id;
      state.gestureHoverMs = 0;
    }
  } else {
    state.gestureHover = null;
    state.gestureHoverMs = 0;
  }

  if (
    state.gestureHover &&
    state.gestureHoverMs >= DWELL_MS &&
    ts >= state.gestureCooldownUntil
  ) {
    const activated = state.gestureHover;
    state.gestureCooldownUntil = ts + 1200;
    state.gestureHover = null;
    state.gestureHoverMs = 0;
    state.gestureFraction = 0;
    triggerGesture(activated);
    return;
  }

  state.gestureFraction = state.gestureHover
    ? Math.min(1, state.gestureHoverMs / DWELL_MS)
    : 0;

  for (const t of state.gestureRects) {
    const active = state.gestureHover === t.id;
    t.el.classList.toggle("hover", active);
    const bar = t.el.querySelector(".gt-dwell");
    if (bar) bar.style.width = active ? `${Math.round(state.gestureFraction * 100)}%` : "0%";
  }

  el.gestureHint.textContent = "🖐 Hold a button to activate";
}

function drawGesturePointer(landmarks) {
  if (!state.gesture || !state.running || !landmarks) return;
  const pointer = getGesturePointer(landmarks);
  if (!pointer) return;

  const w = el.canvas.width;
  const h = el.canvas.height;
  const x = pointer.x * w;
  const y = pointer.y * h;
  const r = 24 * Math.max(1, w / 640);

  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 253, 248, 0.92)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  if (state.gestureFraction > 0) {
    ctx.strokeStyle = "rgba(47, 158, 99, 0.95)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + state.gestureFraction * Math.PI * 2
    );
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, 6 * Math.max(1, w / 640), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(47, 158, 99, 0.95)";
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * UI updates
 * ------------------------------------------------------------------ */
let lastScorePaint = 0;
function updateScoreRing(score, force = false) {
  const now = performance.now();
  if (!force && now - lastScorePaint < 100) return;
  lastScorePaint = now;
  const s = Math.max(0, Math.min(100, score));
  const C = 2 * Math.PI * 52;
  el.ringFg.style.strokeDashoffset = String(C * (1 - s / 100));
  const color = s >= 75 ? "var(--good)" : s >= 50 ? "var(--warn)" : "var(--bad)";
  el.ringFg.style.stroke = color;
  el.scoreValue.textContent = `${Math.round(s)}%`;
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
      <li class="coach-item">
        <span class="coach-step">1</span>
        <div><strong>Stand in full view</strong><p>Head to feet visible, good lighting, face the camera.</p></div>
      </li>
      <li class="coach-item">
        <span class="coach-step">2</span>
        <div><strong>Hold still for a second</strong><p>Let the score settle, then follow the top cue.</p></div>
      </li>`;
    el.jointMeters.hidden = true;
    el.jointMeters.innerHTML = "";
    el.coachBanner.classList.remove("visible", "good");
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

  const top = coaching.cues[0];
  if (top) {
    coachBannerTitle.textContent = top.title;
    coachBannerDetail.textContent = top.detail;
    el.coachBanner.classList.add("visible");
    el.coachBanner.classList.toggle("good", top.priority === "good");
  }
}

function renderPoseCard(analysis) {
  const target = targetPose();
  if (target) {
    el.poseName.textContent = target.name;
    el.poseSanskrit.textContent = target.sanskrit;
    el.poseDifficulty.textContent = target.difficulty;
    el.detailPoseName.textContent = target.name;
    el.detailPoseSanskrit.textContent = target.sanskrit;
    return;
  }

  const best = analysis?.matches?.[0];
  if (best) {
    el.poseName.textContent = best.pose.name;
    el.poseSanskrit.textContent = best.pose.sanskrit;
    el.poseDifficulty.textContent = best.pose.difficulty;
    el.detailPoseName.textContent = best.pose.name;
    el.detailPoseSanskrit.textContent = best.pose.sanskrit;
  } else {
    el.poseName.textContent = "No person";
    el.poseSanskrit.textContent = "Step into full body view";
    el.poseDifficulty.textContent = "—";
    el.detailPoseName.textContent = "—";
    el.detailPoseSanskrit.textContent = "Step into full body view";
  }
}

function renderMatches(analysis) {
  if (analysis?.matches?.length) {
    el.matchList.innerHTML = analysis.matches
      .slice(0, 5)
      .map(
        (m) =>
          `<li>${escapeHtml(m.pose.name)} <span class="pct">${Math.round(
            m.score
          )}%</span></li>`
      )
      .join("");
    const top = analysis.matches[0];
    el.matchTop.textContent = top
      ? `${top.pose.name} ${Math.round(top.score)}%`
      : "—";
  } else {
    el.matchList.innerHTML = `<li class="muted">Waiting for pose…</li>`;
    el.matchTop.textContent = "—";
  }
}

function renderRecommendation(analysis) {
  const target = targetPose();
  const rec = analysis?.recommendation;
  if (target) {
    el.recName.textContent = target.name;
    el.recDesc.textContent = target.description;
    el.recTips.innerHTML = target.tips
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
    return;
  }
  if (rec) {
    el.recName.textContent = rec.name;
    el.recDesc.textContent = rec.description;
    el.recTips.innerHTML = rec.tips
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
  } else {
    el.recName.textContent = "—";
    el.recDesc.textContent = "Hold a pose to get a suggestion";
    el.recTips.innerHTML = "";
  }
}

function updateUI(analysis) {
  if (!analysis) {
    state.lastJointErrors = {};
    renderPoseCard(null);
    renderMatches(null);
    renderRecommendation(null);
    renderCoaching(null);
    return;
  }
  state.lastJointErrors = analysis.jointErrors || {};
  renderPoseCard(analysis);
  renderMatches(analysis);
  renderRecommendation(analysis);
  renderCoaching(analysis.coaching);
}

/* ------------------------------------------------------------------ *
 * Game flow
 * ------------------------------------------------------------------ */
function updateGameHud() {
  const g = state.game;
  const playing = g && g.status === "playing";
  el.liveScreen.classList.toggle("game-active", playing);
  if (!playing) {
    el.gameStrip.hidden = true;
    el.targetChip.hidden = true;
    return;
  }

  el.gameStrip.hidden = false;
  el.targetChip.hidden = false;

  if (g.type === "rush") {
    el.gameTime.textContent = `${Math.ceil(g.timeLeft)}`;
    el.gameTime.parentElement.classList.toggle("urgent", g.timeLeft <= 10);
  } else {
    el.gameTime.textContent = g.stepLabel;
    el.gameTime.parentElement.classList.toggle("urgent", false);
  }
  el.gameScore.textContent = `${g.score}`;
  el.gameCombo.textContent = `×${g.combo}`;
  el.targetPoseName.textContent = g.target ? g.target.name : "—";
  el.holdFill.style.width = `${Math.round(g.progress * 100)}%`;
  el.targetChip.classList.toggle("done", g.progress >= 1);

  const label = el.gameTime.previousElementSibling;
  if (label) label.textContent = g.type === "rush" ? "Time" : "Step";
}

function showGameIntro() {
  const cfg = GAME_PRESETS[state.mode];
  if (!cfg) return;
  el.introEmoji.textContent = cfg.emoji;
  el.introTitle.textContent = cfg.label;
  el.introText.textContent = cfg.blurb;
  el.introStartBtn.textContent = "Start";
  hide(el.resultsOverlay);
  show(el.gameIntro);
}

function beginGame() {
  if (!isGameMode(state.mode)) return;
  const opts =
    state.mode === "flow" ? { flowName: state.flowName } : {};
  state.game = new PoseGame(state.mode, opts);
  state.game.start();
  state.gameLastTs = 0;
  hide(el.gameIntro);
  hide(el.resultsOverlay);
  updateGameHud();
  renderGestureBar();
  sfx.tap();
}

function handleGameEvent(ev) {
  if (ev.type === "grab") {
    sfx.grab();
  } else if (ev.type === "clear") {
    sfx.clear();
    if (ev.combo > 1) {
      toast(`+${ev.points} · ${ev.combo}× combo!`, "good");
    } else {
      toast(`+${ev.points} · ${ev.pose ? ev.pose.name : "Nice"}`, "good");
    }
  } else if (ev.type === "end") {
    endGame(ev.results);
  }
}

function endGame(results) {
  sfx.end();

  const prevHigh = state.stats.highScores[results.scoreKey] || 0;
  const isNewBest = results.score > 0 && results.score > prevHigh;

  state.stats = recordSession({
    score: results.score,
    combo: results.combo,
    cleared: results.cleared,
    durationMs: results.elapsedMs,
    scoreKey: results.scoreKey,
    mode: results.type,
    label: results.label,
  });

  const best = Math.max(prevHigh, results.score);

  el.resultEmoji.textContent = isNewBest ? "🏆" : results.emoji;
  el.resultTitle.textContent = isNewBest ? "New high score!" : "Nice flow!";
  el.resultSub.textContent =
    results.type === "flow"
      ? `You moved through ${results.cleared} of ${results.total} poses.`
      : `You cleared ${results.cleared} pose${results.cleared === 1 ? "" : "s"}.`;

  el.resultGrid.innerHTML = `
    <div class="rstat"><strong>${results.score}</strong><span>Score</span></div>
    <div class="rstat"><strong>${results.combo}×</strong><span>Best combo</span></div>
    <div class="rstat"><strong>${results.cleared}</strong><span>Cleared</span></div>`;
  el.resultBest.textContent = isNewBest
    ? "Saved as your best 🎉"
    : `Best ${results.scoreKey === "rush" ? "Rush" : "Flow"}: ${best}`;

  show(el.resultsOverlay);
  el.gameStrip.hidden = true;
  el.targetChip.hidden = true;
  renderQuickStats();
  renderGestureBar();
}

/* ------------------------------------------------------------------ *
 * Sheet / controls wiring
 * ------------------------------------------------------------------ */
function wireEvents() {
  // Generic delegated actions
  document.addEventListener("click", (e) => {
    const gestureEl = e.target.closest("[data-gesture]");
    if (gestureEl) {
      triggerGesture(gestureEl.dataset.gesture);
      return;
    }
    const modeEl = e.target.closest("[data-mode]");
    if (modeEl) {
      selectMode(modeEl.dataset.mode);
      return;
    }
    const screenEl = e.target.closest("[data-screen]");
    if (screenEl) {
      showScreen(screenEl.dataset.screen);
      return;
    }
    const poseEl = e.target.closest("[data-pose]");
    if (poseEl) {
      practiceThisPose(poseEl.dataset.pose);
      return;
    }
    const diffEl = e.target.closest("[data-difficulty]");
    if (diffEl) {
      state.difficulty = diffEl.dataset.difficulty;
      for (const b of el.difficultyFilter.querySelectorAll("[data-difficulty]")) {
        b.classList.toggle("active", b === diffEl);
      }
      renderLibrary();
      return;
    }
    const paneEl = e.target.closest("[data-pane]");
    if (paneEl) {
      setPane(paneEl.dataset.pane);
    }
  });

  el.brandBtn.addEventListener("click", () => showScreen("home"));
  el.backBtn.addEventListener("click", () => showScreen("home"));
  el.startBtn.addEventListener("click", () => startCamera());
  el.stopBtn.addEventListener("click", () => stopCamera());

  el.mirrorBtn.addEventListener("click", () => {
    state.mirror = !state.mirror;
    applyMirror();
  });

  el.flipBtn.addEventListener("click", () => switchCamera());

  el.gestureBtn.addEventListener("click", () => {
    state.gesture = !state.gesture;
    state.lastGestureTs = 0;
    if (state.gesture) {
      renderGestureBar();
      toast("🖐 Gesture control on — point & hold");
    } else {
      toast("Gesture control off");
    }
    updateGestureVisibility();
  });

  el.soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    el.soundBtn.textContent = state.sound ? "🔊" : "🔇";
    el.soundBtn.classList.toggle("sound-off", !state.sound);
    if (state.sound) sfx.tap();
  });

  el.sheetHandle.addEventListener("click", () => {
    el.liveSheet.classList.toggle("expanded");
  });

  el.introStartBtn.addEventListener("click", () => beginGame());
  el.introSkipBtn.addEventListener("click", () => {
    hide(el.gameIntro);
    selectMode("practice");
  });

  el.replayBtn.addEventListener("click", () => beginGame());
  el.resultsHomeBtn.addEventListener("click", () => {
    stopCamera();
    showScreen("home");
  });

  el.poseSelect.addEventListener("change", () => {
    state.practicePose =
      POSES.find((p) => p.name === el.poseSelect.value) || POSES[0];
    state.smoother.reset();
  });

  el.cyclePoseBtn.addEventListener("click", () => cyclePose());
  el.nextPoseBtn.addEventListener("click", () => cyclePose());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    } else if (state.running && !state.rafId) {
      state.lastFpsTs = performance.now();
      state.frames = 0;
      state.rafId = requestAnimationFrame(tick);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Init
 * ------------------------------------------------------------------ */
function init() {
  renderModeGrid();
  renderModeSwitch();
  renderQuickStats();
  populatePoseSelect();
  setPane("coach");
  wireEvents();
  updateModeChrome();
  setStatus("idle", "Idle");

  if (!window.isSecureContext) {
    showError(
      "Camera needs a secure context. Open via http://localhost (not a raw file path)."
    );
  }
}

init();

// Optional debug handle — only when explicitly requested with ?debug
if (new URLSearchParams(location.search).has("debug")) {
  window.__yoga = {
    state,
    mode: selectMode,
    screen: showScreen,
    beginGame,
    endGame,
    updateGameHud,
    renderGestureBar,
    updateGesture,
    updateGestureVisibility,
    landmarkToElement,
  };
}

// DrawingUtils is available for future official connectors
void DrawingUtils;
