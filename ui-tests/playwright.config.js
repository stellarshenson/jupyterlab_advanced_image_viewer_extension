/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

// The test server port. CI keeps 8888; locally a developer's own lab often holds
// 8888, and galata's server config refuses to move (port_retries = 0), so the
// suite runs with JUPYTER_TEST_PORT set to a free port instead.
const PORT = process.env.JUPYTER_TEST_PORT || '8888';
const BASE_URL = `http://localhost:${PORT}`;

module.exports = {
  ...baseConfig,
  // Playwright defaults to half the cores (32 on this workstation), and that
  // many Lab pages loading at once exceed the 15 s readiness wait; the sibling
  // extensions pin one worker for the same reason.
  workers: 1,
  use: { ...baseConfig.use, baseURL: BASE_URL },
  webServer: {
    command: 'jlpm start',
    url: `${BASE_URL}/lab`,
    timeout: 120 * 1000,
    reuseExistingServer: false
  }
};
