'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {buildChapterLevels,levelCurriculumPackage}=require('./levelCurriculum');
const {fail}=require('./instructionalSequence');
// Explicit offline manifest: no directory scanning, provider or database client.
async function buildFromConfig(configPath){
  const base=path.dirname(path.resolve(configPath)),config=JSON.parse(await fs.readFile(configPath,'utf8'));
  if(config.schemaVersion!==1||!Array.isArray(config.artifacts)||!config.artifacts.length||typeof config.outputDirectory!=='string'||!config.outputDirectory.trim())fail('INVALID_LEVEL_CONFIG');
  const resolve=p=>{if(typeof p!=='string'||!p.trim())fail('INVALID_LEVEL_PATH');return path.resolve(base,p);};
  const inputs=await Promise.all(config.artifacts.map(async entry=>({artifactPath:await fs.realpath(resolve(entry.artifactPath)),evidencePath:entry.evidencePath?await fs.realpath(resolve(entry.evidencePath)):null})));
  const built=[];
  // Build/validate all inputs first; never partially process a corrupt manifest.
  for(const input of inputs){const artifact=JSON.parse(await fs.readFile(input.artifactPath,'utf8')),sourceEvidence=input.evidencePath?JSON.parse(await fs.readFile(input.evidencePath,'utf8')):undefined;
    const chapter=buildChapterLevels(artifact,{...(config.policy||{}),sourceEvidence});built.push(chapter);}
  if(new Set(built.map(b=>b.artifactVersionId)).size!==built.length)fail('DUPLICATE_ARTIFACT_INPUT');
  const output=resolve(config.outputDirectory);await fs.mkdir(output,{recursive:true});const realOutput=await fs.realpath(output);
  const protectedPaths=new Set([await fs.realpath(configPath),...inputs.flatMap(i=>[i.artifactPath,i.evidencePath]).filter(Boolean)]);
  const outputs=built.map(chapter=>({chapter,destination:path.join(realOutput,`${chapter.artifactVersionId}.levels.json`)}));
  for(const {destination} of outputs){const existing=await fs.lstat(destination).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});if(existing?.isSymbolicLink()||existing&&!existing.isFile()||protectedPaths.has(destination))fail('UNSAFE_LEVEL_OUTPUT');}
  for(const {chapter,destination} of outputs){const temp=destination+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(chapter,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(temp,destination);}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
  return outputs.map(({chapter,destination})=>({artifactVersionId:chapter.artifactVersionId,chapter:chapter.chapterTitle,levels:chapter.levels.length,outputPath:destination,reviewStatus:chapter.reviewStatus}));
}
if(require.main===module){if(process.argv.length!==4||process.argv[2]!=='--config'){console.error('Usage: node buildLevelPackages.js --config local-manifest.json');process.exitCode=1;}else buildFromConfig(process.argv[3]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.code||'LOCAL_LEVEL_BUILD_FAILED');process.exitCode=1;});}
module.exports={buildFromConfig,levelCurriculumPackage};
