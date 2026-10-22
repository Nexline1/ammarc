# Ammarc

**Say it. See it built.** An idea-to-image studio for plant improvements. Mark a spot on a photo, or drop an element from the library, then say one sentence. Only that area changes, and the result becomes a pitch slide.

- **Claude** (`claude-opus-5-5`) reads the sentence, the board and his saved rules, then returns a structured plan. The plan covers what changes, where, the hinge side, sizes, what must stay, and its own assumptions.
- **OpenAI** (`gpt-image-2.5-sunburst` for edits, `-flare` for new renders and parts) draws it.
- **The app** pastes the original pixels back everywhere outside the marked area, so untouched areas stay byte-identical. Dimensions and notes are drawn by the app, never by the model.

## Run

```bash
npm install
npm run dev        # http://localhost:5180 (demo mode until keys are set)
```

To run the production build:

```bash
npm run build
npm start
```

Copy `.env.example` to `.env` and add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` to switch off demo mode.

With real keys and no `APP_PASSWORD`, the server only answers on this computer. Set a password to use it from a phone or to put it online.

`DAILY_IMAGE_CAP` and `DAILY_CLAUDE_CAP` limit the paid calls per day.

## Check

```bash
npm test           # unit: paste-back guarantee, API sizes, prompt contract, schemas, element library
npm run e2e        # Playwright: full flow on desktop (1440) and phone (390, touch)
npm run eval       # planner contract on 12 cases from his profile (mock, free)
```

For the planner on real Claude, run `npm run eval -- --live --cap=5`. It stops at an estimated $5. Put his own photos in `evals/images/<case-id>.jpg` to use them.

## Layout

| Path | What |
|---|---|
| `shared/types.ts` | The contract (zod) between board, Claude and renderer |
| `server/claude.ts` | System prompt, plan/check/pitch calls |
| `server/compile.ts` | Plan → image prompt, deterministic |
| `server/images.ts` | OpenAI edits (streamed previews), parts, transcription |
| `server/mock.ts` | Demo mode |
| `src/canvas/raster.ts` | Masks, feathering, colour-matched paste-back |
| `src/canvas/Board.tsx` | Konva board: tools, pinch/zoom, elements, marks |
| `src/turn.ts` | One sentence → plan → render → version → check |
| `public/elements/` | 81 drawn elements; `src/elements/batch-*.json` holds names (EN/AR), synonyms and sizes |

Plan: `docs/PLAN.md`. Council: `docs/council-transcript.md`. Build log: `loop/`.
