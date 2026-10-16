# Orbit Flip

**One button. One orbit. One more try.**

A one-button browser arcade game. Reverse direction, collect purple sparks, and
avoid red hazards as the orbit gets faster.

Built with plain JavaScript, HTML, CSS, and the Canvas API. No framework, external
assets, backend, or runtime dependencies.

## Features

- Keyboard, mouse, and touch controls.
- Five difficulty levels and score multipliers up to 3x.
- Telegraphing hazards, particle effects, and optional synthesized audio.
- Locally saved personal best and sound preferences.
- Pause/resume, automatic pause when leaving the window, and instant restart.
- Optional fullscreen view with scores, sound, pause, and game controls.
- Responsive layout, visible keyboard focus, game-state announcements, and
  reduced-motion support.

## Gameplay

| Action | Control |
| --- | --- |
| Start or restart | Space or the on-screen play button |
| Reverse direction | Space, tap/click the playfield, or **Flip direction** |
| Pause or resume | P (or Escape outside fullscreen) |
| Resume from pause | Space or **Back to it** |
| Toggle audio | Speaker button |
| Enter or exit fullscreen | Expand/contract button in the playfield |
| Exit fullscreen | Escape |

- Collect purple sparks for points. Every fifth spark increases the multiplier,
  up to 3x. The fifth spark already receives the new multiplier.
- Dashed red arcs warn for 1.1 seconds before becoming dangerous for 2.5 seconds.
  Solid red arcs end your run on contact. Sparks never spawn on a hazard.
- Every five sparks also increases speed and hazard frequency, up to level 5.
- Switching tabs or leaving the browser window automatically pauses the game.
- Sound is muted by default.

### Fullscreen

The expand button hides the surrounding page and gives the game the screen.
Scores, sound, pause, restart, and direction controls remain available. Switching
views pauses an active run without resetting it; press Space to resume.

Browsers without the Fullscreen API use an expanded, game-only view within the
browser viewport instead. The exit button works in either mode, including on
touchscreens. The normal page returns on exit.

## Privacy and accessibility

Personal best and sound preference are saved locally in your browser, not sent to
a server. If browser storage is blocked or full, a visible notice explains that
your best will last only for the current visit.

Reduced-motion mode disables decorative animation and particle bursts. Orbital
movement remains necessary to play, and gameplay relies on visual timing.

## Development

### Tests

```sh
npm test
```

Uses Node's built-in test runner. Tests cover direction changes, pause/resume,
scoring and caps, collision and angle wrapping, warning/expiration timing,
safe spawning, restart state, and invalid elapsed time. The simulation is
separate from rendering and advances in small steps to prevent missed collisions.

### Project structure

| Path | Purpose |
| --- | --- |
| [index.html](./index.html) | Page markup and game controls |
| [assets/](./assets/) | Stylesheet and SVG icon |
| [src/game.js](./src/game.js) | Game state, simulation, scoring, and collisions |
| [src/main.js](./src/main.js) | Rendering, input, audio, and browser persistence |
| [test/](./test/) | Automated simulation tests |
| [scripts/serve.mjs](./scripts/serve.mjs) | Local development server |
| [package.json](./package.json) | Project metadata and development commands |

The simulation has no DOM dependencies and can be tested independently of the
browser. Rendering and browser integrations live in the application entry point.

## Acknowledgments

Developed with assistance from GitHub Copilot in VS Code.
