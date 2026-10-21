import type { CreativeDirection } from '../ambient-director.ts';
import type { CreativeProposal } from '../creative.ts';
export type GeneratedArtwork = { attemptId: string; url: string; title: string; proposal: CreativeProposal };
export type AICandidate = { id: string; requestId: string; locationKey: string; createdAt: number; direction: CreativeDirection };
export type AIStatus = { configured: boolean; authorized: boolean; available: boolean; reason: string; dailyLimit?: number; used?: number; nextAt?: number; remaining?: number; account?:boolean; plan?:string; capacityResetAt?:number };
export type AIResult = { status: 'ready' | 'pending' | 'held' | 'failed' | 'expired'; candidate?: AICandidate; nextAt?: number; reason?: string };
