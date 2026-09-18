const test=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const {PROBES,SIZES,prepareProbe,runProbe,parseArgs,classify,curriculumInput}=require('../../src/services/curriculumIngestion/providerDiagnosticHarness');
const {buildGeminiRequest}=require('../../src/services/curriculumIngestion/geminiRequest');
const {callGemini,prepareCurriculumRequest}=require('../../src/services/curriculumIngestion/curriculumParser');
const {IngestionError}=require('../../src/services/curriculumIngestion/geminiRetry');
const {modelOutput,response}=require('./fixtures/helpers');
const model='synthetic-model',secret='PRIVATE_DIAGNOSTIC_KEY';
test('all probes dry-run with zero transport calls and secret-free numeric measurements',async()=>{
 for(const probe of PROBES){const r=await runProbe(probe,{model,apiKey:secret,fetchImpl:()=>assert.fail('Dry run cannot call transport')});assert.equal(r.providerExecutionOccurred,false);assert.equal(r.attempts,0);assert.equal(r.artifactWritten,false);assert.ok(r.totalBytes>0);assert.equal(JSON.stringify(r).includes(secret),false);}
});
test('CLI requires one named probe and explicit execution flag; no bulk execution',()=>{
 assert.deepEqual(parseArgs(['--probe','basic']),{execute:false,probe:'basic'});assert.equal(parseArgs(['--probe','basic','--execute']).execute,true);
 for(const args of [[],['--probe','all'],['--probe','basic','--retry'],['--execute']])assert.throws(()=>parseArgs(args));
});
test('basic/json/structured isolate MIME and tiny schema without PDF or curriculum',async()=>{
 const a=await prepareProbe('basic',model),b=await prepareProbe('json',model),c=await prepareProbe('structured',model);
 assert.equal(a.request.generationConfig.responseMimeType,undefined);assert.equal(a.request.generationConfig.responseJsonSchema,undefined);
 assert.equal(b.request.generationConfig.responseMimeType,'application/json');assert.equal(b.request.generationConfig.responseJsonSchema,undefined);
 assert.deepEqual(c.request.generationConfig.responseJsonSchema.required,['status']);
 assert.deepEqual(a.request.contents,b.request.contents);assert.deepEqual(b.request.contents,c.request.contents);
 assert.equal(c.request.contents[0].parts.length,1);
});
test('tiny PDF and PDF/schema probes share identical synthetic visuals and use inlineData',async()=>{
 const d=await prepareProbe('pdf',model),e=await prepareProbe('pdf-structured',model);
 assert.deepEqual(d.request.contents,e.request.contents);assert.equal(d.request.contents[0].parts.filter(p=>p.inlineData).length,1);
 const part=d.request.contents[0].parts[1];assert.equal(part.inlineData.mimeType,'application/pdf');assert.equal((await PDFDocument.load(Buffer.from(part.inlineData.data,'base64'))).getPageCount(),1);
 assert.equal(d.request.generationConfig.responseJsonSchema,undefined);assert.ok(e.request.generationConfig.responseJsonSchema);
});
test('size ladder measures final serialization and retains one valid synthetic PDF',async()=>{
 let previous=0;for(const [probe,size]of Object.entries(SIZES)){const p=await prepareProbe(probe,model),r=await runProbe(probe,{model});assert.equal(r.totalBytes,Buffer.byteLength(JSON.stringify(p.request)));assert.ok(r.rawAttachmentBytes>=size&&r.rawAttachmentBytes<size+10000);assert.ok(r.totalBytes>previous);previous=r.totalBytes;assert.equal(r.pdfAttachments,1);assert.equal(r.pdfBase64Bytes,4*Math.ceil(r.rawAttachmentBytes/3));}
});
test('production and harness use identical request builder bytes',async()=>{
 const p=await prepareProbe('structured',model);const c=p.request.generationConfig;let body;
 await callGemini(p.request.contents[0].parts[0].text,{model,apiKey:secret,maxOutputTokens:c.maxOutputTokens,responseMimeType:c.responseMimeType,responseSchema:c.responseJsonSchema,fetchImpl:async(_,opts)=>{body=opts.body;return response({status:'ok'});}});
 assert.equal(body,JSON.stringify(p.request));assert.deepEqual(p.request,buildGeminiRequest(p.request.contents[0].parts[0].text,{maxOutputTokens:128,responseSchema:c.responseJsonSchema}));
});
test('curriculum probe prepares current production prompt/schema and validates source-role fixture',async()=>{
 const p=await prepareProbe('curriculum',model);assert.deepEqual(p.request,await prepareCurriculumRequest(curriculumInput(model)));
 assert.ok(p.request.contents[0].parts[0].text.includes('BLANK STUDENT TABLE -> FILLED ANSWER KEY'));assert.ok(p.request.generationConfig.responseJsonSchema.properties.nodes.items.properties.materials);
 const output=modelOutput(p.input);const base=output.nodes[0].materials[0];output.chapter='Comparing arrangements';output.nodes[0].title=output.chapter;
 output.nodes[1].materials=['explanation','question','activity','table','visual_dependent_task'].map(role=>({...base,role,text:role==='table'?'Arrangement | Count\nA | ___\nB | ___':p.input.extractedText,student_completion:role!=='explanation',visual:{status:role==='visual_dependent_task'?'VISUAL_UNRESOLVED':'NOT_APPLICABLE',description:role==='visual_dependent_task'?'Companion picture not provided.':''}}));
 const r=await runProbe('curriculum',{model,execute:true,apiKey:secret,fetchImpl:async()=>response(output)});assert.equal(r.result,'SUCCESS');assert.equal(r.attempts,1);assert.equal(r.artifactWritten,false);
});
test('explicit execution is one attempt with no fallback or response/header leakage',async()=>{
 for(const status of [401,403,404,429,503]){let calls=0;const r=await runProbe('structured',{model,execute:true,apiKey:secret,fetchImpl:async(url,opts)=>{calls++;assert.ok(url.includes(model));assert.equal(opts.headers['x-goog-api-key'],secret);return{ok:false,status,headers:{get:()=>null},text:async()=>JSON.stringify({error:{message:secret,details:[{reason:secret}]}})};}});assert.equal(calls,1);assert.equal(r.attempts,1);assert.equal(r.httpStatus,status);assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(JSON.stringify(r).includes('Authorization'),false);if(status===503)assert.equal(r.error,'PROVIDER_HTTP');}
});
test('error classifications distinguish evidence from guesses',()=>{
 const classifyHttp=(status,reason)=>{const e=new IngestionError('API_HTTP','safe',{status});e.diagnostics={providerReason:reason};return classify(e);};
 assert.equal(classifyHttp(429,'QUOTA_EXCEEDED'),'PROVIDER_QUOTA');assert.equal(classifyHttp(429,'RATE_LIMIT_EXCEEDED'),'PROVIDER_RATE_LIMIT');assert.equal(classifyHttp(429),'PROVIDER_HTTP');assert.equal(classifyHttp(503),'PROVIDER_HTTP');assert.equal(classifyHttp(401),'PROVIDER_AUTH');assert.equal(classifyHttp(404),'PROVIDER_MODEL_UNAVAILABLE');assert.equal(classifyHttp(400),'PROVIDER_REQUEST_REJECTED');
 for(const code of ['OUTPUT_TRUNCATED','OUTPUT_INCOMPLETE','OUTPUT_JSON_INVALID','OUTPUT_SCHEMA_INVALID'])assert.equal(classify(new IngestionError(code,'safe')),code);assert.equal(classify(new IngestionError('OUTPUT_INVALID','safe')),'CURRICULUM_VALIDATION_FAILED');
});
test('safe ErrorInfo evidence separates quota/rate; output failures stay distinct',async()=>{
 for(const [reason,expected]of [['QUOTA_EXCEEDED','PROVIDER_QUOTA'],['RATE_LIMIT_EXCEEDED','PROVIDER_RATE_LIMIT']]){const r=await runProbe('json',{model,execute:true,apiKey:secret,fetchImpl:async()=>({ok:false,status:429,text:async()=>JSON.stringify({error:{message:secret,details:[{reason}]}})})});assert.equal(r.error,expected);assert.equal(JSON.stringify(r).includes(secret),false);}
 for(const [body,finish,expected]of [['{','STOP','OUTPUT_JSON_INVALID'],[{wrong:true},'STOP','OUTPUT_SCHEMA_INVALID'],[{},'MAX_TOKENS','OUTPUT_TRUNCATED'],[{},'SAFETY','OUTPUT_INCOMPLETE']]){const r=await runProbe('basic',{model,execute:true,apiKey:secret,fetchImpl:async()=>response(body,finish)});assert.equal(r.error,expected);assert.equal(r.attempts,1);}
});
test('network causes retain safe DNS/socket/TLS evidence without secrets or retry',async()=>{
 for(const code of ['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','ERR_TLS_CERT_ALTNAME_INVALID']){
  let calls=0;const cause=Object.assign(new Error(secret),{code,syscall:'getaddrinfo',hostname:'generativelanguage.googleapis.com',address:secret});
  const r=await runProbe('basic',{model,apiKey:secret,execute:true,fetchImpl:async(_,opts)=>{calls++;assert.equal(opts.signal.aborted,false);throw new TypeError('fetch failed '+secret,{cause});}});
  assert.equal(calls,1);assert.equal(r.error,'PROVIDER_NETWORK');assert.equal(r.diagnostics.stage,'provider_request');assert.equal(r.diagnostics.network.cause.code,code);assert.equal(r.diagnostics.network.error.name,'TypeError');assert.equal(r.diagnostics.network.signalAborted,false);assert.equal(r.diagnostics.network.timeoutMs,30000);assert.equal(JSON.stringify(r).includes(secret),false);
 }
});
test('network evidence redacts arbitrary labels and retains bounded aggregate causes',async()=>{
 const cause=Object.assign(new Error(secret),{name:secret,code:secret,hostname:secret,syscall:secret,errors:[Object.assign(new Error(secret),{code:'ECONNREFUSED',syscall:'connect'})]});
 const r=await runProbe('basic',{model,apiKey:secret,execute:true,fetchImpl:async()=>{throw new TypeError(secret,{cause});}});
 assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(r.diagnostics.network.cause.name,'UNKNOWN');assert.equal(r.diagnostics.network.connectionErrors[0].code,'ECONNREFUSED');
});
test('transport timeout aborts only its own signal and successful cleanup prevents later abort',async()=>{
 await assert.rejects(callGemini('synthetic',{model,apiKey:secret,timeoutMs:5,fetchImpl:async(_,opts)=>new Promise((resolve,reject)=>{assert.equal(opts.signal.aborted,false);opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('synthetic'),{name:'AbortError'})),{once:true});})}),e=>e.code==='API_TIMEOUT'&&e.diagnostics.network.signalAborted&&e.diagnostics.network.timeoutMs===5);
 let signal;await callGemini('synthetic',{model,apiKey:secret,timeoutMs:5,fetchImpl:async(_,opts)=>{signal=opts.signal;return response({status:'ok'});}});
 await new Promise(resolve=>setTimeout(resolve,15));assert.equal(signal.aborted,false);
});
