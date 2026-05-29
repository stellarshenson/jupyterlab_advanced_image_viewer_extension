import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './request';

/**
 * Initialization data for the jupyterlab_advanced_image_viewer_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_advanced_image_viewer_extension:plugin',
  description: 'Jupyterlab extension to allow advanced image viewing: pan, zoom, also controls for pan + zoom (and use of the mouse - hold and move, wheel up and down) and optional (configurable) left and right keys to move to previous and next image in folder',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyterlab_advanced_image_viewer_extension is activated!');

    requestAPI<any>('hello', app.serviceManager.serverSettings)
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyterlab_advanced_image_viewer_extension server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
