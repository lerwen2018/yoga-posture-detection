/**
 * Tiny localStorage-backed stats store. Everything stays on the device.
 */
const KEY = "yoga.stats.v1";

const DEFAULTS = {
  totalSessions: 0,
  totalTimeMs: 0,
  posesCleared: 0,
  bestCombo: 0,
  highScores: { rush: 0, flow: 0 },
  history: [],
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...clone(DEFAULTS),
      ...parsed,
      highScores: { ...DEFAULTS.highScores, ...(parsed.highScores || {}) },
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 30) : [],
    };
  } catch {
    return clone(DEFAULTS);
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* storage might be unavailable (private mode) */
  }
}

export function recordSession(patch) {
  const s = loadStats();
  s.totalSessions += 1;
  s.totalTimeMs += patch.durationMs || 0;
  s.posesCleared += patch.cleared || 0;
  s.bestCombo = Math.max(s.bestCombo, patch.combo || 0);
  if (patch.scoreKey && patch.score != null) {
    s.highScores[patch.scoreKey] = Math.max(
      s.highScores[patch.scoreKey] || 0,
      patch.score
    );
  }
  s.history.unshift({
    ts: Date.now(),
    mode: patch.mode || "auto",
    label: patch.label || patch.mode || "Session",
    score: patch.score || 0,
    cleared: patch.cleared || 0,
    durationMs: patch.durationMs || 0,
  });
  s.history = s.history.slice(0, 30);
  saveStats(s);
  return s;
}

export function resetStats() {
  const s = clone(DEFAULTS);
  saveStats(s);
  return s;
}
