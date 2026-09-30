'use client'

import { useState } from 'react'

import { Editable } from '@/features/board/components/editable'
import { EFFORT, PIPELINE, PRIORITY } from '@/features/board/copy'
import { effortSchema, prioritySchema } from '@/features/board/schema'
import type { Effort, NotePatch, Priority, PullRequest, ReviewData } from '@/features/board/types'

type SelectCellProps = {
    pr: PullRequest
    priority: Priority | null
    effort: Effort | null
    onSave: (patch: NotePatch) => Promise<void>
}

type ReviewCellProps = {
    pr: PullRequest
    review: ReviewData
    onShowThreads: () => void
}

function useSaving(onSave: (patch: NotePatch) => Promise<void>) {
    const [busy, setBusy] = useState(false)
    async function save(patch: NotePatch) {
        setBusy(true)
        try {
            await onSave(patch)
        } catch (error) {
            console.warn('Opslaan mislukt', error)
        } finally {
            setBusy(false)
        }
    }
    return [busy, save] as const
}

export function PriorityCell({ pr, priority, onSave }: Omit<SelectCellProps, 'effort'>) {
    const [busy, save] = useSaving(onSave)
    return (
        <td className="prio">
            <Editable fallback={priority && <span className={`pill p-${priority}`}>P{priority}</span>}>
                <select
                    className={`effort-select prio-select ${priority ? `set p-${priority}` : ''}`}
                    title="Prioriteit voor Daan: 1 pakt hij als eerste op"
                    aria-label={`Prioriteit voor PR ${pr.number}`}
                    value={priority ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                        const parsed = prioritySchema.safeParse(Number(event.target.value))
                        void save({ priority: parsed.success ? parsed.data : null })
                    }}
                >
                    <option value="">Prio</option>
                    {Object.entries(PRIORITY).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </Editable>
        </td>
    )
}

export function EffortCell({ pr, effort, onSave }: Omit<SelectCellProps, 'priority'>) {
    const [busy, save] = useSaving(onSave)
    return (
        <td className="effort">
            <Editable fallback={effort && <span className={`pill e-${effort}`}>{EFFORT[effort]}</span>}>
                <select
                    className={`effort-select ${effort ? `set e-${effort}` : ''}`}
                    title="Hoeveel reviewtijd kost deze PR Daan ongeveer?"
                    aria-label={`Reviewtijd voor PR ${pr.number}`}
                    value={effort ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                        const parsed = effortSchema.safeParse(event.target.value)
                        void save({ effort: parsed.success ? parsed.data : null })
                    }}
                >
                    <option value="">Reviewtijd</option>
                    {Object.entries(EFFORT).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </Editable>
        </td>
    )
}

export function PipelineCell({ pr }: { pr: PullRequest }) {
    const { tone, label } = PIPELINE[pr.pipeline]
    return (
        <td>
            <span className={`pdot ${tone}`} role="img" aria-label={label} title={label} />
        </td>
    )
}

export function EnvironmentCell({ pr }: { pr: PullRequest }) {
    if (pr.env.kind === 'shared') return <td className="env-empty" />
    if (pr.env.kind === 'none')
        return (
            <td>
                <span className="pill idle">Nee</span>
            </td>
        )
    return (
        <td>
            <a className="envlink" href={pr.env.url} target="_blank" rel="noopener" title={new URL(pr.env.url).host}>
                <span className="host">{pr.env.host}</span>
                <span className="arrow" aria-hidden="true">
                    ↗
                </span>
            </a>
        </td>
    )
}

export function ReviewCell({ pr, review, onShowThreads }: ReviewCellProps) {
    const threads = review.threads[pr.number] ?? []
    const answered = threads.filter((thread) => thread.replied).length
    const rereview = pr.review === 'changes_requested' && threads.length > 0 && answered === threads.length
    const who = review.review[pr.number]?.who ?? 'Daan'
    return (
        <td className="rev">
            {pr.review === 'approved' && <span className="pill done-pill">✓ Approved</span>}
            {pr.review === 'changes_requested' &&
                (rereview ? (
                    <span
                        className="pill wait rereview"
                        title="Alle opmerkingen zijn beantwoord of verwerkt. De reviewer moet opnieuw kijken."
                    >
                        Aan {who}: re-review
                    </span>
                ) : (
                    <span className="pill bad">Changes requested</span>
                ))}
            {pr.review === 'pending' && <span className="pill idle">Nog geen review</span>}
            {pr.review === 'none' && <span className="none">geen</span>}
            {threads.length > 0 && pr.review !== 'approved' && (
                <span className="tcounts">
                    <button
                        type="button"
                        className="tshow"
                        title="Toon de opmerkingen en mijn reacties"
                        onClick={onShowThreads}
                    >
                        {threads.length} {threads.length === 1 ? 'opmerking' : 'opmerkingen'},{' '}
                        <span
                            className={answered === threads.length ? 't-resolved' : answered ? 't-recheck' : 't-open'}
                        >
                            {answered} door mij beantwoord
                        </span>
                    </button>
                    ·
                    <a href={pr.url} target="_blank" rel="noopener" title="Open de PR met alle comments in Bitbucket">
                        Bitbucket ↗
                    </a>
                </span>
            )}
        </td>
    )
}
