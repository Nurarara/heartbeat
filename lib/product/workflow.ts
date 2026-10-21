import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { runArtworkJob, type JobEnv } from './jobs.ts';
export class HeartbeatWorkflow extends WorkflowEntrypoint<JobEnv,{jobId:string}> {
  async run(event:WorkflowEvent<{jobId:string}>,step:WorkflowStep) {
    return step.do('prepare-one-picture',{retries:{limit:0,delay:'1 second',backoff:'constant'},timeout:'4 minutes'},()=>runArtworkJob(this.env,event.payload.jobId));
  }
}
