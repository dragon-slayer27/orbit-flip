export const TAU = Math.PI * 2;
export const PLAYER_RADIUS = 0.052;
export const SPARK_RADIUS = 0.075;
export const HAZARD_HALF_WIDTH = 0.14;
export const WARNING_TIME = 1.1;
export const ACTIVE_TIME = 2.5;
const FIXED_STEP = 1 / 120;

export function normalizeAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

export function angleDistance(a, b) {
  const distance = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(distance, TAU - distance);
}

export function createGame() {
  return {
    phase: "running",
    angle: -Math.PI / 2,
    direction: 1,
    elapsed: 0,
    score: 0,
    collected: 0,
    multiplier: 1,
    level: 1,
    spark: normalizeAngle(-Math.PI / 2 + 1.05),
    hazards: [],
    nextHazard: 2.2,
  };
}

export function flip(game) {
  if (game.phase === "running") game.direction *= -1;
}

export function pause(game) {
  if (game.phase === "running") game.phase = "paused";
}

export function resume(game) {
  if (game.phase === "paused") game.phase = "running";
}

function placeSpark(game, random) {
  // Scan the whole orbit from a random offset; even three hazards leave room.
  const offset = random() * TAU;
  for (let i = 0; i < 48; i++) {
    const candidate = normalizeAngle(offset + (i / 48) * TAU);
    if (
      angleDistance(candidate, game.angle) > 0.8 &&
      game.hazards.every((hazard) => angleDistance(candidate, hazard.angle) > 0.55)
    ) {
      return candidate;
    }
  }
  throw new Error("No safe position available for a spark.");
}

function spawnHazard(game, random) {
  if (game.hazards.length >= 3) return;
  const offset = 1.8 + random() * 0.5;
  for (let i = 0; i < 24; i++) {
    const candidate = normalizeAngle(game.angle + game.direction * (offset + (i / 24) * TAU));
    if (
      angleDistance(candidate, game.angle) > 1.1 &&
      angleDistance(candidate, game.spark) > 0.55 &&
      game.hazards.every((hazard) => angleDistance(candidate, hazard.angle) > 0.85)
    ) {
      game.hazards.push({ angle: candidate, age: 0 });
      return;
    }
  }
}

export function advance(game, seconds, random = Math.random) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("Elapsed time must be a finite, nonnegative number.");
  }
  const events = [];
  if (game.phase !== "running") return events;

  // Small simulation steps prevent tunneling through arcs on slower frames.
  let remaining = seconds;
  while (remaining > 0.0000001 && game.phase === "running") {
    const dt = Math.min(remaining, FIXED_STEP);
    remaining -= dt;
    game.elapsed += dt;
    const speed = 1.55 + (game.level - 1) * 0.18;
    game.angle = normalizeAngle(game.angle + game.direction * speed * dt);
    for (const hazard of game.hazards) hazard.age += dt;
    game.hazards = game.hazards.filter((hazard) => hazard.age < WARNING_TIME + ACTIVE_TIME);

    if (game.hazards.some((hazard) =>
      hazard.age >= WARNING_TIME &&
      angleDistance(game.angle, hazard.angle) <= HAZARD_HALF_WIDTH + PLAYER_RADIUS
    )) {
      game.phase = "over";
      events.push({ type: "death", angle: game.angle });
      break;
    }

    if (angleDistance(game.angle, game.spark) <= PLAYER_RADIUS + SPARK_RADIUS) {
      const angle = game.spark;
      game.collected++;
      game.multiplier = Math.min(3, 1 + Math.floor(game.collected / 5));
      game.level = Math.min(5, 1 + Math.floor(game.collected / 5));
      const points = 10 * game.multiplier;
      game.score += points;
      game.spark = placeSpark(game, random);
      events.push({ type: "spark", angle, points });
    }

    if (game.elapsed >= game.nextHazard) {
      spawnHazard(game, random);
      game.nextHazard = game.elapsed + 3.1 - (game.level - 1) * 0.2;
    }
  }
  return events;
}
