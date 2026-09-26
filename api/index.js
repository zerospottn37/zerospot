// Vercel Serverless Function Entrypoint
// Wraps the Zero Spot Express application for auto-scaling serverless execution on Vercel

let app;
let initError = null;

try {
  app = require("../backend.js");
} catch (err) {
  initError = err;
  console.error("CRITICAL: Failed to load backend.js in Vercel function:", err);
}

module.exports = (req, res) => {
  if (initError) {
    console.error("Vercel Function Error:", initError);
    return res.status(500).json({
      success: false,
      error: "Backend failed to initialize",
      message: initError.message,
      stack: initError.stack
    });
  }

  // Ensure request URL preserves /api prefix expected by Express router
  if (req.url && !req.url.startsWith("/api") && req.url !== "/") {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }

  return app(req, res);
};
