try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode: https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings
    warnings.warn("Importing 'jupyterlab_advanced_image_viewer_extension' outside a proper installation.")
    __version__ = "dev"
from .routes import setup_route_handlers


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "@stellarshenson/jupyterlab-advanced-image-viewer-extension"
    }]


def _jupyter_server_extension_points():
    return [{"module": "jupyterlab_advanced_image_viewer_extension"}]


def _load_jupyter_server_extension(server_app):
    """Registers the waveform endpoint of the audio viewer."""
    setup_route_handlers(server_app.web_app)
    server_app.log.info("Registered jupyterlab_advanced_image_viewer_extension server extension")
