/** The path as the page router sees it, so /%61dmin, //admin and /admin.rsc are all treated as /admin. */
export function routePath(raw:string):string{
 let path=raw;
 try{path=raw.split('/').map(segment=>decodeURIComponent(segment)).join('/');}catch{/* keep the raw path */}
 path=path.replace(/\/{2,}/g,'/').replace(/\.rsc$/,'');
 if(path.length>1)path=path.replace(/\/+$/,'');
 return path||'/';
}
