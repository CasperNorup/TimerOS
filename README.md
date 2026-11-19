# TimerOS

TimerOS is a Windows study timer designed to work offline. Choose a focus routine, start it, and keep working with a small, click-through timer at the bottom of the screen. Customizable screen alerts signal focus and break transitions. Sound is off by default.

The planned timer modes include Pomodoro, fixed focus and break intervals, a countdown, a stopwatch, custom sequences, and Flowtime.

## Windows foundation preview

Version 0.0.1 opens the compact Timer and Settings screens after playing Bloom. Settings lets you choose a display mode, and Timer previews the Classic Pomodoro layout. Timer controls arrive in Phase 1.

For development on Windows x64, install Node.js 24 and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). Run `npm ci`, then `npm run dev:windows`. To build the per-user installer, run `npm run tauri -- build -- --locked`. The installer is written to `src-tauri/target/release/bundle/nsis`.

## Documentation

- [Master development prompt](docs/MASTER_PROMPT.md) covers product requirements, the six-phase roadmap, and Windows acceptance checks.
- [TimerOS logo kit](src/assets/branding/Start%20here.txt) describes the app icons, wordmarks, and splash animations.
