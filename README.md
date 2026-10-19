# Eli's Workout Tracker

A personal fitness tracking app built with React + TypeScript. Designed to feel like a native mobile app — tracks a 5-day plan of two lifting days (muscle retention) and three functional days (core, t-spine, hips), plus a built-in rest timer and Claude export for progress analysis.

## Features

- **5-day program** — Lift A (Mon), Core + T-Spine (Tue), Hips + Functional (Wed), Lift B (Thu), Aesthetic Core + Upper (Fri), with rest days on weekends. Sessions are capped at ~45 minutes; the lift days use straight sets on one station at a time.
- **Set logging** — tap a set to log weight/reps, or a hold time in seconds for isometrics; previous session values pre-fill as suggestions
- **Per-exercise rest timer** — 60s by default, longer (90–120s) on the heavy compound lifts; starts automatically after each set, with browser notifications for the next exercise
- **Box pistol + left/right tracking** — on the hips day, box pistols (with box height in inches and counterbalance in lb), Copenhagen plank, and single-leg glute bridge are logged left and right separately
- **Warm-up openers** — a short t-spine/hip opener on every training day
- **Nightly routine** — a short PM nerve-glide/twist item plus the daily bedtime routine (shown every day, including rest days)
- **Export for Claude** — copies your full workout log as text to paste into Claude for progress analysis. Earlier history is preserved and labeled with the exercise names in use at the time: the MAPS Symmetry program (2026-09-30 → 2026-10-19) and the pre-2026-09-30 push/pull/lower program
- **Persistent storage** — all data saved to localStorage, survives page refreshes and browser restarts. Program logs are namespaced by version (`_v3`) so a program change never overwrites or mislabels historical records. Logs are keyed by day position and exercise position, so **never reorder or edit exercises in `PROGRAM_DAYS` without bumping the storage version** and freezing the old program as a labeled snapshot (see `LEGACY_V2_PROGRAM`).

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS (layout shell only — app UI uses inline styles)
- Deployed via GitHub Pages

## Local development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

Deploys to GitHub Pages via the `gh-pages` branch. Make sure the repo has Pages enabled (Settings → Pages → source: `gh-pages` branch).

## Usage on mobile

Open the GitHub Pages URL in Safari on iPhone, tap the share button → **Add to Home Screen**. The app will sit on your home screen and behave like a native app. localStorage persists between sessions on that device.

To sync progress across devices or analyze trends, use the **Export** button to copy your log and paste it into a Claude chat.
