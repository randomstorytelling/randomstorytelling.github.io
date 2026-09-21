// pose.js — MediaPipe Pose Landmarker wrapper (runs fully on-device)
// Pinned to 0.10.35: a version-mismatched WASM dir is the #1 silent slowdown.
import { FilesetResolver, PoseLandmarker, DrawingUtils }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODELS = {
  lite:  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  full:  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
};

// 33-landmark indices we care about
export const LM = {
  NOSE:0,
  L_EYE:2, R_EYE:5,
  L_SHO:11, R_SHO:12,
  L_ELB:13, R_ELB:14,
  L_WRI:15, R_WRI:16,
  L_PINKY:17, R_PINKY:18,
  L_INDEX:19, R_INDEX:20,
  L_THUMB:21, R_THUMB:22,
  L_HIP:23, R_HIP:24,
  L_KNE:25, R_KNE:26,
  L_ANK:27, R_ANK:28,
  L_HEEL:29, R_HEEL:30,
  L_FOOT:31, R_FOOT:32,
};

let landmarker = null;
let curMode = null;
let curModel = null;
let lastTs = 0;                              // shared monotonic clock for the single instance
function safeTs(ms) { const t = ms > lastTs ? ms : lastTs + 1; lastTs = t; return t; }
export function resetClock() { lastTs = 0; }

export async function initPose({ model = "full", runningMode = "VIDEO" } = {}) {
  if (landmarker && curMode === runningMode && curModel === model) return landmarker;
  if (landmarker) { try { landmarker.close(); } catch {} landmarker = null; }

  const vision = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate) => PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODELS[model] ?? MODELS.full, delegate },
    runningMode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });

  try {
    landmarker = await make("GPU");
  } catch (e) {
    console.warn("[pose] GPU delegate failed, falling back to CPU", e);
    landmarker = await make("CPU");
  }
  curMode = runningMode;
  curModel = model;
  return landmarker;
}

// Tear the landmarker down (iOS discards the GPU context on backgrounding;
// the next initPose rebuilds fresh from the CDN-cached model).
export function dispose() {
  if (landmarker) { try { landmarker.close(); } catch {} }
  landmarker = null; curMode = null; curModel = null; lastTs = 0;
}

// Live camera frame
export function detectVideo(video, tsMs) {
  if (!landmarker) return null;
  try { return landmarker.detectForVideo(video, safeTs(Math.round(tsMs))); }
  catch (e) { console.warn("[pose] live detect failed", e); return null; }
}

// Run pose over a recorded clip and return the frames around ONE shot.
//
// The cost of this used to scale with the length of the clip: a fixed 1/fps
// step across the whole thing meant a 30s recording ran 900 seek-and-detect
// passes, and a clip picked from the camera roll had no ceiling at all. On a
// phone that is a freeze with a progress bar in front of it.
//
// It is now two passes and a hard budget, so cost is flat no matter how long
// the clip is:
//   1. LOCATE  a coarse scan (COARSE_FPS, at most COARSE_MAX frames) finds the
//              release, the frame where a wrist is highest above the head.
//   2. READ    a dense scan at `fps` over that release, plus/minus WINDOW_PAD.
// A caller that already knows the window (the live detector caught the shot)
// skips pass 1. Either way the dense pass is capped at DENSE_MAX frames.
//
// Returns [{ t, lm:[{x,y,z,visibility}], world:[{x,y,z}] }, ...]
// onProgress(0..1) for the UI bar.
const COARSE_FPS = 8;      // enough to see a wrist cross the head
const COARSE_MAX = 120;    // ~15s of coarse scan, whatever the clip's length
const DENSE_MAX  = 110;    // ~3.6s at 30fps, the most any one shot needs
const WINDOW_PAD = { before: 1.7, after: 1.1 };   // matches the live detector

export async function analyzeClip(video, { fps = 30, onProgress, from = 0, to = null } = {}) {
  await initPose({ runningMode: "VIDEO", model: curModel || "full" });
  resetClock();                               // fresh ~33ms deltas for this clip, untainted by the live loop
  const frames = [];
  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) throw new Error("Clip has no duration");

  // optional window — analyze only around the detected shot (keeps long clips fast)
  const start = Math.max(0, from);
  const end = (to != null && to > start) ? Math.min(to, duration) : duration;
  const span = (end - start) || 1;


  // Seek + wait. Short-circuits same-value seeks (a fresh <video> at 0 fires no
  // 'seeked' for seekTo(0) → would deadlock) and races a timeout so a missing
  // 'seeked' on iOS drops one frame instead of hanging the whole analysis.
  const seekTo = (t) => new Promise((res) => {
    const target = Math.min(t, duration - 0.001);
    if (Math.abs(video.currentTime - target) < 1e-3) { res(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); video.removeEventListener("seeked", onSeek); res(); };
    const onSeek = () => finish();
    const timer = setTimeout(finish, 400);
    video.addEventListener("seeked", onSeek);
    video.currentTime = target;
  });

  video.pause();

  // One sweep. `budget` caps the frame count, so the step widens on a long
  // span instead of the pass getting longer.
  const sweep = async (a, b, wantFps, budget, report) => {
    const out = [];
    const width = Math.max(b - a, 1 / wantFps);
    const step = Math.max(1 / wantFps, width / budget);
    for (let t = a; t <= b; t += step) {
      await seekTo(t);
      const tsMs = safeTs(Math.round(video.currentTime * 1000));

      let result = null;
      try { result = landmarker.detectForVideo(video, tsMs); } catch (e) { /* skip frame */ }

      const lm = result?.landmarks?.[0] || null;
      const world = result?.worldLandmarks?.[0] || null;
      out.push({
        t: video.currentTime,
        lm: lm ? lm.map(p => ({ x: p.x, y: p.y, z: p.z, v: p.visibility })) : null,
        world: world ? world.map(p => ({ x: p.x, y: p.y, z: p.z })) : null,
      });
      if (report) report(Math.min(1, (t - a) / width));
    }
    return out;
  };

  // Where the ball leaves the hand: the frame whose higher wrist sits highest
  // on screen (smallest y), preferring frames where it is above the head. Both
  // wrists are considered, so handedness is never assumed here.
  const releaseTime = (fr) => {
    let best = null, bestY = Infinity, bestOverHead = false;
    for (const f of fr) {
      const lm = f.lm;
      if (!lm) continue;
      const vis = (p) => p && (p.visibility == null || p.visibility >= 0.5);
      const wrists = [lm[15], lm[16]].filter(vis);
      if (!wrists.length) continue;
      const w = wrists.reduce((hi, p) => (p.y < hi.y ? p : hi));
      const head = vis(lm[0]) ? lm[0].y : null;
      const overHead = head != null && w.y < head;
      if ((overHead && !bestOverHead) || ((overHead === bestOverHead) && w.y < bestY)) {
        best = f.t; bestY = w.y; bestOverHead = overHead;
      }
    }
    return best;
  };

  const windowGiven = to != null && to > start;
  let a = start, b = end;

  if (!windowGiven && span > 4) {
    // LOCATE. A fifth of the bar; the dense read is the part worth waiting on.
    const coarse = await sweep(start, end, COARSE_FPS, COARSE_MAX,
      onProgress ? (p) => onProgress(p * 0.2) : null);
    const rel = releaseTime(coarse);
    if (rel != null) {
      a = Math.max(start, rel - WINDOW_PAD.before);
      b = Math.min(end, rel + WINDOW_PAD.after);
    } else {
      // No shot found anywhere. Read the tail rather than the whole clip: a
      // person filming themselves ends the recording after the shot.
      a = Math.max(start, end - (WINDOW_PAD.before + WINDOW_PAD.after));
      b = end;
    }
  }

  const dense = await sweep(a, b, fps, DENSE_MAX,
    onProgress ? (p) => onProgress((windowGiven || span <= 4) ? p : 0.2 + p * 0.8) : null);
  frames.push(...dense);

  if (onProgress) onProgress(1);
  return frames;
}

// thin re-export so app.js can draw without re-importing the CDN module
export function makeDrawer(ctx) {
  return new DrawingUtils(ctx);
}
export { PoseLandmarker };
