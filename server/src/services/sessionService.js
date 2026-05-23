const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const db = require("../db/knex");
const sessionRepository = require("../repositories/sessionRepository");
const { firstRoleAssignment } = require("../repositories/userRepository");
const { DomainError } = require("./domainError");

function invalidTokenError() {
  return new DomainError("Session is not active", 401, "INVALID_TOKEN");
}

// Derive expiry from the same parser jsonwebtoken uses, without taking a `ms`
// dependency: sign a throwaway token with the configured expiresIn and read
// its `exp` claim back.
function computeExpiresAt() {
  const probe = jwt.sign({}, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  const decoded = jwt.decode(probe);
  return new Date(decoded.exp * 1000);
}

async function issueSession({ user, actingRole, req }, trx = db) {
  const assignment = firstRoleAssignment(user);
  const sid = crypto.randomUUID();
  const expiresAt = computeExpiresAt();

  await sessionRepository.createSession(
    {
      id: sid,
      userId: user.id,
      actingRole,
      facilityId: assignment?.facilityId || null,
      expiresAt,
      sourceIp: req?.ip || null,
      userAgent: req?.headers?.["user-agent"] || null
    },
    trx
  );

  return { sid, expiresAt };
}

async function validateSession(sid, now = new Date()) {
  const session = await sessionRepository.findActiveSessionById(sid, now);
  if (!session) {
    throw invalidTokenError();
  }
  return session;
}

async function revokeSession(sid, now = new Date(), trx = db) {
  return sessionRepository.revokeSession(sid, now, trx);
}

async function rotateSession({ user, previousSid, actingRole, req, trx }) {
  const run = async (work) => (trx ? work(trx) : db.transaction(work));
  return run(async (activeTrx) => {
    await sessionRepository.revokeSession(previousSid, new Date(), activeTrx);
    const { sid, expiresAt } = await issueSession({ user, actingRole, req }, activeTrx);
    return { sid, expiresAt, previousSid };
  });
}

module.exports = {
  issueSession,
  validateSession,
  revokeSession,
  rotateSession
};
