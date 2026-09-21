// app.js — Swish orchestrator: camera, recording, analysis, review, progress, drills.
import * as pose from "./pose.js";
import { LM } from "./pose.js";
import { analyzeShot } from "./analyze.js";
import * as store from "./store.js";
import { drillsByStage, getDrill } from "./drills.js";
import { coachLine, enhanceCoach, speak } from "./ai.js";
import { PERSONAS, getPersona, coachCue, PRINCIPLES, LINEAGE } from "./coaches.js";
import { PLANS, TRIAL_DAYS, entitlement, validateKey, formatKey, buyHref, SALES_EMAIL } from "./billing.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  facing: "environment",
  stream: null,
  recorder: null,
  chunks: [],
  recording: false,
  recTimer: null,
  liveRAF: null,
  settings: store.getSettings(),
  frames: null,
  report: null,
  reviewURL: null,
  activeDrill: null,
  poseWarm: false,
  reviewRAF: null,
};

/* ----------------- elements ----------------- */
const el = {
  views: $$(".view"),
  tabs: $$(".tab"),
  camFeed: $("#camFeed"),
  overlay: $("#overlay"),
  camPlaceholder: $("#camPlaceholder"),
  enableCamBtn: $("#enableCamBtn"),
  shootControls: $("#shootControls"),
  recordBtn: $("#recordBtn"),
  flipCamBtn: $("#flipCamBtn"),
  uploadBtn: $("#uploadBtn"),
  fileInput: $("#fileInput"),
  liveHud: $("#liveHud"),
  liveStatus: $("#liveStatus"),
  liveDot: $("#liveDot"),
  recHud: $("#recHud"),
  recTimer: $("#recTimer"),
  poseStatus: $("#poseStatus"),
  frameGuide: $("#frameGuide"),
  analyzingBar: $("#analyzingBar"),
  analyzingFill: $("#analyzingFill"),
  analyzingText: $("#analyzingText"),
  // analysis
  analysisEmpty: $("#analysisEmpty"),
  analysisContent: $("#analysisContent"),
  ringFg: $("#ringFg"),
  scoreVal: $("#scoreVal"),
  scoreGrade: $("#scoreGrade"),
  scoreSummary: $("#scoreSummary"),
  reviewVideo: $("#reviewVideo"),
  reviewOverlay: $("#reviewOverlay"),
  phaseChips: $("#phaseChips"),
  playBtn: $("#playBtn"),
  scrubber: $("#scrubber"),
  slowBtn: $("#slowBtn"),
  coachText: $("#coachText"),
  metricsList: $("#metricsList"),
  saveSessionBtn: $("#saveSessionBtn"),
  // progress
  statRow: $("#statRow"),
  trendChart: $("#trendChart"),
  historyList: $("#historyList"),
  progressSub: $("#progressSub"),
  // drills
  drillList: $("#drillList"),
  // settings
  settingsBtn: $("#settingsBtn"),
  settingsSheet: $("#settingsSheet"),
  closeSettings: $("#closeSettings"),
  setHand: $("#setHand"),
  setAngle: $("#setAngle"),
  setVoice: $("#setVoice"),
  setLiveSkel: $("#setLiveSkel"),
  setModel: $("#setModel"),
  setCoach: $("#setCoach"),
  setSeat: $("#setSeat"),
  coachBlurb: $("#coachBlurb"),
  toast: $("#toast"),
  // seats + roster (v2)
  whoChip: $("#whoChip"),
  whoName: $("#whoName"),
  tabRoster: $("#tabRoster"),
  rosterSub: $("#rosterSub"),
  rosterList: $("#rosterList"),
  trainerCodeVal: $("#trainerCodeVal"),
  copyCodeBtn: $("#copyCodeBtn"),
  addPlayerBtn: $("#addPlayerBtn"),
  importWeekBtn: $("#importWeekBtn"),
  onboardSheet: $("#onboardSheet"),
  onboardStep2: $("#onboardStep2"),
  onboardName: $("#onboardName"),
  onboardNameLbl: $("#onboardNameLbl"),
  onboardCode: $("#onboardCode"),
  onboardCodeField: $("#onboardCodeField"),
  onboardDone: $("#onboardDone"),
  handoffSheet: $("#handoffSheet"),
  handoffTitle: $("#handoffTitle"),
  handoffSub: $("#handoffSub"),
  handoffText: $("#handoffText"),
  handoffCopy: $("#handoffCopy"),
  handoffShare: $("#handoffShare"),
  handoffGo: $("#handoffGo"),
  planRow: $("#planRow"),
  planVal: $("#planVal"),
  planSheet: $("#planSheet"),
  planTitle: $("#planTitle"),
  planSub: $("#planSub"),
  planList: $("#planList"),
  licenseInput: $("#licenseInput"),
  licenseApply: $("#licenseApply"),
  planClose: $("#planClose"),
};

/* ----------------- nav ----------------- */
function switchView(name) {
  el.views.forEach(v => v.hidden = v.dataset.view !== name);
  el.tabs.forEach(t => t.classList.toggle("active", t.dataset.view === name));
  if (name === "shoot" && state.stream && !state.recording) { el.liveHud.hidden = false; startLiveTracking(); }
  else if (name !== "shoot") stopLiveTracking();
  if (name === "progress") renderProgress();
  if (name === "roster") renderRoster();
  if (name === "drills") renderDrills();
  if (name === "analysis" && state.report) drawReviewAt(el.reviewVideo.currentTime || 0);
}
el.tabs.forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));
$$("[data-goto]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.goto)));

/* ----------------- toast ----------------- */
let toastT;
function toast(msg, ms = 2600) {
  el.toast.textContent = msg; el.toast.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => el.toast.hidden = true, ms);
}

/* ----------------- camera ----------------- */
async function enableCamera() {
  el.enableCamBtn.disabled = true;
  el.enableCamBtn.textContent = "Starting…";
  const ok = await startStream();
  el.enableCamBtn.disabled = false;
  el.enableCamBtn.textContent = "Turn on camera";
  if (!ok) return;
  el.camPlaceholder.hidden = true;
  document.querySelector(".camera-stage")?.classList.add("live");
  el.shootControls.hidden = false;
  el.frameGuide.hidden = false;
  el.liveHud.hidden = false;
  setLiveStatus("searching", "loading coach…");
  await warmPose();
  startLiveTracking();
}
el.enableCamBtn.addEventListener("click", enableCamera);

async function startStream() {
  stopStream();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    console.warn(e);
    toast("Camera needs permission. Enable it for this site in your browser settings.");
    return false;
  }
  el.camFeed.srcObject = state.stream;
  el.camFeed.muted = true; el.camFeed.playsInline = true;
  try { await el.camFeed.play(); } catch {}
  return true;
}
function stopStream() {
  if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
}
el.flipCamBtn.addEventListener("click", async () => {
  if (state.recording) return;
  state.facing = state.facing === "environment" ? "user" : "environment";
  await startStream();
});

async function warmPose() {
  if (state.poseWarm) return true;
  try {
    el.poseStatus.textContent = "loading coach…";
    await pose.initPose({ runningMode: "VIDEO", model: state.settings.model });
    state.poseWarm = true;
    el.poseStatus.textContent = "ready";
    return true;
  } catch (e) {
    console.warn("pose warm failed", e);
    setLiveStatus("warn", "Couldn't load the coach — check your connection, then reopen.");
    return false;
  }
}

/* ----------------- live tracking + framing assistant ----------------- */
function setLiveStatus(cls, txt) {
  el.liveStatus.textContent = txt;
  el.liveHud.className = "live-hud " + cls;
}
function startLiveTracking() {
  if (state.liveRAF || !state.stream) return;
  const loop = () => {
    state.liveRAF = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - (state._lastDet || 0) < 40) return;      // ~25fps cap (plenty for framing)
    state._lastDet = now;
    if (!state.stream || el.camFeed.readyState < 2) return;
    let lm = null;
    if (state.poseWarm) { try { lm = pose.detectVideo(el.camFeed, now)?.landmarks?.[0] || null; } catch {} }
    drawSkeleton(el.overlay, el.camFeed, lm, "cover", state.liveHand);
    if (!state.recording) updateFraming(lm);
    else if (lm) feedShotDetector(lm);
  };
  state.liveRAF = requestAnimationFrame(loop);
}

// Real-time shot detector: watches the shooting wrist go from loaded (below the
// shoulder) up past the head (release), then come back down → registers the shot
// and stops recording after a short follow-through tail.
function feedShotDetector(lm) {
  if (state.shotCaught || !state.shotDet) return;
  const sd = state.shotDet;
  const hand = state.liveHand || "right";
  const wi = hand === "left" ? 15 : 16, si = hand === "left" ? 11 : 12;
  const w = lm[wi], s = lm[si], nose = lm[0];
  const okv = (p) => p && (p.visibility == null || p.visibility >= 0.5);
  if (!okv(w) || !okv(s)) return;
  if (w.y > s.y + 0.04) sd.wasLow = true;                  // wrist loaded below the shoulder
  const headY = okv(nose) ? nose.y : s.y - 0.12;
  const now = performance.now();
  if (sd.phase === "watch") {
    if (sd.wasLow && w.y < headY) {                        // came up over the head = release
      sd.phase = "up"; sd.peakT = now; sd.peakY = w.y;
      el.poseStatus.textContent = "shot captured";
    }
  } else if (sd.phase === "up") {
    if (w.y < sd.peakY) sd.peakY = w.y;
    if (w.y > s.y || now - sd.peakT > 900) {              // hand back down, or a beat after the peak
      state.shotCaught = true;
      const offset = (sd.peakT - state.recordStartT) / 1000;
      state.shotWindow = { from: Math.max(0, offset - 1.7), to: offset + 1.1 };  // just the shot
      setTimeout(() => { if (state.recording) stopRecord(); }, 350);            // tail for follow-through
    }
  }
}
function stopLiveTracking() {
  if (state.liveRAF) cancelAnimationFrame(state.liveRAF);
  state.liveRAF = null;
  clearCanvas(el.overlay);
}
function visOK(lm, i) { const p = lm[i]; return p && (p.visibility == null || p.visibility >= 0.5); }
function updateFraming(lm) {
  if (!state.poseWarm) { setLiveStatus("searching", "loading coach…"); return; }
  if (!lm) { setLiveStatus("searching", "Looking for you — step into the frame, good light"); return; }
  const head = visOK(lm, 0);
  const hips = visOK(lm, 23) || visOK(lm, 24);
  const feet = visOK(lm, 27) || visOK(lm, 28) || visOK(lm, 31) || visOK(lm, 32);
  const arm = (visOK(lm, 13) && visOK(lm, 15)) || (visOK(lm, 14) && visOK(lm, 16));
  const lw = lm[15], rw = lm[16];
  if (lw && rw && (lw.visibility ?? 1) > .3 && (rw.visibility ?? 1) > .3)
    state.liveHand = (rw.y < lw.y) ? "right" : "left";
  const hand = state.liveHand ? ` · ${state.liveHand}-handed` : "";
  if (head && hips && feet) setLiveStatus("ok", `Whole body in frame${hand} · record when ready`);
  else if ((arm || hips) && !feet) setLiveStatus("warn", "Back up so I can see your feet 👟");
  else if (!head) setLiveStatus("warn", "Step back — I need your head in frame too");
  else setLiveStatus("warn", "Get your whole body in the frame");
}

/* ----------------- record ----------------- */
function pickMime() {
  const cands = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  if (!("MediaRecorder" in window)) return null;
  for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {} }
  return "";
}
el.recordBtn.addEventListener("click", toggleRecord);

async function toggleRecord() {
  if (!state.stream) { toast("Turn on the camera first."); return; }
  if (state.recording) { stopRecord(); return; }

  const mime = pickMime();
  if (mime === null) { toast("Recording isn't supported here — use the upload button to analyze a clip instead."); return; }

  try {
    state.chunks = [];
    state.recorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
    state.recorder.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = onRecordStop;
    state.recorder.start();
  } catch (e) {
    console.warn(e);
    toast("Couldn't start recording — try the upload button instead.");
    return;
  }

  state.recording = true;
  state.shotCaught = false;
  state.shotWindow = null;
  state.shotDet = { phase: "watch", wasLow: false, peakT: 0, peakY: 1 };
  el.recordBtn.classList.add("recording");
  el.liveHud.hidden = true;            // recHud takes over while recording
  el.recHud.hidden = false;
  el.poseStatus.textContent = "watching for your shot…";
  startLiveTracking();                 // ensure the skeleton keeps drawing (idempotent)
  const t0 = performance.now();
  state.recordStartT = t0;
  el.recTimer.textContent = "0.0s";
  state.recTimer = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    el.recTimer.textContent = s.toFixed(1) + "s";
    if (s >= 30) {                      // hard safety cap if no shot is ever detected
      if (!state.shotCaught) toast("Didn't catch a shot — make sure I can see you, then try again.", 3800);
      stopRecord();
    }
  }, 100);
}

function stopRecord() {
  if (!state.recording) return;
  state.recording = false;
  clearInterval(state.recTimer);
  el.recordBtn.classList.remove("recording");
  el.recHud.hidden = true;
  try { state.recorder.stop(); } catch {}
}

async function onRecordStop() {
  if (!state.chunks.length) { toast("That clip came back empty — try recording again."); el.liveHud.hidden = false; return; }
  const blob = new Blob(state.chunks, { type: state.recorder.mimeType || "video/mp4" });
  state.chunks = [];
  loadClipForReview(blob);
}

/* ----------------- upload ----------------- */
el.uploadBtn.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", () => {
  const f = el.fileInput.files?.[0];
  if (f) loadClipForReview(f);
  el.fileInput.value = "";
});

/* ----------------- analysis pipeline ----------------- */
async function loadClipForReview(blobOrFile) {
  stopLiveTracking();                  // free the landmarker for the clip analysis
  el.liveHud.hidden = true;
  const win = state.shotWindow; state.shotWindow = null;   // analyze just the detected shot, if any
  state.reviewWindow = win || null;
  if (state.reviewURL) { URL.revokeObjectURL(state.reviewURL); state.reviewURL = null; }
  state.reviewURL = URL.createObjectURL(blobOrFile);
  el.reviewVideo.muted = true; el.reviewVideo.playsInline = true;
  el.reviewVideo.src = state.reviewURL;

  await new Promise((res, rej) => {
    el.reviewVideo.onloadedmetadata = () => res();
    el.reviewVideo.onerror = () => rej(new Error("decode"));
    setTimeout(res, 4000);
  }).catch(() => {});

  showAnalyzing(true, "Reading your shot…");
  try {
    await pose.initPose({ runningMode: "VIDEO", model: state.settings.model });
    state.poseWarm = true;
    const frames = await pose.analyzeClip(el.reviewVideo, {
      fps: 30, from: win?.from ?? 0, to: win?.to ?? null,
      onProgress: (p) => setAnalyzeProgress(p),
    });
    el.reviewVideo.currentTime = 0;
    const report = analyzeShot(frames, { view: state.settings.angle, hand: state.settings.hand });
    state.frames = frames;
    state.report = report;
    showAnalyzing(false);

    if (!report.ok) { toast(report.reason, 4600); backToShootLive(); return; }
    // only persist a clip with a solid read, so the trend isn't polluted by junk
    state.currentSessionId = null;
    if (report.metrics.length >= 3 && report.frameCount >= 12) {
      const rec = store.saveSession(report, { drill: state.activeDrill?.id || null });
      state.currentSessionId = rec?.id || null;
      if (!rec) toast(store.lastStorageError() || "Could not save that rep.", 4200);
      else if (store.lastStorageError()) toast(store.lastStorageError(), 4200);
    }
    renderAnalysis(report);
    switchView("analysis");
    const line = coachLine(report);
    speak(line);
    enhanceCoach(report).then(txt => { if (txt) el.scoreSummary.textContent = txt; });
  } catch (e) {
    console.error(e);
    showAnalyzing(false);
    toast("Something went wrong reading that clip. Try a shorter clip in good light.");
    backToShootLive();
  }
}

// return to a live, retryable Shoot screen after a failed/rejected analysis
function backToShootLive() {
  if (!state.stream) return;
  el.liveHud.hidden = false;
  startLiveTracking();
}

function showAnalyzing(on, text) {
  el.analyzingBar.hidden = !on;
  if (on) { el.analyzingText.textContent = text || "Analyzing…"; el.analyzingFill.style.width = "0%"; }
}
function setAnalyzeProgress(p) { el.analyzingFill.style.width = Math.round(p * 100) + "%"; }

/* ----------------- render analysis ----------------- */
function statusColor(s) { return s >= 80 ? "var(--good)" : s >= 55 ? "var(--warn)" : "var(--bad)"; }
const UNIT = { "°": "°", "%": "%", "×": "×", "t": " torso", "sw": " SW" };

function renderAnalysis(report) {
  el.analysisEmpty.hidden = true;
  el.analysisContent.hidden = false;

  // score ring
  const C = 2 * Math.PI * 52;
  el.ringFg.style.strokeDasharray = C;
  el.ringFg.style.strokeDashoffset = C * (1 - report.overall / 100);
  el.ringFg.style.stroke = statusColor(report.overall);
  el.scoreVal.textContent = report.overall;
  el.scoreGrade.textContent = report.grade;
  const dialed = report.metrics.filter(m => m.status === "good").length;
  const viewLabel = report.view === "45" ? "45°" : `${report.view}-on`;
  el.scoreSummary.textContent = `${report.hand} hand · ${viewLabel} · ${dialed}/${report.metrics.length} dialed in`;

  // coach card — persona voice + an attributed cue from a world-class coach
  const persona = getPersona(state.settings.coach);
  const avatar = el.coachText.parentElement.querySelector(".coach-avatar");
  if (avatar) avatar.textContent = persona.name.replace(/^The\s+/, "").charAt(0);
  const top = report.topFixes[0];
  const ec = top ? coachCue(top.key, persona.id) : null;
  let html = `<span class="coach-byline">${persona.name} · ${persona.role}</span>`;
  if (!report.legsSeen) html += `<span class="legs-note">Only your upper body was in frame — I scored that. Back up next time to add your legs &amp; balance.</span>`;
  html += mdBold(report.summary);
  if (ec) html += `<span class="metric-attrib"><b>${ec.from}:</b> “${ec.cue}”</span>`;
  el.coachText.innerHTML = html;

  // phase chips
  const phases = [
    ["Dip", report.phaseTimes.dip], ["Set point", report.phaseTimes.set],
    ["Release", report.phaseTimes.release], ["Follow-through", report.phaseTimes.follow],
  ];
  el.phaseChips.innerHTML = "";
  phases.forEach(([name, t]) => {
    const c = document.createElement("button");
    c.className = "phase-chip"; c.textContent = name; c.dataset.t = t ?? 0;
    c.addEventListener("click", () => { el.reviewVideo.pause(); seekReview(t ?? 0); });
    el.phaseChips.appendChild(c);
  });

  // metrics
  el.metricsList.innerHTML = "";
  report.metrics.forEach(m => el.metricsList.appendChild(metricEl(m)));

  // save button reflects whether this shot is actually in history
  if (state.currentSessionId) { el.saveSessionBtn.textContent = "Saved to history"; el.saveSessionBtn.disabled = true; }
  else { el.saveSessionBtn.textContent = "Save to history"; el.saveSessionBtn.disabled = false; }

  // first skeleton frame (start of the focused shot window)
  seekReview(reviewBounds().from);
}

function metricEl(m) {
  const wrap = document.createElement("div");
  wrap.className = "metric";
  const unit = UNIT[m.unit] ?? m.unit;
  const idealTxt = `ideal ${m.ideal[0]}–${m.ideal[1]}${unit}`;
  const conf = m.lowConf ? ` <span class="muted tiny">· read better from a ${m.confidence < 0.5 ? "front-on" : "side-on"} angle</span>` : "";
  const ec = m.status !== "good" ? coachCue(m.key, state.settings.coach) : null;
  const attrib = ec ? `<div class="metric-attrib"><b>${ec.from}:</b> “${ec.cue}”</div>` : "";
  wrap.innerHTML = `
    <div class="metric-top">
      <span class="metric-name">${m.label}${conf}</span>
      <span class="metric-val">${m.value}${unit} <span class="pill ${m.status}">${m.status === "good" ? "dialed" : m.status === "warn" ? "tune" : "fix"}</span></span>
    </div>
    <div class="metric-bar"><div class="metric-bar-fill bar-${m.status}" style="width:${m.score}%"></div></div>
    <div class="metric-cue">${mdBold(m.cue)} <span class="muted">(${idealTxt})</span></div>
    ${attrib}`;
  return wrap;
}
function mdBold(s) { return (s || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<b>$1</b>"); }

/* ----------------- review scrubbing + skeleton ----------------- */
function nearestFrame(t) {
  if (!state.frames) return null;
  let best = null, bd = Infinity;
  for (const f of state.frames) { const d = Math.abs(f.t - t); if (d < bd) { bd = d; best = f; } }
  return best;
}
function reviewBounds() {
  const dur = el.reviewVideo.duration || 1;
  const w = state.reviewWindow;
  let from = w ? Math.max(0, w.from) : 0;
  let to = w ? Math.min(dur, w.to) : dur;
  if (!(to > from)) { from = 0; to = dur; }
  return { from, to };
}
function seekReview(t) {
  if (!isFinite(t)) t = 0;
  el.reviewVideo.currentTime = t;
}
function drawReviewAt(t) {
  const f = nearestFrame(t);
  drawSkeleton(el.reviewOverlay, el.reviewVideo, f?.lm || null, "contain", state.report?.hand);
  // active phase chip
  const pt = state.report?.phaseTimes;
  if (pt) {
    const names = [["Dip", pt.dip], ["Set point", pt.set], ["Release", pt.release], ["Follow-through", pt.follow]];
    let active = 0, bd = Infinity;
    names.forEach(([, tt], i) => { const d = Math.abs((tt ?? 0) - t); if (d < bd) { bd = d; active = i; } });
    $$(".phase-chip", el.phaseChips).forEach((c, i) => c.classList.toggle("active", i === active));
  }
  // scrubber position (mapped to the focused shot window if one is set)
  const { from, to } = reviewBounds();
  el.scrubber.value = Math.round(((t - from) / ((to - from) || 1)) * 1000);
}
el.reviewVideo.addEventListener("seeked", () => drawReviewAt(el.reviewVideo.currentTime));
el.reviewVideo.addEventListener("timeupdate", () => { if (!el.reviewVideo.paused) drawReviewAt(el.reviewVideo.currentTime); });
el.scrubber.addEventListener("input", () => {
  el.reviewVideo.pause();
  const { from, to } = reviewBounds();
  seekReview(from + (el.scrubber.value / 1000) * (to - from));
});
el.playBtn.addEventListener("click", () => {
  if (el.reviewVideo.paused) { el.reviewVideo.play(); el.playBtn.textContent = "❚❚"; driveReview(); }
  else { el.reviewVideo.pause(); el.playBtn.textContent = "▶"; }
});
el.reviewVideo.addEventListener("ended", () => { el.playBtn.textContent = "▶"; });
function driveReview() {
  const loop = () => {
    if (el.reviewVideo.paused) return;
    drawReviewAt(el.reviewVideo.currentTime);
    state.reviewRAF = requestAnimationFrame(loop);
  };
  state.reviewRAF = requestAnimationFrame(loop);
}
let slow = false;
el.slowBtn.addEventListener("click", () => {
  slow = !slow;
  el.reviewVideo.playbackRate = slow ? 0.25 : 1;
  el.slowBtn.classList.toggle("on", slow);
  el.slowBtn.textContent = slow ? "0.25x" : "1x";
});

el.saveSessionBtn.addEventListener("click", () => {
  if (!state.report?.ok || state.currentSessionId) return;
  const rec = store.saveSession(state.report, { drill: state.activeDrill?.id || null });
  if (!rec) { toast(store.lastStorageError() || "Could not save that rep.", 4200); return; }
  state.currentSessionId = rec.id;
  el.saveSessionBtn.textContent = "Saved to history";
  el.saveSessionBtn.disabled = true;
});

/* ----------------- skeleton drawing ----------------- */
const CONN = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32],
  [15, 19], [16, 20], // hands
];
function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { cw: canvas.width, ch: canvas.height };
}
function clearCanvas(canvas) { const c = canvas.getContext("2d"); c && c.clearRect(0, 0, canvas.width, canvas.height); }
function contentRect(video, cw, ch, fit) {
  const vw = video.videoWidth || cw, vh = video.videoHeight || ch;
  const ar = vw / vh, car = cw / ch;
  let dw, dh;
  if (fit === "cover") { if (ar > car) { dh = ch; dw = ch * ar; } else { dw = cw; dh = cw / ar; } }
  else { if (ar > car) { dw = cw; dh = cw / ar; } else { dh = ch; dw = ch * ar; } }
  return { dw, dh, ox: (cw - dw) / 2, oy: (ch - dh) / 2 };
}
function drawSkeleton(canvas, video, lm, fit, hand) {
  const ctx = canvas.getContext("2d");
  const { cw, ch } = fitCanvas(canvas);
  ctx.clearRect(0, 0, cw, ch);
  if (!lm) return;
  const { dw, dh, ox, oy } = contentRect(video, cw, ch, fit);
  const P = (i) => { const p = lm[i]; const v = p && (p.v != null ? p.v : p.visibility); return (p && (v == null || v >= 0.4)) ? { x: ox + p.x * dw, y: oy + p.y * dh } : null; };
  const shoot = hand === "left"
    ? new Set([11, 13, 15, 19]) : new Set([12, 14, 16, 20]);

  ctx.lineWidth = Math.max(2, cw / 160);
  ctx.lineCap = "round";
  for (const [a, b] of CONN) {
    const pa = P(a), pb = P(b); if (!pa || !pb) continue;
    const hot = shoot.has(a) && shoot.has(b);
    ctx.strokeStyle = hot ? "rgba(255,106,43,.95)" : "rgba(255,255,255,.55)";
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  for (let i = 0; i < lm.length; i++) {
    const p = P(i); if (!p) continue;
    if (![0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(i)) continue;
    ctx.fillStyle = shoot.has(i) ? "var(--accent)" : "#fff";
    ctx.fillStyle = shoot.has(i) ? "#ff6a2b" : "#ffffff";
    ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth * 1.3, 0, 7); ctx.fill();
  }
}

/* ----------------- progress ----------------- */
function renderProgress() {
  const s = store.stats();
  const who = seatIsTrainer() ? (store.activePlayer()?.name || "Me") : null;
  const lead = who ? `${who} · ` : "";
  el.progressSub.textContent = s.count
    ? `${lead}${s.count} shot${s.count > 1 ? "s" : ""} logged · keep stacking reps.`
    : `${lead}Film the first shot to start tracking.`;
  mountSendWeek();
  const consistency = s.count > 1 ? Math.max(0, 100 - s.std * 4) : null;
  const stats = [
    ["Best", s.best || "—"],
    ["Average", s.avg || "—"],
    ["Shots", s.count || 0],
    ["Consistency", consistency == null ? "—" : consistency],
  ];
  el.statRow.innerHTML = stats.map(([l, n]) =>
    `<div class="stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join("");

  drawTrend(el.trendChart, s.trend);

  const sessions = store.getSessions().slice().reverse();
  el.historyList.innerHTML = sessions.length ? "" : `<p class="muted" style="padding:0 4px">No shots yet.</p>`;
  sessions.forEach(rec => {
    const item = document.createElement("div");
    item.className = "history-item";
    const pal = rec.overall >= 80 ? ["#2F7D5B", "rgba(47,125,91,.12)"]
      : rec.overall >= 55 ? ["#9A7212", "rgba(154,114,18,.12)"]
      : ["#A32430", "rgba(163,36,48,.1)"];
    item.innerHTML = `
      <div class="history-score" style="background:${pal[1]};color:${pal[0]}">${rec.overall}</div>
      <div class="history-meta">
        <div class="h-date">${fmtDate(rec.ts)} · ${rec.grade}</div>
        <div class="h-note">${rec.topFix ? "Work on: " + rec.topFix : "Clean stroke"}${rec.drill ? " · " + (getDrill(rec.drill)?.name || "") : ""}</div>
      </div>`;
    el.historyList.appendChild(item);
  });
}
function drawTrend(canvas, scores) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!scores || scores.length < 2) {
    ctx.fillStyle = "#6E645A"; ctx.font = `${13 * dpr}px Elza,-apple-system,sans-serif`;
    ctx.fillText("Need a couple more shots to chart a trend.", 10 * dpr, h / 2);
    return;
  }
  const pad = 14 * dpr;
  const min = Math.min(...scores) - 5, max = Math.max(...scores) + 5;
  const xs = (i) => pad + (i / (scores.length - 1)) * (w - 2 * pad);
  const ys = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  // area
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(142,22,32,.22)"); grad.addColorStop(1, "rgba(142,22,32,0)");
  ctx.beginPath(); ctx.moveTo(xs(0), ys(scores[0]));
  scores.forEach((v, i) => ctx.lineTo(xs(i), ys(v)));
  ctx.lineTo(xs(scores.length - 1), h - pad); ctx.lineTo(xs(0), h - pad); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // line
  ctx.beginPath(); ctx.moveTo(xs(0), ys(scores[0]));
  scores.forEach((v, i) => ctx.lineTo(xs(i), ys(v)));
  ctx.strokeStyle = "#8E1620"; ctx.lineWidth = 2.5 * dpr; ctx.lineJoin = "round"; ctx.stroke();
  // dots
  scores.forEach((v, i) => { ctx.beginPath(); ctx.arc(xs(i), ys(v), 3 * dpr, 0, 7); ctx.fillStyle = "#FBF8F2"; ctx.strokeStyle = "#8E1620"; ctx.lineWidth = 1.5 * dpr; ctx.fill(); ctx.stroke(); });
}

/* ----------------- drills ----------------- */
function renderDrills() {
  if (el.drillList.dataset.built) return;
  el.drillList.dataset.built = "1";
  el.drillList.innerHTML = "";

  // "trained on the greats" knowledge card
  const brain = document.createElement("div");
  brain.className = "brain-card";
  brain.innerHTML = `
    <h3>What the greats agree on</h3>
    <ul>${PRINCIPLES.slice(0, 5).map(p => `<li>${p}</li>`).join("")}</ul>
    <div class="brain-credits">${LINEAGE}</div>`;
  el.drillList.appendChild(brain);

  drillsByStage().forEach(stage => {
    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = `<h3>Stage ${stage.n} · ${stage.title}</h3>`;
    el.drillList.appendChild(head);
    const sub = document.createElement("p");
    sub.className = "muted tiny"; sub.style.padding = "0 0 6px"; sub.textContent = stage.blurb;
    el.drillList.appendChild(sub);
    stage.drills.forEach((d, i) => {
      const card = document.createElement("div");
      card.className = "drill-card";
      card.innerHTML = `
        <div class="drill-index">${String(i + 1).padStart(2, "0")}</div>
        <div class="drill-info">
          <h3>${d.name}</h3>
          <p>${d.purpose}</p>
          <div class="drill-meta">
            <span class="drill-tag lvl">${d.level}</span>
            <span class="drill-tag">${d.reps}</span>
          </div>
        </div>`;
      card.addEventListener("click", () => {
        state.activeDrill = d;
        toast(`Drill set: ${d.name}. Film a rep — I'll watch ${d.watch.toLowerCase()}`, 3600);
        switchView("shoot");
      });
      el.drillList.appendChild(card);
    });
  });
}

/* ----------------- settings ----------------- */
function populateCoachSelect() {
  if (el.setCoach.options.length) return;
  el.setCoach.innerHTML = PERSONAS.map(p => `<option value="${p.id}">${p.name} — ${p.role}</option>`).join("");
}
function syncSettingsUI() {
  const s = state.settings;
  populateCoachSelect();
  el.planVal.textContent = planLabel();
  el.setSeat.value = s.seat || "trainer";
  el.setCoach.value = s.coach;
  el.coachBlurb.textContent = getPersona(s.coach).style;
  el.setHand.value = s.hand; el.setAngle.value = s.angle;
  el.setVoice.checked = s.voice; el.setLiveSkel.checked = s.liveSkel; el.setModel.value = s.model;
}
el.settingsBtn.addEventListener("click", () => { syncSettingsUI(); el.settingsSheet.hidden = false; });
el.closeSettings.addEventListener("click", () => el.settingsSheet.hidden = true);
el.settingsSheet.addEventListener("click", (e) => { if (e.target === el.settingsSheet) el.settingsSheet.hidden = true; });

function bindSetting(elm, key, isCheck) {
  elm.addEventListener("change", () => {
    const val = isCheck ? elm.checked : elm.value;
    state.settings = store.setSettings({ [key]: val });
    if (key === "model") { state.poseWarm = false; toast("New model quality applies on your next shot."); }
    // hand/angle feed the engine directly — re-run analysis on the current shot
    if ((key === "hand" || key === "angle") && state.frames && state.report) {
      const report = analyzeShot(state.frames, { view: state.settings.angle, hand: state.settings.hand });
      if (!report.ok) { toast(report.reason, 4200); return; }
      state.report = report;
      if (state.currentSessionId) store.updateSession(state.currentSessionId, report, { drill: state.activeDrill?.id ?? null });
      renderAnalysis(report);
      toast(`Re-analyzed: ${report.hand} hand · ${state.settings.angle}-on`);
    }
  });
}
bindSetting(el.setHand, "hand");
bindSetting(el.setAngle, "angle");
bindSetting(el.setVoice, "voice", true);
bindSetting(el.setLiveSkel, "liveSkel", true);
bindSetting(el.setModel, "model");
bindSetting(el.setCoach, "coach");
el.setSeat.addEventListener("change", () => {
  state.settings = store.setSettings({ seat: el.setSeat.value });
  if (el.setSeat.value === "trainer") store.trainerCode();
  applySeat();
  toast(el.setSeat.value === "trainer" ? "Trainer seat on — your roster is in the Roster tab." : "Player seat on.");
});
el.setCoach.addEventListener("change", () => {
  el.coachBlurb.textContent = getPersona(el.setCoach.value).style;
  if (state.report) renderAnalysis(state.report);   // re-voice the open analysis
});

/* ----------------- lifecycle ----------------- */
function teardownForBackground() {
  if (state.recording) stopRecord();
  stopLiveTracking();
  el.liveHud.hidden = true;
  try { window.speechSynthesis?.cancel(); } catch {}
  state.cameraWasOn = !!state.stream;     // remember to relight on return
  stopStream();
  document.querySelector(".camera-stage")?.classList.remove("live");
  if (el.camFeed) el.camFeed.srcObject = null;
  pose.dispose();                          // iOS kills the GPU context when backgrounded
  state.poseWarm = false;
}
function resumeFromForeground() {
  const onShoot = !$('[data-view="shoot"]').hidden;
  if (state.cameraWasOn && onShoot) startStream().then(async ok => {
    if (ok) { el.liveHud.hidden = false; setLiveStatus("searching", "loading coach…"); await warmPose(); startLiveTracking(); }
  });
  state.cameraWasOn = false;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) teardownForBackground();
  else resumeFromForeground();
});
// iOS often uses pagehide (bfcache/app-switch) where visibilitychange is skipped
window.addEventListener("pagehide", teardownForBackground);
window.addEventListener("orientationchange", () => {
  if (state.report) setTimeout(() => drawReviewAt(el.reviewVideo.currentTime), 300);
});

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}


/* ============================================================
   SEATS · ROSTER · HAND-OFF  (v2)
   Swish is sold to the trainer. The trainer seat is a superset: it films the
   trainer's own reps exactly like the player seat, and adds a roster and a
   week log on top. The player seat is the free companion that sends a week
   back to the coach. There is no server, so a "code" is a handle and a
   hand-off, never a login — and the UI never claims otherwise.
   ============================================================ */

function seatIsTrainer() { return state.settings.seat === "trainer"; }

function applySeat() {
  const trainer = seatIsTrainer();
  el.tabRoster.hidden = !trainer;
  el.whoChip.hidden = !trainer;
  if (trainer) el.whoName.textContent = store.activePlayer()?.name || "Me";
  // a player seat should never be parked on a roster view
  if (!trainer && !$('[data-view="roster"]').hidden) switchView("shoot");
  renderProgressSubtitle();
}

function renderProgressSubtitle() {
  const who = seatIsTrainer() ? (store.activePlayer()?.name || "Me") : null;
  el.progressSub.dataset.who = who || "";
}

/* ---------------- who is shooting ---------------- */
el.whoChip?.addEventListener("click", () => switchView("roster"));

/* ---------------- onboarding ---------------- */
let pendingSeat = "trainer";
function openOnboarding() {
  el.onboardStep2.hidden = true;
  $$(".seat-card").forEach(c => c.classList.remove("sel"));
  el.onboardSheet.hidden = false;
}
$$(".seat-card").forEach(card => card.addEventListener("click", () => {
  pendingSeat = card.dataset.seat;
  $$(".seat-card").forEach(c => c.classList.toggle("sel", c === card));
  el.onboardStep2.hidden = false;
  el.onboardCodeField.hidden = pendingSeat !== "player";
  el.onboardNameLbl.textContent = pendingSeat === "trainer" ? "Your name" : "Your name";
  el.onboardName.focus();
}));
el.onboardDone?.addEventListener("click", () => {
  const name = (el.onboardName.value || "").trim() || (pendingSeat === "trainer" ? "Me" : "Me");
  const first = store.getPlayers()[0];
  if (first) store.renamePlayer(first.id, name);
  const patch = { seat: pendingSeat, onboarded: true, activePlayer: first?.id || "" };
  if (pendingSeat === "player") {
    const code = store.normalizeCode(el.onboardCode.value);
    if (code) patch.joinedCode = code;
  } else {
    store.trainerCode();
  }
  state.settings = store.setSettings(patch);
  el.onboardSheet.hidden = true;
  applySeat();
  toast(pendingSeat === "trainer" ? "Roster ready. Add your players from the Roster tab." : "You are set. Film a rep.", 3600);
});

/* ---------------- roster ---------------- */
function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

function renderRoster() {
  el.trainerCodeVal.textContent = store.trainerCode();
  renderPaywall();
  const rows = store.weekLog(7);
  const active = store.activePlayerId();
  const totalShots = rows.reduce((a, r) => a + r.shots, 0);
  el.rosterSub.textContent = totalShots
    ? `${totalShots} shot${totalShots === 1 ? "" : "s"} logged across ${rows.filter(r => r.shots).length} of ${rows.length} players this week.`
    : "The week in one log. No film to watch.";

  el.rosterList.innerHTML = "";
  rows.forEach(r => {
    const card = document.createElement("div");
    card.className = "roster-card";
    const deltaChip = r.delta == null ? ""
      : `<span class="rchip ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}">${r.delta > 0 ? "+" : ""}${r.delta} vs last week</span>`;
    const quiet = r.shots === 0
      ? `<span class="rchip quiet">${r.total ? "nothing this week" : "no reps yet"}</span>` : "";
    card.innerHTML = `
      <div class="roster-top">
        <div class="roster-avatar">${initials(r.name)}</div>
        <div class="roster-name">${escapeHTML(r.name)}${r.id === active ? ' <span class="muted tiny">· shooting</span>' : ""}</div>
        <div class="roster-avg">${r.avg ?? "—"}<small>${r.avg != null ? " avg" : ""}</small></div>
      </div>
      <div class="roster-meta">
        <span class="rchip">${r.shots} shot${r.shots === 1 ? "" : "s"}</span>
        <span class="rchip">${r.days} day${r.days === 1 ? "" : "s"}</span>
        ${r.best != null ? `<span class="rchip">${r.best} best</span>` : ""}
        ${deltaChip}${quiet}
      </div>
      ${r.topFix ? `<div class="roster-fix">Work on: <b>${escapeHTML(r.topFix)}</b></div>` : ""}
      <div class="roster-btns">
        <button class="btn ghost" data-act="shoot">Film them</button>
        <button class="btn ghost" data-act="progress">Their trend</button>
        <button class="btn ghost subtle" data-act="remove">Remove</button>
      </div>`;
    card.querySelector('[data-act="shoot"]').addEventListener("click", () => {
      store.setActivePlayer(r.id); state.settings = store.getSettings();
      applySeat(); toast(`Filming ${r.name}. Every rep lands on their log.`); switchView("shoot");
    });
    card.querySelector('[data-act="progress"]').addEventListener("click", () => {
      store.setActivePlayer(r.id); state.settings = store.getSettings();
      applySeat(); switchView("progress");
    });
    card.querySelector('[data-act="remove"]').addEventListener("click", () => {
      if (!confirm(`Remove ${r.name} and their ${r.total} saved rep${r.total === 1 ? "" : "s"}? This cannot be undone.`)) return;
      store.removePlayer(r.id); state.settings = store.getSettings(); applySeat(); renderRoster();
    });
    el.rosterList.appendChild(card);
  });
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

el.addPlayerBtn?.addEventListener("click", () => {
  const e = ent();
  if (!e.licensed && e.plan === "free" && store.getPlayers().length >= PLANS.free.players) {
    renderPaywall(); openPlan(); return;
  }
  if (store.getPlayers().length >= e.players) { openPlan(); return; }
  const name = prompt("Player's name");
  if (name == null) return;
  const p = store.addPlayer(name);
  store.setActivePlayer(p.id);
  state.settings = store.getSettings();
  applySeat(); renderRoster();
  toast(`${p.name} added. Reps land on their log until you switch.`);
});

el.copyCodeBtn?.addEventListener("click", async () => {
  const code = store.trainerCode();
  const ok = await copyText(`My Swish coach code is ${code}. Install Swish at ${location.origin}${location.pathname}, pick "I am the one shooting", and put my code in.`);
  toast(ok ? "Code copied — send it to a player." : `Your code is ${code}`, 3600);
});

/* ---------------- hand-off ---------------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  }
}

let handoffMode = "send";
function openHandoffSend() {
  handoffMode = "send";
  const rep = store.weekReport(7);
  if (!rep.count) { toast("No saved reps in the last 7 days yet."); return; }
  el.handoffTitle.textContent = "Send your week to your coach";
  el.handoffSub.textContent = `${rep.count} rep${rep.count === 1 ? "" : "s"} · ${rep.avg} average. Numbers only, no video.`;
  el.handoffText.value = rep.text;
  el.handoffText.readOnly = true;
  el.handoffShare.hidden = !navigator.share;
  el.handoffCopy.hidden = false;
  el.handoffGo.textContent = "Done";
  el.handoffSheet.hidden = false;
}
function openHandoffImport() {
  handoffMode = "import";
  el.handoffTitle.textContent = "Paste a player's week";
  el.handoffSub.textContent = "Paste the whole message they sent you. It merges into their row and never double-counts.";
  el.handoffText.value = "";
  el.handoffText.readOnly = false;
  el.handoffShare.hidden = true;
  el.handoffCopy.hidden = true;
  el.handoffGo.textContent = "Load it";
  el.handoffSheet.hidden = false;
  setTimeout(() => el.handoffText.focus(), 80);
}
el.importWeekBtn?.addEventListener("click", openHandoffImport);
el.handoffCopy?.addEventListener("click", async () => {
  toast(await copyText(el.handoffText.value) ? "Copied. Send it to your coach." : "Select the text and copy it.", 3200);
});
el.handoffShare?.addEventListener("click", async () => {
  try { await navigator.share({ title: "My Swish week", text: el.handoffText.value }); } catch {}
});
el.handoffGo?.addEventListener("click", () => {
  if (handoffMode === "send") { el.handoffSheet.hidden = true; return; }
  const res = store.importHandoff(el.handoffText.value);
  if (!res.ok) { toast(res.reason, 4200); return; }
  el.handoffSheet.hidden = true;
  state.settings = store.getSettings();
  renderRoster(); applySeat();
  toast(res.added
    ? `${res.player.name}: ${res.added} rep${res.added === 1 ? "" : "s"} loaded${res.skipped ? `, ${res.skipped} already here` : ""}.`
    : `${res.player.name}: nothing new in that one.`, 4200);
});
el.handoffSheet?.addEventListener("click", (e) => { if (e.target === el.handoffSheet) el.handoffSheet.hidden = true; });
el.onboardSheet?.addEventListener("click", (e) => { /* modal on purpose: no dismiss */ });

/* ---------------- the week, sent (the report that leaves the app) ----------------
   Numbers only: a readable week plus a paste-able payload. A player sends it to
   their coach; a trainer sends a parent the month their kid actually had. */
function mountSendWeek() {
  const host = el.progressSub.parentElement;
  let btn = host.querySelector("#sendWeekBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "sendWeekBtn";
    btn.className = "btn ghost";
    btn.style.cssText = "margin-top:12px;width:100%";
    btn.addEventListener("click", openHandoffSend);
    host.appendChild(btn);
  }
  const who = seatIsTrainer() ? (store.activePlayer()?.name || "this player") : null;
  btn.textContent = who ? `Share ${who}'s week` : "Send my week to my coach";
  btn.hidden = store.stats().count === 0;
}

/* ---------------- the plan: how a trainer actually buys this ----------------
   No card is handled in this app. The buy button opens a hosted checkout (or an
   email while that link is being set up), and the key that comes back unlocks
   the roster offline. Nothing here pretends a purchase happened. */
function ent() { return entitlement(state.settings); }

function planLabel() {
  const e = ent();
  if (e.licensed) return e.name;
  if (e.plan === "trial") return `Trial · ${e.trialDaysLeft}d left`;
  return "Solo (free)";
}

function renderPlanSheet() {
  const e = ent();
  el.planTitle.textContent = e.licensed ? `${e.name} plan` : e.plan === "trial" ? "You are on the trial" : "Choose your plan";
  el.planSub.textContent = e.licensed
    ? `Up to ${e.players === Infinity ? "unlimited" : e.players} players. Thank you.`
    : e.plan === "trial"
      ? `${e.trialDaysLeft} day${e.trialDaysLeft === 1 ? "" : "s"} left of the full roster. After that Swish keeps working for you and three players.`
      : `Swish still works for you and ${PLANS.free.players} players. A plan opens the rest of the roster.`;

  el.planList.innerHTML = "";
  Object.entries(PLANS).forEach(([id, plan]) => {
    const card = document.createElement("div");
    const current = e.licensed ? e.plan === id : id === "free";
    card.className = "plan-card" + (current ? " current" : "");
    card.innerHTML = `
      <div class="plan-info">
        <div class="plan-name">${plan.name}${current ? ' <span class="muted tiny">· current</span>' : ""}</div>
        <div class="plan-blurb">${plan.blurb}</div>
      </div>
      <div class="plan-price">${plan.price}</div>`;
    if (id !== "free" && !(e.licensed && e.plan === id)) {
      const buy = document.createElement("a");
      buy.className = "plan-buy";
      buy.href = buyHref(id);
      buy.target = "_blank"; buy.rel = "noopener";
      buy.textContent = "Get it";
      card.appendChild(buy);
    }
    el.planList.appendChild(card);
  });
}
function openPlan() { renderPlanSheet(); el.licenseInput.value = formatKey(state.settings.licenseKey); el.planSheet.hidden = false; }
el.planRow?.addEventListener("click", openPlan);
el.planClose?.addEventListener("click", () => { el.planSheet.hidden = true; syncSettingsUI(); });
el.planSheet?.addEventListener("click", (e) => { if (e.target === el.planSheet) { el.planSheet.hidden = true; syncSettingsUI(); } });
el.licenseApply?.addEventListener("click", () => {
  const raw = el.licenseInput.value;
  const plan = validateKey(raw);
  if (!plan) { toast("That key did not check out. Check it against the email, or write to " + SALES_EMAIL + ".", 5200); return; }
  state.settings = store.setSettings({ licenseKey: raw.toUpperCase().replace(/[^A-Z0-9]/g, "") });
  renderPlanSheet(); syncSettingsUI(); renderRoster();
  toast(`${PLANS[plan].name} unlocked. Full roster is open.`, 4200);
});

function renderPaywall() {
  const e = ent();
  const count = store.getPlayers().length;
  const host = el.rosterList.parentElement;
  let card = host.querySelector("#paywallCard");
  const needed = !e.licensed && e.plan !== "trial" && count >= PLANS.free.players;
  const soon = !e.licensed && e.plan === "trial" && e.trialDaysLeft <= 5;
  if (!needed && !soon) { card?.remove(); return; }
  if (!card) {
    card = document.createElement("div");
    card.id = "paywallCard";
    card.className = "paywall";
    host.insertBefore(card, el.rosterList);
  }
  card.innerHTML = needed
    ? `<h3>Your roster is full</h3>
       <p>The free seat holds you plus ${PLANS.free.players} players. ${PLANS.pro.name} opens ${PLANS.pro.players} of them and the full week log for ${PLANS.pro.price}.</p>
       <a class="btn primary" href="${buyHref("pro")}" target="_blank" rel="noopener">Get ${PLANS.pro.name} · ${PLANS.pro.price}</a>`
    : `<h3>${e.trialDaysLeft} day${e.trialDaysLeft === 1 ? "" : "s"} left on the trial</h3>
       <p>Keep the full roster and the week log for ${PLANS.pro.price}. Your players never pay anything.</p>
       <a class="btn primary" href="${buyHref("pro")}" target="_blank" rel="noopener">Keep the roster</a>`;
}

/* ---------------- a failure should say so, not go black ---------------- */
function reportFatal(err) {
  console.error("[Swish]", err);
  try { toast("Something broke on that step. Nothing was lost — try again.", 5000); } catch {}
}
window.addEventListener("error", (e) => reportFatal(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => reportFatal(e.reason));

/* boot */
store.stampInstall();
const migration = store.migrate();
if (migration.moved) console.log(`[Swish] migrated ${migration.moved} shots into the roster`);
state.settings = store.getSettings();
syncSettingsUI();
applySeat();
switchView("shoot");
if (!state.settings.onboarded) openOnboarding();
console.log("[Swish] ready · seat:", state.settings.seat || "unset");

/* dev-only hook for headless verification (no-op in normal use) */
if (["localhost", "127.0.0.1", "0.0.0.0"].includes(location.hostname)) {
  window.__swishDev = {
    render(report, frames = []) { state.frames = frames; state.report = report; renderAnalysis(report); switchView("analysis"); },
  };
}
