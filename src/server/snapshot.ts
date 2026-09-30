import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { cacheLife, cacheTag } from 'next/cache'

import { boardSchema, diffFilesSchema, reviewSchema } from '@/features/board/schema'
import type { Board, DiffFile, PullRequestNumber, ReviewData } from '@/features/board/types'

const snapshotDir = join(process.cwd(), 'data', 'snapshot')
const diffsDir = join(process.cwd(), 'diffs')

async function readJson(path: string) {
    const raw: string = await readFile(path, 'utf8')
    return JSON.parse(raw)
}

/**
 * @name loadBoard
 * @description Reads the PR list and group layout from the Bitbucket snapshot in `data/snapshot/board.json`.
 *
 * @example
 * const board = await loadBoard()
 * board.prs.length
 */
export async function loadBoard(): Promise<Board> {
    'use cache'
    cacheTag('snapshot')
    cacheLife('max')
    return boardSchema.parse(await readJson(join(snapshotDir, 'board.json')))
}

/**
 * @name loadReview
 * @description Reads review threads, reviewer verdicts and fix diffs from `data/snapshot/review.json`.
 *
 * @example
 * const review = await loadReview()
 * review.threads['851']?.length
 */
export async function loadReview(): Promise<ReviewData> {
    'use cache'
    cacheTag('snapshot')
    cacheLife('max')
    return reviewSchema.parse(await readJson(join(snapshotDir, 'review.json')))
}

/**
 * @name loadDiff
 * @description Reads the per-file diff of one PR from `diffs/<pr>.json`. Returns null when the file is missing.
 *
 * @example
 * const files = await loadDiff(851)
 * if (!files) return notFound()
 */
export async function loadDiff(pr: PullRequestNumber): Promise<DiffFile[] | null> {
    'use cache'
    cacheTag('snapshot', `diff-${pr}`)
    cacheLife('max')
    try {
        return diffFilesSchema.parse(await readJson(join(diffsDir, `${pr}.json`)))
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
        throw error
    }
}
