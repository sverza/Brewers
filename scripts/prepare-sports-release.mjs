// A release preparation command, never a deploy/push. Default is validation-only.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{validateTransfer,materialize}from'./sports-publication.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{const input=process.argv[2];if(!input)throw Error('VALIDATED_PRODUCTION_TRANSFER_FILE_REQUIRED');const envelope=JSON.parse(await fs.readFile(input,'utf8')),artifact=validateTransfer(envelope);const plan={status:'validated-only',releaseId:artifact.current.releaseId,files:artifact.current.files.length,sourceActivation:false,pushed:false,deployed:false};
 if(process.argv.includes('--apply-after-go-live-approval')){await materialize(envelope,root);await fs.writeFile(path.join(root,'ServerCode/sports-source.js'),"// Approved production static source. No backend credentials or visitor Firestore reads.\nwindow.BrewersSportsSource=Object.freeze({enabled:true,preview:false,current:'sports/v1/current.json'});\n");plan.status='prepared-for-review-and-commit';plan.sourceActivation=true;}
 console.log(JSON.stringify(plan));
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'RELEASE_PREPARATION_FAILED');process.exitCode=1;}
