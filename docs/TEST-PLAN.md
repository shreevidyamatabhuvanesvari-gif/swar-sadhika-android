# Index Panel Acceptance Test Plan

## Required checks

1. App launches to the Index Panel without crashing.
2. Build label is visible.
3. Overall percentage starts at 0% because zero features have certified PASS.
4. All 17 modules are listed.
5. Each module displays its actual status.
6. Expanding a module shows test environment, timestamp, evidence, and blocker.
7. Refresh reloads `progress.json`.
8. An unsubstantiated `PASS` entry is displayed as `BLOCKED`.
9. The panel remains usable on a narrow Android phone screen and with a large font setting.
10. No network permission or internet request is required by the Index Panel.

## Evidence required before PASS

- Exact device/emulator model and Android version.
- App version/build.
- Date/time of test.
- Steps performed.
- Actual result.
- Screenshot, log, audio/video sample, or other relevant evidence.
