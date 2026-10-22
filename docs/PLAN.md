# Ammarc (formerly Armature): idea-to-image studio for plant improvements

> 2026-10-22: the owner renamed the app **Ammarc**. Older mentions of "Armature" below are the original plan text.

## Context
Ammar works at Alba and pitches plant improvements (hazards, guarding, access, machinery changes) to his boss. ChatGPT gives him good images but doesn't follow him literally: it changes things he never mentioned and guesses details like the hinge side. His memory profile (`ammar_llm_memory_summary.pdf`) shows the pattern. He speaks one sentence at a time, marks photos in red, gives exact dimensions (door 90×60, 5 cm gaps, lower a duct 20 cm), wants "3D" to mean an industrial render that keeps the geometry, works in 1:1 or 3:4, and writes hazard → consequence → solution for PowerPoint pitches in English or Arabic. A mobile CAD app he imagined earlier failed because buttons didn't work and image insertion broke.

**Goal:** a Canva-feel React app (phone + laptop) where Claude interprets and OpenAI renders. Only what he asked for changes, and the result becomes a pitch slide. It is built and demoable on mocks with no API spend; keys come after the nephew sees it.

## Decisions locked
- **Photo-first.** Alba permits uploads. EXIF/GPS is still stripped from every upload.
- **Name: Armature.** Hides A-R-M-A from Ammar. It's the frame an idea is built on and the heart of an electric motor, and it isn't anyone's name, so it works as a company product long-term. Tagline: "Say it. See it built." The Latin wordmark is used in both the EN and AR UI. It lives in one `BRAND` constant.
- **Mock mode** switches on automatically when keys are absent, shown by a "Demo mode" pill. No spend until keys arrive.
- **After keys:** a proof run on 12 cases with a **$5 hard cap**, before Ammar sees it.
- **Hosting:** chosen at hand-over. The build is host-ready: one Node service, Dockerfile, password gate, daily image cap.
- **Model routing:** Fable is out of usage credits, so Deep-tier work runs on Opus and mechanical work goes to Sonnet.

## Council verdict (5 advisors + anonymous peer review; Executor rated strongest by all 5)
- Image models don't preserve the rest of the image on their own. The real guarantee is **deterministic paste-back** of original pixels outside the edited region.
- **Dropped elements are literal by construction.** The app places them, with hinge side and size visible before rendering, and the model only blends them in. This is what makes the element library worth having.
- **The app draws dimensions as vector callouts.** The model never renders them. The slide is labelled "Concept illustration, not to scale".
- **The pitch slide is the real deliverable.** Learned rules stay visible and editable. Nothing auto-spends on retries; the app offers a one-tap fix instead.
- Mocks can't prove the image quality, so the eval harness is built now and the capped proof run happens when keys arrive. The pass bar with Ammar is 8 of 10 literal edits.

## The product: one loop inside the three panels
**Loop:** photo (or blank board) → mark a spot or drop an element → one sentence (voice or text) → only that area changes → before/after → pitch slide.

### Layout
- **Desktop ≥1024:** a header (wordmark, project name, aspect 1:1 / 3:4 / 4:3 / 16:9, **Export**). Left Elements panel (288px), canvas in the centre (biggest), right Agent panel (340px). A contextual toolbar floats over the canvas, plus a bottom bar with undo/redo, zoom, versions and before/after.
- **Tablet 768–1023:** the left panel becomes an icon rail with a flyout; the agent becomes a right drawer.
- **Phone <768:** full-screen canvas with a bottom bar: Elements · Draw · **Mic** (large, centre) · Versions · Export. Panels open as spring bottom sheets. Tapping an element adds it, as a fallback to dragging.
- **First 10 seconds:** the canvas shows one large "Drop a photo" target with a "Start on a blank board" link. Nothing else.

### Canvas (react-konva)
- **Tools (kept few):** Select · Mark (red pen/circle, his habit) · Arrow · Dimension (two taps + value, e.g. "90 cm") · Text · Eraser.
- **Elements:** move, resize, rotate, **flip** (sets hinge side), duplicate, delete, set real size in cm.
- **Navigation and editing:** pinch-zoom and two-finger pan on touch; wheel zoom and space-drag on desktop. Undo/redo through scene snapshots. Shortcuts: Del, Ctrl+Z/Y, Ctrl+D.
- **Dragging from the library:** Pointer Events, so it works on touch. The dragged element keeps the offset where it was grabbed and settles with a spring.

### Element library (left)
- About 80 drawn SVG line-art elements across 7 category pages:
  - Access & Safety: inspection door, L-door, sliding door, handrail, safety/step grating, ladder, cage ladder, platform, stairs, toe board, guard fence, mesh guard, wire rope, barrier, sign
  - Gas & Piping
  - Ducts & Air
  - Machinery & Lifting
  - Structure & Materials
  - Tanks & Vessels
  - Markups
- `catalog.json` gives each element an id, EN/AR name, synonyms, default size in cm, a flippable/hinge flag, and a prompt description. Doors show a visible hinge mark.
- **Search:** local fuzzy match on EN/AR names and synonyms.
- **"My parts" tab:**
  - Cut a part out of his own photo with a lasso.
  - Or ask the agent "make me a flue-end obturator", which generates a transparent PNG with Flare.
  - Either way the part is saved to his library, which grows with real Alba equipment.

### The Claude ↔ OpenAI contract (the precision core)
1. **Turn packet (client):**
   - the current version image
   - an annotated overlay (base + elements + marks + numbered tags)
   - scene JSON: elements with type, bbox %, rotation, flip/hinge and size in cm; marks with geometry and dimension values; text notes
   - his sentence, his language, and the aspect ratio
2. **Claude** (`CLAUDE_MODEL`, default `claude-sonnet-5-5`, switchable to Opus by env) gets a system prompt containing his rules, spec book and glossary, plus **one strict tool `plan_edit`** with these fields:
   - `action`: edit | generate | reply | make_part
   - `region`: marks | elements | whole, plus `expand_px`
   - `change`: one sentence
   - `items[{tag, what, material, size_cm, position, orientation}]`
   - `preserve[]`
   - `style`: photo | 3d_render | drawing
   - `aspect`
   - `assumptions[{text, alt}]`
   - `reply` (in his language)
   - `rule_suggestion?`
   - `pitch?`

   zod validates it at the server boundary.
3. **The server compiles the OpenAI prompt deterministically** from the plan, using a template: CHANGE / ITEMS / KEEP EXACTLY / STYLE. It is snapshot-tested. Claude never free-writes the final prompt.
4. **Render:** OpenAI's edits endpoint.
   - `image[0]` is the flattened composite (base + dropped elements); `image[1..]` are "my part" references.
   - `mask` is the union of marks and elements, dilated.
   - Model: `IMAGE_MODEL_EDIT` = `gpt-image-2.5-sunburst` for edits, `IMAGE_MODEL_FAST` = `gpt-image-2.5-flare` for generate and make-part.
   - Output size equals the base size, rounded to a multiple of 16.
   - `partial_images: 2` streams previews into the canvas while the agent narrates in his language.
5. **Paste-back (client):** the result is resized to the base and colour-matched in the feather band. It is then composited back through a feathered mask, so **pixels outside the region stay identical**. Paste-back is skipped only for whole-image actions such as "make it 3D".
6. **Background check:** a cheap Claude vision call compares the request with the result. On a clear miss the app shows "The door didn't appear. Fix it?" as one tap. It never auto-spends.
7. **No-mark rule:** if the sentence needs a location and nothing is marked, the agent's only allowed question is "Tap where". One tap becomes an auto-expanded region. Global operations (3D, style) need no mark.
8. Dimensions and labels are drawn by the app over the image. They are never requested from the model.

### Learning (visible, never hidden)
- **Seed rules** come from the PDF: edit literally, keep everything unmentioned, never guess the hinge side, steel for industrial parts, white background, 1:1 or 3:4.
- **Spec book:** door 90×60 cm, cylinders 5 cm apart, mesh 8 mm / 1 mm, tube 40×40, and similar. Each spec is applied only to the same component.
- **Corrections:** when he corrects something, a "Remember this?" chip appears. Tapping it saves the rule to the "What Armature knows" list, where he can edit or delete it.
- **Glossary:** what his words mean, e.g. "metal door" at a furnace = a hinged steel inspection door.

### Versions, export, voice, language
- **Versions:** every render becomes a version in a filmstrip; tap one to restore it. A before/after slider tracks the finger 1:1 and settles with a spring.
- **Export PNG:** at the chosen aspect, with the vector overlays.
- **Export pitch slide** (.pptx via pptxgenjs):
  - title, before photo, after image
  - hazard → consequence → solution, drafted by Claude and editable before export
  - EN or AR, with RTL handled
  - the "concept" footer
- **Voice:** push-to-talk → MediaRecorder → `/api/transcribe` (OpenAI transcription, handles mixed Gulf Arabic and English). The transcript is shown before sending. In mock mode it returns canned text.
- **Language:** English UI by default with an Arabic toggle. The agent replies in whatever language he used, and text uses `dir="auto"`. Panel positions stay fixed (elements left, agent right) as specified.

## Architecture: new folder `armature/` (one package)
- `src/`: React 19 + TS + Vite
  - `App.tsx`, `i18n.ts`, `styles.css`
  - `canvas/`: `Board.tsx`, `tools.ts`, `mask.ts`, `pasteBack.ts`
  - `panels/`: `Library.tsx`, `Agent.tsx`, `Versions.tsx`
  - `export/`: `png.ts`, `pitch.ts`
  - `elements/`: SVGs + `catalog.json`
- `server/`: Express 5 run with tsx
  - `index.ts`: static files, API, password gate, caps
  - `claude.ts`, `compile.ts`, `images.ts`, `transcribe.ts`
  - `store.ts`: `DATA_DIR` holds JSON and PNGs
  - `mock.ts`
- `shared/types.ts`: zod schemas for Turn, Scene, Plan
- `evals/cases.json` + `evals/run.ts`:
  - 12 cases from his profile, plus his real ones if the nephew provides them
  - mock mode checks the contract; live mode stops at $5
- `tests/`: vitest + Playwright. `loop/`: queue/state/lessons, a lean copy of the Qarar harness pattern from `beyond-the-chatbot/loop/`
- `Dockerfile`, `.env.example`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `APP_PASSWORD`, `DAILY_IMAGE_CAP`, `CLAUDE_MODEL`, `IMAGE_MODEL_EDIT`, `IMAGE_MODEL_FAST`, `DATA_DIR`
- **Deps:** react, react-dom, konva, react-konva, motion, pptxgenjs, express, @anthropic-ai/sdk, openai, zod. **Dev:** vite, typescript, tsx, vitest, @playwright/test.
- **Security:**
  - keys stay server-side only
  - password gate with a signed cookie
  - body size limits, per-minute rate limit and a daily image cap
  - EXIF stripped by re-encoding on upload
  - no keys in logs

## Design direction (/frontend-design from scratch + /apple-design)
- **Canva-familiar:** white workspace, light-grey canvas surround, element thumbnail grid, floating contextual toolbar, rounded panels.
- **Palette:** graphite neutrals plus one custom "molten copper" accent scale, not Alba's branding. Red is reserved for his marks.
- **Type:** a display face for the wordmark and empty-state headings; system-ui for the UI; IBM Plex Sans Arabic for Arabic. Tracking and leading vary with size.
- **Materials:** translucent floating bars over the canvas (backdrop blur), layered tinted shadows. Feedback fires on pointer-down; every control has hover, focus-visible and active states.
- **Motion:** critically damped springs by default; bottom sheets at damping 0.8 / response 0.3; bounce only after a flick. Fallbacks for reduced motion and reduced transparency.
- **Checks:** at least 2 screenshot-compare rounds per screen at 1440, 820 and 390 px.

## Build: loop engineering
**Each item runs:** build → CHECK (typecheck, vitest, Playwright desktop + 390px, vite build, zero console errors) → `/code-review` → fix → note the lesson. Each item gets at most 3 rounds, then it's marked blocked and reported.

| # | Item | Model |
|---|---|---|
| Q00 | Save the council report (HTML) and transcript in `armature/docs/` | Sonnet |
| Q01 | Scaffold, server, mock mode, shared schemas, password gate, caps | Opus |
| Q02 | **Canvas core first:** upload, place, transform, flip, marks, dimension, text, eraser, undo/redo, pinch/pan (his old app died here) | Opus |
| Q03 | Library: about 80 SVGs to a fixed style spec + catalog EN/AR | Sonnet |
| Q03 | Library: panel, search, pointer drag-drop, tap-to-add | Opus |
| Q04 | Contract: `plan_edit` tool + system prompt + compiler + mask + paste-back + versions | Opus (I review closely) |
| Q05 | Agent panel: chat, assumption chips, rules list, voice | Opus |
| Q06 | Export: PNG + pitch .pptx in EN/AR | Opus |
| Q07 | Responsive build | Opus |
| Q07 | Phone sheets, motion, a11y, design polish | Opus |
| Q07 | Screenshot runs (I judge the results) | Sonnet |
| Q08 | Eval harness + 12 cases (mock contract checks now, live $5 mode later) | Opus |

## Verification before hand-over
- `npm run build` passes, and `npm start` serves the app on localhost in mock mode with no keys.
- **Playwright e2e at 1440 and 390 px (touch emulation):**
  - upload a photo → drag a door from the library → flip it → draw a circle
  - type "put a metal door here" → a version appears → before/after works
  - PNG and .pptx downloads both work
  - undo/redo and pinch-zoom work
  - no console errors
- **Unit tests:**
  - compiler snapshots for each eval case
  - paste-back leaves the outside pixels byte-identical
  - mask dilation
  - zod rejects malformed plans
  - caps are enforced
- Desktop and phone screenshots are shared with you from the browser preview.
- **After keys (needs your go):** the $5-capped proof run produces a per-case report ("followed literally?"). Then we pick a host, and Ammar runs 10 real requests against the 8/10 pass bar.
