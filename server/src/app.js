const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const env = require("./config/env");
const authRoutes = require("./modules/auth/routes");
const assessmentRoutes = require("./modules/assessments/routes");
const mitigationRoutes = require("./modules/mitigations/routes");
const adminRoutes = require("./modules/admin/routes");
const { DomainError } = require("./services/domainError");

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  req.traceId = req.headers["x-trace-id"] || crypto.randomUUID();
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "vantage-server" });
});

app.use("/api/auth", authRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/mitigations", mitigationRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
});

app.use((error, req, res, _next) => {
  if (error instanceof DomainError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        traceId: req.traceId
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred",
      traceId: req.traceId
    }
  });
});

module.exports = app;
