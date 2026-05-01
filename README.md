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
- how to share custom survey links that prefill induction and the second
  context field for collaborator groups
- how to update the questionnaire in Google Sheets
- how to use OSF downloads, codebooks, changelogs, and data examples
- how to tune the public radial violin peer-plot prototype in the browser
- how the running survey, sheet edits, and download-only workflows fit together
- which current app contracts matter for safe edits: stable `item_id` values,
  embedded `scale_id` mapping, the `comparison_tokens` stable registry,
  text-storage controls, complete 11-factor ASC scores, and high-level
  submission quality metadata

## Site

Current public URL:

- `https://mesmerprism.com/axp-mvp-survey-guide/`

## Relationship To The App Repo

This guide repo is the public GitHub Pages surface. The private Shiny app repo is a separate control layer:

- app/runtime repo: `C:\Users\tillh\source\repos\axp-mvp-survey`
- public guide repo: `C:\Users\tillh\source\repos\axp-mvp-survey-guide`
- public guide URL: `https://mesmerprism.com/axp-mvp-survey-guide/`
- Pages workflow: `.github/workflows/pages.yml`

Use the app repo to verify live behavior, URL-prefill parsing, questionnaire loading, DB/export contracts, and deploy scripts. Use this guide repo for collaborator-facing copy, static examples, diagrams, data examples, and public onboarding pages.

Do not update the private app repo and assume the public Pages site changed. Public guide changes require edits in this repo, a push to `main`, a successful `Deploy GitHub Pages` workflow run, and a live URL check.

## Public Update Workflow

For collaborator-facing documentation changes:

1. Verify the underlying behavior in the app repo or live survey.
2. Edit the relevant files under `docs/` in this repo.
3. Preview locally with `python -m http.server 8000 --directory docs`.
4. Commit and push `main`.
5. Wait for the `Deploy GitHub Pages` workflow to complete.
6. Verify the public URL on `https://mesmerprism.com/axp-mvp-survey-guide/`.

## Local preview

From repo root:

```powershell
python -m http.server 8000 --directory docs
```

Then open:

- `http://localhost:8000/`

## Structure

- `docs/index.html` overview of access types and common tasks
- `docs/value-lifecycle.html` using the running survey, including custom
  prefilled survey links
- `docs/questionnaire-edits.html` Google Sheets workflow, sheet enforcer usage,
  and stable comparison-token onboarding
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
