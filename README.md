# TimerOS

TimerOS is a Windows study timer designed to work offline. Choose a focus routine, start it, and keep working with a small, click-through timer at the bottom of the screen. Customizable screen alerts signal focus and break transitions. Sound is off by default.

The planned timer modes include Pomodoro, fixed focus and break intervals, a countdown, a stopwatch, custom sequences, and Flowtime.

## Phase 1 Windows preview

Version 0.1.3 supports Pomodoro, fixed focus and break intervals, and a single countdown. Edit the active setup once or save it as a named preset. Choose automatic or manual transitions, then end after a round target, a focus-time goal, or by pressing Stop.

**Settings → Timer recovery** controls Windows lock, sleep, and app close independently. Pause and resume manually is the default. Keeping time running reconciles elapsed intervals after you return. TimerOS saves presets and active sessions on the device. After an unexpected exit in pause mode, it restores the last saved checkpoint, normally within ten seconds of the interruption.

For development on Windows x64, install Node.js 24 and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). Run `npm ci`, then `npm run dev:windows`. To build the per-user installer, run `npm run tauri -- build -- --locked`. The installer is written to `src-tauri/target/release/bundle/nsis`.

Run `npm test` for the timer state tests. Windows verification also tests the installer, app startup, and session recovery.

## Documentation

- [Master development prompt](docs/MASTER_PROMPT.md) covers product requirements, the six-phase roadmap, and Windows acceptance checks.
- [TimerOS logo kit](src/assets/branding/Start%20here.txt) describes the app icons, wordmarks, and splash animations.
