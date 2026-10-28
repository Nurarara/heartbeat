import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { advanceArtworkJob, type JobEnv } from './jobs.ts';
import { assertConfiguration, assertSchema } from './configuration.ts';
export class HeartbeatWorkflow extends WorkflowEntrypoint<JobEnv,{jobId:string}> {
  async run(event:WorkflowEvent<{jobId:string}>,step:WorkflowStep) {
    assertConfiguration(this.env);
    await assertSchema(this.env);
    for(let stage=0;stage<120;stage++){
      const result=await step.do(`advance-${stage}`,{retries:{limit:2,delay:'2 seconds',backoff:'exponential'},timeout:'4 minutes'},()=>advanceArtworkJob(this.env,event.payload.jobId));
      if(result.completed)return result;
      if(result.waiting)await step.sleep(`capacity-${stage}`,'15 seconds');
    }
    return {completed:false};
  }
}
