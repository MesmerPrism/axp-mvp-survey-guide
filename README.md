# AXP Access Guide

Public-facing collaborator guide for using AXP based on the access level a
person has been given.

This repo publishes the GitHub Pages guide for:

- collaborators who can open the running survey
- collaborators with Google Sheets access
- collaborators with OSF download access

The site explains:

- how a new collaborator should decide which workflow applies to them
- how to use the live survey
- how to update the questionnaire in Google Sheets
- how to use OSF downloads, codebooks, changelogs, and data examples
- how to tune the public radial violin peer-plot prototype in the browser
- how the running survey, sheet edits, and download-only workflows fit together
- which current app contracts matter for safe edits: stable `item_id` values,
  embedded `scale_id` mapping, canonical peer buckets, text-storage controls,
  and complete 11-factor ASC scores

## Site

Current public URL:

- `https://mesmerprism.com/axp-mvp-survey-guide/`

## Local preview

From repo root:

```powershell
python -m http.server 8000 --directory docs
```

Then open:

- `http://localhost:8000/`

## Structure

- `docs/index.html` overview of access types and common tasks
- `docs/value-lifecycle.html` using the running survey
- `docs/questionnaire-edits.html` Google Sheets workflow and sheet enforcer usage
- `docs/data-examples.html` data type, file structure, and export examples
- `docs/peer-plot-lab.html` browser-hosted peer violin plot tuning page
- `docs/diagrams.html` diagram pages with deep links into the examples
- `docs/diagrams/*.mmd` Mermaid sources

## Public plot lab data

The plot lab reads static JSON bundles from `docs/assets/peer-plot-data/`.

To rebuild those bundles from the public peer export:

```powershell
python scripts/build_peer_plot_lab_data.py
```
