'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const { createRuntimeHttpServer } = require('../../src/http/runtimeApi');
const { runtimeFixture, RUNTIME_VERSION } = require('../runtime/fixtures/runtimeFixture');
async function fixture(t, overrides = {}, fixtureOptions = {}) {
  const f = await runtimeFixture(fixtureOptions);
  const options = {
    db: f.db,
    resolveActor: async ({ bearerToken }) => bearerToken === 'student-token' ? { learnerId: f.identity.learnerId, role: 'STUDENT' } : bearerToken === 'other-token' ? { learnerId: 'other-learner', role: 'STUDENT' } : null,
    authorizeExecution: async ({ learnerId, actor }) => learnerId === actor.learnerId ? { reference: 'HTTP_TEST_ONLY' } : null,
    ...overrides
  };
  const server = createRuntimeHttpServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  function request(path, body, { method = 'POST', token = 'student-token', headers = {}, raw, chunked = false } = {}) {
    return new Promise((resolve, reject) => {
      const bytes = raw === undefined ? JSON.stringify(body) : raw;
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method, agent: false,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, headers: res.headers, data: text ? JSON.parse(text) : null }); });
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(Error('TEST_HTTP_TIMEOUT')));
      if (chunked) { req.write(bytes.slice(0, 2000)); req.end(bytes.slice(2000)); } else req.end(bytes);
    });
  }
  const base = `/api/runtime/sessions/${f.runtime.sessionId}`;
  const open = extra => request('/api/runtime/sessions', { gameSpecId: f.openInput.gameSpecId, creationKey: 'api-launch', runtimeVersion: RUNTIME_VERSION, ...extra });
  const event = (value, opts) => request(`${base}/events`, { runtimeVersion: RUNTIME_VERSION, event: value }, opts);
  let n = 0;
  const send = (type, details = {}) => event({ eventId: `http${++n}`, type, ...details });
  const present = async () => {
    assert.equal((await send('GAME_STARTED')).status, 200);
    for (const p of f.runtime.phases.slice(0,3)) assert.equal((await send('PHASE_STARTED', { phaseId: p.id })).status, 200);
    assert.equal((await send('CHALLENGE_PRESENTED', { challengeId: 'challenge1' })).status, 200);
  };
  f.db.trace = [];
  return { ...f, request, base, open, event, send, present };
}
const noLeaks = data => assert.doesNotMatch(JSON.stringify(data), /correctAnswer|correctIndex|storedPackage|sourceRegistry|artifactVersionId|runtimeAuthorizationReference|validationResults|SECRET|postgres:\/\/|stack/);
test('HTTP authorized open returns the existing sanitized Unity contract directly', async t => {
  const f = await fixture(t), result = await f.open();
  assert.equal(result.status, 200); assert.equal(result.data.runtimeVersion, RUNTIME_VERSION);
  assert.equal(result.data.challenges[0].prompt, f.runtime.challenges[0].prompt); noLeaks(result.data);
  assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual((await f.open()).data, result.data);
});
for (const [name, overrides, token, status] of [
  ['missing token', {}, null, 401], ['invalid token', {}, 'wrong', 401],
  ['missing resolver', { resolveActor: undefined }, 'student-token', 401],
  ['resolver failure', { resolveActor: async () => { throw Error('SECRET'); } }, 'student-token', 401],
  ['invalid actor', { resolveActor: async () => ({ learnerId: '', role:'STUDENT' }) }, 'student-token', 401],
  ['teacher actor', { resolveActor: async () => ({ learnerId:'teacher', role:'TEACHER' }) }, 'student-token', 403],
  ['missing execution policy', { authorizeExecution: undefined }, 'student-token', 403]
]) test(`${name} fails closed before database access`, async t => {
  const f = await fixture(t, overrides);
  const r = await f.request('/api/runtime/sessions', {}, { token }); assert.equal(r.status,status); noLeaks(r.data); assert.equal(f.db.trace.length,0);
});
test('execution policy receives authenticated actor and exact trusted checksum', async t => {
  let selected; const f = await fixture(t, { authorizeExecution: async input => { selected=input;return null; } });
  assert.equal((await f.open()).status,403); assert.equal(selected.actor.learnerId,f.identity.learnerId);
  assert.equal(selected.specificationChecksum,f.db.state.gameSpec[0].spec.specificationFingerprint);
  assert.equal(f.db.state.gameplayEvidenceSession.length,1);
});
test('cross-learner session restore and event reject without writing', async t => {
  const f=await fixture(t), before=structuredClone(f.db.state);
  assert.equal((await f.request(`${f.base}/restore`,{runtimeVersion:RUNTIME_VERSION},{token:'other-token'})).status,404);
  assert.equal((await f.event({eventId:'x',type:'GAME_STARTED'},{token:'other-token'})).status,404);
  assert.deepEqual(f.db.state,before);
});
for (const field of ['learnerId','actor','role','correctness','score','mastery','difficulty','adaptiveMode']) test(`launch rejects client ${field}`,async t=>{
  const f=await fixture(t);assert.equal((await f.open({[field]:'spoof'})).status,400);
});
for (const field of ['correctness','score','mastery','attempt','difficulty','learnerState']) test(`event rejects client ${field}`,async t=>{
  const f=await fixture(t);assert.equal((await f.send('GAME_STARTED',{[field]:true})).status,400);assert.equal(f.db.state.gameplayEvidenceEvent.length,0);
});
for (const type of ['CLOZE','MCQ_CLOZE']) test(`${type} scoring, stable duplicate event IDs and safe restored state`,async t=>{
  const f=await fixture(t,{}, {type}); await f.present();
  const wrong=await f.send('ANSWER_SUBMITTED',{challengeId:'challenge1',response:type==='CLOZE'?'wrong':1});
  assert.equal(wrong.status,200);assert.equal(wrong.data.correctness,false);assert.equal(wrong.data.attempt,1);
  const value={eventId:'answer-retry',type:'ANSWER_SUBMITTED',challengeId:'challenge1',response:type==='CLOZE'?'eight':0};
  const first=await f.event(value), second=await f.event(value);assert.deepEqual(first.data,second.data);assert.equal(first.data.attempt,2);assert.equal(first.data.correctness,true);noLeaks(first.data);
  assert.equal(f.db.state.gameplayEvidenceEvent.filter(e=>e.eventKey==='answer-retry').length,1);
  assert.equal((await f.event({...value,response:type==='CLOZE'?'changed':1})).status,409);
  const restored=await f.request(`${f.base}/restore`,{runtimeVersion:RUNTIME_VERSION});assert.equal(restored.status,200);noLeaks(restored.data);
  assert.equal(restored.data.progress.resolved[0].completed,true);assert.equal(restored.data.progress.activeChallengeId,null);
  assert.equal((await f.send('GAME_COMPLETED')).status,409);
  await f.send('PHASE_STARTED',{phaseId:'complete'});assert.equal((await f.send('GAME_COMPLETED')).data.progress.status,'COMPLETED');
});
test('hints, skips and abandonment remain existing service transitions',async t=>{
  const f=await fixture(t);await f.present();assert.equal((await f.send('HINT_REQUESTED',{challengeId:'challenge1'})).status,200);
  assert.equal((await f.send('CHALLENGE_SKIPPED',{challengeId:'challenge1'})).status,200);
  assert.equal((await f.send('GAME_ABANDONED')).data.progress.status,'ABANDONED');
  assert.notEqual(f.db.state.curriculumNodeMastery[0].status,'MASTERED');
});
for(const [name,body,options,status] of [
  ['malformed JSON',{}, {raw:'{'},400], ['array body',[],{},400], ['null body',null,{},400],
  ['wrong MIME',{}, {headers:{'Content-Type':'text/plain'}},415],
  ['compressed body',{}, {headers:{'Content-Encoding':'gzip'}},415],
  ['unsupported version',{gameSpecId:'x',creationKey:'x',runtimeVersion:'future'},{},400],
  ['oversized chunked body',{}, {raw:' '.repeat(5000),chunked:true},413],
  ['unsupported method',{}, {method:'GET'},405]
]) test(name,async t=>{
  const f=await fixture(t);const r=await f.request('/api/runtime/sessions',body,options);assert.equal(r.status,status);noLeaks(r.data);
});
test('URL/query injection and unknown routes fail safely',async t=>{
  const f=await fixture(t);for(const path of ['/api/runtime/sessions?learnerId=other','/api/runtime/sessions/%2F/restore','/unknown']) assert.equal((await f.request(path,{})).status,404);
});
test('stale authority and private policy exceptions never leak',async t=>{
  let fail=false;const f=await fixture(t,{authorizeExecution:async()=>{if(fail)throw Error('SECRET postgres://password');return {reference:'TEST_ONLY'};}});
  fail=true;const r=await f.open();assert.equal(r.status,500);noLeaks(r.data);fail=false;
  f.db.state.curriculumArtifactVersion[0].reviewStatus='SUPERSEDED';const stale=await f.request(`${f.base}/restore`,{runtimeVersion:RUNTIME_VERSION});assert.equal(stale.status,500);noLeaks(stale.data);
});
test('explicit CORS allowlist supports only permitted Unity origins and headers',async t=>{
  const f=await fixture(t,{allowedOrigins:['https://unity.example.test']});
  const preflight={method:'OPTIONS',token:null,headers:{Origin:'https://unity.example.test','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, Content-Type'}};
  const r=await f.request('/api/runtime/sessions',undefined,preflight);assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],'https://unity.example.test');assert.equal(r.headers['access-control-allow-credentials'],undefined);
  assert.equal((await f.request('/api/runtime/sessions',{}, {headers:{Origin:'https://evil.example.test'}})).status,403);
  assert.equal((await f.request('/api/runtime/sessions',{}, {...preflight,headers:{...preflight.headers,'Access-Control-Request-Headers':'x-learner-id'}})).status,403);
});
test('cookie/local identity cannot authenticate and invalid origin configuration rejects',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/api/runtime/sessions',{}, {token:null,headers:{Cookie:'student=synthetic-learner','X-Learner-Id':'synthetic-learner'}})).status,401);
  assert.throws(()=>createRuntimeHttpServer({allowedOrigins:['*']}),/RUNTIME_HTTP_CONFIG_INVALID/);
});
test('remediation uses the existing phase-specific event protocol',async t=>{
  const f=await fixture(t,{}, {mutate:g=>{g.phases[2].type='REMEDIATION';}});
  await f.send('GAME_STARTED');await f.send('PHASE_STARTED',{phaseId:'intro'});await f.send('PHASE_STARTED',{phaseId:'teach'});
  assert.equal((await f.send('PHASE_STARTED',{phaseId:'practice'})).status,409);
  const result=await f.send('REMEDIATION_STARTED',{phaseId:'practice'});assert.equal(result.status,200);assert.deepEqual(result.data.derivedTypes,['PHASE_STARTED']);
});
test('unsupported event, wrong answer type and restore body spoofing reject',async t=>{
  const f=await fixture(t);assert.equal((await f.send('ANSWER_CORRECT')).status,400);await f.present();
  assert.equal((await f.send('ANSWER_SUBMITTED',{challengeId:'challenge1',response:'0'})).status,400);
  assert.equal((await f.request(`${f.base}/restore`,{runtimeVersion:RUNTIME_VERSION,learnerId:'other-learner'})).status,400);
});
test('revoked execution policy blocks event and restore on existing sessions',async t=>{
  const f=await fixture(t,{authorizeExecution:async()=>null});
  assert.equal((await f.send('GAME_STARTED')).status,403);
  assert.equal((await f.request(`${f.base}/restore`,{runtimeVersion:RUNTIME_VERSION})).status,403);
  assert.equal(f.db.state.gameplayEvidenceEvent.length,0);
});
