# AXP MVP Survey Guide

Public-facing onboarding guide for the AXP MVP Survey project.

This partner repo is intentionally docs-only:

- no Shiny app code
- no private research data
- no export bundles
- no secrets or runtime config

It exists to help a new collaborator understand:

- how questionnaire changes are made through Google Sheets
- which changes are analytically safe versus version-breaking
- how values move from questionnaire definition to scoring, storage, feedback, and export
- how the main Mermaid diagrams fit together

## Site

The GitHub Pages site is designed to publish directly from the `docs/` folder
through the included workflow.

Planned public URL after first push:

- `https://zivilkannibale.github.io/axp-mvp-survey-guide/`

## Local preview

From repo root:

```powershell
python -m http.server 8000 --directory docs
```

Then open:

- `http://localhost:8000/`

## Structure

- `docs/index.html` overview and newcomer path
- `docs/questionnaire-edits.html` Google Sheets adaptation workflow
- `docs/value-lifecycle.html` value computation, storage, and export stages
- `docs/diagrams.html` Mermaid diagram gallery
- `docs/diagrams/*.mmd` diagram sources

## Public boundary

This repo explains the workflow and data contracts at a conceptual and schema
level. It does not publish implementation code, questionnaire response data, or
private infrastructure details.
