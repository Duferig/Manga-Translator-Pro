# Manga Translator Pro Local v2

This is a local-first rewrite scaffold for improving translation quality and making the pipeline easier to debug.

## What changed

- Added a project model with pages, text regions, glossary, summaries, and settings.
- Added local persistence through IndexedDB.
- Split Gemini usage into two explicit stages:
  - region detection on the page
  - text translation using glossary and recent page context
- Added a manual review UI so translations can be fixed before any future render or inpaint step.

## Why this rewrite exists

The original app is a strong prototype, but it mixes detection, translation, and image generation in one flow. This rewrite prepares the project for a smarter local workflow:

1. Detect regions
2. Review source text
3. Translate with context and glossary
4. Manually adjust problem lines
5. Add a future render/inpaint stage

## Run

```bash
cd local-v2
npm install
npm run dev
```

## Suggested next steps

- Add a dedicated OCR fallback service
- Add import/export for project JSON
- Add rendering/inpainting as a separate module
- Add confidence sorting so low-quality detections are fixed first
