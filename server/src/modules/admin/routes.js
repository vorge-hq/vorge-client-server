const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRole = require("../../middleware/authorizeRole");
const { ROLES } = require("../../services/constants");

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole(ROLES.ADMIN));

router.get("/configuration", (_req, res) => {
  res.json({
    surfaces: [
      "users",
      "roles",
      "facilities",
      "threatClassifications",
      "riskMatrix",
      "libraries",
      "notifications",
      "defaultTeams",
      "mitigationOwnerPool",
      "mfaPolicy",
      "offlinePolicy"
    ]
  });
});

module.exports = router;
