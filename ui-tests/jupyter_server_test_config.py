"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provide access to JupyterLab
JavaScript objects through the global window variable.
"""
import os
from tempfile import mkdtemp

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)

# Galata pins port 8888 with no retries. JUPYTER_TEST_PORT moves the server when
# 8888 is taken; `or` rather than a get() default, so an exported-but-empty
# value falls back like JavaScript's `||` in playwright.config.js does.
c.ServerApp.port = int(os.environ.get("JUPYTER_TEST_PORT") or "8888")

# Settings written during a test land in a fresh folder, never in the
# developer's own ~/.jupyter/lab/user-settings.
c.LabApp.user_settings_dir = mkdtemp(prefix="galata-settings-")

# A startup tab other than the Launcher hangs galata's readiness wait. Ignored
# where the extension is not installed, as in CI.
c.GalaxaHubMotd.open_on_start = False

# The workstation image's jupyter_lab_config.py roots /files/ at the user's
# workspace through ContentsManager, so a viewer that reads a test file from its
# file URL gets 404. This narrower section wins whichever file loads last.
c.FileContentsManager.files_handler_params = {"path": c.ServerApp.root_dir}

# A delete goes to the trash by default. Where the test root under /tmp and the
# home folder are separate filesystems, send2trash targets the root-owned
# /.Trash-<uid> and every delete answers 400 (DEF-BUILD-77-GALATA-TRASH). The
# developer's own config can set it on the more specific manager classes, which
# outrank FileContentsManager, so all three are set.
for manager in ("FileContentsManager", "AsyncFileContentsManager", "AsyncLargeFileManager"):
    getattr(c, manager).delete_to_trash = False

# This extension ships the image fit that jupyterlab_fit_image_size_extension
# used to supply. The test pages disable that extension, so its stylesheet never
# loads and the suite measures this extension's fit alone, as in CI where it is
# not installed. A no-op where it is not installed.
FIT_EXTENSION = "@stellarshenson/jupyterlab-fit-image-size-extension"


def _disable_fit_extension(handler, page_config):
    if FIT_EXTENSION not in page_config["disabledExtensions"]:
        page_config["disabledExtensions"].append(FIT_EXTENSION)
    return page_config


c.ServerApp.tornado_settings.update({"page_config_hook": _disable_fit_extension})

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
