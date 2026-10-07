# Planline Scheduler

A free, server-free project scheduler that runs entirely in the browser.

- **WBS** with unlimited sub-activities (indent / outdent), summary roll-ups and WBS codes
- **Import** from Excel (.xlsx/.xls), CSV, MS Project XML, or a Planline backup, with automatic column matching
- **Man-hours** typed in, or calculated from an editable library of indicative industry norms (quantity × MH/unit × productivity factor); duration can be derived from man-hours ÷ (crew × hours/day)
- **Scheduling logic**: FS / SS / FF / SF links with lead/lag, critical path, total float, working calendar with holidays, "start no earlier than" dates, status-date rescheduling, baseline
- **Gantt chart** with dependency arrows, critical path, progress, baseline bars and day / week / month zoom
- **Dashboard**: KPI tiles, S-curve (planned, baseline, actual), status mix, phase progress, man-hour histogram, a chart builder with PNG export, and a "needs attention" list
- **Export**: Excel report (summary, schedule, critical path, weekly man-hours, phases, resources), CSV, MS Project XML, JSON backup

All data is stored in the visitor's browser (localStorage). There is no server, database or login.

## Run it

Open `index.html` in a browser. That's it. No build step.

## Publish free on GitHub Pages

1. Push this folder to a public GitHub repository.
2. On GitHub: **Settings › Pages › Build and deployment › Source: Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

Cloudflare Pages or Netlify work the same way (no build command, output directory `/`).

## Turn on ads (later)

1. Apply for Google AdSense with the live site URL. AdSense needs a privacy policy: edit `privacy.html` (add your contact email).
2. When approved, edit `js/config.js`: set `ads.enabled: true`, paste your `ca-pub-…` id into `adsenseClient`, and the slot ids into `slots.top` / `slots.bottom`.
3. Add the `ads.txt` file AdSense gives you to the repository root.

## Files

| Path | What it does |
|---|---|
| `index.html` | Page layout |
| `css/app.css` | Styles, light and dark theme |
| `js/config.js` | Site name, ads and footer links |
| `js/schedule.js` | Critical path engine |
| `js/importers.js`, `js/exporters.js` | File import and export |
| `js/norms.js` | Built-in man-hour norms (indicative values) |
| `js/gantt.js`, `js/dashboard.js`, `js/analytics.js` | Gantt chart, dashboard, progress maths |
| `js/app.js` | Editing, views and dialogs |
| `vendor/` | SheetJS (Apache-2.0) and Chart.js (MIT) |
