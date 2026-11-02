# Swar-Sadhika GitHub Pages Index Panel

This folder contains a **static web progress dashboard** for GitHub Pages. It is separate from the native Android Jetpack Compose Index Panel in the Android source project.

## Publish

Copy these files into the **root of the GitHub Pages publishing branch/folder**:

- `index.html`
- `styles.css`
- `app.js`
- `progress.json`

`docs/DASHBOARD-PROGRESS.md` is a human-readable log and is not required by the website.

In GitHub, open **Settings → Pages** and confirm that Pages is publishing from the branch and folder where `index.html` is located. The dashboard URL must point to that published site.

## Update progress

Edit `progress.json` and update the relevant module status, test environment, timestamp, evidence, and blocker. Do not mark a module `PASS` without actual test evidence.

## Important distinction

GitHub Pages can host this HTML/CSS/JavaScript dashboard. It cannot run Kotlin/Jetpack Compose. The native Android Index Panel must be built and installed as an Android app separately.
