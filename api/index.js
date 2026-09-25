// Vercel Serverless Function Entrypoint
// Wraps the Zero Spot Express application for auto-scaling serverless execution on Vercel
const app = require("../backend.js");

module.exports = app;
