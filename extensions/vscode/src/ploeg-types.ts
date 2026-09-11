export type PloegItem = { id: string; title: string; provider: string; externalId: string; team: string; state: string; description: string; attempts: number; target: { owner: string; repo: string } | null };
export type PloegPage = { items: PloegItem[]; nextCursor: string | null };
export type PloegTeam = { id: string; paused: boolean | null; queueDepth: number; roles: { id: string; queueDepth: number }[] };
export type PloegLane = 'needs_human' | 'leased' | 'queued' | 'all';
export type PloegOverview = { available: boolean; configured: boolean; demo: boolean; message: string; teams: PloegTeam[]; selectedTeam?: string; lanes?: Record<PloegLane, PloegPage> };
