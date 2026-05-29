<!-- @import /home/lab/workspace/.claude/CLAUDE.md -->

# Project-Specific Configuration

This file imports workspace-level configuration from `/home/lab/workspace/.claude/CLAUDE.md`.
All workspace rules apply. Project-specific rules below strengthen or extend them.

The workspace `/home/lab/workspace/.claude/` directory contains additional instruction files
(MERMAID.md, NOTEBOOK.md, DATASCIENCE.md, GIT.md, and others) referenced by CLAUDE.md.
Consult workspace CLAUDE.md and the .claude directory to discover all applicable standards.

## Mandatory Bans (Reinforced)

The following workspace rules are STRICTLY ENFORCED for this project:

- **No automatic git tags** - only create tags when user explicitly requests
- **No automatic version changes** - only modify version in package.json/pyproject.toml/etc. when user explicitly requests
- **No automatic publishing** - never run `make publish`, `npm publish`, `twine upload`, or similar without explicit user request
- **No manual package installs if Makefile exists** - use `make install` or equivalent Makefile targets, not direct `pip install`/`uv install`/`npm install`
- **No automatic git commits or pushes** - only when user explicitly requests

## Project Context

`jupyterlab_advanced_image_viewer_extension` is a JupyterLab 4 extension scaffolded from the
`jupyterlab/extension-template` copier template (v4.5.2, `frontend-and-server` kind). It provides
advanced image viewing: pan, zoom, mouse controls (hold-and-move, wheel up/down), and optional
configurable left/right keys to move to the previous/next image in a folder.

**Technology Stack**:
- TypeScript frontend extension built with `@jupyterlab/builder` against `@jupyterlab/application` 4.x
- Python server extension on `jupyter_server` (Tornado API handlers in `routes.py`)
- Jest for frontend unit tests, Pytest for server tests, Playwright/Galata for integration tests
- `hatch` build backend (`pyproject.toml`), npm/jlpm + project-local `.nodeenv` for JS tooling

## Required Workspace Skills

These skills MUST be referenced when working on this project:

- **`jupyterlab-extension`** - JupyterLab extension development guidelines, testing strategy, CI/CD
  workflows, jupyter-releaser, common caveats, TypeScript compatibility, syntax highlighting, and
  local development patterns. Follow it for any extension code, build, or release work
- **`playwright`** - browser automation for capturing screenshots and verifying the extension UI in
  a running JupyterLab (including authenticated JupyterHub sessions)

## Package Management (Reinforced)

- **MANDATORY**: Install the package with `make install` - never run `pip install`, `jlpm install`,
  `npm install`, `jlpm build`, or `yarn build` directly. The Makefile owns the project-local
  `.nodeenv`, version increment, build, and install flow
- Use `make build`, `make test`, `make clean`, `make mrproper` for their respective operations

## Makefile Version Tracking

- **MANDATORY**: Always compare the local `Makefile` version header against the reference Makefile at
  `/home/lab/workspace/private/jupyterlab/@utils/jupyterlab-extensions/Makefile`. As soon as a newer
  version is found in the reference, update the local `Makefile` to match it
- The version is declared on the first line (`# Makefile for Jupyterlab extensions version X.YZ`).
  Local and reference are currently both at v1.32

## Git Tracking

- **MANDATORY**: Always track `package.json` and `package-lock.json` in git - both must be committed
  and kept in sync with dependency changes

## Journal Rules (Project-Specific)

- **APPEND ONLY**: New journal entries MUST be appended at the end of the file, never inserted between existing entries
- Entries maintain strict chronological order by position - the last entry in the file is always the most recent work
- Never reorder, move, or insert entries out of sequence
- The Stellars **journal plugin** is the canonical tool for this file: create via `/journal:create`, append via `/journal:update`, archive via `/journal:archive`. The `journal:journal` skill auto-triggers on any mention of "journal" and runs `journal-tools check` after every write
- Direct edits to `JOURNAL.md` are a last resort - prefer the plugin so modus secundis format, continuous numbering and append-only order are enforced automatically
