import {runMaintenance} from '../lib/product/operations';
import {processBillingInbox} from '../lib/product/billing-recovery';
import {processAccountDeletions} from '../lib/product/lifecycle';
import {assertConfiguration,assertSchema,operatorStudyAllowed} from '../lib/product/configuration';
import type {ProductEnv} from '../lib/product/core';
import handler from "vinext/server/fetch-handler";
export { HeartbeatWorkflow } from '../lib/product/workflow';
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  scheduled(_event:ScheduledEvent,env:Cloudflare.Env,ctx:ExecutionContext){ctx.waitUntil((async()=>{const runtime=env as unknown as ProductEnv;assertConfiguration(runtime);await assertSchema(runtime);return runMaintenance(runtime);})());},
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const runtime=env as unknown as ProductEnv;
    try{assertConfiguration(runtime);await assertSchema(runtime);}catch{return Response.json({error:'Application configuration needs operator attention.'},{status:503});}
    const path=new URL(request.url).pathname;
    if((/^\/api\/(heartbeat|world|pulse|display|art)(?:\/|$)/.test(path)||['/local-study','/story','/pulse','/prototype'].includes(path)||path.startsWith('/prototype/'))&&!operatorStudyAllowed(request,runtime))return new Response('Not found',{status:404});
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response=await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    if(new URL(request.url).pathname==='/api/product/webhook'&&response.ok)ctx.waitUntil(processBillingInbox(runtime));
    if(path==='/api/product/account/delete'&&request.method==='POST'&&response.ok)ctx.waitUntil(processAccountDeletions(runtime,Date.now(),2));
    return response;
  },
};
