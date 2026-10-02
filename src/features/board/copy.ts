import type { Effort, PipelineState, Priority, ThreadStatus } from '@/features/board/types'

export const THREAD_STATUS: Record<ThreadStatus, string> = {
    open: 'Open, auteur aan zet',
    recheck: 'Reviewer is aan zet',
    resolved: 'Resolved',
}

export const EFFORT: Record<Effort, string> = {
    quick: 'Very fast · 1 min',
    short: 'Quick · 5 min',
    normal: 'Normal · 15 min',
    deep: 'Long · 30+ min',
}

export const PRIORITY: Record<Priority, string> = { 1: '1 · eerst', 2: '2', 3: '3', 4: '4', 5: '5 · later' }

export const PIPELINE: Record<PipelineState, { tone: string; label: string }> = {
    passed: { tone: 'ok', label: 'Pipeline groen' },
    failed: { tone: 'bad', label: 'Pipeline rood' },
    missing: { tone: 'none', label: 'Nog geen pipeline op de head' },
}

export const PROVIDER_LABEL: Record<string, string> = { bitbucket: 'Bitbucket', github: 'GitHub', snapshot: 'Snapshot' }
