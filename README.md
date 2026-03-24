# AXP Access Guide

Public-facing collaborator guide for using AXP based on the access level a
person has been given.

This repo publishes the GitHub Pages guide for:

- collaborators with live app access
- collaborators with Google Sheets access
- collaborators with OSF download access

The site explains:

- when app-level access is required
- how to use the live app
- how to update the questionnaire in Google Sheets
- how to use OSF downloads, codebooks, changelogs, and data examples
- how the access handoff works between sheet editors, app users, and
  download-only users

## Site

Planned public URL:

- `https://zivilkannibale.github.io/axp-mvp-survey-guide/`

## Local preview

From repo root:

```powershell
python -m http.server 8000 --directory docs
```

Then open:

- `http://localhost:8000/`

## Structure

- `docs/index.html` overview of access types and common tasks
- `docs/value-lifecycle.html` live app usage and app-only checks
- `docs/questionnaire-edits.html` Google Sheets workflow and handoff rules
- `docs/data-examples.html` data type, file structure, and export examples
- `docs/diagrams.html` diagram pages with deep links into the examples
- `docs/diagrams/*.mmd` Mermaid sources
