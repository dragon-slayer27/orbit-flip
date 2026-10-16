import { createGame, advance, flip, pause, resume, TAU, WARNING_TIME, HAZARD_HALF_WIDTH } from "./game.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const context = canvas.getContext("2d");
const arena = $("arena");
const overlay = $("game-overlay");
const center = $("orbit-center");
const playButton = $("play-button");
const soundButton = $("sound-button");
const pauseButton = $("pause-button");
const gameCard = $("game-card");
const fullscreenButton = $("fullscreen-button");
const soundButtonHome = soundButton.parentElement;
const surroundingUI = [...document.querySelectorAll(".site-header, .intro, .sidebar, .site-footer")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const STORAGE_KEY = "orbit-flip.v1";
const RADIUS = 176;
const CX = 300;
const CY = 260;
const colors = { mint: "#a4f4cb", purple: "#c0a6ff", red: "#f28b82" };
let game = createGame();
game.phase = "ready";
let best = 0;
let muted = true;
let audio;
let lastTime;
let feedbackUntil = 0;
let particles = [];
let expanded = false;
let scrollBeforeFullscreen = { x: 0, y: 0 };

function report(message, error) {
  console.warn(message, error);
  $("storage-note").textContent = message;
  $("storage-note").hidden = false;
}

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    const value = JSON.parse(stored);
    if (!value || !Number.isSafeInteger(value.best) || value.best < 0 || typeof value.muted !== "boolean") {
      throw new Error("Invalid saved preferences.");
    }
    best = value.best;
    muted = value.muted;
  }
} catch (error) {
  report("Saved scores are unavailable. You can still play; your best will last for this visit.", error);
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best, muted }));
  } catch (error) {
    report("Your best couldn't be saved on this device. It will last for this visit.", error);
  }
}

function syncSoundButton() {
  soundButton.setAttribute("aria-pressed", String(!muted));
  soundButton.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
  soundButton.title = muted ? "Turn sound on" : "Turn sound off";
  $("sound-waves").toggleAttribute("hidden", muted);
  $("sound-slash").toggleAttribute("hidden", !muted);
}

function setExpandedView(enabled) {
  if (enabled === expanded) return;
  pauseGame();
  if (enabled) scrollBeforeFullscreen = { x: scrollX, y: scrollY };
  expanded = enabled;
  gameCard.classList.toggle("is-fullscreen", enabled);
  document.body.classList.toggle("game-expanded", enabled);
  (enabled ? $("arena-actions") : soundButtonHome).append(soundButton);
  for (const element of surroundingUI) element.inert = enabled;
  fullscreenButton.setAttribute("aria-pressed", String(enabled));
  const label = enabled ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = enabled ? "Exit fullscreen (Esc)" : label;
  $("fullscreen-icon").setAttribute("d", enabled
    ? "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"
    : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5");
  if (!enabled) scrollTo(scrollBeforeFullscreen.x, scrollBeforeFullscreen.y);
  arena.focus({ preventScroll: true });
}

async function toggleFullscreen() {
  if (fullscreenButton.disabled) return;
  fullscreenButton.disabled = true;
  pauseGame();
  try {
    if (document.fullscreenElement === gameCard) {
      await document.exitFullscreen();
    } else if (expanded) {
      setExpandedView(false);
    } else if (document.fullscreenEnabled && gameCard.requestFullscreen) {
      await gameCard.requestFullscreen();
    } else {
      setExpandedView(true);
      $("announcer").textContent = "Expanded game view. This browser does not support native fullscreen. Use Exit fullscreen to return.";
    }
  } catch (error) {
    report("Fullscreen couldn't be changed. Try again, or continue in the current view.", error);
  } finally {
    fullscreenButton.disabled = false;
  }
}

async function unlockAudio() {
  if (muted) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") await audio.resume();
  } catch (error) {
    muted = true;
    syncSoundButton();
    report("Sound couldn't start in this browser. The game will stay muted.", error);
  }
}

function tone(type) {
  if (muted || !audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  const duration = type === "death" ? 0.28 : 0.12;
  const start = type === "spark" ? 660 + game.multiplier * 110 : type === "flip" ? 340 : 150;
  oscillator.type = type === "spark" ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.exponentialRampToValueAtTime(type === "death" ? 40 : start * 1.5, now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function updateHUD() {
  $("score").textContent = String(game.score).padStart(3, "0");
  $("best").textContent = String(best).padStart(3, "0");
  $("multiplier").firstChild.nodeValue = String(game.multiplier);
  $("timer").textContent = formatTime(game.elapsed);
  const names = ["A GENTLE START", "FINDING YOUR FLOW", "PICKING UP SPEED", "TRUST YOUR REFLEXES", "IN THE ZONE"];
  $("level-label").textContent = `LEVEL ${String(game.level).padStart(2, "0")} / ${names[game.level - 1]}`;
  $("direction-arrow").textContent = game.direction === 1 ? "\u21bb" : "\u21ba";
  $("direction-label").textContent = game.direction === 1 ? "CLOCKWISE" : "COUNTERCLOCKWISE";
}

function showOverlay(kicker, title, copy, button) {
  $("overlay-kicker").textContent = kicker;
  $("overlay-title").textContent = title;
  $("overlay-copy").textContent = copy;
  playButton.replaceChildren(document.createTextNode(button));
  const arrow = document.createElement("span");
  arrow.textContent = "\u2197";
  arrow.setAttribute("aria-hidden", "true");
  playButton.append(arrow);
  overlay.hidden = false;
  center.hidden = true;
  pauseButton.hidden = true;
}

function syncPhase() {
  const running = game.phase === "running";
  overlay.hidden = running;
  center.hidden = !running;
  pauseButton.hidden = !running;
  $("game-status").textContent = {
    ready: "READY WHEN YOU ARE",
    running: "YOU'RE IN THE LOOP",
    paused: "TAKE YOUR TIME",
    over: "THERE'S ALWAYS ANOTHER ORBIT",
  }[game.phase];
  $("game-status-dot").style.background = game.phase === "over" ? colors.red : colors.mint;
  $("flip-button").disabled = !running;
}

function startGame() {
  game = createGame();
  particles = [];
  feedbackUntil = 0;
  lastTime = undefined;
  $("collect-feedback").textContent = "FIND YOUR FLOW";
  $("announcer").textContent = "Game started. Press Space or tap to reverse. P to pause.";
  syncPhase();
  updateHUD();
  arena.focus({ preventScroll: true });
  const bounds = gameCard.getBoundingClientRect();
  if (bounds.bottom > innerHeight || bounds.top < 0) {
    gameCard.scrollIntoView({ block: "center", behavior: "instant" });
  }
}

function action() {
  if (!context) return;
  void unlockAudio();
  if (game.phase === "ready" || game.phase === "over") {
    startGame();
  } else if (game.phase === "paused") {
    resume(game);
    lastTime = undefined;
    syncPhase();
    $("announcer").textContent = "Game resumed.";
    arena.focus({ preventScroll: true });
  } else {
    flip(game);
    tone("flip");
    updateHUD();
  }
}

function pauseGame() {
  if (game.phase !== "running") return;
  pause(game);
  showOverlay("NO RUSH", "Take a breather.", "Your orbit will be right here.\nReady when you are.", "Back to it");
  syncPhase();
  $("announcer").textContent = "Game paused. Press Space to resume.";
}

function endGame() {
  const record = game.score > best;
  if (record) {
    best = game.score;
    savePreferences();
  }
  showOverlay(
    record ? "A NEW PERSONAL BEST" : "SO CLOSE. GO AGAIN?",
    record ? "Look at you go." : "One more orbit?",
    `${game.score} points / ${game.collected} sparks / ${formatTime(game.elapsed)}\n${record ? "That's a new little win. Keep it going." : "A quick reset. A fresh chance."}`,
    "Try again",
  );
  syncPhase();
  updateHUD();
  $("announcer").textContent = `Game over. ${game.score} points. ${record ? "New personal best! " : ""}Press Space or Try again to restart.`;
}

function point(angle, radius = RADIUS) {
  return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
}

function burst(angle, color, count) {
  if (reducedMotion.matches) return;
  const origin = point(angle);
  for (let i = 0; i < count; i++) {
    const direction = Math.random() * TAU;
    const speed = 25 + Math.random() * 80;
    particles.push({ ...origin, vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed, life: 0.65, color });
  }
}

function arc(radius, start, end, color, width) {
  context.beginPath();
  context.arc(CX, CY, radius, start, end);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function draw(time, dt) {
  context.clearRect(0, 0, 600, 520);
  context.lineCap = "round";

  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * TAU;
    const outer = point(angle, RADIUS + (i % 6 === 0 ? 29 : 25));
    const inner = point(angle, RADIUS + 21);
    context.beginPath();
    context.moveTo(inner.x, inner.y);
    context.lineTo(outer.x, outer.y);
    context.strokeStyle = i % 6 === 0 ? "#344847" : "#243735";
    context.lineWidth = 1;
    context.stroke();
  }
  context.setLineDash([2, 9]);
  arc(RADIUS + 49, 0, TAU, "#24363488", 1);
  context.setLineDash([]);
  arc(RADIUS, 0, TAU, "#29453e", 3);
  arc(RADIUS - 17, 0, TAU, "#20332d55", 1);

  const visualTime = reducedMotion.matches || game.phase === "paused" ? 0 : time;
  const hazards = game.phase === "ready" ? [{ angle: 2.2, age: WARNING_TIME + 0.5 }] : game.hazards;
  for (const hazard of hazards) {
    const warning = hazard.age < WARNING_TIME;
    context.save();
    context.globalAlpha = warning ? 0.35 + 0.3 * (Math.sin(visualTime * 9) + 1) / 2 : 1;
    context.shadowColor = colors.red;
    context.shadowBlur = warning ? 0 : 17;
    context.setLineDash(warning ? [3, 5] : []);
    arc(RADIUS, hazard.angle - HAZARD_HALF_WIDTH, hazard.angle + HAZARD_HALF_WIDTH, colors.red, warning ? 7 : 11);
    context.restore();
    if (warning) {
      const marker = point(hazard.angle, RADIUS + 39);
      context.fillStyle = "#f2a199";
      context.font = "12px Consolas, monospace";
      context.textAlign = "center";
      context.fillText("!", marker.x, marker.y + 4);
    }
  }

  const spark = point(game.spark);
  context.save();
  context.translate(spark.x, spark.y);
  context.rotate(Math.PI / 4 + Math.sin(visualTime * 2) * 0.15);
  context.shadowColor = colors.purple;
  context.shadowBlur = 19;
  context.fillStyle = colors.purple;
  context.fillRect(-6, -6, 12, 12);
  context.fillStyle = "#eee5ff";
  context.fillRect(-2, -2, 4, 4);
  context.restore();

  for (let i = 14; i >= 1; i--) {
    const trail = point(game.angle - game.direction * i * 0.029);
    context.beginPath();
    context.arc(trail.x, trail.y, 6 * (1 - i / 18), 0, TAU);
    context.fillStyle = `rgba(164,244,203,${0.3 * (1 - i / 15)})`;
    context.fill();
  }
  const player = point(game.angle);
  context.save();
  context.shadowColor = game.phase === "over" ? colors.red : colors.mint;
  context.shadowBlur = 22;
  context.beginPath();
  context.arc(player.x, player.y, 9, 0, TAU);
  context.fillStyle = game.phase === "over" ? colors.red : colors.mint;
  context.fill();
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(player.x, player.y, 4, 0, TAU);
  context.fillStyle = "#effff5";
  context.fill();
  context.restore();

  if (game.phase !== "paused") {
    particles = particles.filter((particle) => particle.life > 0);
    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      context.globalAlpha = Math.max(0, particle.life / 0.65);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, 3, 3);
    }
    context.globalAlpha = 1;
  }
}

function resizeCanvas() {
  const rect = arena.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const scale = Math.min(canvas.width / 600, canvas.height / 520);
  context.setTransform(scale, 0, 0, scale, (canvas.width - 600 * scale) / 2, (canvas.height - 520 * scale) / 2);
}

function frame(timestamp) {
  const dt = lastTime === undefined ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  const previousSecond = Math.floor(game.elapsed);
  const events = advance(game, dt);
  for (const event of events) {
    if (event.type === "spark") {
      tone("spark");
      burst(event.angle, colors.purple, 14);
      $("collect-feedback").textContent = `+${event.points} / NICE LITTLE WIN`;
      feedbackUntil = game.elapsed + 1.4;
    } else {
      tone("death");
      burst(event.angle, colors.red, 25);
      endGame();
    }
  }
  if (game.phase === "running") {
    if (game.elapsed > feedbackUntil) {
      $("collect-feedback").textContent = `${5 - game.collected % 5} SPARKS TO ${game.multiplier < 3 ? "BOOST" : "LEVEL UP"}`;
      if (game.level === 5) $("collect-feedback").textContent = "YOU'RE IN THE ZONE";
    }
    if (events.length > 0 || Math.floor(game.elapsed) !== previousSecond) updateHUD();
  }
  draw(timestamp / 1000, dt);
  requestAnimationFrame(frame);
}

playButton.addEventListener("click", action);
$("flip-button").addEventListener("click", () => {
  if (game.phase === "running") action();
  arena.focus({ preventScroll: true });
});
arena.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || event.target.closest("button")) return;
  event.preventDefault();
  arena.focus({ preventScroll: true });
  action();
});
pauseButton.addEventListener("click", pauseGame);
fullscreenButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  setExpandedView(document.fullscreenElement === gameCard);
});
soundButton.addEventListener("click", async () => {
  muted = !muted;
  await unlockAudio();
  syncSoundButton();
  savePreferences();
  if (!muted) tone("spark");
  if (expanded) arena.focus({ preventScroll: true });
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable='true']")) return;
  if (event.code === "Escape" && expanded) {
    event.preventDefault();
    if (!event.repeat) void toggleFullscreen();
    return;
  }
  if (event.code === "Space") {
    if (event.target.closest("button, a")) return;
    event.preventDefault();
    if (!event.repeat) action();
  }
  if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) {
    event.preventDefault();
    if (game.phase === "running") pauseGame();
    else if (game.phase === "paused") action();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});
window.addEventListener("blur", pauseGame);

if (!context) {
  report("This browser doesn't support the canvas needed to play Orbit Flip. Try a current browser.", new Error("Canvas 2D unavailable"));
  playButton.disabled = true;
  $("flip-button").disabled = true;
} else {
  new ResizeObserver(resizeCanvas).observe(arena);
  resizeCanvas();
  syncPhase();
  syncSoundButton();
  updateHUD();
  requestAnimationFrame(frame);
}
