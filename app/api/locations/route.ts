import {env} from 'cloudflare:workers';
import {createWeatherAdapter} from '@/lib/server/weather';
import {authorizeWeatherRequest} from '@/lib/product/configuration';
import {ProductError, json as productJson} from '@/lib/product/core';
import { failure, json } from "@/lib/server";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
  try {
    await authorizeWeatherRequest(request,env,'search');
    if(q.length<2)return json({locations:[]});
    return json({ locations: await createWeatherAdapter(env).search(q, request.signal) });
  } catch (e) { return e instanceof ProductError?productJson({error:e.message},e.status):failure(e); }
}
