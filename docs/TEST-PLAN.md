# Web Index Panel — Browser Acceptance Test Plan

## Browser checks

1. GitHub Pages URL opens in Chrome over HTTPS.
2. `index.html` loads without errors.
3. `styles.css` applies a responsive mobile layout.
4. `app.js` initializes without JavaScript errors.
5. `progress.json` fetches and parses successfully.
6. All 15 browser-oriented modules appear.
7. Status filter displays the correct modules.
8. Refresh fetches the latest `progress.json`.
9. An unsupported `PASS` record is displayed as `BLOCKED`.
10. The panel remains usable on narrow Android Chrome and desktop viewports.

## Evidence required before PASS

- Actual browser/device and browser version.
- Timezone-aware ISO-8601 test timestamp.
- Test steps and observed result.
- Relevant screenshot, console log, audio/video sample or test report.
- A UI or source file alone does not prove the feature works.

## Scope

This plan covers the browser-based web app only. Android APK, Gradle, Android Studio and Play Store tests are out of scope.
