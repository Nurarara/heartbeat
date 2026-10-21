import { env } from 'cloudflare:workers';
import { productService } from '@/lib/product/service';
import type { JobEnv } from '@/lib/product/jobs';
export function GET(request:Request) {return productService(env as unknown as JobEnv).handle(request);}
export function POST(request:Request) {return productService(env as unknown as JobEnv).handle(request);}
