import {
  JOINT_DEFS,
  MIRROR_JOINTS,
  POSES,
  PROGRESSION,
} from "./poses.js";

function angle3(a, b, c) {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const na = Math.hypot(bax, bay);
  const nc = Math.hypot(bcx, bcy);
  if (na < 1e-6 || nc < 1e-6) return 0;
  let cos = (bax * bcx + bay * bcy) / (na * nc);
  cos = Math.min(1, Math.max(-1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * @param {Array<{x:number,y:number,visibility?:number}>} landmarks
 * @param {number} minVis
 */
export function computeAngles(landmarks, minVis = 0.4) {
  const angles = {};
  for (const [name, [ia, iv, ib]] of Object.entries(JOINT_DEFS)) {
    const a = landmarks[ia];
    const v = landmarks[iv];
    const b = landmarks[ib];
    if (!a || !v || !b) continue;
    const va = a.visibility ?? 1;
    const vv = v.visibility ?? 1;
    const vb = b.visibility ?? 1;
    if (va < minVis || vv < minVis || vb < minVis) continue;
    angles[name] = angle3(a, v, b);
  }
  return angles;
}

/**
 * Score live angles against a target pose.
 * delta = live - ideal  (positive = more open/straight than target)
 */
function scorePose(live, target, mirror = false) {
  const errors = {};
  const deltas = {}; // joint key as labeled on target → signed delta
  const liveKeys = {}; // target joint → which live key was used
  let total = 0;
  let count = 0;
  for (const [joint, ideal] of Object.entries(target)) {
    const key = mirror ? MIRROR_JOINTS[joint] : joint;
    if (!(key in live)) continue;
    const delta = live[key] - ideal;
    const err = Math.abs(delta);
    errors[joint] = err;
    deltas[joint] = delta;
    liveKeys[joint] = key;
    total += err;
    count += 1;
  }
  if (count === 0) return { score: 0, errors, deltas, liveKeys, mirrored: mirror };
  const avg = total / count;
  const score = Math.max(0, 100 * (1 - avg / 45));
  return { score, errors, deltas, liveKeys, mirrored: mirror };
}

export function matchPoses(liveAngles) {
  const results = POSES.map((pose) => {
    const s1 = scorePose(liveAngles, pose.angles, false);
    const s2 = scorePose(liveAngles, pose.angles, true);
    const best = s2.score > s1.score ? s2 : s1;
    return {
      pose,
      score: best.score,
      jointErrors: best.errors,
      jointDeltas: best.deltas,
      liveKeys: best.liveKeys,
      mirrored: best.mirrored,
    };
  });
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function recommendNext(best, matches) {
  if (!matches.length) return null;

  if (best && best.score >= 70) {
    const nextName = PROGRESSION[best.pose.name];
    if (nextName) {
      const found = matches.find((m) => m.pose.name === nextName);
      if (found) return found.pose;
    }
    const harder = matches.find(
      (m) =>
        m.pose.name !== best.pose.name &&
        m.pose.difficulty !== "beginner" &&
        best.pose.difficulty === "beginner"
    );
    if (harder) return harder.pose;
    return matches[1]?.pose ?? null;
  }

  const easy = matches.find((m) => m.pose.difficulty === "beginner");
  return easy?.pose ?? matches[0].pose;
}

const JOINT_LABEL = {
  left_elbow: "left elbow",
  right_elbow: "right elbow",
  left_shoulder: "left arm",
  right_shoulder: "right arm",
  left_hip: "left hip",
  right_hip: "right hip",
  left_knee: "left knee",
  right_knee: "right knee",
};

/**
 * Turn signed joint deltas into clear coaching instructions.
 * @param {object} match - result from matchPoses
 * @param {object} [opts]
 * @returns {{ cues: Array, summary: string, formLevel: string }}
 */
export function buildCoachingFeedback(match, opts = {}) {
  const minErr = opts.minError ?? 10; // degrees before we care
  const maxCues = opts.maxCues ?? 4;

  if (!match) {
    return {
      cues: [],
      summary: "Step fully into the frame so we can read your joints.",
      formLevel: "unknown",
      joints: [],
    };
  }

  const score = match.score;
  const deltas = match.jointDeltas || {};
  const errors = match.jointErrors || {};
  const poseTips = match.pose?.tips || [];

  // Rank joints by how far off they are
  const joints = Object.keys(errors)
    .map((joint) => ({
      joint,
      label: JOINT_LABEL[joint] || joint.replace(/_/g, " "),
      error: errors[joint],
      delta: deltas[joint] ?? 0,
      ideal: match.pose.angles[joint],
    }))
    .sort((a, b) => b.error - a.error);

  const off = joints.filter((j) => j.error >= minErr);

  if (score >= 88 || off.length === 0) {
    return {
      cues: [
        {
          priority: "good",
          title: "Great form",
          detail:
            "You’re close to the ideal shape. Hold steady, breathe evenly, and lengthen through the spine.",
          joint: null,
          error: 0,
        },
        ...poseTips.slice(0, 2).map((t) => ({
          priority: "tip",
          title: "Refine",
          detail: t,
          joint: null,
          error: 0,
        })),
      ],
      summary: "Solid alignment — keep holding and breathe.",
      formLevel: "excellent",
      joints,
    };
  }

  const cues = off.slice(0, maxCues).map((j, idx) => {
    const cue = cueForJoint(j.joint, j.delta, j.error);
    return {
      priority: idx === 0 ? "primary" : j.error >= 25 ? "high" : "medium",
      title: cue.title,
      detail: cue.detail,
      joint: j.joint,
      label: j.label,
      error: j.error,
      delta: j.delta,
    };
  });

  // Add one general pose tip if form is still rough
  if (score < 70 && poseTips[0]) {
    cues.push({
      priority: "tip",
      title: "Pose tip",
      detail: poseTips[0],
      joint: null,
      error: 0,
    });
  }

  const top = cues[0];
  let formLevel = "needs_work";
  if (score >= 75) formLevel = "good";
  else if (score >= 55) formLevel = "fair";

  const summary =
    formLevel === "good"
      ? `Almost there — focus on your ${top.label || "alignment"}.`
      : formLevel === "fair"
        ? `Main fix: ${top.title.toLowerCase()}.`
        : `Start with this: ${top.title.toLowerCase()}.`;

  return { cues, summary, formLevel, joints };
}

/**
 * Human coaching for one joint.
 * delta > 0 → joint is more open/straight than target
 * delta < 0 → joint is more bent/closed than target
 */
function cueForJoint(joint, delta, error) {
  const mag = error >= 30 ? "a lot" : error >= 18 ? "more" : "slightly";
  const side = joint.startsWith("left")
    ? "left"
    : joint.startsWith("right")
      ? "right"
      : "";

  const open = delta > 0; // more extended than ideal

  switch (joint) {
    case "left_knee":
    case "right_knee":
      if (open) {
        return {
          title: `Bend your ${side} knee ${mag}`,
          detail: `Your ${side} knee is too straight. Soften it (about ${Math.round(
            error
          )}° more bend) so it tracks over the ankle — avoid locking.`,
        };
      }
      return {
        title: `Straighten your ${side} knee ${mag}`,
        detail: `Your ${side} knee is bent too deeply. Press the heel down and extend the leg a bit (about ${Math.round(
          error
        )}°) without hyperextending.`,
      };

    case "left_elbow":
    case "right_elbow":
      if (open) {
        return {
          title: `Soften your ${side} elbow ${mag}`,
          detail: `That arm is locked too straight. Micro-bend the ${side} elbow so the joint stays soft and active.`,
        };
      }
      return {
        title: `Extend your ${side} arm ${mag}`,
        detail: `Your ${side} elbow is too bent. Reach longer through the fingertips and open the arm toward straight.`,
      };

    case "left_shoulder":
    case "right_shoulder":
      // shoulder angle uses elbow-shoulder-hip; larger ≈ arm more raised/overhead
      if (open) {
        return {
          title: `Lower your ${side} arm ${mag}`,
          detail: `Your ${side} arm is higher/more open than this pose needs. Bring it closer to the target shape (roughly ${Math.round(
            error
          )}°).`,
        };
      }
      return {
        title: `Lift your ${side} arm ${mag}`,
        detail: `Raise the ${side} arm — open the shoulder angle about ${Math.round(
          error
        )}° more toward the pose shape (often out to the side or overhead).`,
      };

    case "left_hip":
    case "right_hip":
      // larger hip angle ≈ more upright / less folded
      if (open) {
        return {
          title: `Fold at your ${side} hip ${mag}`,
          detail: `Hinge a bit more at the ${side} hip (deeper fold ~${Math.round(
            error
          )}°). Keep the spine long rather than rounding the back.`,
        };
      }
      return {
        title: `Open your ${side} hip ${mag}`,
        detail: `You’re folded too deep on the ${side}. Lift the torso a little or step the foot to open the hip angle ~${Math.round(
          error
        )}°.`,
      };

    default:
      return {
        title: `Adjust your ${JOINT_LABEL[joint] || joint}`,
        detail: `This joint is about ${Math.round(
          error
        )}° off the ideal. Move slowly toward the target shape and recheck the score.`,
      };
  }
}

/** Map joint name → landmark index (vertex) for coloring the skeleton */
export const JOINT_LANDMARK = {
  left_elbow: 13,
  right_elbow: 14,
  left_shoulder: 11,
  right_shoulder: 12,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
};

/** Simple exponential-ish smooth via rolling average */
export class ScoreSmoother {
  constructor(size = 10) {
    this.size = size;
    this.buf = [];
  }
  push(v) {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    return this.buf.reduce((a, b) => a + b, 0) / this.buf.length;
  }
  reset() {
    this.buf = [];
  }
}
