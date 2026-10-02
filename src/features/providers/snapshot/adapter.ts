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
    ExternalID,
    ProviderAdapter,
    SyncContext,
    SyncedPullRequest,
    SyncedRepository,
    SyncedReviewer,
    SyncedThread,
} from '@/features/providers/types'
import { fail, ok } from '@/shared/errors/result'

export const SNAPSHOT_EXTERNAL_ID = 'snapshot'
export const DUMMY_EXTERNAL_ID = 'dummy'

const diffsDir = join(process.cwd(), 'diffs')

/**
 * @name datasetDir
 * @description Folder of a snapshot dataset: the fictional `data/dummy` for the dummy repository, the exported
 * `data/snapshot` for anything else.
 *
 * @example
 * const board = await readFile(join(datasetDir(DUMMY_EXTERNAL_ID), 'board.json'), 'utf8')
 */
export function datasetDir(externalId: ExternalID) {
    return join(process.cwd(), 'data', externalId === DUMMY_EXTERNAL_ID ? 'dummy' : 'snapshot')
}

async function readJson(path: string) {
    return JSON.parse(await readFile(path, 'utf8'))
}

async function load(externalId: ExternalID) {
    try {
        const [board, review] = await Promise.all([
            readJson(join(datasetDir(externalId), 'board.json')),
            readJson(join(datasetDir(externalId), 'review.json')),
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

function toRepository(externalId: ExternalID, board: SnapshotBoard): SyncedRepository {
    return {
        externalId,
        slug: board.repository,
        name: board.repository,
        owner: board.author,
        url: board.prs[0]?.url.replace(/\/pull-requests\/\d+.*$/, '') ?? '',
        private: true,
        updatedAt: board.fetchedAt,
    }
}

async function listRepositories() {
    const repositories: SyncedRepository[] = []
    for (const externalId of [DUMMY_EXTERNAL_ID, SNAPSHOT_EXTERNAL_ID]) {
        const data = await load(externalId)
        if (!data.ok) return data
        repositories.push(toRepository(externalId, data.value.board))
    }
    return ok(repositories)
}

async function listPullRequests(ctx: SyncContext) {
    const data = await load(ctx.repository.externalId)
    if (!data.ok) return data
    const { board, review } = data.value
    return ok(board.prs.map((pr) => toPullRequest(pr, review)))
}

async function getPullRequest(ctx: SyncContext, number: string) {
    const all = await listPullRequests(ctx)
    if (!all.ok) return all
    const pr = all.value.find((candidate) => candidate.externalId === number)
    return pr ? ok(pr) : fail<SyncedPullRequest>('not_found', `snapshot has no PR ${number}`, { provider: 'snapshot' })
}

async function listThreads(ctx: SyncContext, pr: string) {
    const data = await load(ctx.repository.externalId)
    return data.ok ? ok(toThreads(pr, data.value.review)) : data
}

async function readDiff(externalId: ExternalID, pr: string) {
    if (externalId !== DUMMY_EXTERNAL_ID) return readJson(join(diffsDir, `${pr}.json`))
    const diffs = await readJson(join(datasetDir(externalId), 'diffs.json'))
    return diffs[pr]
}

async function getDiff(ctx: SyncContext, pr: string) {
    try {
        return ok(snapshotDiffSchema.parse(await readDiff(ctx.repository.externalId, pr)))
    } catch (error) {
        return fail<[]>('invalid_diff', `snapshot diff ${pr} did not load: ${String(error)}`, { provider: 'snapshot' })
    }
}

/**
 * @name snapshot
 * @description Provider adapter over two file datasets: the exported Bitbucket snapshot in `data/snapshot` and
 * `diffs/`, and the fictional one in `data/dummy`. Needs no token, so the board runs as a demo and seeds its
 * tables without any provider account.
 *
 * @example
 * const prs = await snapshot.listPullRequests(ctx)
 */
export const snapshot: ProviderAdapter = {
    id: 'snapshot',
    listRepositories,
    listPullRequests,
    listClosedPullRequests: async () => ok([]),
    getPullRequest,
    enrichPullRequest: async (_ctx, pr) => ok(pr),
    listThreads,
    getDiff,
    classifyError: () => null,
    parseWebhook: async () => fail('webhook_invalid', 'snapshot has no webhooks', { provider: 'snapshot' }),
}
