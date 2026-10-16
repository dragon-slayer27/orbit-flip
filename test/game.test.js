import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, flip, pause, resume, angleDistance, normalizeAngle,
  WARNING_TIME, ACTIVE_TIME, HAZARD_HALF_WIDTH, PLAYER_RADIUS, TAU,
} from "../src/game.js";

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("angles wrap and measure the shortest distance across zero", () => {
  assert.ok(Math.abs(normalizeAngle(-0.1) - (TAU - 0.1)) < 1e-10);
  assert.ok(Math.abs(angleDistance(0.1, TAU - 0.1) - 0.2) < 1e-10);
});

test("the player moves automatically; flipping reverses without teleporting", () => {
  const game = createGame();
  advance(game, 0.2);
  const angle = game.angle;
  flip(game);
  assert.equal(game.angle, angle);
  assert.equal(game.direction, -1);
  advance(game, 0.1);
  assert.ok(angleDistance(game.angle, angle - 0.155) < 1e-10);
});

test("pause freezes all gameplay and resume preserves the run", () => {
  const game = createGame();
  advance(game, 0.5);
  pause(game);
  const frozen = structuredClone(game);
  assert.deepEqual(advance(game, 10), []);
  flip(game);
  assert.deepEqual(game, frozen);
  resume(game);
  advance(game, 0.1);
  assert.equal(game.phase, "running");
  assert.ok(game.elapsed > frozen.elapsed);
});

test("sparks award points, move safely, and boost multipliers with a cap", () => {
  const game = createGame();
  const random = seededRandom(9);
  game.nextHazard = Infinity;
  let expectedScore = 0;
  for (let count = 1; count <= 25; count++) {
    game.spark = game.angle;
    const events = advance(game, 1 / 120, random);
    const multiplier = Math.min(3, 1 + Math.floor(count / 5));
    expectedScore += 10 * multiplier;
    assert.equal(game.collected, count);
    assert.equal(game.multiplier, multiplier);
    assert.equal(game.score, expectedScore);
    assert.equal(events[0].type, "spark");
    assert.equal(events[0].points, 10 * multiplier);
    assert.ok(angleDistance(game.spark, game.angle) > 0.8);
  }
  assert.equal(game.level, 5);
});

test("warning arcs are harmless, solid arcs end the run", () => {
  const game = createGame();
  game.hazards = [{ angle: game.angle, age: 0 }];
  advance(game, 1 / 120);
  assert.equal(game.phase, "running");
  game.hazards = [{ angle: game.angle, age: WARNING_TIME }];
  const events = advance(game, 1 / 120);
  assert.equal(game.phase, "over");
  assert.equal(events[0].type, "death");
  const frozen = structuredClone(game);
  advance(game, 1);
  flip(game);
  assert.deepEqual(game, frozen);
});

test("large frame intervals cannot tunnel through a hazard", () => {
  const game = createGame();
  game.angle = 0;
  game.spark = 4;
  game.hazards = [{ angle: 0.6, age: WARNING_TIME }];
  advance(game, 0.8);
  assert.equal(game.phase, "over");
  assert.ok(game.angle < 0.6);
});

test("collision includes the player's radius across the angle boundary", () => {
  const game = createGame();
  game.angle = TAU - HAZARD_HALF_WIDTH - PLAYER_RADIUS + 0.01;
  game.hazards = [{ angle: 0, age: WARNING_TIME }];
  advance(game, 1 / 120);
  assert.equal(game.phase, "over");
});

test("expired hazards disappear before collision detection", () => {
  const game = createGame();
  game.hazards = [{ angle: game.angle, age: WARNING_TIME + ACTIVE_TIME }];
  advance(game, 1 / 120);
  assert.equal(game.hazards.length, 0);
  assert.equal(game.phase, "running");
});

test("new hazards are telegraphed and spaced away from the player and spark", () => {
  for (let seed = 0; seed < 200; seed++) {
    const game = createGame();
    game.angle = seededRandom(seed + 1)() * TAU;
    game.spark = normalizeAngle(game.angle + 0.7);
    game.nextHazard = 0;
    advance(game, 1 / 120, seededRandom(seed));
    assert.equal(game.hazards.length, 1);
    const hazard = game.hazards[0];
    assert.equal(hazard.age, 0);
    assert.ok(angleDistance(hazard.angle, game.angle) > 1.1);
    assert.ok(angleDistance(hazard.angle, game.spark) > 0.55);
  }
});

test("spark placement avoids every current hazard across varied runs", () => {
  for (let seed = 0; seed < 200; seed++) {
    const game = createGame();
    game.angle = 0;
    game.spark = 0;
    game.hazards = [{ angle: 1.5, age: 0 }, { angle: 3, age: 0 }, { angle: 4.5, age: 0 }];
    advance(game, 1 / 120, seededRandom(seed));
    assert.equal(game.collected, 1);
    assert.ok(game.hazards.every((hazard) => angleDistance(game.spark, hazard.angle) > 0.55));
  }
});

test("a fresh run resets score, difficulty, direction, hazards and elapsed time", () => {
  const old = createGame();
  old.score = 200;
  old.level = 4;
  old.phase = "over";
  const fresh = createGame();
  assert.equal(fresh.score, 0);
  assert.equal(fresh.level, 1);
  assert.equal(fresh.direction, 1);
  assert.equal(fresh.elapsed, 0);
  assert.deepEqual(fresh.hazards, []);
});

test("invalid time is reported rather than corrupting the game", () => {
  for (const seconds of [-1, NaN, Infinity]) {
    assert.throws(() => advance(createGame(), seconds), RangeError);
  }
});
