'use strict';
// Isolated serializable in-memory storage. No environment, network or Prisma dependency.
const { isDeepStrictEqual: equal } = require('node:util');
const names = ['curriculumArtifactIdentity', 'curriculumArtifactVersion', 'curriculumArtifactReview', 'curriculumArtifactImport', 'curriculumBook', 'curriculumChapter', 'curriculumNode'];
function matches(row, where = {}) {
  return Object.entries(where).every(([k,v]) => k === 'OR' ? v.some(part => matches(row,part)) : k === 'AND' ? v.every(part => matches(row,part)) : v && Array.isArray(v.in) ? v.in.includes(row[k]) : v && typeof v.startsWith === 'string' ? typeof row[k] === 'string' && row[k].startsWith(v.startsWith) : equal(row[k], v));
}
function database({ includeGameSpec = false, includeGameplay = false } = {}) {
  const modelNames = [...names, ...(includeGameSpec || includeGameplay ? ['gameSpec'] : []), ...(includeGameplay ? ['curriculumNodeMastery', 'gameplayEvidenceSession', 'gameplayEvidenceEvent'] : [])];
  const fake = { state: Object.fromEntries(modelNames.map(n => [n, []])), trace: [], hook: null };
  let queue = Promise.resolve();
  fake.$disconnect = async () => {};
  fake.$transaction = (callback, options) => {
    const perform = async () => {
      const state = structuredClone(fake.state), tx = {};
      fake.trace.push({ operation: 'transaction', options });
      for (const name of modelNames) {
        tx[name] = {};
        for (const operation of ['findUnique','findMany','create','update','updateMany']) tx[name][operation] = async args => {
          fake.trace.push({ name, operation, args: structuredClone(args) });
          if (fake.hook) await fake.hook(name, operation, args, state);
          const rows = state[name];
          if (operation.startsWith('find')) {
            let result = rows.filter(row => matches(row,args.where));
            if (args.orderBy) { const key = Object.keys(args.orderBy)[0]; result = result.slice().sort((a,b)=> (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (args.orderBy[key] === 'desc' ? -1 : 1)); }
            if (args.take !== undefined) result = result.slice(0, args.take);
            return structuredClone(operation === 'findUnique' ? result[0] || null : result);
          }
          if (operation === 'create') {
            const row = { id: `synthetic-${name}-${rows.length}`, ...structuredClone(args.data) };
            const unique = { gameSpec: ['slug'], curriculumBook: ['board','grade','subject','title'], curriculumChapter: ['bookId','chapterNumber'], curriculumArtifactVersion: ['artifactChecksum'], curriculumArtifactReview: ['versionId','revision'], curriculumArtifactImport: ['versionId','chapterId'] }[name];
            if (rows.some(r => r.id === row.id || unique && unique.every(k => equal(r[k],row[k])))) throw Object.assign(new Error('synthetic unique conflict'), {code:'P2002'});
            const constraints = { curriculumNodeMastery: [['learnerId','artifactVersionId','nodeId']], gameplayEvidenceSession: [['learnerId','creationKey']], gameplayEvidenceEvent: [['sessionId','eventKey'],['sessionId','sequence'],['scopeId','scopeSequence']] }[name] || [];
            if (constraints.some(keys => rows.some(r => keys.every(k => equal(r[k],row[k]))))) throw Object.assign(new Error('synthetic unique conflict'), {code:'P2002'});
            if (name === 'curriculumNode' && row.parentId && !rows.some(r => r.id === row.parentId)) throw new Error('Parent missing');
            rows.push(row); return structuredClone(row);
          }
          const selected = rows.filter(row => matches(row,args.where)); selected.forEach(row => Object.assign(row,structuredClone(args.data)));
          return operation === 'updateMany' ? {count:selected.length} : structuredClone(selected[0]);
        };
        tx[name].deleteMany = () => { throw new Error('Destructive call forbidden'); };
        tx[name].upsert = () => { throw new Error('Uncontrolled upsert forbidden'); };
      }
      tx.$queryRaw = async (strings, id) => { fake.trace.push({operation:'lock',sql:strings.join('?'),id}); return state.curriculumArtifactVersion.filter(v=>v.id===id).map(v=>({id:v.id})); };
      const result = await callback(tx); fake.state = state; return result;
    };
    const result = queue.then(perform); queue = result.catch(()=>{}); return result;
  };
  return fake;
}
module.exports = { database };
