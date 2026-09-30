import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    snapshotBoardSchema,
    snapshotDiffSchema,
    snapshotReviewSchema,
    type SnapshotBoard,
    type SnapshotPullRequest,
    type SnapshotReview,
} from '@/features/providers/snapshot/schema'
import type {
    ProviderAdapter,
    SyncContext,
    SyncedPullRequest,
    SyncedReviewer,
    SyncedThread,
} from '@/features/providers/types'
import { fail, ok } from '@/shared/errors/result'

export const SNAPSHOT_EXTERNAL_ID = 'snapshot'

const snapshotDir = join(process.cwd(), 'data', 'snapshot')
const diffsDir = join(process.cwd(), 'diffs')

async function readJson(path: string) {
    return JSON.parse(await readFile(path, 'utf8'))
}

async function load() {
    try {
        const [board, review] = await Promise.all([
            readJson(join(snapshotDir, 'board.json')),
            readJson(join(snapshotDir, 'review.json')),
        ])
        return ok({ board: snapshotBoardSchema.parse(board), review: snapshotReviewSchema.parse(review) })
    } catch (error) {
        return fail<{ board: SnapshotBoard; review: SnapshotReview }>(
            'invalid_response',
            `snapshot did not load: ${String(error)}`,
            {
                provider: 'snapshot',
            },
        )
    }
}

function reviewers(pr: SnapshotPullRequest, review: SnapshotReview): SyncedReviewer[] {
    const verdict = review.review[pr.number]
    if (verdict) return [{ name: verdict.who, state: verdict.state }]
    if (pr.reviewer) return [{ name: pr.reviewer, state: pr.review === 'approved' ? 'approved' : null }]
    return []
}

function toPullRequest(pr: SnapshotPullRequest, review: SnapshotReview): SyncedPullRequest {
    return {
        externalId: String(pr.number),
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: 'open',
        draft: pr.draft,
        author: pr.author,
        sourceBranch: `pr-${pr.number}`,
        targetBranch: pr.base ?? 'master',
        headCommit: null,
        additions: pr.add,
        deletions: pr.rem,
        files: pr.files,
        pipeline: pr.pipeline,
        reviewers: reviewers(pr, review),
        environment: pr.env,
        ticket: pr.ticket,
        createdAt: pr.updatedAt,
        updatedAt: pr.updatedAt,
        closedAt: null,
    }
}

function toThreads(pr: string, review: SnapshotReview): SyncedThread[] {
    return (review.threads[pr] ?? []).map((thread) => ({
        externalId: String(thread.id),
        path: thread.path,
        line: thread.line,
        lineFrom: thread.lineFrom,
        commit: null,
        changedCommit: thread.changed,
        changedAt: thread.changedAt,
        status: thread.status === 'resolved' ? 'resolved' : 'open',
        url: thread.url,
        fix: review.fixes[thread.id] ?? null,
        comments: thread.messages.map((message, index) => ({
            externalId: `${thread.id}-${index}`,
            author: message.who,
            body: message.text,
            createdAt: message.at,
        })),
    }))
}

async function listPullRequests() {
    const data = await load()
    if (!data.ok) return data
    const { board, review } = data.value
    return ok(board.prs.map((pr) => toPullRequest(pr, review)))
}

async function getPullRequest(_ctx: SyncContext, number: string) {
    const all = await listPullRequests()
    if (!all.ok) return all
    const pr = all.value.find((candidate) => candidate.externalId === number)
    return pr ? ok(pr) : fail<SyncedPullRequest>('not_found', `snapshot has no PR ${number}`, { provider: 'snapshot' })
}

async function listThreads(_ctx: SyncContext, pr: string) {
    const data = await load()
    return data.ok ? ok(toThreads(pr, data.value.review)) : data
}

async function getDiff(_ctx: SyncContext, pr: string) {
    try {
        return ok(snapshotDiffSchema.parse(await readJson(join(diffsDir, `${pr}.json`))))
    } catch (error) {
        return fail<[]>('invalid_diff', `snapshot diff ${pr} did not load: ${String(error)}`, { provider: 'snapshot' })
    }
}

/**
 * @name snapshot
 * @description Provider adapter over the exported Bitbucket snapshot in `data/snapshot` and `diffs/`. Needs no
 * token, so the board runs as a demo and seeds its tables without any provider account.
 *
 * @example
 * const prs = await snapshot.listPullRequests(ctx)
 */
export const snapshot: ProviderAdapter = {
    id: 'snapshot',
    async listRepositories() {
        const data = await load()
        if (!data.ok) return data
        return ok([
            {
                externalId: SNAPSHOT_EXTERNAL_ID,
                slug: data.value.board.repository,
                name: data.value.board.repository,
                owner: data.value.board.author,
                url: data.value.board.prs[0]?.url.replace(/\/pull-requests\/\d+.*$/, '') ?? '',
                private: true,
                updatedAt: data.value.board.fetchedAt,
            },
        ])
    },
    listPullRequests,
    listClosedPullRequests: async () => ok([]),
    getPullRequest,
    enrichPullRequest: async (_ctx, pr) => ok(pr),
    listThreads,
    getDiff,
    classifyError: () => null,
    parseWebhook: async () => fail('webhook_invalid', 'snapshot has no webhooks', { provider: 'snapshot' }),
}
