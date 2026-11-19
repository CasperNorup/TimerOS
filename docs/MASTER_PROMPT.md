# TimerOS Master Development Prompt

**Repository** · [CasperNorup/TimerOS](https://github.com/CasperNorup/TimerOS)  
**Platform** · Windows desktop, single user, fully usable offline  
**Language** · English UI and documentation. Add Danish as a selectable UI language in Phase 5.

## 1. Role and goal

You are the developer, designer, and tester for TimerOS. Build a small study timer that lets me select a routine, start it, and get back to work. When I start a session, minimize the main window and show a small, click-through timer at the bottom of the screen. Tell me when to switch between focus and breaks with a translucent color pulse. Keep sound off by default.

Use [LifeOS](https://github.com/CasperNorup/LifeOS) and [BudgetOS](https://github.com/CasperNorup/BudgetOS) as the visual and technical references. Carry over the rounded shapes, typography, spacing, buttons, focus states, and Settings layout. Keep the TimerOS main screen compact. Give the timer, preset selector, and Start button priority. Offer Timer, Settings, and eventually History through compact navigation. Reopen the app with the last-used preset ready.

## 2. Timer modes and presets

| Mode | Behavior | Initial preset or default |
| --- | --- | --- |
| Pomodoro | Alternate timed focus blocks and short breaks. Substitute a long break after a configurable number of focus blocks when the session is continuing. | **Classic Pomodoro** uses 25 min focus, 5 min short breaks, and a 15 min long break after every four completed focus blocks. |
| Fixed focus and break | Repeat a two-block focus and break pattern. | 45/5 and 90/15. |
| Single countdown | Run one focus block with an editable duration. | Offer quick durations and allow direct entry. |
| Stopwatch | Count up from zero. Allow an optional focus-time goal. | Open-ended unless a goal is set. |
| Custom sequence | Build an ordered list of named Focus and Break blocks. Set each duration, reorder blocks, and choose whether the sequence repeats. | Include a short example users can duplicate and edit. |
| Flowtime | Count up while I study. When I choose **Take a break**, suggest a break based on time spent focusing and let me adjust it. Next focus block counts up again. | Editable defaults of 5 min for up to 25 min of focus, 8 min for over 25 through 50 min, and 10 min for over 50 min. Also allow choosing each break duration by hand. |

In TimerOS, a timer mode defines the timing behavior and a preset stores its reusable configuration. Create, save, name, rename, edit, duplicate, and delete personal presets. Use the preset editor to enter focus time, short and long breaks, the long-break cadence, and other settings supported by that mode. Make built-in presets easy to use as starting points. A one-off edit applies to the current session. Provide a deliberate **Save preset** or **Save as new preset** action for permanent changes.

### Session rules

- For repeating modes, offer three ending conditions: a fixed number of focus rounds, a target amount of active study time, or **Until I stop**. One-off countdowns and single-pass sequences can finish on their own. A round means one completed focus block. A skipped focus block advances the plan and does not count as a completed round.
- Study targets count active focus time. Exclude breaks, manual pauses, and time spent waiting for the next interval. Finish when the target is reached, including mid-block. When a round target is reached, finish directly unless the user deliberately included a final break in a single-pass sequence. Show the applicable condition in the session setup.
- Auto-start the next timed focus or break interval by default. Give the user independent settings for starting breaks and starting focus automatically. If manual, show which interval is ready and let the user start it from the main window, tray, or a configured shortcut. Flowtime begins breaks when the user chooses to take one.
- Allow pause, resume, skip, restart the current interval, add time, and stop. Offer **+5 min** for timed blocks. Commands affect the active session and keep all views synchronized. At the end, show the result and make starting the same preset again easy.
- Support one active session at a time. Prompt before replacing it with another. Store enough state to recover after reopening. Let the user set separate policies for Windows lock, sleep, and explicit app quit. For each, offer **Pause and resume manually** (default) or **Keep time running**. In keep-running mode, derive the expected state from elapsed time when Windows wakes or TimerOS reopens. Respect manual transition settings during catch-up. Reconcile elapsed intervals once and deliver at most one relevant catch-up alert. Closing the main window during a session keeps the app running in the tray. Provide a separate **Quit TimerOS** action.

## 3. Windows mini timer

- After Start, minimize the main window automatically while keeping its taskbar entry accessible. Show a small always-on-top, non-activating window near the bottom-right by default. Its entire surface is click-through during ordinary use. Clicking or scrolling through it continues to affect the underlying app. Starting a timer must avoid transferring focus to the mini timer.
- Clicking the TimerOS taskbar button restores the main controls while the same session continues. Use an explicit **Move mini timer** action to temporarily make the mini timer draggable. Return it to click-through mode as soon as placement is confirmed or canceled.
- Offer bottom-left, bottom-center, bottom-right, and free placement, plus a monitor choice. Remember the chosen position across launches and account for Windows taskbar placement, display scaling, and monitor disconnects. If the saved display becomes unavailable, move the mini timer into view on an available display.
- Show the time and a slim progress bar by default when the interval has a duration or target. An untargeted count-up shows elapsed time with no determinate bar. Let the user choose which elements appear, including the phase label or round count, and customize size, opacity, colors, and progress style.
- Keep the session running while another app is fullscreen. Keep the mini timer visible over supported fullscreen windows. Verify behavior in Windows with ordinary, maximized, borderless fullscreen, and exclusive fullscreen apps. If Windows prevents a window from being drawn above an app, keep timing and provide a tray or in-app status fallback. Record the verified fullscreen behavior.
- Provide configurable global shortcuts where Windows supports them, including Pause/Resume, Start Next Interval, Show/Hide Mini Timer, Open TimerOS, and Dismiss Alert. Report conflicts and leave the corresponding controls available from the taskbar or tray. Make Open, Pause/Resume, and Dismiss Alert easy to reach from the tray.

## 4. Visual and sound alerts

Create independent settings for **Focus ended / break is next**, **Break ended / focus is next**, and **Session finished**. All three visual events are enabled by default. Each can be disabled independently and have its own color and animation. A transition with a manually started next interval alerts once when the current interval ends. The final interval generates only the session-finished alert. Give the user a separate setting for whether explicitly pressing Stop also plays the session-finished alert. Leave that setting off initially.

- Show a translucent visual alert on **all connected monitors by default**, including across supported fullscreen apps. Keep the overlay above normal app windows, click-through, and free of keyboard focus. Offer selected-monitor and mini-timer-only alternatives. Keep work visible beneath full-screen tint.
- Offer at least three visual styles, such as a whole-screen fade, edge glow, and static tint. Settings include color, peak opacity, fade duration, time between pulses, and pulse count. Allow either a finite pulse count or **Repeat until dismissed**. Default to two soft fade pulses in distinct, editable colors for the three events. Bound all pulsing styles to a slow cadence of at most one complete pulse every two seconds. Add a still indicator and respect the Windows reduced-motion setting. Include an explicit preview that can be stopped immediately.
- For a repeating alert, dismiss from the global shortcut, taskbar-restored main window, or tray. Dismissal leaves the timer running. A newer event replaces the old alert as one synchronized alert across displays. Stop alert overlays when the app quits. If an overlay cannot appear over a fullscreen window, surface the event in the tray or app and test that the timer continues correctly.
- Sound is optional and off by default. Use bundled, quiet chimes, with a master switch, master volume, per-event choices, and manual preview. Play a single chime per enabled event even when the visual alert repeats.

## 5. Appearance, branding, and history

- Bundle the official [TimerOS logo kit](https://github.com/CasperNorup/TimerOS/tree/main/src/assets/branding) without regenerating the artwork. Use **TimerOS-mark-transparent.png** as the in-app blue T on transparent surfaces. Size the visible mark to match the apparent size of the logos in equivalent LifeOS and BudgetOS placements. Compare rendered screenshots and account for transparent padding. Use the official rounded icon with transparent corners and the checked-in `src-tauri/icons` assets for the Windows app, taskbar, Start menu, and installer. Review the icon at small sizes.
- Use a LifeOS-style startup splash. Default to **Bloom** in the first Windows build. Add a saved **Splash screen** choice with Bloom, Origami, Signal, and Off. Bundle animations locally. Opening the main window from the taskbar, bringing back the mini timer, or recovering an active session must avoid replaying the startup splash.
- Provide a light, dark, or system display mode and a blue default palette. Add editable and duplicable theme palettes, solid and gradient backgrounds, bundled and local image backgrounds with fill/fit and framing, font and text size controls, and spacing and density controls. Provide a live preview and an easy reset to defaults. Keep all appearance controls in Settings. Let the mini timer inherit the theme or have its own appearance. Handle missing or invalid image files gracefully.
- Add an optional local History view in the final phase. Show recent sessions and daily and weekly focus totals. Allow a short optional subject label. Record actual active study time, including stopped sessions, and mark those sessions as partial. Give users a way to turn tracking off and clear saved history. Provide the full timer workflow without history.
- The product scope is a standalone study timer. Keep presets, preferences, assets added by the user, and any history on the device. Exclude accounts, sync, export, and LifeOS or BudgetOS integrations.

## 6. Implementation and development workflow

- Start from the current TimerOS repository. Read its files, branding guide, and history, plus the relevant LifeOS and BudgetOS components. Preserve the official kit and existing work. Use the shared Tauri 2, Rust, React, TypeScript, and Vite stack. Verify native window, shortcut, power-state, and display behavior early on Windows.
- Use one authoritative timer state for the main window, mini timer, tray, and alerts. Derive elapsed and remaining time from clock state and deadlines so missed UI updates do not slow the timer. Separate timer transitions from rendering. Validate timer input and persist state on meaningful changes with atomic or transactional writes. Use stable settings and data versions and preserve them across upgrades. Avoid duplicated transitions, sounds, completed rounds, or history after resume and recovery.
- Work in complete, explicitly authorized subphases. Before coding, define the scope, user-facing deliverable, and acceptance checks. Finish and verify the whole subphase, record the tested revision and open issues, then wait for approval before starting the next subphase. Version prototypes as `0.<phase>.<subphase>`.
- Run fast tests and builds locally. Keep GitHub Actions runs focused on checks that require CI, meaningful integration points, or installer delivery. Batch related work and reuse a verified build at the same revision when possible. At the end of each main phase, provide one verified Windows x64 installer and a short manual checklist. The owner installs and tests the app without needing developer tools. Validate installation, Start menu shortcut, and in-place upgrade with preferences retained.

## 7. Roadmap

| Phase | Subphases and acceptance checks |
| --- | --- |
| **0 · Windows foundation** | **0.1** Set up the repo, compact app shell, official icon, Bloom splash, and installer. **0.2** Verify the Windows approach for non-activating click-through windows, monitor geometry, pulse overlays, fullscreen behavior, global shortcuts, and power-state events. Record supported cases and any gaps on real Windows. |
| **1 · Reliable timer** | **1.1** Build timer state, Pomodoro, and a one-off countdown. Verify pause and resume, skip, restart, time adjustments, and finish. **1.2** Add personal presets, fixed intervals, rounds and focus-time targets, and manual or automatic transitions. **1.3** Add session persistence, sleep and lock settings, restart recovery, and duplicate-event tests. |
| **2 · Mini timer and alerts** | **2.1** Implement taskbar restore, tray controls, click-through mini timer, and saved monitor placement. **2.2** Add all-monitor alerts with per-event controls, optional sound, finite pulses, and repeat until dismissed. **2.3** Add shortcuts and test fullscreen, multiple DPI settings, disconnected displays, and alert dismissal. This is the first daily-use installer. |
| **3 · Additional timer methods** | **3.1** Add the stopwatch and custom sequence editor with repeat controls. **3.2** Add Flowtime and manual-break selection. Verify that every mode works from the same main window, mini timer, session controls, and alert settings. |
| **4 · Appearance** | **4.1** Add themes and editable palettes. **4.2** Add backgrounds, image positioning, fonts, and spacing. **4.3** Add mini timer styling and the splash selector. Verify saved choices, dark and light readability, logo sizing, and full keyboard access. |
| **5 · History and release** | **5.1** Add optional local history, subjects, and daily and weekly totals. **5.2** Add Danish and verify layouts, date formats, and all timer states in both languages. **5.3** Verify installation, upgrade, and the complete owner checklist, and prepare the release. |

### End-to-end checks

- Start Classic Pomodoro and return to studying in another window. Verify that the main window has minimized, the mini timer is visible and accurate, and clicks pass through it. Reopen TimerOS from the taskbar and verify the same interval and remaining time.
- Use multiple monitors and a fullscreen app. Observe the focus, break, and session-finished alerts, confirm their event-specific colors and pulse counts, and verify that a repeating alert dismisses everywhere without pausing the timer. Fresh installs should produce no timer sounds.
- Test manual and automatic transitions, all three ending conditions where applicable, pause and time adjustment, and the countdown, stopwatch, custom sequence, and Flowtime modes. Verify the time target can end mid-block and that skipped or paused time does not inflate focus totals.
- Restart, lock, and sleep Windows under both recovery settings. Verify the timer settles into the correct state, and missed alerts and history are reconciled once. Confirm presets, theme, backgrounds, mini timer placement, and splash preference survive app restart and upgrade.

## References

- [LifeOS appearance guide](https://github.com/CasperNorup/LifeOS/blob/main/docs/USER_GUIDE.md#appearance-and-keyboard-shortcuts) and [BudgetOS design reference](https://github.com/CasperNorup/BudgetOS/blob/main/docs/MASTER_PROMPT.md#lifeos-design-reference).
- [Study of Pomodoro, Flowtime, and self-regulated breaks](https://pmc.ncbi.nlm.nih.gov/articles/PMC12292963/) for the timing patterns.
- [W3C guidance on flash frequency](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes.html) for the slow-pulse alert design.
