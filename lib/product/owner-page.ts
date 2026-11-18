import {authenticate} from './auth.ts';
import {isOwner} from './beta.ts';
import type {ProductEnv} from './core.ts';
/** Returns a 404 response unless the request comes from the signed-in, verified owner. */
export async function ownerOnlyPage(request:Request,env:ProductEnv,now=Date.now()):Promise<Response|null>{
 let allowed=false;
 try{const auth=await authenticate(request,env,now);allowed=!!auth&&!!auth.user.verified&&isOwner(env,auth.user.email);}catch{allowed=false;}
 return allowed?null:new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
