'use strict';
const http = require('node:http');
const { createGameplayService } = require('../services/gameplay/gameplaySession');
const { GameplayError, fields, id } = require('../services/gameplay/gameplayEvents');
const { createLevelLearningLoop } = require('../services/gameplay/levelLearningLoop');

const BODY_LIMIT = 4096;
class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const reject = (status, code) => { throw new HttpError(status, code); };
const malformed = new Set(['INVALID_FIELDS', 'INVALID_ID', 'INVALID_EVENT', 'INVALID_RESPONSE', 'INVALID_OPTION', 'CLIENT_EVENT_NOT_ALLOWED', 'RUNTIME_VERSION_UNSUPPORTED']);
const conflict = new Set(['EVENT_KEY_CONFLICT', 'SESSION_KEY_CONFLICT', 'INVALID_SEQUENCE', 'GAME_NOT_STARTED', 'PHASE_ORDER', 'PHASE_EVENT_TYPE', 'CHALLENGE_ORDER', 'UNKNOWN_CHALLENGE', 'CHALLENGE_NOT_ACTIVE', 'GAME_INCOMPLETE', 'SESSION_TERMINAL', 'HINT_NOT_ALLOWED', 'SESSION_EVENT_LIMIT']);
function response(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) reject(415, 'JSON_REQUIRED');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') reject(415, 'ENCODING_UNSUPPORTED');
  if (Number(req.headers['content-length']) > BODY_LIMIT) reject(413, 'REQUEST_TOO_LARGE');
  const chunks = []; let size = 0;
  // Keep the socket alive long enough to send a bounded error, even for chunked
  // oversized input. The error response closes it; never buffer the remainder.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) reject(413, 'REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { reject(400, 'INVALID_JSON'); }
}

// Native Node HTTP adapter: no listener, env loading or database client on import.
// resolveActor verifies the bearer token with the real identity provider. It must
// never derive identity/role from a request body or an unverified token payload.
function createRuntimeHttpHandler({ db, resolveActor, authorizeExecution, allowedOrigins = [], learning } = {}) {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.some(origin => {
    try { const url = new URL(origin); return !['https:', 'http:'].includes(url.protocol) || url.origin !== origin; }
    catch { return true; }
  })) throw new Error('RUNTIME_HTTP_CONFIG_INVALID');
  const origins = new Set(allowedOrigins);
  // Bounded actor-specific planning tickets. Authentication/authorization still
  // runs on every request; an old ticket never carries execution permission.
  const learningServices = new Map();
  return async function runtimeHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    try {
      const open = req.url === '/api/runtime/sessions';
      const scoped = /^\/api\/runtime\/sessions\/([A-Za-z0-9_-]{1,160})\/(events|restore)$/.exec(req.url || '');
      const learningRoute = /^\/api\/learning\/(levels|plans|launch)$/.exec(req.url || '');
      if (!open && !scoped && !learningRoute) reject(404, 'NOT_FOUND');
      const origin = req.headers.origin;
      if (origin !== undefined) {
        if (!origins.has(origin)) reject(403, 'ORIGIN_DENIED');
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      if (req.method === 'OPTIONS') {
        if (!origin || req.headers['access-control-request-method'] !== 'POST' ||
            (req.headers['access-control-request-headers'] || '').split(',').some(h => h.trim() && !['authorization', 'content-type'].includes(h.trim().toLowerCase()))) reject(403, 'PREFLIGHT_DENIED');
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.writeHead(204); res.end(); return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); reject(405, 'METHOD_NOT_ALLOWED'); }
      let actor;
      try {
        const header = req.headers.authorization;
        if (typeof resolveActor !== 'function' || typeof header !== 'string' || header.length > 4096 || !/^Bearer [A-Za-z0-9._~+\/-]+=*$/i.test(header)) reject(401, 'UNAUTHENTICATED');
        const resolved = await resolveActor(Object.freeze({ bearerToken: header.slice(7) }));
        if (!resolved) reject(401, 'UNAUTHENTICATED');
        actor = Object.freeze({ learnerId: id(resolved.learnerId), role: resolved.role });
      } catch { reject(401, 'UNAUTHENTICATED'); }
      if (actor.role !== 'STUDENT') reject(403, 'STUDENT_REQUIRED');
      // A deployment must supply execution permission independently of login.
      if (typeof authorizeExecution !== 'function') reject(403, 'EXECUTION_DENIED');
      const body = await readBody(req);
      if (learningRoute) {
        if (!learning) reject(503, 'LEARNING_UNAVAILABLE');
        const action = learningRoute[1];
        fields(body, action === 'levels' ? ['curriculumArtifactVersionId'] : action === 'plans' ?
          ['curriculumArtifactVersionId', 'levelId', 'language'] : ['planId', 'gameId', 'creationKey', 'runtimeVersion']);
        let loop = learningServices.get(actor.learnerId);
        if (!loop) {
          const wrap = fn => typeof fn === 'function' ? selection => fn(Object.freeze({ ...selection, actor })) : undefined;
          loop = createLevelLearningLoop(db, { ...learning, authorizeExecution: wrap(authorizeExecution),
            authorizeLevel: wrap(learning.authorizeLevel), authorizeLearning: wrap(learning.authorizeLearning) });
          learningServices.set(actor.learnerId, loop);
          if (learningServices.size > 128) learningServices.delete(learningServices.keys().next().value);
        }
        const input = { ...body, learnerId: actor.learnerId };
        const result = await (action === 'levels' ? loop.catalogue(input) : action === 'plans' ? loop.prepare(input) : loop.launch(input));
        if (!result.ok) reject(result.error?.code?.includes('PROVIDER') ? 503 : 409, 'LEARNING_REQUEST_REJECTED');
        const { ok, ...prepared } = result;
        response(res, 200, action === 'launch' ? result.runtime : action === 'levels' ? result.catalogue : prepared);
        return;
      }
      fields(body, open ? ['gameSpecId', 'creationKey', 'runtimeVersion'] : scoped[2] === 'events' ? ['runtimeVersion', 'event'] : ['runtimeVersion']);
      const service = createGameplayService(db, {
        authorizeExecution: selection => authorizeExecution(Object.freeze({ ...selection, actor }))
      });
      let result;
      if (open) result = await service.openRuntimeSession({ learnerId: actor.learnerId, gameSpecId: body.gameSpecId, creationKey: body.creationKey, runtimeVersion: body.runtimeVersion });
      else {
        const input = { learnerId: actor.learnerId, sessionId: scoped[1], runtimeVersion: body.runtimeVersion };
        result = scoped[2] === 'events' ? await service.ingestRuntimeEvent({ ...input, event: body.event }) : await service.restoreRuntimeSession(input);
      }
      response(res, 200, result); // Already sanitized by the trusted service.
    } catch (error) {
      let status = 500, code = 'RUNTIME_UNAVAILABLE';
      if (error instanceof HttpError) { status = error.status; code = error.code; }
      else if (error instanceof GameplayError) {
        if (malformed.has(error.code)) { status = 400; code = 'INVALID_REQUEST'; }
        else if (conflict.has(error.code)) { status = 409; code = 'EVENT_OR_SESSION_CONFLICT'; }
        else if (error.code === 'SESSION_NOT_FOUND') { status = 404; code = 'SESSION_NOT_FOUND'; }
        else if (error.code === 'RUNTIME_AUTHORIZATION_REQUIRED') { status = 403; code = 'EXECUTION_DENIED'; }
      }
      // Never echo exception messages, tokens, bodies, DB errors or stacks.
      if (!req.complete) res.setHeader('Connection', 'close');
      if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      if (!res.destroyed && !res.headersSent) response(res, status, { error: { code } });
    }
  };
}
function createRuntimeHttpServer(options) {
  return http.createServer({ maxHeaderSize: 8192, requestTimeout: 30000, headersTimeout: 10000 }, createRuntimeHttpHandler(options));
}
module.exports = { createRuntimeHttpHandler, createRuntimeHttpServer };
