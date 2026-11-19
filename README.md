# TimerOS

TimerOS is a Windows study timer designed to work offline. Choose a focus routine, start it, and keep working with a small, click-through timer at the bottom of the screen. Customizable screen alerts signal focus and break transitions. Sound is off by default.

The planned timer modes include Pomodoro, fixed focus and break intervals, a countdown, a stopwatch, custom sequences, and Flowtime.

## Phase 2 Windows preview

Version 0.2.3 supports Pomodoro, fixed focus and break intervals, and a single countdown. Edit the active setup once or save it as a named preset. Choose automatic or manual transitions, then end after a round target, a focus-time goal, or by pressing Stop.

Starting a session minimizes TimerOS and opens the click-through mini timer. Restore the main window from the taskbar or tray. Closing the main window during a session leaves the timer running in the tray. Use **Quit TimerOS** from the tray or Settings to exit.

**Settings → Mini timer** controls its monitor, placement, size, opacity, colors, and visible information. **Move mini timer** makes it draggable until you save or cancel. TimerOS uses the primary display when your saved display is unavailable.

**Settings → Alerts and sound** lets you configure focus, break, and session-finished alerts separately. Screen alerts use all monitors by default. The optional chimes start off. A repeating alert can be dismissed without interrupting the session. Windows reduced motion uses a still tint.

The default shortcuts are Ctrl+Alt+F6 to pause or resume, F7 to start the next interval, F8 to show or hide the mini timer, F9 to reopen TimerOS, and F10 to dismiss an alert. Use the same Ctrl+Alt modifiers with each key. Each shortcut is editable and can be disabled.

**Settings → Timer recovery** controls Windows lock, sleep, and app close independently. Pause and resume manually is the default. Keeping time running reconciles elapsed intervals after you return. TimerOS saves presets and active sessions on the device. After an unexpected exit in pause mode, it restores the last saved checkpoint, normally within ten seconds of the interruption.

For development on Windows x64, install Node.js 24 and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). Run `npm ci`, then `npm run dev:windows`. To build the per-user installer, run `npm run tauri -- build -- --locked`. The installer is written to `src-tauri/target/release/bundle/nsis`.

Run `npm test` for the timer and settings tests. Windows verification covers the installer, recovery, mini timer, alert windows, and global shortcut dispatch. Exclusive fullscreen apps may control the display directly. The running timer and last alert remain available through the tray or main window.

## Documentation

- [Master development prompt](docs/MASTER_PROMPT.md) covers product requirements, the six-phase roadmap, and Windows acceptance checks.
- [TimerOS logo kit](src/assets/branding/Start%20here.txt) describes the app icons, wordmarks, and splash animations.
