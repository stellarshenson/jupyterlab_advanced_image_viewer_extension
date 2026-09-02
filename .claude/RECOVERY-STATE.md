# Recovery State

Cold-start board for this project. The newest BRACE section is the truth; older ones are history.

## BRACE 2026-09-02T09:22:20Z (local 11:22) - usage limit

### HORIZON: LIMIT

`~/.claude/bin/brace-horizon` returned:

```
LIMIT 85% five_hour resets 3:00pm (218m)
```

The machine stays up. Nothing detached is at risk, no process was killed by the host, and THIS
session is expected to return after the reset at 15:00 local. The workflow below was paused, not
killed, so the cheap resume path applies.

### FIRST ACTION

Relaunch the paused workflow from cache, in this same session:

```
Workflow({scriptPath: "/home/lab/.claude/projects/-home-lab-workspace-private-jupyterlab-jupyterlab-advanced-image-viewer-extension/08abab55-a6ae-48f7-a1b7-df60413310ba/workflows/scripts/imageviewer-pan-clamp-wf_46fd43d6-edb.js", resumeFromRunId: "wf_46fd43d6-edb"})
```

Both Survey agents replay instantly from cache; only the Implement agent and the phases after it
re-run. If that call reports nothing cached, the session did not truly survive - drop immediately to
`Workflow({scriptPath: "<same path>"})` with no args (the workflow takes none) and feed the two
salvaged Survey results in by hand from the journal named below.

### Paused workflow

| Field | Value |
|---|---|
| Task id | `wxtb620rj` |
| Run id | `wf_46fd43d6-edb` |
| Script path | `/home/lab/.claude/projects/-home-lab-workspace-private-jupyterlab-jupyterlab-advanced-image-viewer-extension/08abab55-a6ae-48f7-a1b7-df60413310ba/workflows/scripts/imageviewer-pan-clamp-wf_46fd43d6-edb.js` |
| Args | none - the script takes no `args` |
| Transcript dir | `/home/lab/.claude/projects/-home-lab-workspace-private-jupyterlab-jupyterlab-advanced-image-viewer-extension/08abab55-a6ae-48f7-a1b7-df60413310ba/subagents/workflows/wf_46fd43d6-edb` |
| Phase reached | Survey complete (2 of 2 agents returned), Implement killed mid-flight |

Phases: Survey → Implement → Review (3 lenses) → Adjudicate → Fix.

### Tree difference the stop produced

None. `git status --porcelain` before and after the stop are identical:

```
RM docs/acceptance_criteria.md -> docs/acc-crit.md
```

The Implement agent was killed before it wrote anything. `src/controller.ts` and
`src/__tests__/controller.spec.ts` are untouched, so the resume starts from a clean baseline.

### Salvaged results, valid on disk

`<transcriptDir>/journal.jsonl` holds one result line per completed agent. Two are complete and
paid for. Read them rather than re-running them.

1. **Evidence audit** (agent `a1e8e8d887a88d302`) - 22 criteria closable, 21 not. Closable ids:
   ACC-FIT-1, ACC-FIT-2, ACC-FIT-3, ACC-FIT-4, ACC-FIT-6, ACC-FIT-7, ACC-FIT-8, ACC-ZOOM-9,
   ACC-ZOOM-10, ACC-ZOOM-13, ACC-ZOOM-14, ACC-ZOOM-15, ACC-RESET-17, ACC-PAN-18, ACC-NAV-21,
   ACC-NAV-22, ACC-NAV-26, ACC-NAV-27, ACC-HEALTH-31, ACC-STOCK-35, ACC-HELP-36, ACC-HELP-37.
   Each carries a one-line evidence string and its source. Read the full JSON before closing anything.
2. **Geometry check** (agent `a9f6ba7d6117730a2`) - the proposed measure-and-correct clamp is sound,
   but the mechanism line recorded on ACC-PAN-38 is wrong and it returned 9 corrections and 13
   pitfalls. Three that change the work:
   - Wrapping the img in the pan layer already breaks a stock rule. `.jp-ImageViewer > img` is a
     direct-child selector carrying `transform-origin: top left`, so inside the layer the img falls
     back to `50% 50%` and the stock rotate, flip and scale keybindings pivot from the wrong point.
     This is a pre-existing defect, not one the clamp introduces.
   - ACC-PAN-43 has no trigger under the proposed mechanism: stock rotate and flip write only
     `img.style.transform`, which changes no layout box, so neither the ResizeObserver nor a load
     event fires and the clamp is never re-evaluated after a rotation.
   - The lab tab-zoom command sets `style.zoom` on the `jp-zoom-target` node, so host-local CSS
     pixels stop equalling screen pixels and one correction pass stops being sufficient.

Extract both with:

```
python3 -c "import json;[print(json.dumps(json.loads(l)['result'],indent=2)) for l in open('<transcriptDir>/journal.jsonl') if json.loads(l).get('type')=='result']"
```

### Running compute

None. No detached job, no background shell, no notebook execution. Nothing to reattach.

### Pending decisions and work

- **Release version is 1.1.0** (from 1.0.11), npm + PyPI, decided by the Star Colonel. The Makefile
  can only raise the patch digit, so the release is: set `"version": "1.1.0"` in `package.json` by
  hand, then `make -o increment_version publish`. Verified by dry run. Publishing still needs
  explicit approval at the time.
- **22 criteria to close** in `docs/acc-crit.md` with `pm-tools close --evidence`, author `@kj`,
  quoting the evidence string from the salvaged audit. These writes are done by the main session
  serially, never by a subagent.
- **ACC-PAN-38 mechanism line must be replaced.** Current line claims a single 0-to-(host minus
  image) formula holds because the baseline renders top-left. Replacement returned by the geometry
  agent: "the clamp is measured, not derived: apply() writes the transform, reads the host and img
  bounding rects, and adds the per-axis correction that keeps a smaller image inside the host and a
  larger one covering it, because the centre-origin layer scale and the stock rotate or flip move
  the rendered bounds away from any 0-to-(host minus image) offset formula".
- **Consider filing the transform-origin defect** in `docs/defects.md` (does not exist yet) once the
  clamp lands. It is a real stock-behaviour regression the wrap already causes.
- Open tasks: #3 implement the pan clamp, #4 close the evidenced criteria. Both in progress.

### Bans that stay in force through the resume

No `make build`, `make install`, `make publish` or any version edit without explicit approval - the
Makefile bumps the version as a build prerequisite. `make test` is the only sanctioned verification
command. No commit, push or tag without explicit approval, the brace checkpoint commit excepted.
