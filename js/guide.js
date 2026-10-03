/**
 * Pose guide figures.
 *
 * Each pose is authored as a set of BlazePose landmark points in a normalised
 * 0..1 box (x right, y down). We can then:
 *   - draw a clean animated pictogram ("do this" picture), and
 *   - rigidly map the figure onto the user's body (hip + shoulder alignment)
 *     to use as a ghost overlay / directional target.
 *
 * Keys are MediaPipe Pose landmark indices.
 */
import { SKELETON_EDGES } from "./poses.js";

const HEAD_EDGES = [
  [0, 11],
  [0, 12],
];
const GUIDE_EDGES = [...SKELETON_EDGES, ...HEAD_EDGES];

export const POSE_GUIDES = {
  "Mountain Pose": {
    0: [0.5, 0.1],
    11: [0.44, 0.205],
    12: [0.56, 0.205],
    13: [0.425, 0.33],
    14: [0.575, 0.33],
    15: [0.42, 0.47],
    16: [0.58, 0.47],
    23: [0.465, 0.5],
    24: [0.535, 0.5],
    25: [0.465, 0.71],
    26: [0.535, 0.71],
    27: [0.465, 0.92],
    28: [0.535, 0.92],
  },
  "Raised Arms Pose": {
    0: [0.5, 0.1],
    11: [0.44, 0.21],
    12: [0.56, 0.21],
    13: [0.43, 0.13],
    14: [0.57, 0.13],
    15: [0.475, 0.035],
    16: [0.525, 0.035],
    23: [0.465, 0.5],
    24: [0.535, 0.5],
    25: [0.465, 0.71],
    26: [0.535, 0.71],
    27: [0.465, 0.92],
    28: [0.535, 0.92],
  },
  "Warrior II": {
    0: [0.5, 0.12],
    11: [0.42, 0.22],
    12: [0.58, 0.22],
    13: [0.27, 0.215],
    14: [0.73, 0.215],
    15: [0.12, 0.21],
    16: [0.88, 0.21],
    23: [0.44, 0.5],
    24: [0.56, 0.5],
    25: [0.3, 0.62],
    26: [0.6, 0.7],
    27: [0.2, 0.86],
    28: [0.63, 0.9],
  },
  "Warrior I": {
    0: [0.5, 0.11],
    11: [0.44, 0.21],
    12: [0.56, 0.21],
    13: [0.43, 0.12],
    14: [0.57, 0.12],
    15: [0.48, 0.03],
    16: [0.52, 0.03],
    23: [0.45, 0.5],
    24: [0.55, 0.5],
    25: [0.34, 0.63],
    26: [0.6, 0.71],
    27: [0.24, 0.8],
    28: [0.64, 0.92],
  },
  "Tree Pose": {
    0: [0.5, 0.1],
    11: [0.44, 0.2],
    12: [0.56, 0.2],
    13: [0.44, 0.32],
    14: [0.56, 0.32],
    15: [0.5, 0.25],
    16: [0.5, 0.25],
    23: [0.48, 0.5],
    24: [0.55, 0.5],
    25: [0.475, 0.71],
    26: [0.63, 0.55],
    27: [0.475, 0.92],
    28: [0.53, 0.55],
  },
  "Goddess Pose": {
    0: [0.5, 0.11],
    11: [0.42, 0.21],
    12: [0.58, 0.21],
    13: [0.28, 0.21],
    14: [0.72, 0.21],
    15: [0.27, 0.07],
    16: [0.73, 0.07],
    23: [0.43, 0.5],
    24: [0.57, 0.5],
    25: [0.28, 0.6],
    26: [0.72, 0.6],
    27: [0.16, 0.84],
    28: [0.84, 0.84],
  },
  "Chair Pose": {
    0: [0.5, 0.12],
    11: [0.44, 0.22],
    12: [0.56, 0.22],
    13: [0.43, 0.13],
    14: [0.57, 0.13],
    15: [0.47, 0.04],
    16: [0.53, 0.04],
    23: [0.46, 0.52],
    24: [0.54, 0.52],
    25: [0.42, 0.66],
    26: [0.58, 0.66],
    27: [0.4, 0.84],
    28: [0.6, 0.84],
  },
  "Downward Dog": {
    0: [0.19, 0.62],
    11: [0.3, 0.54],
    12: [0.32, 0.57],
    13: [0.22, 0.74],
    14: [0.24, 0.76],
    15: [0.12, 0.92],
    16: [0.14, 0.93],
    23: [0.55, 0.33],
    24: [0.57, 0.35],
    25: [0.68, 0.6],
    26: [0.7, 0.62],
    27: [0.83, 0.9],
    28: [0.85, 0.91],
  },
  "Warrior III": {
    0: [0.22, 0.4],
    11: [0.34, 0.42],
    12: [0.35, 0.44],
    13: [0.2, 0.42],
    14: [0.21, 0.44],
    15: [0.05, 0.42],
    16: [0.06, 0.44],
    23: [0.52, 0.48],
    24: [0.54, 0.49],
    25: [0.6, 0.7],
    26: [0.72, 0.44],
    27: [0.62, 0.92],
    28: [0.9, 0.4],
  },
  "Triangle Pose": {
    0: [0.4, 0.34],
    11: [0.45, 0.3],
    12: [0.43, 0.36],
    13: [0.3, 0.22],
    14: [0.56, 0.52],
    15: [0.22, 0.12],
    16: [0.66, 0.7],
    23: [0.48, 0.52],
    24: [0.52, 0.54],
    25: [0.38, 0.72],
    26: [0.66, 0.74],
    27: [0.28, 0.92],
    28: [0.78, 0.92],
  },
};

export function hasGuide(poseName) {
  return !!POSE_GUIDES[poseName];
}

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Rigidly map an authored guide onto the user's body.
 * @returns {Object<number,{x:number,y:number}>|null} mapped normalised points
 */
export function mapGuideToBody(poseName, landmarks, mirrored = false) {
  const g = POSE_GUIDES[poseName];
  if (!g || !landmarks) return null;
  const lh = landmarks[23];
  const rh = landmarks[24];
  const ls = landmarks[11];
  const rs = landmarks[12];
  if (!lh || !rh || !ls || !rs) return null;
  if ((lh.visibility ?? 1) < 0.3 || (ls.visibility ?? 1) < 0.3) return null;

  const uHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const uSh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const gHip = mid(g[23], g[24]);
  const gSh = mid(g[11], g[12]);

  const gTorso = Math.hypot(gSh[0] - gHip[0], gSh[1] - gHip[1]) || 1e-3;
  const uTorso = Math.hypot(uSh.x - uHip.x, uSh.y - uHip.y);
  if (uTorso < 1e-4) return null;
  const scale = uTorso / gTorso;
  const ang =
    Math.atan2(uSh.y - uHip.y, uSh.x - uHip.x) -
    Math.atan2(gSh[1] - gHip[1], gSh[0] - gHip[0]);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);

  const out = {};
  for (const key of Object.keys(g)) {
    const p = g[key];
    const dx = (p[0] - gHip[0]) * scale;
    const dy = (p[1] - gHip[1]) * scale;
    out[key] = {
      x: uHip.x + dx * cos - dy * sin,
      y: uHip.y + dx * sin + dy * cos,
    };
  }

  if (mirrored) {
    for (const [a, b] of MIRROR_PAIRS) {
      const tmp = out[a];
      out[a] = out[b];
      out[b] = tmp;
    }
  }
  return out;
}

const MIRROR_PAIRS = [
  [11, 12],
  [13, 14],
  [15, 16],
  [23, 24],
  [25, 26],
  [27, 28],
];

/**
 * Draw the clean animated pictogram into a canvas (the "do this" picture).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} poseName
 * @param {number} w
 * @param {number} h
 * @param {number} t time in ms
 * @param {string} color base colour
 */
export function drawGuideCard(ctx, poseName, w, h, t, color = "#2f9e63") {
  ctx.clearRect(0, 0, w, h);
  const g = POSE_GUIDES[poseName];
  if (!g) return false;

  const pad = Math.min(w, h) * 0.1;
  const sx = w - pad * 2;
  const sy = h - pad * 2;
  const map = (p) => [pad + p[0] * sx, pad + p[1] * sy];

  // Gentle breathing pulse.
  const pulse = 1 + Math.sin(t / 700) * 0.02;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(pulse, pulse);
  ctx.translate(-w / 2, -h / 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const drawEdges = (width, style, dash, offset) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.setLineDash(dash || []);
    ctx.lineDashOffset = offset || 0;
    for (const [i, j] of GUIDE_EDGES) {
      const a = g[i];
      const b = g[j];
      if (!a || !b) continue;
      const [ax, ay] = map(a);
      const [bx, by] = map(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  // Soft silhouette underlay.
  drawEdges(Math.max(8, w * 0.075), hexA(color, 0.16));
  // Flowing animated outline.
  drawEdges(Math.max(3, w * 0.028), color, [w * 0.07, w * 0.05], -(t / 42));

  // Joints.
  for (const key of Object.keys(g)) {
    const [x, y] = map(g[key]);
    const r = key === "0" ? w * 0.05 : w * 0.032;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();
  }

  ctx.restore();
  return true;
}

function hexA(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
