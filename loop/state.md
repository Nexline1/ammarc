# Build state (resume here)

Plan: `docs/PLAN.md` (approved). Council: `docs/council-report.html` + `docs/council-transcript.md`.

**Owner decisions**
- Photo-first: Alba allows uploads.
- Name: **Ammarc** (renamed from Armature on 2026-10-22). The folder stays `armature/`.
- Live proof run capped at **$5**.
- Hosting is decided at hand-over.
- Fable is out of credits, so deep work runs on Opus and mechanical work on Sonnet.

## Status: built and working in demo mode (2026-10-21)
- **Built:** server, contract, Claude/OpenAI calls, demo mode, board, library (81 SVGs), turn loop with paste-back, assistant + voice + memory, versions + compare, PNG + PPTX export, EN/AR, wide/compact layouts.
- **Checks:**
  - `npx tsc` clean
  - `npm test` 107/107
  - `npm run eval` 8/8 mock (4 cases are live-only)
  - `npm run build` OK
  - `npm run e2e` 8 passed, 2 skipped by design (laptop-only / phone-only) on system Edge, laptop 1440 + phone 390
- **Visual checks in the browser preview:** laptop, phone, Arabic, memory sheet, compare.

## Review round (Opus, fresh context): 12 findings, all fixed
- **Project switch mid-render:** writes are now tied to the project; switching projects and versions is blocked while busy.
- **Flipped element:** the flip is on the inner image and the transformer on an outer group, so resizing a flipped element no longer turns it upside down.
- **Unmasked edit:** an edit with nothing marked now asks "Tap where" instead of rendering without a mask. The region is always every mark and element on the board.
- **Scene snapshot:** the render uses the scene Claude planned on, and the board is frozen while a turn runs.
- **Pitch slide:** images are fitted to their box by aspect ratio instead of stretched.
- **Login and network:** login locks after 8 failures in 15 minutes. With real keys and no password, the server listens on 127.0.0.1 only.
- **Spend caps:** they apply after validation, and there is a new daily cap on Claude calls (`DAILY_CLAUDE_CAP`).
- **Busy state:** `busy` is kept through blank-board creation.
- **Awaiting tap:** it is cleared on project switch and on undo/redo.
- **Autosave:** saves are serialized.
- **Phone sheet:** it stays mounted while dragging.
- **Margin:** `expand_px` became `expand_pct`, a percentage of the short side.

After the fixes: tsc clean, 109/109 unit tests, e2e 8 passed with 2 skipped by design, mock eval 8/8.

## UI round 2 (2026-10-22, owner: "rename to Ammarc, enhance the layout")
- **Laptop:** a Canva-style rail (Elements · My parts · Versions · Ideas). Clicking the open item folds the panel away.
- **Elements:** pages, with a row per category, "See all N", and a category page with a back arrow.
- **Versions:** newest first, each with the sentence that made it and a Current badge.
- **Board:** a progress stepper (Reading → Drawing → Saving) and a tool hint under the toolbar. The bottom bar has a zoom % readout (click to fit), and the tool returns to Select after a render.
- **Other:** an assistant identity header and example cards, and "My parts" action cards.

All checks green after this round: tsc, 109 unit tests, mock eval 8/8, e2e 8 passed with 2 skipped by design.

## Next (after the owner adds keys)
- `npm run eval -- --live --cap=5` with his photos in `evals/images/`
- a manual real render on one photo
- pick a host and set `APP_PASSWORD`

## Lessons
- Never edit files with PowerShell 5.1 Get-Content/Set-Content: it reads UTF-8 as ANSI and mangles non-ASCII. Use Edit/Write.
- Opus 5.5 / Sonnet 5.5 reject forced `tool_choice`. Use structured outputs (`betaZodOutputFormat`).
- `res.sendFile` 404s for any path containing a dot-folder (e.g. `.e2e-data`) unless `dotfiles: 'allow'` is set.
- Pointer capture on an overlay swallows taps on its own buttons. Skip capture when the press starts on a button.
- A CSS class named like a panel (`.agent`) collided with a message role class. Use `from-agent`/`from-user`.
- `tsx watch` hangs inside the desktop preview runner. The preview uses `npm run preview` (no watch).
- Playwright 1.64's bundled Chromium wasn't installed, so the config uses `channel: 'msedge'`.
