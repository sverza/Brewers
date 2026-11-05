// Node standard library only. This publisher cannot read Firestore or run the exporter.
import fs from 'node:fs/promises';import path from 'node:path';import{fileURLToPath}from'node:url';import{createContext,runInContext,runInNewContext}from'node:vm';import{createHash,randomUUID}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context=createContext({});
runInContext(await fs.readFile(path.join(root,'ServerCode/sports/contract.js'),'utf8'),context);
const C=context.BrewersSports,sha=s=>createHash('sha256').update(s).digest('hex');
const qaFolder='1jp3WvMLCcT5HvO1QQ52vMtLwRwLnRhYn',qaScript='1NP_Jx5onzQtPce5NLsJ42y9vtv8Dd00-uM1OqyhQPAxu8WuB7nRRLxin';
const fail=code=>{throw Error(code);};
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{10,200}$/.test(value))fail('DRIVE_ID_REQUIRED');return value;};
export function validateTransfer(envelope,{environment='production'}={}){
 if(!envelope||envelope.format!=='brewers-public-transfer-v1'||envelope.environment!==environment||envelope.projectId!==(environment==='production'?'brewers-hub':'synthetic-test'))fail('PROVENANCE_REQUIRED');
 if(Object.keys(envelope).some(k=>!['format','environment','projectId','artifact'].includes(k)))fail('TRANSFER_KEYS');
 C.validateArtifact(envelope.artifact,sha);
 if(environment==='production'){
  const a=envelope.artifact,prefix='sports/v1/releases/'+a.current.releaseId+'/',players=JSON.parse(a.files[prefix+'players.json']).players;
  if(players.some(p=>!/^[ph]_[a-f0-9]{24}$/.test(p.playerId)))fail('QA_IDENTITIES_FORBIDDEN');
 }
 return envelope.artifact;
}
async function limited(url,token,fetcher=fetch){
 const response=await fetcher(url,{redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)fail('REMOTE_HTTP_'+response.status);
 const cap=3*1024*1024;if(Number(response.headers.get('content-length')||0)>cap)fail('REMOTE_SIZE');
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>cap){await reader.cancel();fail('REMOTE_SIZE');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}
export async function downloadTransfer({token,pointerId,folderId,scriptId,fetcher=fetch}){
 if(!token)fail('TEMPORARY_GOOGLE_TOKEN_REQUIRED');id(folderId);id(scriptId);id(pointerId);
 if(folderId===qaFolder||folderId==='1QLkwha6S3HzilL_xqXGMCn9_ESYUtZdq'||scriptId===qaScript)fail('QA_RESOURCE_FORBIDDEN');
 const base='https://www.googleapis.com/drive/v3/files/';
 // appProperties are private to the Apps Script OAuth application. The separate
 // read-only WIF identity verifies non-secret properties, plus pinned folder/IDs.
 async function metadata(file,kind){const value=JSON.parse(await limited(base+id(file)+'?fields=id,parents,mimeType,trashed,properties',token,fetcher));
  if(value.id!==file||value.trashed||value.mimeType!=='application/json'||value.parents?.length!==1||value.parents[0]!==folderId||value.properties?.brewersSportsProd!==kind||value.properties?.scriptId!==scriptId)fail('DRIVE_OWNERSHIP');return value;}
 await metadata(pointerId,'public-pointer');const pointer=JSON.parse(await limited(base+pointerId+'?alt=media',token,fetcher));
 if(Object.keys(pointer).some(k=>!['format','environment','projectId','releaseId','artifactFileId','sha256'].includes(k))||pointer.format!=='brewers-public-pointer-v1'||pointer.environment!=='production'||pointer.projectId!=='brewers-hub'||!/^[a-f0-9]{64}$/.test(pointer.releaseId)||!/^[a-f0-9]{64}$/.test(pointer.sha256))fail('POINTER_SCHEMA');
 await metadata(pointer.artifactFileId,'public-artifact');const text=await limited(base+id(pointer.artifactFileId)+'?alt=media',token,fetcher);
 if(sha(text)!==pointer.sha256)fail('TRANSFER_HASH');const envelope=JSON.parse(text),artifact=validateTransfer(envelope);
 if(artifact.current.releaseId!==pointer.releaseId)fail('POINTER_RELEASE');return envelope;
}
export async function materialize(envelope,destination,{environment='production'}={}){
 const a=validateTransfer(envelope,{environment}),dest=path.resolve(destination),release=a.current.releaseId,current=path.join(dest,'sports/v1/current.json');
 try{const prior=JSON.parse(await fs.readFile(current,'utf8'));if(prior.releaseId===release){
   for(const [name,body]of Object.entries(a.files))if(await fs.readFile(path.join(dest,name),'utf8')!==body)fail('EXISTING_RELEASE_CORRUPT');
   return {status:'unchanged',releaseId:release,filesWritten:0};
  }}catch(e){if(e.code!=='ENOENT')throw e;}
 const immutable=Object.entries(a.files).filter(([name])=>name!=='sports/v1/current.json');
 // Check all collisions before writing any file; current remains valid on every failure.
 for(const [name,body]of immutable){const target=path.resolve(dest,name);if(!target.startsWith(dest+path.sep))fail('PUBLICATION_PATH');try{if(await fs.readFile(target,'utf8')!==body)fail('IMMUTABLE_CONFLICT');}catch(e){if(e.code!=='ENOENT')throw e;}}
 let written=0;for(const [name,body]of immutable){const target=path.join(dest,name);await fs.mkdir(path.dirname(target),{recursive:true});try{await fs.writeFile(target,body,{flag:'wx'});written++;}catch(e){if(e.code!=='EEXIST')throw e;}}
 await fs.mkdir(path.dirname(current),{recursive:true});const temp=current+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,a.files['sports/v1/current.json'],{flag:'wx'});await fs.rename(temp,current);
 return {status:'prepared',releaseId:release,filesWritten:written+1};
}
export async function verifyServed(origin,expected,{localTest=false,fetcher=fetch}={}){
 const base=new URL(origin);if(base.protocol!=='https:'&&!(localTest&&base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))fail('VERIFY_ORIGIN');
 if(!/^[a-f0-9]{64}$/.test(expected))fail('EXPECTED_RELEASE');
 const current=JSON.parse(await limited(new URL('sports/v1/current.json?verify='+expected,base),null,fetcher));if(current.releaseId!==expected)fail('PAGES_NOT_UPDATED');
 const files={'sports/v1/current.json':C.canonical(current)+'\n'},prefix='sports/v1/releases/'+expected+'/';
 if(!Array.isArray(current.files)||current.files.length>2000)fail('PUBLIC_FILE_LIMIT');
 for(const row of current.files){if(typeof row.path!=='string'||!row.path.startsWith(prefix)||!/^[A-Za-z0-9_./-]+$/.test(row.path)||row.path.split('/').some(p=>p==='..'))fail('VERIFY_PATH');files[row.path]=await limited(new URL(row.path,base),null,fetcher);}
 C.validateArtifact({format:'brewers-public-sports-artifact-v1',current,files},sha);return {status:'served-and-validated',releaseId:expected,files:current.files.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const command=process.argv[2];
  if(command==='download'){const envelope=await downloadTransfer({token:process.env.GOOGLE_ACCESS_TOKEN,pointerId:process.env.SPORTS_POINTER_ID,folderId:process.env.SPORTS_OUTBOX_FOLDER_ID,scriptId:process.env.SPORTS_PRODUCER_SCRIPT_ID});await fs.writeFile(process.env.SPORTS_DOWNLOAD_FILE,JSON.stringify(envelope),{mode:0o600});console.log(JSON.stringify({status:'downloaded-and-validated',releaseId:envelope.artifact.current.releaseId}));}
  else if(command==='assert-active'){const local={window:{}};runInNewContext(await fs.readFile(path.join(root,'ServerCode/sports-source.js'),'utf8'),local);const c=local.window.BrewersSportsSource;if(c?.enabled!==true||c.preview!==false||c.current!=='sports/v1/current.json')fail('SOURCE_ACTIVATION_REQUIRED');console.log('Static source active');}
  else if(command==='prepare'){const envelope=JSON.parse(await fs.readFile(process.env.SPORTS_DOWNLOAD_FILE,'utf8'));console.log(JSON.stringify(await materialize(envelope,root)));}
  else if(command==='verify')console.log(JSON.stringify(await verifyServed(process.env.SPORTS_PUBLIC_ORIGIN,process.env.SPORTS_EXPECTED_RELEASE)));
  else fail('PUBLICATION_COMMAND_REQUIRED');
 }catch(e){console.error(/^[A-Z_]+(?:_[0-9]+)?$/.test(e.message)?e.message:'PUBLICATION_FAILED');process.exitCode=1;}
}
