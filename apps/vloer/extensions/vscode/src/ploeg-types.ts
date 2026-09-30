export type PloegItem = { id: string; title: string; provider: string; externalId: string; team: string; state: string; description: string; attempts: number; target: { owner: string; repo: string } | null };
export type PloegPage = { items: PloegItem[]; nextCursor: string | null };
export type PloegTeam = { id: string; paused: boolean | null; queueDepth: number; roles: { id: string; queueDepth: number }[] };
export type PloegLane = 'awaiting_review' | 'needs_human' | 'leased' | 'queued' | 'all';
export const ploegLanes: readonly { id: PloegLane; label: string; icon: string }[] = [{ id: 'awaiting_review', label: 'Ready for review', icon: 'git-pull-request' }, { id: 'needs_human', label: 'Needs you', icon: 'bell-dot' }, { id: 'leased', label: 'Running', icon: 'pulse' }, { id: 'queued', label: 'Queued', icon: 'layers' }, { id: 'all', label: 'All', icon: 'list-flat' }];
export type PloegOverview = { available: boolean; configured: boolean; demo: boolean; message: string; teams: PloegTeam[]; selectedTeam?: string; lanes?: Record<PloegLane, PloegPage> };
