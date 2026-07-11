// Integration auth helper: mint a REAL session + bearer token so supertest can
// exercise the live middleware stack (authenticate → route) against the real
// Postgres fixtures. Mirrors the login route's signSessionToken exactly:
// jwt.sign({ email, actingRole, sid }, jwtSecret, { subject: userId }).
//
// Sessions are issued with mfaSatisfied:true so authenticate's MFA gate lets
// the request through — these tests prove TENANT isolation, not the MFA gate
// (that has its own unit coverage).
const jwt = require("jsonwebtoken");
const env = require("../../src/config/env");
const sessionService = require("../../src/services/sessionService");
const { findUserById } = require("../../src/repositories/userRepository");
const { USERS } = require("./fixtures");

// login(userKey, actingRole) -> { token, actingRole, user }
async function login(userKey, actingRole) {
  const fixtureUser = USERS[userKey];
  if (!fixtureUser) {
    throw new Error(`Unknown fixture user key: ${userKey}`);
  }
  const user = await findUserById(fixtureUser.id);
  if (!user) {
    throw new Error(`Fixture user not seeded: ${userKey} (${fixtureUser.id})`);
  }

  const { sid } = await sessionService.issueSession({
    user,
    actingRole,
    mfaSatisfied: true
  });

  const token = jwt.sign(
    { email: user.email, actingRole, sid },
    env.jwtSecret,
    { subject: user.id, expiresIn: env.jwtExpiresIn }
  );

  return { token, actingRole, user };
}

// Attach the Authorization bearer to a supertest request builder. `session`
// may be null to send an unauthenticated request.
//
// NOTE: the acting role is bound to the signed token claim; the server ignores
// any X-Acting-Role header. The header is still set here for backward-compat but
// has no effect. To exercise an unassigned/other role, mint the token with that
// role via login(userKey, role) rather than passing `overrideRole`.
function withAuth(reqBuilder, session, overrideRole) {
  if (!session) {
    return reqBuilder;
  }
  reqBuilder.set("Authorization", `Bearer ${session.token}`);
  const role = overrideRole !== undefined ? overrideRole : session.actingRole;
  if (role) {
    reqBuilder.set("X-Acting-Role", role);
  }
  return reqBuilder;
}

module.exports = { login, withAuth };
