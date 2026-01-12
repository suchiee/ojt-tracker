const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Proxy API requests to the backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5003',
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
