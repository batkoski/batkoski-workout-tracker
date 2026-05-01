# Eli's Workout Tracker

A personal fitness tracking app built with React + TypeScript. Designed to feel like a native mobile app — tracks sets, weight, and reps across a 5-day training program, with a built-in rest timer and Claude export for progress analysis.

## Features

- **5-day program** — Push, Core/Mobility, Pull, Lower+Core, Core/Mobility, with rest days on weekends
- **Set logging** — tap a set to log weight + reps; previous session values pre-fill as suggestions
- **90s rest timer** — starts automatically after each set, with browser notifications for next exercise
- **Core exercise pool** — pick-your-own exercises on mobility days, with 4-week frequency tracking to avoid overuse
- **PM stretch checklists** — collapsible, with context for the next day's training
- **Export for Claude** — copies your full workout log as text to paste into Claude for progress analysis and recommendations
- **Persistent storage** — all data saved to localStorage, survives page refreshes and browser restarts

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
