import { env } from 'cloudflare:workers';
import { aiService, type AIEnvironment } from '@/lib/ai/service';
export async function GET(request: Request) { return aiService(env as unknown as AIEnvironment).handle(request); }
export async function POST(request: Request) { return aiService(env as unknown as AIEnvironment).handle(request); }
