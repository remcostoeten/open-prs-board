import { describe, expect, test } from 'bun:test'

import { groupThreads, mapPullRequest, pipelineFromStatuses } from '@/features/providers/bitbucket/map'
import { commentSchema, pullRequestSchema } from '@/features/providers/bitbucket/schema'

function comment(
    id: number,
    parent: number | null,
    author: string,
    at: string,
    extra: Record<string, boolean | object> = {},
) {
    return commentSchema.parse({
        id,
        content: { raw: `comment ${id}` },
        user: { display_name: author },
        created_on: at,
        parent: parent ? { id: parent } : null,
        ...extra,
    })
}

describe('groupThreads', () => {
    test('attaches nested replies to their root and keeps inline position', () => {
        const threads = groupThreads(
            [
                comment(3, 2, 'Remco', '2026-09-01T12:00:00Z'),
                comment(1, null, 'Daan', '2026-09-01T10:00:00Z', { inline: { path: 'a.ts', to: 12 } }),
                comment(2, 1, 'Remco', '2026-09-01T11:00:00Z'),
                comment(4, null, 'Pieter', '2026-09-02T10:00:00Z', { resolution: { type: 'resolved' } }),
            ],
            'https://bitbucket.org/acme/web/pull-requests/7',
        )
        expect(
            threads.map((thread) => [
                thread.externalId,
                thread.path,
                thread.line,
                thread.status,
                thread.comments.length,
            ]),
        ).toEqual([
            ['1', 'a.ts', 12, 'open', 3],
            ['4', null, null, 'resolved', 1],
        ])
    })

    test('drops deleted comments and threads that end up empty', () => {
        const threads = groupThreads([comment(1, null, 'Daan', '2026-09-01T10:00:00Z', { deleted: true })], 'https://x')
        expect(threads).toEqual([])
    })
})

describe('pipelineFromStatuses', () => {
    test('reduces build statuses', () => {
        expect(pipelineFromStatuses([])).toBe('missing')
        expect(pipelineFromStatuses(['SUCCESSFUL', 'SUCCESSFUL'])).toBe('passed')
        expect(pipelineFromStatuses(['SUCCESSFUL', 'FAILED'])).toBe('failed')
        expect(pipelineFromStatuses(['INPROGRESS'])).toBe('missing')
    })
})

describe('mapPullRequest', () => {
    test('maps state, branches and reviewer verdicts', () => {
        const pr = mapPullRequest(
            pullRequestSchema.parse({
                id: 7,
                title: 'WEB-12 login',
                state: 'MERGED',
                author: { display_name: 'Remco' },
                source: { branch: { name: 'feature/WEB-12' }, commit: { hash: 'abc' } },
                destination: { branch: { name: 'main' } },
                participants: [
                    { role: 'REVIEWER', approved: true, user: { display_name: 'Daan' } },
                    { role: 'REVIEWER', approved: false, state: 'changes_requested', user: { display_name: 'Pieter' } },
                    { role: 'PARTICIPANT', approved: false, user: { display_name: 'Bot' } },
                ],
                created_on: '2026-09-01T10:00:00Z',
                updated_on: '2026-09-02T10:00:00Z',
                links: { html: { href: 'https://bitbucket.org/acme/web/pull-requests/7' } },
            }),
        )
        expect(pr.state).toBe('merged')
        expect(pr.closedAt).toBe('2026-09-02T10:00:00Z')
        expect(pr.headCommit).toBe('abc')
        expect(pr.reviewers).toEqual([
            { name: 'Daan', state: 'approved' },
            { name: 'Pieter', state: 'changes_requested' },
        ])
    })
})
