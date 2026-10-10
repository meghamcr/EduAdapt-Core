'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createProviderCache}=require('../../src/development/providerCache');
const {providerSchema}=require('../../src/services/gameGeneration/geminiProviderSchema');
const {schema}=require('../../src/services/gamePlanning/plannerContract');
const {checkSchema}=require('../../src/services/gameGeneration/gameValidation');
test('provider schema projection leaves full local constraints unchanged',()=>{
  const before=structuredClone(schema),wire=providerSchema(schema);
  assert.deepEqual(schema,before); assert.equal(wire.properties.requestFingerprint.pattern,undefined);
  assert.ok(checkSchema('invalid',schema.properties.requestFingerprint).length);
  assert.deepEqual(wire.properties.games.items.required,schema.properties.games.items.required);
  assert.equal(wire.additionalProperties,false);
});
test('development cache reuses exact requests and respects total call budget',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eduadapt-provider-cache-'));
  let calls=0; const provider={planStructuredGame:async()=>({answer:++calls})};
  const c=createProviderCache({directory,plannerProvider:provider,maxCalls:1});
  assert.deepEqual(await c.plannerProvider.planStructuredGame({scope:1}),{answer:1});
  assert.deepEqual(await c.plannerProvider.planStructuredGame({scope:1}),{answer:1});
  await assert.rejects(c.plannerProvider.planStructuredGame({scope:2}),/BUDGET/);
  const offline=createProviderCache({directory});
  assert.deepEqual(await offline.plannerProvider.planStructuredGame({scope:1}),{answer:1});
  assert.equal(calls,1);
});
test('failed attempts are retained without automatic repeated calls or raw provider messages',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eduadapt-provider-failure-'));
  const c=createProviderCache({directory,plannerProvider:{planStructuredGame:async()=>{throw Object.assign(Error('private provider message'),{providerCode:'API_HTTP',httpStatus:503});}},maxCalls:2});
  await assert.rejects(c.plannerProvider.planStructuredGame({scope:1}));
  await assert.rejects(c.plannerProvider.planStructuredGame({scope:1}),/CACHED/);
  assert.equal(c.calls(),1);
  const saved=await fs.readFile(path.join(directory,(await fs.readdir(directory))[0]),'utf8');
  assert.ok(saved.includes('503'));assert.ok(!saved.includes('private provider message'));
});
test('runtime components contain no actual chapter or level routing assumptions',async()=>{
  const paths=['../../src/development/localRuntime.js','../../src/services/gamePlanning/gamePlanner.js','../../../EduAdapt-GameRuntime/Assets/EduAdapt/Scripts/Runtime/RuntimeMechanicRegistry.cs','../../../EduAdapt-GameRuntime/Assets/EduAdapt/Scripts/Runtime/RuntimeSessionController.cs'];
  for(const file of paths){const text=await fs.readFile(path.resolve(__dirname,file),'utf8');assert.doesNotMatch(text,/Shapes Around Us|Living Together|maths-mela|our-wondrous-world|chapter-1|level-v1-[a-f0-9]{64}/);}
});
