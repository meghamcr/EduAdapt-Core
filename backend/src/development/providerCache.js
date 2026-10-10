'use strict';
const fs = require('node:fs/promises'), path = require('node:path');
const {fingerprint} = require('../services/curriculumIngestion/curriculumIdentity');
const {atomicJson} = require('../services/curriculumIngestion/ingestCurriculum');
// Cache is an untrusted candidate store. Existing planner/GameSpec validation
// always runs again. Failed attempts are retained and never silently reissued.
function createProviderCache({directory, plannerProvider, gameProvider, maxCalls=0}) {
  let calls=0, active=false;
  async function execute(kind, request, provider) {
    const key=fingerprint(request), file=path.join(directory, `${kind}-${key}.json`);
    const existing=await fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(existing) {
      if(existing.key!==key || existing.kind!==kind || existing.status!=='RECEIVED') throw Error('CACHED_PROVIDER_ATTEMPT_UNAVAILABLE');
      return existing.candidate;
    }
    if(active || calls>=maxCalls || !provider) throw Error('DEVELOPMENT_PROVIDER_BUDGET_EXHAUSTED');
    active=true; calls++;
    await atomicJson(file,{key,kind,status:'STARTED',startedAt:new Date().toISOString()});
    try {
      const candidate=await provider(request);
      await atomicJson(file,{key,kind,status:'RECEIVED',receivedAt:new Date().toISOString(),candidate});
      return candidate;
    } catch (error) {
      await atomicJson(file,{key,kind,status:'FAILED',failedAt:new Date().toISOString(),
        providerCode:error.providerCode || 'PROVIDER_FAILURE', ...(Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{})});
      throw Error('DEVELOPMENT_PROVIDER_FAILED');
    } finally {active=false;}
  }
  return {plannerProvider:{planStructuredGame:r=>execute('plan',r,plannerProvider?.planStructuredGame)},
    provider:{generateStructuredGame:r=>execute('game',r,gameProvider?.generateStructuredGame)}, calls:()=>calls};
}
module.exports={createProviderCache};
