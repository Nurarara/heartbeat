"use client";
import type {AIStatus} from '@/lib/ai/types';
export function ArtworkStatus({connection,busy,message,original,waiting=false}:{connection:AIStatus;busy:boolean;message:string;original:boolean;waiting?:boolean}){
 const preparing=busy||waiting;
 const state=preparing?'preparing':original?'original':'preview';
 const label=preparing?'Preparing your next original':original?'Your original artwork':'Illustrated preview';
 const reset=connection.capacityResetAt?` Capacity resets ${new Date(connection.capacityResetAt).toLocaleString(undefined,{weekday:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'})}.`:'';
 const detail=preparing?'Your current picture stays while the new one is prepared.':!connection.available?connection.reason+reset:message||'Your next original follows your city, time and weather.';
 return <div className="hb-artwork-status" data-artwork-state={state} role="status"><span>{label}</span><small>{detail}</small></div>;
}
