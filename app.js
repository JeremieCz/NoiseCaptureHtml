"use strict";

const STORAGE_KEY = "noisecapture-web-sessions-v1";
const SETTINGS_KEY = "noisecapture-web-settings-v1";
const SCALE_VERSION_KEY = "noisecapture-web-scale-v2";
const GAUGE_CIRCUMFERENCE = 653.45;

const elements = {
  views: {
    measure: document.getElementById("measure-view"),
    history: document.getElementById("history-view"),
    about: document.getElementById("about-view"),
    result: document.getElementById("result-view")
  },
  pageName: document.getElementById("page-name"),
  status: document.getElementById("measurement-status"),
  statusLabel: document.getElementById("status-label"),
  liveTag: document.getElementById("live-tag"),
  start: document.getElementById("start-button"),
  pause: document.getElementById("pause-button"),
  stop: document.getElementById("stop-button"),
  hint: document.getElementById("permission-hint"),
  reading: document.getElementById("level-value"),
  unit: document.getElementById("level-unit"),
  caption: document.getElementById("level-caption"),
  gauge: document.getElementById("gauge-value"),
  waveform: document.getElementById("waveform"),
  mean: document.getElementById("mean-level"),
  maximum: document.getElementById("max-level"),
  elapsed: document.getElementById("elapsed-time"),
  locationTitle: document.getElementById("location-title"),
  locationDetail: document.getElementById("location-detail"),
  mapLink: document.getElementById("map-link"),
  sessionNote: document.getElementById("session-note"),
  calibrationDot: document.getElementById("calibration-dot"),
  calibrationState: document.getElementById("calibration-state"),
  calibrationDescription: document.getElementById("calibration-description"),
  calibrationDialog: document.getElementById("calibration-dialog"),
  calibrationReading: document.getElementById("calibration-reading"),
  referenceLevel: document.getElementById("reference-level"),
  dialogError: document.getElementById("dialog-error"),
  historyList: document.getElementById("history-list"),
  historySummary: document.getElementById("history-summary"),
  historyCount: document.getElementById("history-count"),
  toast: document.getElementById("toast")
};

let sessions = loadSessions();
let settings = loadSettings();
migrateMeasurementScale();
let activeMeasurement = null;
let audioStream = null;
let audioContext = null;
let analyser = null;
let sampleTimer = null;
let displayTimer = null;
let locationWatch = null;
let latestLocation = null;
let latestDbfs = null;
let toastTimer = null;
let selectedResult = null;

function loadSessions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Le format de l’historique est invalide.");
    return parsed.filter((session) =>
      session &&
      typeof session.id === "string" &&
      Array.isArray(session.samples) &&
      session.samples.every((sample) => Number.isFinite(sample.level))
    );
  } catch (error) {
    window.setTimeout(() => showToast(`Impossible de lire l’historique : ${error.message}`, true), 0);
    return [];
  }
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return { calibrationOffset: null };
    const parsed = JSON.parse(stored);
    const offset = parsed && parsed.calibrationOffset;
    return { calibrationOffset: Number.isFinite(offset) ? offset : null };
  } catch (error) {
    window.setTimeout(() => showToast(`Impossible de lire les réglages : ${error.message}`, true), 0);
    return { calibrationOffset: null };
  }
}

function migrateMeasurementScale() {
  try {
    if (localStorage.getItem(SCALE_VERSION_KEY) === "1") return;
    for (const session of sessions) {
      if (Number.isFinite(session.calibrationOffset)) session.calibrationOffset -= 100;
      for (const sample of session.samples) {
        const baseLevel = Number.isFinite(sample.dbfs)
          ? sample.dbfs + 100
          : sample.level + 100;
        sample.level = Math.max(0, baseLevel + (session.calibrationOffset ?? 0));
      }
    }
    if (Number.isFinite(settings.calibrationOffset)) settings.calibrationOffset -= 100;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(SCALE_VERSION_KEY, "1");
  } catch (error) {
    window.setTimeout(() => showToast(`L’ancienne échelle n’a pas pu être convertie dans l’historique : ${error.message}`, true), 0);
  }
}

function persistSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch (error) {
    showToast(`La session n’a pas pu être enregistrée dans ce navigateur : ${error.message}`, true);
    return false;
  }
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    showToast(`Le réglage n’a pas pu être enregistré : ${error.message}`, true);
    return false;
  }
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 4200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : "—";
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(value, includeTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", includeTime
    ? { dateStyle: "long", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function navigate(viewName) {
  if (!elements.views[viewName]) return;
  Object.entries(elements.views).forEach(([name, element]) => {
    element.hidden = name !== viewName;
  });
  const pageLabels = { measure: "Mesure", history: "Historique", about: "À propos", result: "Résultats" };
  elements.pageName.textContent = pageLabels[viewName];
  document.querySelectorAll(".nav-list [data-view-link]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewLink === viewName);
  });
  if (viewName === "history") renderHistory();
  if (viewName === "result" && selectedResult) renderResult(selectedResult);
  window.requestAnimationFrame(() => {
    if (viewName === "result" && selectedResult) drawResultChart(selectedResult);
    if (viewName === "measure") drawWaveform();
  });
}

function calculateMetrics(samples) {
  if (!samples.length) return { leq: null, maximum: null, minimum: null, l10: null, l50: null, l90: null };
  const values = samples.map((sample) => sample.level).filter(Number.isFinite);
  if (!values.length) return { leq: null, maximum: null, minimum: null, l10: null, l50: null, l90: null };
  const energy = values.reduce((sum, value) => sum + (10 ** (value / 10)), 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (percent) => sorted[Math.min(sorted.length - 1, Math.floor((1 - percent / 100) * sorted.length))];
  return {
    leq: 10 * Math.log10(energy),
    maximum: Math.max(...values),
    minimum: Math.min(...values),
    l10: percentile(10),
    l50: percentile(50),
    l90: percentile(90)
  };
}

function displayUnit(calibrationOffset = settings.calibrationOffset) {
  return calibrationOffset === null ? "dB relatifs" : "dB estimés";
}

function relativeMicrophoneLevel(dbfs) {
  return Math.max(0, dbfs + 100);
}

function currentElapsed() {
  if (!activeMeasurement) return 0;
  const runningTime = activeMeasurement.segmentStart
    ? performance.now() - activeMeasurement.segmentStart
    : 0;
  return activeMeasurement.elapsedMs + runningTime;
}

function updateMeasurementDisplay() {
  const sample = activeMeasurement?.samples.at(-1);
  const isCalibrated = activeMeasurement
    ? activeMeasurement.calibrationOffset !== null
    : settings.calibrationOffset !== null;
  const unit = displayUnit(activeMeasurement ? activeMeasurement.calibrationOffset : settings.calibrationOffset);
  const scaleMaximum = isCalibrated ? 140 : 100;
  document.getElementById("scale-mid").textContent = String(scaleMaximum / 2);
  document.getElementById("scale-max").textContent = String(scaleMaximum);
  const shownLevel = sample ? sample.level : null;
  elements.reading.textContent = shownLevel === null ? "--" : formatNumber(shownLevel);
  elements.unit.textContent = unit;
  elements.caption.textContent = sample
    ? (isCalibrated ? "estimation indicative" : "niveau relatif du microphone")
    : "en attente du microphone";

  const gaugeRatio = shownLevel === null
    ? 0
    : isCalibrated
      ? Math.max(0, Math.min(1, shownLevel / 140))
      : Math.max(0, Math.min(1, shownLevel / 100));
  elements.gauge.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - gaugeRatio));
  elements.gauge.style.stroke = shownLevel !== null && isCalibrated && shownLevel >= 80 ? "#e99a53" : "#14a497";

  const metrics = calculateMetrics(activeMeasurement?.samples ?? []);
  const valueLabel = metrics.leq === null ? "--" : formatNumber(metrics.leq);
  const maxLabel = metrics.maximum === null ? "--" : formatNumber(metrics.maximum);
  elements.mean.innerHTML = `${valueLabel} <small>dB</small>`;
  elements.maximum.innerHTML = `${maxLabel} <small>dB</small>`;
  elements.elapsed.innerHTML = `${formatDuration(currentElapsed())} <small>min</small>`;

  elements.calibrationDot.classList.toggle("is-set", isCalibrated);
  elements.calibrationState.textContent = isCalibrated ? "Réglage indicatif actif" : "Niveau relatif";
  elements.calibrationDescription.textContent = isCalibrated
    ? "Correction de gain appliquée avec votre référence. La pondération A n’est pas calculée."
    : "Échelle relative 0–100 décalée depuis le microphone. 0 correspond au seuil de silence numérique, pas à 0 dB SPL.";
  elements.calibrationReading.textContent = latestDbfs === null ? "--" : `${formatNumber(relativeMicrophoneLevel(latestDbfs))} dB relatifs`;

  const location = activeMeasurement?.location ?? latestLocation;
  if (location) {
    elements.locationTitle.textContent = "Position GPS disponible";
    elements.locationDetail.textContent = `${formatNumber(location.latitude, 5)}°, ${formatNumber(location.longitude, 5)}° · précision ±${Math.round(location.accuracy)} m`;
    elements.mapLink.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=17/${encodeURIComponent(location.latitude)}/${encodeURIComponent(location.longitude)}`;
    elements.mapLink.hidden = false;
  }
  drawWaveform();
}

function canvasContext(canvas) {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  return { context, width: bounds.width, height: bounds.height };
}

function drawSeries(canvas, samples, options = {}) {
  const canvasInfo = canvasContext(canvas);
  if (!canvasInfo) return;
  const { context, width, height } = canvasInfo;
  const padding = { top: 14, right: 8, bottom: 22, left: 34 };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const values = samples.map((sample) => sample.level).filter(Number.isFinite);
  const isCalibrated = options.calibrated ?? false;
  const min = 0;
  const max = isCalibrated ? 140 : 100;
  const toY = (value) => padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  context.clearRect(0, 0, width, height);
  context.font = "9px Lato, sans-serif";
  context.textBaseline = "middle";
  context.lineWidth = 1;
  [0, 0.5, 1].forEach((fraction) => {
    const y = padding.top + plotHeight * fraction;
    const label = max - (max - min) * fraction;
    context.strokeStyle = "#edf1f1";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = "#9aa7a9";
    context.textAlign = "left";
    context.fillText(`${Math.round(label)}`, 1, y);
  });

  if (!values.length) {
    context.strokeStyle = "#dfe8e8";
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(padding.left, padding.top + plotHeight / 2);
    context.lineTo(width - padding.right, padding.top + plotHeight / 2);
    context.stroke();
    context.setLineDash([]);
    return;
  }

  const points = values.map((value, index) => ({
    x: padding.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth),
    y: toY(Math.max(min, Math.min(max, value)))
  }));
  context.beginPath();
  context.moveTo(points[0].x, padding.top + plotHeight);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points.at(-1).x, padding.top + plotHeight);
  context.closePath();
  const fill = context.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
  fill.addColorStop(0, "rgba(20,164,151,.20)");
  fill.addColorStop(1, "rgba(20,164,151,.015)");
  context.fillStyle = fill;
  context.fill();
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = "#139b90";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.fillStyle = "#87979b";
  context.textAlign = "left";
  context.fillText("début", padding.left, height - 8);
  context.textAlign = "right";
  context.fillText("maintenant", width - padding.right, height - 8);
}

function drawWaveform() {
  const measurement = activeMeasurement;
  const samples = measurement?.samples.slice(-60) ?? [];
  drawSeries(elements.waveform, samples, { calibrated: measurement
    ? measurement.calibrationOffset !== null
    : settings.calibrationOffset !== null });
}

function drawResultChart(session) {
  const canvas = document.getElementById("result-chart");
  if (!canvas) return;
  drawSeries(canvas, session.samples, { calibrated: session.calibrationOffset !== null });
}

function beginGeolocation() {
  latestLocation = null;
  activeMeasurement.location = null;
  elements.locationTitle.textContent = "Recherche de la position…";
  elements.locationDetail.textContent = "Autorisez la géolocalisation pour associer des points GPS aux mesures.";
  elements.mapLink.hidden = true;
  if (!("geolocation" in navigator)) {
    elements.locationTitle.textContent = "Géolocalisation indisponible";
    elements.locationDetail.textContent = "Ce navigateur ne fournit pas de position GPS.";
    return;
  }
  locationWatch = navigator.geolocation.watchPosition((position) => {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    latestLocation = location;
    if (activeMeasurement) activeMeasurement.location = location;
    updateMeasurementDisplay();
  }, (error) => {
    locationWatch = null;
    elements.locationTitle.textContent = "Position non disponible";
    elements.locationDetail.textContent = error.code === error.PERMISSION_DENIED
      ? "Autorisation refusée. La mesure audio continue sans position."
      : "Position introuvable. La mesure audio continue sans position.";
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}

function endGeolocation() {
  if (locationWatch !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(locationWatch);
    locationWatch = null;
  }
}

function sampleAudio() {
  if (!activeMeasurement || !analyser || !audioContext) return;
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sumSquares = 0;
  for (const value of data) sumSquares += value * value;
  const rms = Math.sqrt(sumSquares / data.length);
  const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;
  latestDbfs = Math.max(-100, Math.min(0, dbfs));
  const level = Math.max(0, relativeMicrophoneLevel(latestDbfs) + (activeMeasurement.calibrationOffset ?? 0));
  activeMeasurement.samples.push({
    time: new Date().toISOString(),
    dbfs: latestDbfs,
    level,
    latitude: activeMeasurement.location?.latitude ?? null,
    longitude: activeMeasurement.location?.longitude ?? null,
    accuracy: activeMeasurement.location?.accuracy ?? null
  });
  updateMeasurementDisplay();
}

async function acquireMicrophone() {
  if (!window.isSecureContext) {
    showToast("Le microphone nécessite HTTPS ou localhost. Ouvrez cette application via une adresse sécurisée.", true);
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Ce navigateur ne permet pas l’accès au microphone. Essayez une version récente de Chrome, Firefox ou Safari.", true);
    return false;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    });
  } catch (error) {
    const explanation = error.name === "NotAllowedError" || error.name === "PermissionDeniedError"
      ? "L’accès au microphone a été refusé. Autorisez-le dans les réglages du navigateur, puis réessayez."
      : error.name === "NotFoundError"
        ? "Aucun microphone n’a été trouvé sur cet appareil."
        : `Le microphone n’a pas pu être activé : ${error.message}`;
    showToast(explanation, true);
    elements.hint.textContent = explanation;
    return false;
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("L’analyse audio n’est pas prise en charge par ce navigateur.");
    audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioStream = stream;
    elements.hint.textContent = "Mesure active. Aucun fichier audio n’est enregistré.";
    return true;
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== "closed") await audioContext.close();
    audioContext = null;
    analyser = null;
    showToast(`L’analyse audio n’a pas pu démarrer : ${error.message}`, true);
    return false;
  }
}

async function releaseMicrophone() {
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
  analyser = null;
  if (audioContext && audioContext.state !== "closed") {
    const closingContext = audioContext;
    audioContext = null;
    try {
      await closingContext.close();
    } catch (error) {
      showToast(`Le microphone a été coupé, mais le contexte audio ne s’est pas fermé correctement : ${error.message}`, true);
    }
  } else {
    audioContext = null;
  }
}

async function startOrResumeMeasurement() {
  if (activeMeasurement?.recording) return;
  const started = await acquireMicrophone();
  if (!started) return;

  if (!activeMeasurement) {
    activeMeasurement = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: 0,
      note: elements.sessionNote.value.trim(),
      calibrationOffset: settings.calibrationOffset,
      samples: [],
      location: null,
      recording: true,
      elapsedMs: 0,
      segmentStart: performance.now()
    };
    beginGeolocation();
  } else {
    activeMeasurement.recording = true;
    activeMeasurement.segmentStart = performance.now();
  }

  sampleTimer = window.setInterval(sampleAudio, 1000);
  sampleAudio();
  displayTimer = window.setInterval(updateMeasurementDisplay, 250);
  setMeasurementState("recording");
}

function setMeasurementState(state) {
  const recording = state === "recording";
  const paused = state === "paused";
  elements.status.classList.toggle("is-recording", recording);
  elements.status.classList.toggle("is-paused", paused);
  elements.statusLabel.textContent = recording ? "Mesure en cours" : paused ? "Mesure en pause" : "Prêt à mesurer";
  elements.liveTag.classList.toggle("is-live", recording);
  elements.liveTag.lastElementChild.textContent = recording ? "EN DIRECT" : paused ? "EN PAUSE" : "EN ATTENTE";
  elements.start.hidden = recording || paused;
  elements.pause.hidden = !recording && !paused;
  elements.pause.innerHTML = paused ? '<span aria-hidden="true">▶</span> Reprendre' : '<span aria-hidden="true">Ⅱ</span> Pause';
  elements.stop.hidden = !recording && !paused;
}

async function pauseMeasurement() {
  if (!activeMeasurement) return;
  if (activeMeasurement.recording) {
    sampleAudio();
    activeMeasurement.elapsedMs += performance.now() - activeMeasurement.segmentStart;
    activeMeasurement.segmentStart = null;
    activeMeasurement.recording = false;
    window.clearInterval(sampleTimer);
    window.clearInterval(displayTimer);
    sampleTimer = null;
    displayTimer = null;
    endGeolocation();
    await releaseMicrophone();
    elements.hint.textContent = "Mesure en pause. Le microphone est désactivé.";
    setMeasurementState("paused");
    updateMeasurementDisplay();
  } else {
    await startOrResumeMeasurement();
  }
}

async function stopMeasurement() {
  if (!activeMeasurement) return;
  if (activeMeasurement.recording) {
    sampleAudio();
    activeMeasurement.elapsedMs += performance.now() - activeMeasurement.segmentStart;
  }
  window.clearInterval(sampleTimer);
  window.clearInterval(displayTimer);
  sampleTimer = null;
  displayTimer = null;
  endGeolocation();
  await releaseMicrophone();

  const completed = {
    ...activeMeasurement,
    finishedAt: new Date().toISOString(),
    durationMs: activeMeasurement.elapsedMs,
    recording: false,
    segmentStart: null,
    samples: activeMeasurement.samples
  };
  activeMeasurement = null;
  setMeasurementState("ready");
  elements.hint.textContent = "Mesure terminée. Aucun fichier audio n’a été enregistré.";
  elements.sessionNote.value = "";

  if (!completed.samples.length) {
    showToast("La session est vide : aucun relevé audio n’a été capturé.", true);
    updateMeasurementDisplay();
    return;
  }

  sessions.unshift(completed);
  persistSessions();
  selectedResult = completed;
  renderHistory();
  navigate("result");
}

function renderHistory() {
  elements.historyCount.textContent = String(sessions.length);
  elements.historySummary.textContent = `${sessions.length} ${sessions.length === 1 ? "session enregistrée" : "sessions enregistrées"}`;
  document.getElementById("export-all-button").disabled = sessions.length === 0;
  document.getElementById("export-all-button").classList.toggle("is-disabled", sessions.length === 0);
  if (!sessions.length) {
    elements.historyList.innerHTML = `<div class="empty-state"><div><div class="empty-icon" aria-hidden="true">◷</div><h2>Votre historique est vide</h2><p>Démarrez une mesure pour enregistrer les niveaux sonores et retrouver leurs statistiques ici.</p><button class="button button-primary" type="button" data-view-link="measure">Commencer une mesure</button></div></div>`;
    return;
  }

  elements.historyList.innerHTML = sessions.map((session) => {
    const metrics = calculateMetrics(session.samples);
    const unit = session.calibrationOffset === null ? "dB relatifs" : "dB estimés";
    const gpsCount = session.samples.filter((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude)).length;
    const label = session.note?.trim() || formatDate(session.startedAt, false);
    return `<article class="history-item" data-session-id="${escapeHtml(session.id)}">
      <span class="history-badge" aria-hidden="true">⌁</span>
      <div class="history-info"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(formatDate(session.startedAt))} · ${formatDuration(session.durationMs)} · ${session.samples.length} relevés${gpsCount ? ` · ${gpsCount} points GPS` : ""}</p></div>
      <div class="history-level"><strong>${metrics.leq === null ? "—" : formatNumber(metrics.leq)} <small>dB</small></strong><span>${unit} · Leq</span></div>
      <div class="history-buttons"><button class="small-action" type="button" data-action="open" data-id="${escapeHtml(session.id)}" aria-label="Ouvrir les résultats">↗</button><button class="small-action" type="button" data-action="export" data-id="${escapeHtml(session.id)}" aria-label="Exporter cette session">↓</button><button class="small-action delete" type="button" data-action="delete" data-id="${escapeHtml(session.id)}" aria-label="Supprimer cette session">×</button></div>
    </article>`;
  }).join("");
}

function renderResult(session) {
  if (!session) return;
  const metrics = calculateMetrics(session.samples);
  const calibrated = session.calibrationOffset !== null;
  const unit = calibrated ? "dB estimés" : "dB relatifs";
  const gpsSamples = session.samples.filter((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude));
  const gpsCount = gpsSamples.length;
  const title = session.note?.trim() || "Session de mesure";
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-subtitle").textContent = `${formatDate(session.startedAt)} · ${formatDuration(session.durationMs)} · ${session.samples.length} relevés`;
  document.getElementById("chart-unit").textContent = unit;
  document.getElementById("result-summary").innerHTML = [
    ["Leq moyen", metrics.leq, unit],
    ["Niveau maximum", metrics.maximum, unit],
    ["Niveau minimum", metrics.minimum, unit],
    ["Durée", null, formatDuration(session.durationMs)]
  ].map(([label, value, suffix]) => `<div class="summary-tile"><span>${label}</span><strong>${value === null ? escapeHtml(suffix) : `${formatNumber(value)} <small>${escapeHtml(suffix)}</small>`}</strong></div>`).join("");
  document.getElementById("statistics-list").innerHTML = [
    ["Leq moyen", metrics.leq],
    ["Niveau maximum", metrics.maximum],
    ["Niveau minimum", metrics.minimum],
    ["L10 · dépassé 10 % du temps", metrics.l10],
    ["L50 · médiane", metrics.l50],
    ["L90 · dépassé 90 % du temps", metrics.l90],
    ["Nombre de relevés", session.samples.length, "relevés", 0]
  ].map(([label, value, suffix = "dB", digits = 1]) => `<div class="stat-row"><span>${label}</span><strong>${Number.isFinite(value) ? `${formatNumber(value, digits)} ${suffix}` : "—"}</strong></div>`).join("");
  document.getElementById("route-count").textContent = `${gpsCount} ${gpsCount === 1 ? "point" : "points"}`;
  document.getElementById("route-caption").textContent = gpsCount
    ? `${gpsCount} position${gpsCount === 1 ? "" : "s"} enregistrée${gpsCount === 1 ? "" : "s"} · précision communiquée par l’appareil.`
    : "Aucune position GPS n’a été enregistrée pour cette session.";
  renderRoute(gpsSamples);
  document.getElementById("report-disclaimer").textContent = calibrated
    ? "Valeurs estimées à partir du réglage de gain que vous avez fourni. Le microphone n’est pas étalonné et aucune pondération A n’est appliquée : ces résultats ne remplacent pas une mesure acoustique certifiée."
    : "Niveaux relatifs affichés sur une échelle 0–100 décalée depuis le signal du microphone. 0 correspond au seuil de silence numérique, pas à 0 dB SPL. Le gain varie selon les appareils : sans calibration ni pondération fréquentielle A, ces valeurs ne représentent pas des dB SPL ou des niveaux certifiés en dB(A).";
  document.getElementById("export-session-button").disabled = false;
}

function renderRoute(samples) {
  const container = document.getElementById("route-plot");
  if (!samples.length) {
    container.innerHTML = '<div class="route-plot-empty">Aucune position GPS pour cette session</div>';
    return;
  }
  const minLatitude = Math.min(...samples.map((sample) => sample.latitude));
  const maxLatitude = Math.max(...samples.map((sample) => sample.latitude));
  const minLongitude = Math.min(...samples.map((sample) => sample.longitude));
  const maxLongitude = Math.max(...samples.map((sample) => sample.longitude));
  const latSpan = maxLatitude - minLatitude || 0.0001;
  const lonSpan = maxLongitude - minLongitude || 0.0001;
  const points = samples.map((sample) => ({
    x: 20 + ((sample.longitude - minLongitude) / lonSpan) * 760,
    y: 20 + ((maxLatitude - sample.latitude) / latSpan) * 110
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const markers = points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 6 : 3.5}" fill="${index === points.length - 1 ? "#e79b55" : "#138f86"}" stroke="white" stroke-width="2"/>`).join("");
  const first = samples[0];
  const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(first.latitude)}&mlon=${encodeURIComponent(first.longitude)}#map=16/${encodeURIComponent(first.latitude)}/${encodeURIComponent(first.longitude)}`;
  container.innerHTML = `<svg viewBox="0 0 800 150" preserveAspectRatio="none" role="img" aria-label="Tracé schématique des positions GPS"><polyline points="${line}" fill="none" stroke="#168f86" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${markers}</svg>`;
  document.getElementById("route-caption").innerHTML = `${samples.length} point${samples.length === 1 ? "" : "s"} GPS relevé${samples.length === 1 ? "" : "s"} · <a class="map-link" href="${mapUrl}" target="_blank" rel="noopener">Ouvrir le point de départ dans OpenStreetMap ↗</a>`;
}

function csvField(value) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function exportSession(session) {
  if (!session) return;
  const rows = [
    ["date_utc", "niveau", "niveau_microphone_dbfs", "latitude", "longitude", "precision_gps_m"],
    ...session.samples.map((sample) => [sample.time, sample.level, sample.dbfs, sample.latitude, sample.longitude, sample.accuracy])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvField).join(";")).join("\r\n")}`;
  downloadFile(`noisecapture-${session.id}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportAllSessions() {
  if (!sessions.length) {
    showToast("Il n’y a aucune session à exporter.", true);
    return;
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2)], { type: "application/json" });
  downloadFile("noisecapture-historique.json", blob);
}

function deleteSession(id) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  const title = session.note?.trim() || formatDate(session.startedAt, false);
  if (!window.confirm(`Supprimer la session « ${title} » ? Cette action est définitive.`)) return;
  sessions = sessions.filter((item) => item.id !== id);
  persistSessions();
  if (selectedResult?.id === id) selectedResult = null;
  renderHistory();
  showToast("La session a été supprimée.");
}

function openCalibrationDialog() {
  if (activeMeasurement) {
    showToast("Terminez la mesure avant de modifier le réglage de calibration.", true);
    return;
  }
  elements.dialogError.hidden = true;
  elements.calibrationReading.textContent = latestDbfs === null ? "--" : `${formatNumber(relativeMicrophoneLevel(latestDbfs))} dB relatifs`;
  if (!elements.calibrationDialog.open) elements.calibrationDialog.showModal();
}

function applyCalibration(event) {
  event.preventDefault();
  const reference = Number(elements.referenceLevel.value);
  if (!Number.isFinite(reference) || reference < 20 || reference > 140) {
    elements.dialogError.textContent = "Indiquez une valeur de référence comprise entre 20 et 140 dB.";
    elements.dialogError.hidden = false;
    return;
  }
  if (latestDbfs === null) {
    elements.dialogError.textContent = "Démarrez une mesure et attendez un relevé avant d’appliquer le réglage.";
    elements.dialogError.hidden = false;
    return;
  }
  settings.calibrationOffset = reference - relativeMicrophoneLevel(latestDbfs);
  if (!persistSettings()) return;
  elements.calibrationDialog.close();
  updateMeasurementDisplay();
  showToast("Réglage indicatif appliqué. Les prochaines mesures seront estimées en dB.");
}

function clearCalibration() {
  settings.calibrationOffset = null;
  if (!persistSettings()) return;
  elements.calibrationDialog.close();
  updateMeasurementDisplay();
  showToast("Le réglage de calibration a été effacé.");
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-link]");
  if (viewButton) {
    navigate(viewButton.dataset.viewLink);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const session = sessions.find((item) => item.id === actionButton.dataset.id);
    if (actionButton.dataset.action === "open" && session) {
      selectedResult = session;
      navigate("result");
    } else if (actionButton.dataset.action === "export" && session) {
      exportSession(session);
    } else if (actionButton.dataset.action === "delete") {
      deleteSession(actionButton.dataset.id);
    }
  }
});

elements.start.addEventListener("click", startOrResumeMeasurement);
elements.pause.addEventListener("click", pauseMeasurement);
elements.stop.addEventListener("click", stopMeasurement);
document.getElementById("settings-button").addEventListener("click", openCalibrationDialog);
document.getElementById("calibrate-button").addEventListener("click", openCalibrationDialog);
document.getElementById("calibration-form").addEventListener("submit", applyCalibration);
document.getElementById("clear-calibration").addEventListener("click", clearCalibration);
document.getElementById("close-dialog").addEventListener("click", () => elements.calibrationDialog.close());
document.getElementById("export-all-button").addEventListener("click", exportAllSessions);
document.getElementById("export-session-button").addEventListener("click", () => exportSession(selectedResult));
window.addEventListener("resize", () => {
  drawWaveform();
  if (!elements.views.result.hidden && selectedResult) drawResultChart(selectedResult);
});
window.addEventListener("pagehide", () => {
  window.clearInterval(sampleTimer);
  window.clearInterval(displayTimer);
  endGeolocation();
  if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
  if (audioContext && audioContext.state !== "closed") audioContext.close();
});

renderHistory();
updateMeasurementDisplay();
setMeasurementState("ready");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      showToast("La mise en cache hors ligne n’a pas pu être activée.", true);
    });
  });
}
