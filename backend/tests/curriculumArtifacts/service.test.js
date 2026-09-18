const test = require('node:test');
const assert = require('node:assert/strict');
const { createArtifactService } = require('../../src/services/curriculumArtifacts/artifactService');
const { options, run, safeError } = require('../../src/services/curriculumArtifacts/artifactCli');
const { artifact, rehash, database } = require('./fixtures/serviceFixture');
const { curriculum } = require('../curriculumIngestion/fixtures/helpers');
function setup() { const db = database(); return { db, service: createArtifactService(db, { dbNull: null, now: () => new Date('2026-02-01T00:00:00Z') }) }; }
async function approved(s, a = artifact()) { const p = await s.persist(a); await s.review(p.versionId,'IN_REVIEW',{expectedRevision:0}); await s.review(p.versionId,'APPROVED',{expectedRevision:1,reviewerReference:'reviewer:synthetic'}); return p.versionId; }
const writes = db => db.trace.filter(t=>['create','update','updateMany'].includes(t.operation));

test('first persist preserves full provenance and starts unreviewed with no implicit selection', async()=>{
  const {db,service:s}=setup(),a=artifact(),p=await s.persist(a); const v=db.state.curriculumArtifactVersion[0];
  assert.deepEqual(v.snapshot,a); assert.deepEqual(v.sourceProvenance.sources,a._ingestion.sources); assert.equal(v.reviewStatus,'UNREVIEWED'); assert.equal(v.authoritativeNodes[0].content,a.nodes[0].content); assert.equal(p.reused,false); assert.equal(db.state.curriculumArtifactIdentity[0].currentVersionId,undefined);
});
test('exact replay preserves original generating actor and review state; changed generation is distinct', async()=>{
  const {db,service:s}=setup(),a=artifact();const first=await s.persist(a,{generatedBy:'actor:first'});await s.review(first.versionId,'IN_REVIEW',{expectedRevision:0});
  const again=await s.persist(a,{generatedBy:'actor:second'}); assert.equal(again.reused,true); assert.equal(again.reviewStatus,'IN_REVIEW'); assert.equal(db.state.curriculumArtifactVersion[0].generatedBy,'actor:first');
  a._ingestion.generatedAt='2026-01-02T00:00:00Z';const next=await s.persist(a,{selectCurrent:true});assert.notEqual(first.versionId,next.versionId);assert.equal(db.state.curriculumArtifactVersion.length,2);assert.equal(db.state.curriculumArtifactIdentity[0].currentVersionId,next.versionId);assert.equal(next.reviewStatus,'UNREVIEWED');
});
test('legacy artifact persists with null provenance, never invented authority or approval',async()=>{
  const {db,service:s}=setup();await s.persist(curriculum());const v=db.state.curriculumArtifactVersion[0];assert.equal(v.authorityVersion,null);assert.equal(v.authoritativeNodes,null);assert.equal(v.generatedAt,null);assert.deepEqual(v.sourceProvenance,{registry:null,sources:null});
});
test('review increments revisions, records append-only events and rejects stale/invalid transitions',async()=>{
  const {db,service:s}=setup();const id=(await s.persist(artifact())).versionId;
  await assert.rejects(s.review(id,'APPROVED',{expectedRevision:0,reviewerReference:'r'}),/Invalid review transition/);
  await s.review(id,'IN_REVIEW',{expectedRevision:0});await assert.rejects(s.review(id,'REJECTED',{expectedRevision:0,reviewerReference:'r'}),/STALE_REVIEW/);
  await assert.rejects(s.review(id,'REJECTED',{expectedRevision:1}),/REVIEWER_REQUIRED/);
  await s.review(id,'REJECTED',{expectedRevision:1,reviewerReference:'r',notes:'Needs source correction'});await s.review(id,'IN_REVIEW',{expectedRevision:2});
  assert.deepEqual(db.state.curriculumArtifactReview.map(e=>e.revision),[1,2,3]);assert.equal(db.state.curriculumArtifactVersion[0].reviewRevision,3);
  assert.equal(db.trace.some(t=>t.name==='curriculumArtifactReview'&&t.operation==='update'),false);
});
test('review event failure rolls status and revision back',async()=>{
  const {db,service:s}=setup();const id=(await s.persist(artifact())).versionId;const before=structuredClone(db.state);
  db.hook=(name,op)=>{if(name==='curriculumArtifactReview'&&op==='create')throw new Error('synthetic event failure');};
  await assert.rejects(s.review(id,'IN_REVIEW',{expectedRevision:0}),/synthetic event failure/);assert.deepEqual(db.state,before);
});
test('two concurrent decisions with same expected revision cannot both succeed',async()=>{
  const {db,service:s}=setup();const id=(await s.persist(artifact())).versionId;
  const results=await Promise.allSettled([s.review(id,'IN_REVIEW',{expectedRevision:0}),s.review(id,'REJECTED',{expectedRevision:0,reviewerReference:'r'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.state.curriculumArtifactReview.length,1);
});
test('dry run performs zero writes, reports missing versions and blocks unapproved artifacts',async()=>{
  const {db,service:s}=setup();const id=(await s.persist(artifact())).versionId;db.trace=[];const before=structuredClone(db.state);
  assert.deepEqual((await s.dryRun('missing')).conflicts,['VERSION_NOT_FOUND']);const p=await s.dryRun(id);assert.equal(p.allowed,false);assert.ok(p.conflicts.includes('NOT_APPROVED'));assert.equal(writes(db).length,0);assert.equal(db.trace.some(t=>t.operation==='lock'),false);assert.deepEqual(db.state,before);
});
test('approved plan preserves deep hierarchy, deterministic sibling order and duplicate titles',async()=>{
  const {service:s}=setup(),a=artifact();a.nodes.push({...structuredClone(a.nodes[1]),id:'deep',parent_id:'worked',order:2});a.nodes.push({...structuredClone(a.nodes[1]),id:'sibling',parent_id:'root',order:2});a.nodes.reverse();const id=await approved(s,rehash(a)),p=await s.dryRun(id);assert.equal(p.allowed,true);assert.deepEqual(p.nodes.map(n=>n.id),['root','worked','deep','sibling']);assert.equal(p.nodeMapping.deep,'deep');assert.equal(p.nodes[2].parentId,'worked');
});
test('approved import records verified hierarchy and repeat is fully idempotent',async()=>{
  const {db,service:s}=setup(),id=await approved(s);const first=await s.importVersion(id,{importedBy:'operator:synthetic'});assert.equal(first.reused,false);assert.equal(db.state.curriculumNode[1].parentId,'root');assert.equal(db.state.curriculumNode[1].orderIndex,1);assert.equal(db.state.curriculumArtifactImport.length,1);
  db.trace=[];const again=await s.importVersion(id);assert.equal(again.reused,true);assert.equal(writes(db).length,0);const plan=await s.dryRun(id);assert.deepEqual(plan.nodesMatching,['root','worked']);assert.equal(plan.nodesToCreate.length,0);
  assert.ok(db.trace.filter(t=>t.operation==='transaction').some(t=>t.options.isolationLevel==='Serializable'));
});
for(const status of ['UNREVIEWED','IN_REVIEW','REJECTED','SUPERSEDED'])test(`import rejects ${status}`,async()=>{
  const {db,service:s}=setup();const id=(await s.persist(artifact())).versionId;db.state.curriculumArtifactVersion[0].reviewStatus=status;const before=structuredClone(db.state);await assert.rejects(s.importVersion(id),/IMPORT_BLOCKED/);assert.deepEqual(db.state,before);
});
test('node failure rolls back book, chapter, nodes and history',async()=>{
  const {db,service:s}=setup(),id=await approved(s),before=structuredClone(db.state);db.hook=(name,op,args)=>{if(name==='curriculumNode'&&op==='create'&&args.data.parentId)throw new Error('synthetic node failure');};await assert.rejects(s.importVersion(id),/synthetic node failure/);assert.deepEqual(db.state,before);
});
test('verification and history insertion failures roll back materialization',async()=>{
  for(const failure of ['verify','history']){const {db,service:s}=setup(),id=await approved(s),before=structuredClone(db.state);db.hook=(name,op,args,state)=>{
    if(failure==='history'&&name==='curriculumArtifactImport'&&op==='create')throw new Error('synthetic history failure');
    if(failure==='verify'&&name==='curriculumNode'&&op==='findMany'&&args.where.chapterId&&state.curriculumNode.length)state.curriculumNode[0].content='corrupted';
  };await assert.rejects(s.importVersion(id));assert.deepEqual(db.state,before);}
});
test('legacy Grade 6-style data with no provenance is not adopted, updated or backfilled',async()=>{
  const {db,service:s}=setup(),a=artifact();a.grade='6';rehash(a);const id=await approved(s,a),p=await s.dryRun(id);db.state.curriculumBook.push(p.book);db.state.curriculumChapter.push(p.chapter);db.state.curriculumNode.push(...p.nodes);const before=structuredClone(db.state);const blocked=await s.dryRun(id);assert.ok(blocked.conflicts.includes('LEGACY_CHAPTER_REQUIRES_SEPARATE_RECONCILIATION'));await assert.rejects(s.importVersion(id));assert.deepEqual(db.state,before);
});
test('compatible book may be reused without modifying it',async()=>{
  const {db,service:s}=setup(),id=await approved(s),p=await s.dryRun(id);db.state.curriculumBook.push({...p.book,sourceFile:'legacy-reference.pdf'});const before=structuredClone(db.state.curriculumBook);await s.importVersion(id);assert.deepEqual(db.state.curriculumBook,before);
});
for(const kind of ['edition','book-id','chapter','foreign-node','extra-node'])test(`safe conflict: ${kind}`,async()=>{
  const {db,service:s}=setup(),id=await approved(s),p=await s.dryRun(id);
  if(kind==='edition')db.state.curriculumBook.push({...p.book,edition:'other'});
  if(kind==='book-id')db.state.curriculumBook.push({...p.book,id:'other'});
  if(kind==='chapter')db.state.curriculumChapter.push({...p.chapter,title:'other'});
  if(kind==='foreign-node')db.state.curriculumNode.push({...p.nodes[0],chapterId:'another-chapter'});
  if(kind==='extra-node')db.state.curriculumNode.push({...p.nodes[0],id:'unrelated'});
  const before=structuredClone(db.state);assert.equal((await s.dryRun(id)).allowed,false);await assert.rejects(s.importVersion(id));assert.deepEqual(db.state,before);
});
test('a different approved version cannot rewrite an imported chapter',async()=>{
  const {db,service:s}=setup(),id=await approved(s);await s.importVersion(id);const a=artifact();a._ingestion.generatedAt='2026-01-03T00:00:00Z';const second=await approved(s,a),before=structuredClone(db.state);assert.ok((await s.dryRun(second)).conflicts.includes('DIFFERENT_VERSION_OR_TARGET_IMPORT'));await assert.rejects(s.importVersion(second));assert.deepEqual(db.state,before);
});
test('tampered snapshot or projection fails integrity verification',async()=>{
  for(const key of ['snapshot','authoritativeNodes']){const {db,service:s}=setup(),id=await approved(s);if(key==='snapshot')db.state.curriculumArtifactVersion[0].snapshot.book='tampered';else db.state.curriculumArtifactVersion[0].authoritativeNodes[0].content='inferred';await assert.rejects(s.importVersion(id));}
});
test('existing import drift fails rather than repairing or overwriting',async()=>{
  const {db,service:s}=setup(),id=await approved(s);await s.importVersion(id);db.state.curriculumNode.pop();const before=structuredClone(db.state);assert.ok((await s.dryRun(id)).conflicts.includes('IMPORTED_STATE_DRIFT'));await assert.rejects(s.importVersion(id));assert.deepEqual(db.state,before);
});
test('GameSpec grounding accepts approved imported mapped node and retains historical null linkage',async()=>{
  const {service:s}=setup(),id=await approved(s);await s.importVersion(id);assert.equal((await s.validateGameGrounding(id,'worked')).chapterId,artifact().chapter_id);assert.deepEqual(await s.validateGameGrounding(null,'legacy-node'),{historical:true,versionId:null});await assert.rejects(s.validateGameGrounding(id,'foreign'),/GAME_NODE_OUTSIDE_MAPPING/);
});
test('GameSpec grounding rejects unapproved, unimported and corrupted mapped nodes',async()=>{
  const {db,service:s}=setup(),id=await approved(s);await assert.rejects(s.validateGameGrounding(id,'root'),/GAME_GROUNDING_BLOCKED/);await s.importVersion(id);db.state.curriculumNode[0].chapterId='wrong';await assert.rejects(s.validateGameGrounding(id,'root'),/GAME_GROUNDING_BLOCKED/);db.state.curriculumNode[0].chapterId=artifact().chapter_id;await s.review(id,'SUPERSEDED',{expectedRevision:2});await assert.rejects(s.validateGameGrounding(id,'root'),/GAME_GROUNDING_BLOCKED/);
});
test('legacy importer is disabled without opening a database',async()=>{const old=require('../../src/services/curriculumIngestion/importCurriculumToDatabase');await assert.rejects(old.importCurriculumFile('never-opened.json'),/File-only import is disabled/);});
test('CLI requires explicit target and write intent before constructing a client',async()=>{
  let clients=0;const clientFactory=()=>{clients++;throw new Error('must not construct');};for(const args of [['import','--version','x'],['inspect','--version','x'],['review','--version','x','--write']])await assert.rejects(run(args,{env:{},clientFactory}));assert.equal(clients,0);assert.match(await run(['--help'],{env:{},clientFactory}),/no .env/);
  const env={CURRICULUM_DATABASE_URL:'postgresql://synthetic:password@localhost:5432/disposable'};assert.equal(options(['--version','x','--target','localhost:5432/disposable'],env).command,'dry-run');assert.throws(()=>options(['import','--version','x','--write','--target','wrong'],env),/DATABASE_TARGET_MISMATCH/);
});
test('CLI suppresses provider/credential details and translates concurrency errors',()=>{assert.equal(JSON.stringify(safeError(new Error('password=private'))).includes('private'),false);assert.equal(safeError({code:'P2034',message:'secret'}).error,'CONCURRENT_CONFLICT');});
test('failed artifact persistence rolls back scope creation',async()=>{
  const {db,service:s}=setup(),before=structuredClone(db.state);db.hook=(name,op)=>{if(name==='curriculumArtifactVersion'&&op==='create')throw new Error('synthetic persist failure');};await assert.rejects(s.persist(artifact()),/synthetic persist failure/);assert.deepEqual(db.state,before);
});
test('duplicate IDs, missing parents, self-parent and cycles are rejected before persistence',async()=>{
  for(const mutate of [a=>a.nodes.push(a.nodes[0]),a=>{a.nodes[1].parent_id='missing';},a=>{a.nodes[1].parent_id=a.nodes[1].id;},a=>{a.nodes[0].parent_id=a.nodes[1].id;}]){
    const {db,service:s}=setup(),a=artifact();mutate(a);rehash(a);await assert.rejects(s.persist(a));assert.equal(writes(db).length,0);
  }
});
test('approval requires a reviewer; validation and inspect never approve',async()=>{
  const {db,service:s}=setup(),id=(await s.persist(artifact())).versionId;await s.inspect(id);assert.equal(db.state.curriculumArtifactVersion[0].reviewStatus,'UNREVIEWED');await s.review(id,'IN_REVIEW',{expectedRevision:0});await assert.rejects(s.review(id,'APPROVED',{expectedRevision:1,reviewerReference:'  '}),/REVIEWER_REQUIRED/);assert.equal(db.state.curriculumArtifactVersion[0].reviewStatus,'IN_REVIEW');
});
test('same titles across board/grade/subject remain separate scoped identities',async()=>{
  const {db,service:s}=setup();await s.persist(artifact());for(const field of ['board','grade','subject']){const a=artifact();a[field]='another scope';await s.persist(rehash(a));}assert.equal(db.state.curriculumArtifactIdentity.length,4);
});
test('materialization excludes synthesis and both inference authorities while retaining their evidence',async()=>{
  const {db,service:s}=setup(),a=artifact(),base=a.nodes[0].materials[0];
  a.nodes[0].source_synthesis=[{...structuredClone(base),authority:'SOURCE_GROUNDED_SYNTHESIS',evidence_kind:'SOURCE_SUMMARY',text:'Synthetic overview excluded from content.'}];
  a.nodes[0].review_inferences=[{...structuredClone(base),authority:'MODEL_INFERENCE',evidence_kind:'DEDUCTION',review_required:true,text:'Synthetic deduction excluded from content.'},{...structuredClone(base),authority:'MODEL_VISUAL_INTERPRETATION',evidence_kind:'VISUAL_READING',review_required:true,text:'Synthetic visual interpretation excluded from content.',visual:{...base.visual,status:'VISUAL_DEPENDENCY'}}];
  const id=await approved(s,rehash(a));await s.importVersion(id);assert.equal(db.state.curriculumNode[0].content,a.nodes[0].content);assert.doesNotMatch(db.state.curriculumNode[0].content,/excluded from content/);assert.deepEqual(db.state.curriculumArtifactVersion[0].snapshot.nodes[0].review_inferences,a.nodes[0].review_inferences);
});
test('CLI dry-run uses injected client, makes no writes and disconnects',async()=>{
  const {db,service:s}=setup(),id=await approved(s);db.trace=[];let disconnected=false;db.$disconnect=async()=>{disconnected=true;};const plan=await run(['--version',id,'--target','localhost:5432/disposable'],{env:{CURRICULUM_DATABASE_URL:'postgresql://synthetic:synthetic@localhost:5432/disposable'},clientFactory:()=>({db,dbNull:null})});assert.equal(plan.allowed,true);assert.equal(writes(db).length,0);assert.equal(disconnected,true);
});
