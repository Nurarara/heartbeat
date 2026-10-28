// Real React journey orchestration, mocked network and immersive display probe.
// No browser automation, provider requests, email delivery or Stripe charges.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole} from 'jsdom';

const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173/onboarding?plan=studio',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','localStorage','history'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
const navigations=[];
Object.defineProperty(globalThis,'location',{configurable:true,value:{get search(){return dom.window.location.search;},get pathname(){return dom.window.location.pathname;},set href(value){navigations.push(value);},replace(value){navigations.push(value);},assign(value){navigations.push(value);}}});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
let pageScroll=0;const scrollCalls=[],headingFocus=[];
Object.defineProperty(window,'scrollY',{configurable:true,get:()=>pageScroll});
window.scrollTo=options=>{scrollCalls.push(options);pageScroll=options.top;};
const nativeFocus=HTMLElement.prototype.focus;
HTMLElement.prototype.focus=function(options){if(this.tagName==='H1')headingFocus.push(options);return nativeFocus.call(this,options);};
globalThis.journeyOrder=[];
HTMLElement.prototype.requestFullscreen=function(){globalThis.journeyOrder.push('fullscreen');return Promise.resolve();};
const london={name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'};
const canonical=(style='surprise')=>({version:1,location:london,seed:42,unit:'c',reducedMotion:true,style});
let preferences=null,version=0,verified=false,local=false,billingReady=false,accessPlan='trial',loggedIn=true,searchFail=true,saveConflict=true,googleAvailable=false,mailAvailable=true;
const requests=[];
globalThis.fetch=async(url,options={})=>{
 const path=String(url),body=options.body?JSON.parse(options.body):null;requests.push({path,body});
 if(path.startsWith('/api/locations'))return searchFail?Response.json({error:'Unavailable'},{status:503}):Response.json({locations:[london]});
 if(path==='/api/product/auth/session')return Response.json({user:loggedIn?{id:'owner',email:'you@example.test',verified}:null,local,billingReady,googleAvailable,access:{plan:accessPlan,eligible:verified||local,reason:'Ready',allowance:3,used:0}});
 if(path==='/api/product/preferences'){
  if(body){if(saveConflict){saveConflict=false;preferences=canonical('cinematic');version=2;return Response.json({error:'Version conflict'},{status:409});}assert.equal(body.expectedVersion,version,'Every write uses the latest canonical version');assert.equal(body.worldId,'world-owner');assert.equal(body.surfaceId,'surface-owner');preferences=body.preferences;version++;}
  return Response.json({preferences,version,worldId:'world-owner',surfaceId:'surface-owner',surface:{owner_id:'owner'}});
 }
 if(path==='/api/product/auth/resend')return Response.json({message:'Verification email sent.'});
 if(path==='/api/product/auth/verify'){verified=true;return Response.json({message:'Email verified.'});}
 if(path==='/api/product/auth/login'||path==='/api/product/auth/register'){loggedIn=true;return Response.json({user:{id:'owner'}});}
 if(path==='/api/product/auth/forgot')return mailAvailable?Response.json({message:'A reset link is on its way.'}):Response.json({error:'Password reset email is not configured yet.'},{status:503});
 if(path==='/api/product/plans')return Response.json({billingReady,prices:{}});
 if(path==='/api/product/checkout')return Response.json({url:'https://checkout.stripe.test/session'});
 if(path==='/api/product/billing/recover')return Response.json({pending:true});
 throw new Error(`Unexpected request ${path}`);
};

const output=await build({stdin:{contents:"export {default as Onboarding} from './components/onboarding';export {AuthPage} from './components/customer-app';export {Pricing} from './components/product-shell';export * from './lib/customer-journey';",resolveDir:process.cwd(),loader:'tsx'},plugins:[{name:'journey-world-probe',setup(b){b.onResolve({filter:/^\.\/customer-app$/},args=>args.importer.endsWith('onboarding.tsx')?{path:'journey-probe',namespace:'journey-probe'}:null);b.onLoad({filter:/.*/,namespace:'journey-probe'},()=>({contents:"import React,{useEffect} from 'react';export function CustomerDisplay(){useEffect(()=>{globalThis.journeyOrder.push('display');},[]);return React.createElement('div',{'data-world-probe':'true'},'Your ambient world');}",loader:'jsx',resolveDir:process.cwd()}));}}],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,tsconfig:'tsconfig.json',logLevel:'silent'});
const artifact=new URL('../.sites-runtime/tests/onboarding.cjs',import.meta.url);await mkdir(new URL('../.sites-runtime/tests/',import.meta.url),{recursive:true});await writeFile(artifact,output.outputFiles[0].contents);
const components=createRequire(import.meta.url)(fileURLToPath(artifact)),React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
const settle=(ms=25)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label||node.getAttribute('aria-label')===label);
async function click(node){assert.ok(node,'Expected a control');await act(async()=>node.click());await settle();}
async function input(node,value){assert.ok(node);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await settle();}
async function mount(Component,url){if(url)history.replaceState(null,'',url);await act(async()=>{root=createRoot(document.getElementById('app'));root.render(React.createElement(Component));});await settle();}
async function unmount(){await act(async()=>root.unmount());await settle();}
async function submit(){await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await settle();}
const originalStorage=globalThis.localStorage;

try{
 for(const path of ['https://evil.test','//evil.test','/\\evil.test','/onboarding?plan=enterprise','/display?next=//evil.test','/app?tab=unknown','/%2f%2fevil.test','/onboarding?plan=trial&next=//evil.test'])assert.equal(components.safeJourneyDestination(path),null,path);
 assert.equal(components.safeContinuation('//evil.test'),'/onboarding');
 for(const plan of ['trial','studio','atelier'])assert.equal(components.readJourney(new URL(components.authDestination('register',components.onboardingDestination(plan),plan),'https://heartbeat.test').search).plan,plan);
 assert.equal(components.afterAuthentication({plan:'trial',next:null},true),'/display');
 assert.equal(components.afterAuthentication({plan:'trial',next:null},false),'/onboarding?plan=trial');
 assert.equal(components.afterAuthentication({plan:'trial',next:'/app?tab=account'},true),'/app?tab=account');
 assert.equal(components.afterAuthentication({plan:'atelier',next:'/onboarding?plan=atelier'},true),'/onboarding?plan=atelier');

 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage blocked');}});
 await mount(components.Onboarding,'/onboarding?plan=studio');
 assert.match(document.body.textContent,/Where’s your world/);assert.equal(button('Continue').disabled,true);
 await input(document.querySelector('#onboarding-city'),'Lon');await settle(300);
 assert.match(document.body.textContent,/City search is unavailable/);assert.equal(button('Continue').disabled,true);
 searchFail=false;await click(button('Try city search again'));await settle(300);await click(document.querySelector('.hp-city-results button'));
 pageScroll=650;await click(button('Continue'));assert.equal(window.scrollY,0,'A new setup step starts at the top rather than retaining a previous scroll position');assert.equal(headingFocus.at(-1).preventScroll,true,'Heading focus does not scroll past the brand and artwork');assert.equal(document.querySelector('input[value=surprise]').checked,true,'Surprise me is the default');
 await click(button('Back'));assert.equal(document.querySelector('#onboarding-city').value,'London','Back preserves selected place');await click(button('Continue'));
 await click(document.querySelector('input[value=pencil]'));await click(button('Continue'));
 assert.match(document.body.textContent,/Settings changed on another screen/);assert.equal(document.querySelector('input[value=cinematic]').checked,true,'Conflict reloads canonical preferences without overwriting them');
 await click(document.querySelector('input[value=pencil]'));pageScroll=800;await click(button('Continue'));assert.equal(window.scrollY,0,'Ready step resets the longer style screen scroll');
 assert.equal(preferences.style,'pencil');assert.equal(version,3);assert.match(document.body.textContent,/One small step: your email/);assert.equal(button('Enter my world'),undefined);
 assert.equal(requests.filter(request=>request.path.includes('generation')||request.path.includes('checkout')).length,0,'Setup never invokes generation or payment');
 await click(button('Resend email'));assert.equal(requests.find(request=>request.path==='/api/product/auth/resend').body.continuation,'/onboarding?plan=studio');
 await click(button('I’ve verified my email'));assert.match(document.body.textContent,/has not been verified/);
 verified=true;await click(button('I’ve verified my email'));assert.match(document.body.textContent,/Paid memberships aren’t open yet/);assert.equal(button('Continue to checkout'),undefined);assert.equal(accessPlan,'trial','Previewing a paid plan never grants paid access');
 await click(button('Continue with the free trial'));assert.ok(button('Enter my world'));const shell=document.querySelector('.hp-world-shell');await click(document.querySelector('.hp-onboarding-fullscreen input'));const resetsBeforeEntry=scrollCalls.length;await click(button('Enter my world'));assert.equal(scrollCalls.length,resetsBeforeEntry,'World entry preserves its persistent fullscreen shell without another setup scroll reset');
 assert.equal(document.querySelector('.hp-world-shell'),shell,'Fullscreen owns the same persistent shell across entry');assert.ok(document.querySelector('[data-world-probe]'));assert.deepEqual(globalThis.journeyOrder,['fullscreen','display']);assert.equal(dom.window.location.pathname,'/display');await unmount();

 billingReady=true;await mount(components.Onboarding,'/onboarding?plan=atelier');assert.ok(button('Continue to checkout'));assert.equal(requests.filter(request=>request.path==='/api/product/checkout').length,0);await click(button('Continue to checkout'));assert.equal(requests.at(-1).body.plan,'atelier');assert.equal(navigations.at(-1),'https://checkout.stripe.test/session');await unmount();
 // A success query alone never enables access; only a fresh server entitlement does.
 await mount(components.Onboarding,'/onboarding?plan=studio&billing=success');assert.equal(button('Enter my world'),undefined);assert.match(document.body.textContent,/Waiting for payment confirmation/);await unmount();accessPlan='studio';await mount(components.Onboarding,'/onboarding?plan=studio&billing=success');await settle();assert.ok(button('Enter my world'));await unmount();

 Object.defineProperty(globalThis,'localStorage',{value:originalStorage,configurable:true});
 preferences=null;await mount(components.AuthPage,'/auth?mode=register&plan=atelier&next=%2Fonboarding%3Fplan%3Datelier');assert.ok(button('Continue with Google').disabled);assert.match(document.body.textContent,/Google sign-in is being set up/);await click(button('Log in'));assert.ok(button('Forgot or reset your password?'));await input(document.querySelector('input[type=password]'),'an old password');await click(button('Forgot or reset your password?'));assert.ok(button('Back to sign in'));await input(document.querySelector('input[type=email]'),'you@example.test');mailAvailable=false;await submit();assert.match(document.body.textContent,/Password reset email is not configured/);mailAvailable=true;await click(button('Back to sign in'));assert.equal(document.querySelector('input[type=password]').value,'','Switching recovery modes clears an old password');await click(button('Create an account'));assert.equal(components.readJourney(dom.window.location.search).plan,'atelier');await input(document.querySelector('input[type=email]'),'you@example.test');await input(document.querySelector('input[type=password]'),'a sufficiently long password');await submit();assert.equal(navigations.at(-1),'/onboarding?plan=atelier');assert.equal(requests.findLast(request=>request.path==='/api/product/auth/register').body.continuation,'/onboarding?plan=atelier');await unmount();
 googleAvailable=true;await mount(components.AuthPage,'/auth?mode=register&plan=atelier&next=%2Fonboarding%3Fplan%3Datelier');const googleLink=new URL(document.querySelector('a.hp-google-button').href);assert.equal(googleLink.pathname,'/api/product/auth/google/start');assert.equal(googleLink.searchParams.get('next'),'/onboarding?plan=atelier');await unmount();googleAvailable=false;
 preferences=canonical();await mount(components.AuthPage,'/auth');await input(document.querySelector('input[type=email]'),'you@example.test');await input(document.querySelector('input[type=password]'),'a sufficiently long password');await submit();assert.equal(navigations.at(-1),'/display','Configured returning customers go directly to their world');await unmount();
 await mount(components.AuthPage,'/auth?next=%2Fapp%3Ftab%3Daccount');await input(document.querySelector('input[type=email]'),'you@example.test');await input(document.querySelector('input[type=password]'),'a sufficiently long password');await submit();assert.equal(navigations.at(-1),'/app?tab=account','An explicit account destination stays in the studio');await unmount();
 await mount(components.AuthPage,'/auth?verify=fixture&next=%2Fonboarding%3Fplan%3Dstudio');await settle();assert.equal(navigations.at(-1),'/onboarding?plan=studio','Verification resumes the safe paid-plan intent');assert.equal(dom.window.location.search.includes('verify='),false,'Verification tokens are removed from the address');await unmount();

 // A real one-use verification contract must survive React effect replay.
 const ordinaryFetch=globalThis.fetch;let verificationPosts=0;
 globalThis.fetch=async(url,options)=>url==='/api/product/auth/verify'?(++verificationPosts===1?Response.json({message:'Email verified.'}):Response.json({error:'This link is invalid or expired.'},{status:400})):ordinaryFetch(url,options);
 try{history.replaceState(null,'','/auth?verify=strict-one-use&next=%2Fonboarding%3Fplan%3Datelier');await act(async()=>{root=createRoot(document.getElementById('app'));root.render(React.createElement(React.StrictMode,null,React.createElement(components.AuthPage)));});await settle();assert.equal(verificationPosts,1,'StrictMode shares one verification request instead of consuming the token twice');assert.equal(navigations.at(-1),'/onboarding?plan=atelier');assert.doesNotMatch(document.querySelector('.hp-message').textContent,/invalid or expired/);await unmount();}finally{globalThis.fetch=ordinaryFetch;}

 loggedIn=false;await mount(components.Pricing,'/pricing');await click(button('Choose Atelier'));const pending=new URL(navigations.at(-1),'https://heartbeat.test');assert.equal(pending.pathname,'/auth');assert.equal(pending.searchParams.get('next'),'/onboarding?plan=atelier');assert.equal(pending.searchParams.get('plan'),'atelier');await unmount();
 assert.ok(!requests.some(request=>request.path.includes('/generation')),'All journey tests avoid inference requests');
 console.log('Passed guided onboarding: safe continuation/plan intents, blocked storage, search failure/retry, back/default style, CAS conflict recovery, verified-email gate, paid-preview/trial honesty, explicit checkout, server-confirmed payment, same-shell fullscreen entry, auth/signup/verify return destinations and recorded-demo navigation. React DOM simulated; services mocked.');
}finally{Object.defineProperty(globalThis,'localStorage',{value:originalStorage,configurable:true});try{await act(async()=>root.unmount());}catch{}dom.window.close();}
