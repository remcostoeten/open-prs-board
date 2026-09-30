export type RepositoryStatus = 'pending' | 'active' | 'needs_auth' | 'disconnected' | 'error'
export type SyncTrigger = 'onboarding' | 'cron' | 'manual' | 'webhook'
export type SyncStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed'
export type SyncPhase = 'pull_requests' | 'closed_pull_requests' | 'threads' | 'links'
export type ThreadOrigin = 'provider' | 'board'
export type LinkOrigin = 'derived' | 'manual'

export type SyncStats = {
    pullRequests: number
    closed: number
    threads: number
    failedThreads: number
}
