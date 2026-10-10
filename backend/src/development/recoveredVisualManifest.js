'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {loadManifest}=require('./localRuntime');
const {atomicJson}=require('../services/curriculumIngestion/ingestCurriculum');
async function main(){
 const [manifestPath,selectionPath,sourcePdf,imageDirectory,output]=process.argv.slice(2);
 const {entries}=await loadManifest(manifestPath),selection=JSON.parse(await fs.readFile(selectionPath));
 const chapter=entries.map(e=>e.package).find(p=>p.artifactVersionId===selection.artifactVersionId),level=chapter.levels.find(l=>l.levelId===selection.levelId);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');const pdfHash=sha(await fs.readFile(sourcePdf));
 const artifact=entries.find(e=>e.package===chapter).artifact;
 const source=artifact.source_context.documents.find(d=>d.sha256===pdfHash);if(!source)throw Error('SOURCE_HASH_MISMATCH');
 const pages=[...new Set(level.learnerMaterialRefs.flatMap(r=>chapter.materials[r].sourceRefs.filter(s=>s.sourceId===source.sourceId).map(s=>s.page)))];
 const recovered=[];
 for(const page of pages){const image=path.join(imageDirectory,path.basename(sourcePdf,'.pdf')+'-'+String(page).padStart(2,'0')+'.png');const bytes=await fs.readFile(image);
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('INVALID_PNG');
 recovered.push({origin:'RECOVERED_PDF_PAGE',sourceId:source.sourceId,sourcePdf:path.resolve(sourcePdf),sourceSha256:pdfHash,page,imagePath:path.resolve(image),imageSha256:sha(bytes),materialRefs:level.learnerMaterialRefs.filter(r=>chapter.materials[r].sourceRefs.some(s=>s.sourceId===source.sourceId&&s.page===page)),originalExerciseAnswerEstablished:false});}
 await atomicJson(output,{curriculumVersion:chapter.artifactVersionId,levelId:level.levelId,recovered,originalExerciseAnswerEstablished:false});console.log(JSON.stringify({recoveredPages:pages,sourceHashVerified:true}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
