// Read-only GitHub qualification gate, executed before any deployment credential
// is made available. Exact revision is required both on staging and production.
import {appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
export function assertExactRevision(revision,head){if(!/^[a-f0-9]{40}$/.test(revision||'')||revision!==head)throw new Error('Release must use the exact workflow commit SHA. Dispatch from that commit or a branch/tag pointing to it.');}
export function assertStagingQualification(run,revision){
 if(run?.head_sha!==revision||run?.conclusion!=='success'||run?.event!=='workflow_dispatch'||run?.path!=='.github/workflows/release.yml')throw new Error('The staging release run must have succeeded for this exact commit.');
 // The run name records the selected environment independently of its branch.
 if(run?.display_title!==`Qualified staging release ${revision}`)throw new Error('The supplied run was not a staging release.');
}
export async function verifyReleasePreflight(env=process.env,fetcher=fetch){
 const revision=env.RELEASE_REVISION,target=env.HEARTBEAT_DEPLOYMENT_ENV;
 assertExactRevision(revision,env.GITHUB_SHA);
 if(!['staging','production'].includes(target)||!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY||'')||!env.GITHUB_TOKEN)throw new Error('Release must use the protected GitHub workflow.');
 async function github(path){const r=await fetcher(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`,{headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Cannot verify GitHub release protection. No resources changed.');return r.json();}
 const environment=await github(`environments/${target}`),rules=environment.protection_rules||[];
 if(!rules.some(rule=>rule.type==='required_reviewers'&&rule.reviewers?.length))throw new Error('Configure required reviewers on the selected GitHub environment before release.');
 if(target==='production'){
  if(env.STAGING_ACCEPTANCE_CONFIRMED!=='true'||!/^\d+$/.test(env.STAGING_RUN_ID||''))throw new Error('Production requires a successful staging run and explicit hosted acceptance confirmation.');
  assertStagingQualification(await github(`actions/runs/${env.STAGING_RUN_ID}`),revision);
 }
 const result=spawnSync('git',['merge-base','--is-ancestor',revision,'origin/main'],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error('Release commit must be reviewed and merged into main.');
 return revision;
}
if(process.argv[1]?.endsWith('release-preflight.mjs')){const sha=await verifyReleasePreflight();if(!process.env.GITHUB_ENV)throw new Error('GitHub release environment is missing.');appendFileSync(process.env.GITHUB_ENV,`HEARTBEAT_RELEASE_VERIFIED_SHA=${sha}\n`);console.log('Exact revision, protected environment and staging qualification gates passed. No resources changed.');}
