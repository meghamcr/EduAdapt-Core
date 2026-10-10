'use strict';
// Opt-in localhost proof server. All records, approvals and providers are synthetic
// and in memory. No Prisma client, .env, Gemini or production data is loaded.
const fs = require('node:fs');
const { fixture, planCandidate, twoChallenges } = require('../../gamePlanning/fixtures/plannerFixture');
const { createRuntimeHttpServer } = require('../../../src/http/runtimeApi');
async function main() {
  const output = process.argv[2]; if (!output) throw Error('LOCAL_PROOF_OUTPUT_REQUIRED');
  const servers = [], endpoints = [];
  for (const story of [false, true]) {
    const f = await fixture({ story });
    const server = createRuntimeHttpServer({ db: f.db,
      resolveActor: async ({ bearerToken }) => bearerToken === 'synthetic-proof-token' ? { learnerId: 'synthetic-learner', role: 'STUDENT' } : null,
      authorizeExecution: async () => ({ reference: 'SYNTHETIC_TEST_ONLY' }),
      learning: { plannerProvider: { planStructuredGame: planCandidate }, provider: { generateStructuredGame: r => twoChallenges(r.originalRequest || r) },
        authorizeLevel: async () => ({ reference: 'SYNTHETIC_TEST_ONLY' }), authorizeLearning: async () => true, loadPrerequisites: async () => [] } });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    servers.push(server); endpoints.push({ endpoint: `http://127.0.0.1:${server.address().port}`, versionId: f.versionId, levelId: f.levelId });
  }
  fs.writeFileSync(output, JSON.stringify({ endpoints }));
  process.stdout.write('Two synthetic localhost proof servers ready. No live database or provider.\n');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    for (const server of servers) { server.close(); server.closeAllConnections(); }
  });
}
main().catch(() => { process.stderr.write('SYNTHETIC_PROOF_SERVER_FAILED\n'); process.exitCode = 1; });
