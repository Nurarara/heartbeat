import type {ProductEnv} from './core.ts';
/**
 * Self-hosted beta: the app runs on an ordinary computer and Cloudflare Tunnel
 * forwards https://<origin> to it over plain HTTP on loopback. Requests that
 * arrive with the public host name are restored to the public HTTPS address,
 * so origin checks and secure cookies behave exactly as on the hosted product.
 * Only safe when the server listens on loopback and the tunnel is its sole
 * public entrance (scripts/beta-serve.mjs does both).
 */
export function selfHostedRequest(request:Request,env:ProductEnv):Request{
 if(env.HEARTBEAT_SELF_HOSTED!=='true')return request;
 let origin:URL;try{origin=new URL(env.HEARTBEAT_APP_ORIGIN||'');}catch{return request;}
 const url=new URL(request.url);
 if(origin.protocol!=='https:'||url.protocol!=='http:'||url.hostname!==origin.hostname)return request;
 return new Request(new URL(url.pathname+url.search,origin),request);
}
