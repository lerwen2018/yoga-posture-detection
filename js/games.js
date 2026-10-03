/**
 * Pose games — a small, framework-free state machine.
 *
 * Two game types:
 *   rush — beat the clock: hold each random pose long enough to score, with
 *          combo bonuses and time rewards.
 *   flow — follow a curated sequence ("Zen Flow") at your own pace.
 *
 * The engine is pure-ish: feed it the live match score each frame and it emits
 * events ({ grab, clear, end }). The DOM layer decides how to celebrate.
 */
import { POSES } from "./poses.js";

export const FLOW_PRESETS = {
  "Morning Flow": [
    "Mountain Pose",
    "Raised Arms Pose",
    "Chair Pose",
    "Downward Dog",
    "Warrior I",
    "Warrior II",
  ],
  "Power Flow": [
    "Goddess Pose",
    "Chair Pose",
    "Warrior I",
    "Warrior II",
    "Triangle Pose",
    "Warrior III",
  ],
  "Balance Flow": [
    "Mountain Pose",
    "Tree Pose",
    "Warrior III",
    "Triangle Pose",
    "Chair Pose",
  ],
};

export const GAME_PRESETS = {
  rush: {
    id: "rush",
    label: "Pose Rush",
    emoji: "⚡",
    blurb: "Beat the clock — hold each pose before time runs out.",
    durationMs: 60000,
    holdMs: 2200,
    threshold: 70,
    basePoints: 100,
    timeBonusPerSec: 6,
    addTimeMs: 2500,
    comboBonus: 20,
    maxComboBonus: 120,
    scoreKey: "rush",
  },
  flow: {
    id: "flow",
    label: "Zen Flow",
    emoji: "🧘",
    blurb: "Follow a calming sequence and keep your streak.",
    holdMs: 2800,
    threshold: 68,
    basePoints: 150,
    comboBonus: 25,
    maxComboBonus: 150,
    scoreKey: "flow",
    sequenceLength: 6,
  },
};

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickFlowSequence(name, length) {
  const names = FLOW_PRESETS[name] || FLOW_PRESETS["Morning Flow"];
  let poses = names.map((n) => POSES.find((p) => p.name === n)).filter(Boolean);
  if (length && length < poses.length) poses = poses.slice(0, length);
  return poses;
}

export class PoseGame {
  constructor(type, opts = {}) {
    this.type = type;
    this.cfg = { ...(GAME_PRESETS[type] || GAME_PRESETS.rush), ...opts };
    this.status = "idle"; // idle | playing | finished

    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.cleared = 0;
    this.holdMs = 0;
    this.elapsedMs = 0;
    this.timeLeftMs = this.cfg.durationMs ?? 0;

    this._onTarget = false;
    this._lastAccuracy = 0;

    if (type === "flow") {
      const seq =
        opts.sequence || pickFlowSequence(opts.flowName, this.cfg.sequenceLength);
      this.sequence = seq.length ? seq : [POSES[0]];
      this.index = 0;
    } else {
      this.pool = shuffle(POSES);
      this.poolIndex = 0;
    }
  }

  get target() {
    if (this.type === "flow") return this.sequence[this.index] || null;
    return this.pool[this.poolIndex] || null;
  }

  get next() {
    if (this.type === "flow") return this.sequence[this.index + 1] || null;
    return this.pool[this.poolIndex + 1] || null;
  }

  get progress() {
    const need = this.cfg.holdMs || 1;
    return Math.max(0, Math.min(1, this.holdMs / need));
  }

  get timeLeft() {
    return Math.max(0, this.timeLeftMs) / 1000;
  }

  get stepLabel() {
    if (this.type === "flow") {
      return `${Math.min(this.index + 1, this.sequence.length)} / ${
        this.sequence.length
      }`;
    }
    return `${this.cleared}`;
  }

  start() {
    this.status = "playing";
    this.startedAt = Date.now();
    return this.target;
  }

  /**
   * Advance one frame.
   * @param {number} liveScore score (0-100) against the current target pose
   * @param {number} dtMs milliseconds since last update
   * @returns {Array<object>} events
   */
  update(liveScore, dtMs) {
    const events = [];
    if (this.status !== "playing") return events;
    const dt = Math.max(0, Math.min(dtMs || 0, 300));
    this.elapsedMs += dt;
    if (this.type === "rush") this.timeLeftMs -= dt;

    const on = liveScore >= this.cfg.threshold;
    if (on) {
      this.holdMs += dt;
      this._lastAccuracy = liveScore;
      if (!this._onTarget) events.push({ type: "grab" });
    } else {
      this.holdMs = Math.max(0, this.holdMs - dt * 1.6);
    }
    this._onTarget = on;

    if (this.holdMs >= this.cfg.holdMs) {
      this.holdMs = 0;
      const range = Math.max(1, 100 - this.cfg.threshold);
      const accuracy = Math.max(
        0,
        Math.min(1, (this._lastAccuracy - this.cfg.threshold) / range)
      );
      let points = Math.round((this.cfg.basePoints || 100) * (1 + accuracy * 0.6));
      if (this.type === "rush") {
        points += Math.round(this.timeLeft * (this.cfg.timeBonusPerSec || 0));
      }
      points += Math.min(
        this.combo * (this.cfg.comboBonus || 0),
        this.cfg.maxComboBonus || 0
      );

      this.score += points;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.cleared += 1;
      events.push({ type: "clear", pose: this.target, points, combo: this.combo });

      if (this.type === "rush") {
        this.timeLeftMs += this.cfg.addTimeMs || 0;
        this._advancePool();
      } else {
        this.index += 1;
        if (this.index >= this.sequence.length) return this._finish(events);
      }
    }

    if (this.type === "rush" && this.timeLeftMs <= 0) {
      return this._finish(events);
    }
    return events;
  }

  _advancePool() {
    const prev = this.pool[this.poolIndex];
    this.poolIndex += 1;
    if (this.poolIndex >= this.pool.length) {
      this.pool = shuffle(POSES);
      this.poolIndex = 0;
    }
    if (this.pool.length > 1 && this.pool[this.poolIndex] === prev) {
      this.poolIndex = (this.poolIndex + 1) % this.pool.length;
    }
  }

  _finish(events) {
    this.status = "finished";
    events.push({ type: "end", results: this.results });
    return events;
  }

  get results() {
    return {
      type: this.type,
      label: this.cfg.label,
      emoji: this.cfg.emoji,
      scoreKey: this.cfg.scoreKey,
      score: this.score,
      combo: this.bestCombo,
      cleared: this.cleared,
      total: this.type === "flow" ? this.sequence.length : null,
      elapsedMs: this.elapsedMs,
    };
  }
}
