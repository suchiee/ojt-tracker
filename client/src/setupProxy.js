const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  let target = 'http://localhost:5001';
  if (process.env.REACT_APP_API_URL) {
    try {
      target = new URL(process.env.REACT_APP_API_URL).origin;
    } catch (e) {
      // If relative path, keep default localhost target
    }
  }

  // Proxy API requests to the backend
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );

  // This is a workaround for the webpack 5 polyfill issues
  // It injects these variables into the global scope
  app.use((req, res, next) => {
    // Add webpack DefinePlugin definitions
    if (!global.process) global.process = {};
    if (!global.process.env) global.process.env = {};
    
    // Continue to the next middleware
    next();
  });
};
