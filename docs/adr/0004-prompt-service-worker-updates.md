# 0004 — Prompt-based service-worker updates

**Status:** Accepted

## Context

`vite-plugin-pwa` can register the service worker as `autoUpdate` (silently swap in new code on the next navigation) or `prompt` (let the app decide when to apply an update). Because the in-progress game is not persisted ([0001](0001-high-score-only-persistence.md)), a silent swap can reload mid-game and discard the player's board.

## Decision

Use **`registerType: 'prompt'`**. On `onNeedRefresh`, show a dismissible "New version available — Refresh" toast; the user chooses when to reload (`updateSW(true)`). `onOfflineReady` shows a brief "Ready to play offline" toast.

## Consequences

- No surprise mid-game reloads; the player controls when to update.
- The toast is created only inside the update callbacks — never at initial load — so it cannot affect First Contentful Paint.
- Slightly more wiring in `main.ts` than autoUpdate; worth it for a game.
