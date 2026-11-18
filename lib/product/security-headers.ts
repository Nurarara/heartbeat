/** Security headers added to every page and API reply. Pages can't be framed by other sites, browsers must not
 * guess file types, links don't leak private URLs, and sensitive device features stay off. */
export function withSecurityHeaders(response:Response,request:Request):Response{
 const secured=new Response(response.body,response),h=secured.headers;
 const set=(k:string,v:string)=>{if(!h.has(k))h.set(k,v);};
 set('X-Content-Type-Options','nosniff');
 set('Referrer-Policy','strict-origin-when-cross-origin');
 set('X-Frame-Options','DENY');
 set('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
 set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
 set('Cross-Origin-Opener-Policy','same-origin');
 if(new URL(request.url).protocol==='https:')set('Strict-Transport-Security','max-age=15552000');
 // Private pages and the owner dashboard are never indexed.
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/')||path.startsWith('/admin')||path.startsWith('/app')||path.startsWith('/display')||path.startsWith('/auth')||path.startsWith('/onboarding'))set('X-Robots-Tag','noindex');
 return secured;
}
