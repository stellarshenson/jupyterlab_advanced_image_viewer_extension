// Plyr publishes its types only through the "exports" map, which the
// project's node module resolution does not read, so point at the file.
declare module 'plyr' {
  import Player from 'plyr/src/js/plyr';
  export default Player;
}

// The JupyterLab builder serves a .svg file imported from .js as a raw
// string, which the video viewer hands to Plyr as a data URL.
declare module '*.svg' {
  const content: string;
  export default content;
}
