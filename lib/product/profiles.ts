import {db,ProductError,rate,type ProductEnv} from './core.ts';
import {screenFraming} from '../screen-profile.ts';
import {parsePreferences,localClock,type AmbientPreferences} from '../ambient.ts';
import {parseStoryMemory,rememberMoment,planMoment,type StoryMemory} from '../ambient-director.ts';
import {recordCreativeFeedback} from '../creative.ts';

type World={id:string;owner_id:string;preferences:string|null;memory:string|null;preferences_version:number;memory_version:number};
export type Surface={id:string;owner_id:string;world_id:string;current_asset_id:string|null;current_at:number;version:number;quiet_start:number;quiet_end:number;policy_version:number;display_sequence:number;width:number;height:number};
export async function ensureDefaultWorld(env:ProductEnv,owner:string,now=Date.now()) {
 const database=db(env);
 if(await database.prepare('SELECT s.id FROM hb_surfaces s JOIN hb_worlds w ON w.id=s.world_id AND w.owner_id=s.owner_id WHERE s.id=? AND s.owner_id=?').bind(`surface-${owner}`,owner).first())return;
 await database.batch([
  database.prepare("INSERT OR IGNORE INTO hb_worlds(id,owner_id,preferences,memory,preferences_version,updated_at) SELECT ?,u.id,p.preferences,p.memory,CASE WHEN p.preferences IS NULL THEN 0 ELSE 1 END,? FROM hb_users u LEFT JOIN hb_profiles p ON p.user_id=u.id WHERE u.id=? AND u.lifecycle='active'").bind(`world-${owner}`,now,owner),
  database.prepare("INSERT OR IGNORE INTO hb_surfaces(id,owner_id,world_id,updated_at) SELECT ?,owner_id,id,? FROM hb_worlds WHERE id=? AND owner_id=?").bind(`surface-${owner}`,now,`world-${owner}`,owner),
 ]);
}
export async function profileFor(env:ProductEnv,owner:string,input:{worldId?:unknown;surfaceId?:unknown}={},now=Date.now()) {
 let worldId=input.worldId,surfaceId=input.surfaceId;
 if(worldId!==undefined&&(typeof worldId!=='string'||worldId.length>100)||surfaceId!==undefined&&(typeof surfaceId!=='string'||surfaceId.length>100))throw new ProductError('Choose a valid world and screen.');
 if(worldId===undefined&&surfaceId===undefined){await ensureDefaultWorld(env,owner,now);worldId=`world-${owner}`;surfaceId=`surface-${owner}`;}
 if(surfaceId!==undefined){const s=await db(env).prepare('SELECT * FROM hb_surfaces WHERE id=? AND owner_id=?').bind(surfaceId,owner).first<Surface>();if(!s||worldId!==undefined&&s.world_id!==worldId)throw new ProductError('Screen not found.',404);worldId=s.world_id;}
 const world=await db(env).prepare("SELECT * FROM hb_worlds WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=hb_worlds.owner_id AND lifecycle='active')").bind(worldId,owner).first<World>();
 if(!world)throw new ProductError('World not found.',404);
 const surface=await db(env).prepare('SELECT * FROM hb_surfaces WHERE owner_id=? AND world_id=? AND (? IS NULL OR id=?) ORDER BY id LIMIT 1').bind(owner,world.id,surfaceId??null,surfaceId??null).first<Surface>();
 if(!surface)throw new ProductError('Screen not found.',404);
 const preferences=world.preferences?parsePreferences(world.preferences):null;
 const memory=preferences?parseStoryMemory(world.memory,preferences.location,now):null;
 return {preferences,memory,version:world.preferences_version,memoryVersion:world.memory_version,worldId:world.id,surfaceId:surface.id,surface,capabilities:{versionedPreferences:true,serverMemory:true,displayEvents:true,jobDiscovery:true}};
}
export async function resolveArtworkInput(env:ProductEnv,owner:string,input:{worldId?:unknown;surfaceId?:unknown}={},now=Date.now()) {
 const p=await profileFor(env,owner,input,now);if(!p.preferences)throw new ProductError('Choose a city in your studio first.',409);
 return {location:p.preferences.location,memory:p.memory?JSON.stringify(p.memory):null,style:p.preferences.style,festive:p.preferences.festiveTouches===true,worldId:p.worldId,surfaceId:p.surfaceId,preferencesVersion:p.version,memoryVersion:p.memoryVersion,surfaceVersion:p.surface.version,framing:screenFraming(p.surface.width,p.surface.height)};
}
export async function updateSurfaceProfile(env:ProductEnv,owner:string,input:Record<string,unknown>,now:number,expectedCredentialEpoch:number) {
 const framing=typeof input.width==='number'&&typeof input.height==='number'?screenFraming(input.width,input.height):null;
 if(!framing)throw new ProductError('Choose a valid screen size.');
 if(!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<1)throw new ProductError('Reload this screen before updating its size.',409);
 const profile=await profileFor(env,owner,input,now);
 const current=await db(env).prepare("SELECT id FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?").bind(owner,expectedCredentialEpoch).first();
 if(!current)throw new ProductError('Your account changed. Sign in again.',401);
 if(profile.surface.version!==input.expectedVersion)throw new ProductError('This screen changed elsewhere. Reload its settings.',409);
 if(profile.surface.width===framing.width&&profile.surface.height===framing.height)return {saved:true,changed:false,surfaceVersion:profile.surface.version,framing};
 await rate(env,`surface:${owner}`,now,12,60000);
 const changed=await db(env).prepare("UPDATE hb_surfaces SET width=?,height=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND world_id=? AND version=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?)").bind(framing.width,framing.height,now,profile.surfaceId,owner,profile.worldId,input.expectedVersion,owner,expectedCredentialEpoch).run();
 if(changed.meta.changes!==1)throw new ProductError('Your account or screen changed. Reload before trying again.',409);
 return {saved:true,changed:true,surfaceVersion:profile.surface.version+1,framing};
}
export async function updatePreferences(env:ProductEnv,owner:string,input:Record<string,unknown>,now:number) {
 const p=await profileFor(env,owner,input,now);
 // The only unversioned compatibility write is initial onboarding. Existing
 // clients must reload instead of silently replacing a newer account profile.
 const version=input.expectedVersion??(p.version===0?0:undefined);
 if(!Number.isSafeInteger(version)||version!==p.version)throw new ProductError('Your preferences changed on another screen. Reload before saving.',409);
 if(input.memory!==undefined)throw new ProductError('Creative history is saved through display events. Reload this display.',409);
 const preferences=parsePreferences(JSON.stringify(input.preferences));if(!preferences)throw new ProductError('Choose valid display preferences.');
 const samePlace=p.preferences&&JSON.stringify(p.preferences.location)===JSON.stringify(preferences.location);
 const changed=await db(env).prepare("UPDATE hb_worlds SET preferences=?,preferences_version=preferences_version+1,memory=CASE WHEN ? THEN memory ELSE NULL END,memory_version=memory_version+CASE WHEN ? THEN 0 ELSE 1 END,updated_at=? WHERE id=? AND owner_id=? AND preferences_version=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active')").bind(JSON.stringify(preferences),samePlace?1:0,samePlace?1:0,now,p.worldId,owner,version,owner).run();
 if(changed.meta.changes!==1)throw new ProductError('Your preferences changed on another screen. Reload before saving.',409);
 return {...await profileFor(env,owner,{worldId:p.worldId,surfaceId:p.surfaceId},now),saved:true};
}
export function presentationPolicy(preferences:AmbientPreferences,surface:Surface,now:number) {
 const hour=Number(localClock(preferences.location,now).hour);
 const quiet=surface.quiet_start>surface.quiet_end?hour>=surface.quiet_start||hour<surface.quiet_end:hour>=surface.quiet_start&&hour<surface.quiet_end;
 let safeDayUntil=now;
 if(!quiet){for(let step=1;step<=15;step++){const next=now+step*60000,h=localClock(preferences.location,next).hour;const night=surface.quiet_start>surface.quiet_end?h>=surface.quiet_start||h<surface.quiet_end:h>=surface.quiet_start&&h<surface.quiet_end;if(night||planMoment(preferences.location,null,next,null,preferences.seed).direction.phase==='night')break;safeDayUntil=next;}}
 return {safeDayUntil,version:surface.policy_version,timezone:preferences.location.timezone,quietStart:surface.quiet_start,quietEnd:surface.quiet_end,night:quiet||planMoment(preferences.location,null,now,null,preferences.seed).direction.phase==='night',width:surface.width,height:surface.height,evaluatedAt:now};
}
export async function acknowledgeDisplay(env:ProductEnv,owner:string,input:Record<string,unknown>,now:number,kind:'display'|'more'|'less'='display') {
 const p=await profileFor(env,owner,input,now);if(!p.preferences)throw new ProductError('Choose your city first.',409);
 if(kind==='display'&&input.presentationPolicyVersion!==undefined&&input.presentationPolicyVersion!==p.surface.policy_version)throw new ProductError('Refresh this screen presentation policy.',409);
 const id=input.id??input.assetId;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new ProductError('Choose a valid picture.');
 const eventId=input.eventId??`${kind}:${p.surfaceId}:${id}`;if(typeof eventId!=='string'||eventId.length>200)throw new ProductError('Invalid display event.');
 const prior=await db(env).prepare('SELECT owner_id,surface_id,asset_id,kind FROM hb_display_events WHERE id=?').bind(eventId).first<{owner_id:string;surface_id:string;asset_id:string;kind:string}>();
 if(prior){if(prior.owner_id!==owner||prior.surface_id!==p.surfaceId||prior.asset_id!==id||prior.kind!==kind)throw new ProductError('Display event conflicts with an earlier request.',409);return {displayed:kind==='display',saved:true,duplicate:true,memory:p.memory,memoryVersion:p.memoryVersion};}
 const art=await db(env).prepare("SELECT a.*,j.world_id,j.surface_id,j.input FROM ai_attempts a LEFT JOIN hb_jobs j ON j.owner=a.owner AND j.request_id=a.request_id WHERE a.id=? AND a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed') AND EXISTS(SELECT 1 FROM hb_assets WHERE id=a.id AND owner=a.owner AND state='ready')").bind(id,owner).first<{candidate:string;world_id:string|null;surface_id:string|null;input:string|null;created_at:number}>();
 if(!art||art.world_id&&art.world_id!==p.worldId||art.surface_id&&art.surface_id!==p.surfaceId)throw new ProductError('Picture not found for this screen.',404);
 const candidate=JSON.parse(art.candidate),checked=parseStoryMemory(JSON.stringify({version:1,locationKey:candidate.locationKey,history:[{direction:candidate.direction,at:Math.min(now,candidate.createdAt)}]}),p.preferences.location,now);
 if(!checked?.history[0])throw new ProductError('This picture belongs to an earlier city. Keep it in your collection.',409);
 const jobInput=art.input?JSON.parse(art.input):null;
 if(kind==='display'&&jobInput?.preferencesVersion!==undefined&&jobInput.preferencesVersion!==p.version)throw new ProductError('Your atmosphere changed while this picture was preparing.',409);
 if(kind==='display'&&presentationPolicy(p.preferences,p.surface,now).night&&candidate.direction.phase!=='night')throw new ProductError('This picture is not suitable for the current night.',409);
 const direction=checked.history[0].direction;
 const memory:StoryMemory=kind==='display'?rememberMoment(p.memory,direction,now):{...(p.memory||{version:1,locationKey:direction.locationKey,history:[]}),creative:recordCreativeFeedback(p.memory?.creative,direction.artwork!.proposal,kind)};
 const statements=[db(env).prepare("UPDATE hb_worlds SET memory=?,memory_version=memory_version+1,event_claim=?,updated_at=? WHERE id=? AND owner_id=? AND memory_version=? AND preferences_version=? AND NOT EXISTS(SELECT 1 FROM hb_display_events WHERE id=?) AND EXISTS(SELECT 1 FROM hb_assets WHERE id=? AND owner=? AND state='ready') AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active')").bind(JSON.stringify(memory),eventId,now,p.worldId,owner,p.memoryVersion,p.version,eventId,id,owner,owner),
  db(env).prepare("INSERT OR IGNORE INTO hb_display_events(id,owner_id,world_id,surface_id,asset_id,kind,sequence,created_at) SELECT ?,?,?,?,?,?,display_sequence+1,? FROM hb_surfaces WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM hb_worlds WHERE id=? AND memory_version=? AND event_claim=?)").bind(eventId,owner,p.worldId,p.surfaceId,id,kind,now,p.surfaceId,owner,p.worldId,p.memoryVersion+1,eventId),
  db(env).prepare('UPDATE hb_surfaces SET display_sequence=display_sequence+1,current_asset_id=CASE WHEN ? THEN ? ELSE current_asset_id END,current_at=CASE WHEN ? THEN ? ELSE current_at END,updated_at=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM hb_display_events WHERE id=? AND sequence=hb_surfaces.display_sequence+1)').bind(kind==='display'?1:0,id,kind==='display'?1:0,now,now,p.surfaceId,owner,eventId)];
 if(kind==='display')statements.push(db(env).prepare("UPDATE ai_attempts SET status='displayed' WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM hb_display_events WHERE id=?)").bind(id,owner,eventId));
 const result=await db(env).batch(statements);
 if(result[0].meta.changes!==1)throw new ProductError('Your world changed during this event. Retry the same event.',409);
 return {displayed:kind==='display',saved:true,memory,memoryVersion:p.memoryVersion+1};
}
