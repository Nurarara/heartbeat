import {env} from 'cloudflare:workers';
import {createWeatherAdapter} from '@/lib/server/weather';
import {authorizeWeatherRequest} from '@/lib/product/configuration';
import {ProductError, json as productJson} from '@/lib/product/core';
import { contextPlace } from "@/lib/context";
import { failure, json, row, decode } from "@/lib/server";
import { LONDON } from "@/lib/world";
export async function GET(request: Request) {
  let selected;
  try { selected = contextPlace(new URL(request.url).searchParams); }
  catch (error) { return failure(error, 400); }
  try {
    await authorizeWeatherRequest(request,env,'context');
    // The local display supplies its selected city directly and needs no D1 row.
    const existing = selected ? null : await row(request);
    const place = selected || (existing ? decode(existing).profile.location : LONDON);
    return json({ context: await createWeatherAdapter(env).collect(place, request.signal), serverTime: Date.now() });
  } catch (error) { return error instanceof ProductError?productJson({error:error.message},error.status):failure(error); }
}
