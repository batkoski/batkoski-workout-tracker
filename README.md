# Eli's Workout Tracker

A personal fitness tracking app built with React + TypeScript. Designed to feel like a native mobile app — tracks the MAPS Symmetry **Phase I** program (TRX/suspension foundational work) with Eli's adaptations, plus a built-in rest timer and Claude export for progress analysis.

## Features

- **5-day program** — Foundational #1 (Mon), Mobility Session #1 + progression work (Tue), Foundational #2 (Wed), Mobility Session #2 + Core & Calf (Thu), Foundational #3 (Fri), with rest days on weekends. Foundational days are the stock Phase I TRX/suspension list (minus the hanging iso-lat stretch).
- **Set logging** — tap a set to log weight/reps or holds; previous session values pre-fill as suggestions
- **Box pistol tracking** — logged left/right separately, with box height (inches) and counterbalance (lb) as first-class fields. Appears on both Tuesday and Thursday.
- **Tracked progression work** — Copenhagen plank, single-leg glute bridge, hollow hold, Pallof, face pulls, weighted prone Y-raise, logged as time/reps/weight PRs (L/R where unilateral) on Tuesday
- **60s rest timer** — starts automatically after each set, with browser notifications for next exercise
- **Mobility checklists** — the two stock MAPS Performance Mobility sessions, with 4-week frequency tracking
- **PM stretch checklists + daily bedtime routine** — collapsible, with context for the next day's training
- **Export for Claude** — copies your full workout log as text to paste into Claude for progress analysis; earlier (pre-2026-09-30) history is preserved and labeled with the exercise names in use at the time
- **Persistent storage** — all data saved to localStorage, survives page refreshes and browser restarts. Program logs are namespaced by version (`_v2`) so a program change never overwrites or mislabels historical records.

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
