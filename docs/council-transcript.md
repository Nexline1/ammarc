# LLM Council: should we build Ammar's idea-to-image platform, and how? (2026-10-21)

**Question:** Build a Canva-like React app (phone + laptop) for Ammar (engineer at Alba, Bahrain). It has three panels: an element library on the left, a draw/circle canvas in the middle, and a Claude agent (voice or text) on the right. Claude interprets his one sentence and OpenAI gpt-image-2.5 renders it. Pressure-test feasibility, the Claude↔OpenAI handoff, how it learns his way of thinking, and what to cut.

**Facts given to the council (verified Oct 2026)**
- gpt-image-2.5 comes in two variants: Flare (fast) and Sunburst (precise edits). Both cost about $0.05 per image at medium quality and $0.20 at high.
- The edits endpoint takes up to 16 images and a soft mask, any size in multiples of 16, and streams partial images.
- Claude 5.5 has vision and tool use.
- The API keys need a server proxy.
- Alba plant photos would be sent to both APIs.

## Advisors

**Contrarian:** Don't build it as specified, because the core promise is unproven.
- Mocks prove nothing. Run 10 real edits through a script first.
- A preserve-list is what ChatGPT already does internally. The only real guarantee is paste-back, and that needs a marked region, while his normal input is a sentence with no circle.
- Claude checking left/right is weak, and auto-fix makes him wait.
- The model can't render dimensions: draw them as vector callouts and stamp the slide "illustrative".
- The library is hidden work, so seed it from his own photos.
- Learned rules rot unless they're visible and editable.
- Confidentiality is a risk.
- Keep the scope small.

**First Principles:** This is the wrong question.
- The real loop is: photo, circle, sentence, edit only inside the circle, before/after, correct, slide.
- Cut the generic library and the chat panel. Keep a visible rules list and tap-chips.
- The app draws dimensions. Paste-back is non-negotiable.
- Spend about $10 on real past requests first.
- Ask about photo permission.

**Expansionist:** The pitch is the product.
- Build the PowerPoint export first.
- Auto-cut his photos into a library of his own equipment.
- Generate deterministic dimensioned drawings plus a parts list.
- Make the learned rules an exportable house style.
- Upside: colleagues and other Gulf smelters.

**Outsider:** Nobody said what he sees in the first 10 seconds.
- Make the first screen one big "drop your photo" target.
- Draw the hinge side on the image before generating.
- Get photo permission.
- Use vector dimensions with an "illustrative" stamp.
- Stream partial images while he waits.
- Paste-back leaves seams.
- Defer voice, memory and the library.

**Executor:** Build it, but not as specified.
- Monday: run 10 real photos through a 50-line script (circle → mask → Sunburst → paste-back).
- Paste-back with a feathered edge is the one feature that matters.
- Cut the generic library, the hidden memory, auto-fix (allow one user-triggered retry) and custom voice.
- Keep: a mockable `/edit` endpoint, Konva/fabric, testing on his phone, pptx export, and structured fields for hinge, dimensions and the preserve-list.
- Real testing costs about $40.
- Day 1 mock UI, Day 3 real edit, Day 5 Ammar runs his 10 cases.

## Peer review (anonymised; mapping revealed)
- Strongest answer: all five reviewers picked the **Executor**. One reviewer called the Contrarian's "a sentence with no circle" the sharpest single point.
- Biggest blind spot: all five picked the **Expansionist**. It treats the engine as solved, adds scope, and spreads confidential photos wider.
- What everyone missed:
  - **Deterministic compositing.** Dropped elements are placed by the app and the model only blends them in, so they are literal by construction.
  - **A pass bar with Ammar** (8 of 10 literal edits), and watching him use it unassisted.
  - **The pitch must be honest.** Label it a concept and keep the original photo beside the render.
  - **Ops:** key proxy, daily spend cap, and a named maintainer (the nephew).
  - **Paste-back alignment and colour shift.**
  - **Stripping EXIF/GPS.**
  - **Gulf-Arabic and mixed-language dictation.**
  - **Run-to-run variance.**

## Chairman verdict
(Synthesised in the main session because the Fable chairman call hit a usage-credit limit.)

**Where they agree**
- Literal obedience is the risk, not the UI.
- Deterministic paste-back is the guarantee.
- The app draws dimensions.
- Get photo permission.
- Structured fields beat prose.
- The pitch slide is the deliverable.
- Rules must be visible.
- Test the core interactions on his phone.
- Mocks alone prove nothing.

**Where they clash**
- **Scope** (cut the library/chat/voice vs the nephew's requirements). Resolved: keep them, but make them serve the one loop. The library earns its place through deterministic placement.
- **Auto-fix.** Resolved: check in the background and offer a one-tap fix.
- **Mock-first.** Resolved: build on mocks, with the eval harness ready for a capped live proof run as soon as keys arrive.

**Recommendation:** build within the nephew's layout around one loop. Three guarantees: paste-back, app-drawn dimensions, and structured element specs whose hinge side is visible before rendering. Pass bar: 8 of 10.

**First step:** confirm Alba's photo policy (answered: allowed) and collect about 10 real ChatGPT-botched requests.
