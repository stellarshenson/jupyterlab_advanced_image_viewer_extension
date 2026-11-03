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

## Upgrading Viewer Libraries

The viewers bundle libraries that release often. Releases in the 12 months to 2026-10-31:
`wavesurfer.js` 18, `three` 13, `@types/three` 13, `plyr` 2, `occt-import-js` 0. Upgrade only on the
Star Colonel's request, one library per commit. `@jupyterlab/*` and the template follow
`references/jupyterlab-upgrades.md` of the `jupyterlab-extension` skill, not this section.

| Library | Current range allows | How to move it | Read after moving it |
|---|---|---|---|
| `three` + `@types/three` | 0.187.x only | Edit both ranges in `package.json` to the same new minor | [Migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) for every skipped release; `three/examples/jsm/` imports in `src/meshscene.ts` (`three/addons/` does not resolve under this project's `moduleResolution`) |
| `wavesurfer.js` | every 8.x | `jlpm up -R wavesurfer.js`, which changes only `yarn.lock` | `wavesurfer.js/dist/plugins/*` imports in `src/audio.ts` |
| `plyr` | every 3.x from 3.8 | `jlpm up -R plyr`, which changes only `yarn.lock` | Copy `node_modules/plyr/dist/plyr.svg` over `style/plyr.svg` when their symbol ids differ, because `src/video.ts` bundles that copy |
| `occt-import-js` | 0.0.23 only | Edit the range in `package.json` | `dist/` file names used by the STEP reader, licence still LGPL-2.1, wheel still lists the WASM file and licence texts |

- **Latest version** - `npm view <package> version`; the installed one is in `node_modules/<package>/package.json`
- **`@types/three`** - can publish days after `three` (0.186.0 came 3 days later). Wait for the same minor, never mix minors
- **Install** - `make -o increment_version install`, because plain `make install` raises the version. `git diff package.json yarn.lock` must show only this library
- **Gates** - `make test`, `jlpm run lint:check`, then Galata through `~/.claude/skills/jupyterlab-extension/scripts/galata-bwrap.sh` on the whole suite
- **`three` only** - read one rendered screenshot as well, because the Galata tests count pixels and a change of rendering defaults can pass them
- **A failed upgrade** - stay on the installed version and file the failure with `pm-tools add docs/defects.md`. Never raise a range to a version that has not passed these gates

## Makefile Version Tracking

- **MANDATORY**: Always compare the local `Makefile` version header against the reference Makefile at
  `/home/lab/workspace/private/jupyterlab/@utils/jupyterlab-extensions/Makefile`. As soon as a newer
  version is found in the reference, update the local `Makefile` to match it
- The version is declared on the first line (`# Makefile for Jupyterlab extensions version X.YZ`).
  Local and reference are currently both at v1.46

## Git Tracking

- **MANDATORY**: Always track `package.json` and `yarn.lock` (root and `ui-tests/`) in git - both
  must be committed and kept in sync with dependency changes. There is no `package-lock.json`: the
  Makefile (1.41+) and CI install with `jlpm` only

## Journal Rules (Project-Specific)

- **APPEND ONLY**: New journal entries MUST be appended at the end of the file, never inserted between existing entries
- Entries maintain strict chronological order by position - the last entry in the file is always the most recent work
- Never reorder, move, or insert entries out of sequence
- The Stellars **journal plugin** is the canonical tool for this file: create via `/journal:create`, append via `/journal:update`, archive via `/journal:archive`. The `journal:journal` skill auto-triggers on any mention of "journal" and runs `journal-tools check` after every write
- Direct edits to `JOURNAL.md` are a last resort - prefer the plugin so modus secundis format, continuous numbering and append-only order are enforced automatically
