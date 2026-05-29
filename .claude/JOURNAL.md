# Claude Code Journal

This journal tracks substantive work on documents, diagrams, and documentation content.

---

1. **Task - Project initialization** (v0.1.0): Initialized the `jupyterlab_advanced_image_viewer_extension` project as a new JupyterLab 4 extension scaffolded from the `jupyterlab/extension-template` copier template (v4.5.2, `frontend-and-server` kind)<br>
   **Result**: Converted `.claude/CLAUDE.md` from the verbatim inlined workspace copy to the canonical import form (`<!-- @import /home/lab/workspace/.claude/CLAUDE.md -->`) with the Mandatory Bans, Project Context, and Journal Rules sections. Added project-specific rules requested at init: `make install` is mandatory for package installation, `package.json` and `package-lock.json` must always be git-tracked, and the local `Makefile` version must be compared against the reference at `@utils/jupyterlab-extensions/Makefile` and updated whenever a newer version appears (both currently v1.32, no update needed). Added a Required Workspace Skills section referencing `jupyterlab-extension` (development, CI/CD, caveats) and `playwright` (screenshots, UI verification). Rewrote `README.md` to add all workspace badges, a concise Features section inspired by `jupyterlab_terminal_show_in_file_browser_extension` (pan/zoom, mouse controls, folder navigation), and dropped every section below Uninstall. Initialized the git repository with `git init -b main` and committed all artefacts as the initial import.
