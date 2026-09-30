import type { Effort, PipelineState, Priority, ThreadStatus } from '@/features/board/types'

export const AUTHOR = 'Remco'

export const THREAD_STATUS: Record<ThreadStatus, string> = {
    open: 'Open, jij bent aan zet',
    recheck: 'Daan moet opnieuw kijken',
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

export const STACK_NOTE_COPY = {
    label: 'Notitie voor Daan bij de hele stack',
    placeholder:
        'Geef Daan context bij de hele APP-stack: wat er sinds zijn laatste ronde is veranderd, in welke volgorde hij het beste kan kijken en wat je van hem nodig hebt.',
    srLabel: 'Notitie voor Daan bij de hele APP-stack',
    empty: 'Geen notitie bij de stack.',
}

export const PR_NOTE_COPY = {
    label: 'Notitie voor Daan',
    placeholder:
        'Geef Daan context bij deze PR: wat er is veranderd sinds zijn review, wat hij moet testen en wat je van hem nodig hebt.',
    srLabel: null,
    empty: 'Geen notitie bij deze PR.',
}
