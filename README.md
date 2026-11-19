# TimerOS

TimerOS is a Windows study timer designed to work offline. Choose a focus routine, start it, and keep working with a small, click-through timer at the bottom of the screen. Customizable screen alerts signal focus and break transitions. Sound is off by default.

## Phase 4 Windows preview

Version 0.4.3 supports Pomodoro, fixed focus and break intervals, a single countdown, Stopwatch, custom sequences, and Flowtime. Edit the current setup or save it as a named preset. Automatic and manual transitions are available for timed focus and break blocks.

- **Stopwatch** counts up from zero. Set a focus-time target to finish automatically and show progress, or press Stop whenever you are done.
- **Review Sequence** is a starting point for a custom sequence. Name, reorder, add, or remove timed focus and break blocks. Run the sequence once, repeat it, or set a round or focus-time goal.
- **Flowtime** counts up until you select **Take a break**. TimerOS suggests a 5-, 8-, or 10-minute break after up to 25, up to 50, or more than 50 minutes of active focus. Change these defaults in the preset or enter a different duration when you take a break. You can configure the next focus block to start automatically or wait for you.

Starting a session minimizes TimerOS and opens the click-through mini timer. Restore the main window from the taskbar or tray. Closing the main window during a session leaves the timer running in the tray. Use **Quit TimerOS** from the tray or Settings to exit.

**Settings → Appearance** lets you choose System, Light, or Dark independently of the theme. Create or duplicate a theme to edit its light and dark palettes. Preview changes in the app as you edit. Switch between the theme background, a solid color, a gradient, either bundled photo, or your own PNG, JPEG, or WebP. TimerOS keeps a local copy of the selected image. Use **Image fit** and the horizontal and vertical sliders to frame it. If the saved copy becomes unavailable, TimerOS uses the theme background.

In **Text and spacing**, set the body and heading fonts, text size, line spacing, and layout density. **Reset appearance** selects the defaults and keeps your saved themes and local image available. In **Splash screen**, choose Bloom, Origami, Signal, or Off. The saved animation plays at launch when motion is enabled. Restoring an active session or reopening the window from the taskbar skips the splash.

**Settings → Mini timer** controls its monitor, placement, size, opacity, colors, and visible information. Use **Mini timer colors** to match the app theme or keep independent colors, and see them in the preview. **Move mini timer** makes it draggable until you save or cancel. TimerOS uses the primary display when your saved display is unavailable.

**Settings → Alerts and sound** lets you configure focus, break, and session-finished alerts separately. Screen alerts use all monitors by default. The optional chimes start off. A repeating alert can be dismissed without interrupting the session. Windows reduced motion uses a still tint.

The default shortcuts are Ctrl+Alt+F6 to pause or resume, F7 to start the next interval, F8 to show or hide the mini timer, F9 to reopen TimerOS, and F10 to dismiss an alert. Use the same Ctrl+Alt modifiers with each key. Each shortcut is editable and can be disabled.

**Settings → Timer recovery** controls Windows lock, sleep, and app close independently. Pause and resume manually is the default. Keeping time running reconciles elapsed intervals after you return. TimerOS saves presets and active sessions on the device. After an unexpected exit in pause mode, it restores the last saved checkpoint, normally within ten seconds of the interruption.

For development on Windows x64, install Node.js 24 and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). Run `npm ci`, then `npm run dev:windows`. To build the per-user installer, run `npm run tauri -- build -- --locked`. The installer is written to `src-tauri/target/release/bundle/nsis`.

Run `npm test` for the timer and settings tests. Windows verification covers the installer, recovery, mini timer, alert windows, and global shortcut dispatch. Exclusive fullscreen apps may control the display directly. The running timer and last alert remain available through the tray or main window.

The bundled Forest Mist and Danish Coast backgrounds are shared with LifeOS.

## Documentation

- [Master development prompt](docs/MASTER_PROMPT.md) covers product requirements, the six-phase roadmap, and Windows acceptance checks.
- [TimerOS logo kit](src/assets/branding/Start%20here.txt) describes the app icons, wordmarks, and splash animations.
