import { expect, test } from 'bun:test'

import { DUMMY_EXTERNAL_ID, snapshot } from '@/features/providers/snapshot/adapter'
import type { SyncContext } from '@/features/providers/types'

function ctx(): SyncContext {
    return {
        correlationId: 'test-correlation',
        token: '',
        scheme: 'bearer',
        repository: { slug: 'webshop', externalId: DUMMY_EXTERNAL_ID },
        signal: new AbortController().signal,
    }
}

test('the dummy repository is offered next to the snapshot', async () => {
    const repositories = await snapshot.listRepositories(ctx())
    if (!repositories.ok) throw new Error(repositories.error.detail)
    expect(repositories.value.map((repository) => repository.externalId)).toContain(DUMMY_EXTERNAL_ID)
})

test('every dummy PR has a diff that matches its line counts', async () => {
    const prs = await snapshot.listPullRequests(ctx())
    if (!prs.ok) throw new Error(prs.error.detail)
    expect(prs.value.length).toBeGreaterThan(0)
    for (const pr of prs.value) {
        const files = await snapshot.getDiff(ctx(), pr.externalId, null)
        if (!files.ok) throw new Error(files.error.detail)
        expect(files.value.length).toBe(pr.files ?? 0)
        expect(files.value.reduce((sum, file) => sum + file.add, 0)).toBe(pr.additions ?? 0)
        expect(files.value.reduce((sum, file) => sum + file.rem, 0)).toBe(pr.deletions ?? 0)
    }
})

test('every dummy thread points at a file of its PR', async () => {
    const prs = await snapshot.listPullRequests(ctx())
    if (!prs.ok) throw new Error(prs.error.detail)
    for (const pr of prs.value) {
        const threads = await snapshot.listThreads(ctx(), pr.externalId)
        const files = await snapshot.getDiff(ctx(), pr.externalId, null)
        if (!threads.ok || !files.ok) throw new Error(`PR ${pr.externalId} did not load`)
        const paths = new Set(files.value.map((file) => file.path))
        for (const thread of threads.value) if (thread.path) expect(paths.has(thread.path)).toBe(true)
    }
})
