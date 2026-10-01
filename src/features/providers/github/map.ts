import type { PipelineState, ReviewerVerdictState } from '@/features/board/types'
import type {
    GithubIssueComment,
    GithubPullRequest,
    GithubRepository,
    GithubReview,
    GithubReviewComment,
} from '@/features/providers/github/schema'
import type { SyncedPullRequest, SyncedRepository, SyncedReviewer, SyncedThread } from '@/features/providers/types'

/**
 * @name mapRepository
 * @description Maps a GitHub repository to the normalized repository model.
 *
 * @example
 * mapRepository(raw).slug // 'acme/web'
 */
export function mapRepository(raw: GithubRepository): SyncedRepository {
    return {
        externalId: String(raw.id),
        slug: raw.full_name,
        name: raw.name,
        owner: raw.owner.login,
        url: raw.html_url,
        private: raw.private,
        updatedAt: raw.updated_at ?? null,
    }
}

/**
 * @name mapPullRequest
 * @description Maps a GitHub pull request to the normalized model. A closed PR with `merged_at` is merged, any
 * other closed PR is declined. Requested reviewers start without a verdict.
 *
 * @example
 * mapPullRequest(raw).state // 'open'
 */
export function mapPullRequest(raw: GithubPullRequest): SyncedPullRequest {
    const state = raw.state === 'open' ? 'open' : raw.merged_at ? 'merged' : 'declined'
    return {
        externalId: String(raw.number),
        number: raw.number,
        title: raw.title,
        url: raw.html_url,
        state,
        draft: raw.draft,
        author: raw.user?.login ?? 'onbekend',
        sourceBranch: raw.head.ref,
        targetBranch: raw.base.ref,
        headCommit: raw.head.sha,
        additions: raw.additions ?? null,
        deletions: raw.deletions ?? null,
        files: raw.changed_files ?? null,
        pipeline: 'missing',
        reviewers: raw.requested_reviewers.map((reviewer) => ({ name: reviewer.login, state: null })),
        environment: null,
        ticket: null,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        closedAt: state === 'open' ? null : (raw.merged_at ?? raw.closed_at ?? raw.updated_at),
    }
}

/**
 * @name reviewersFromReviews
 * @description Combines requested reviewers with submitted reviews: each reviewer's latest approving or
 * change-requesting review decides their verdict; comment-only reviews leave it open.
 *
 * @example
 * reviewersFromReviews(pr.reviewers, reviews)
 */
export function reviewersFromReviews(requested: SyncedReviewer[], reviews: GithubReview[]): SyncedReviewer[] {
    const verdicts = new Map<string, ReviewerVerdictState | null>(
        requested.map((reviewer) => [reviewer.name, reviewer.state]),
    )
    for (const review of reviews.toSorted((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))) {
        const login = review.user?.login
        if (!login) continue
        if (review.state === 'APPROVED') verdicts.set(login, 'approved')
        else if (review.state === 'CHANGES_REQUESTED') verdicts.set(login, 'changes_requested')
        else if (review.state === 'DISMISSED') verdicts.set(login, null)
        else if (!verdicts.has(login)) verdicts.set(login, null)
    }
    return [...verdicts].map(([name, state]) => ({ name, state }))
}

/**
 * @name pipelineFromChecks
 * @description Reduces GitHub check runs to one pipeline state: any failed conclusion is failed, all completed and
 * successful (or skipped) is passed, anything else is missing.
 *
 * @example
 * pipelineFromChecks([{ status: 'completed', conclusion: 'success' }]) // 'passed'
 */
export function pipelineFromChecks(runs: { status: string; conclusion: string | null }[]): PipelineState {
    if (
        runs.some(
            (run) => run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled',
        )
    )
        return 'failed'
    if (
        runs.length > 0 &&
        runs.every(
            (run) =>
                run.status === 'completed' &&
                (run.conclusion === 'success' || run.conclusion === 'skipped' || run.conclusion === 'neutral'),
        )
    )
        return 'passed'
    return 'missing'
}

/**
 * @name groupThreads
 * @description Builds threads from GitHub review comments (grouped on `in_reply_to_id`, anchored to a file and line)
 * and issue comments (each one a general thread).
 *
 * @example
 * groupThreads(reviewComments, issueComments)
 */
export function groupThreads(review: GithubReviewComment[], issue: GithubIssueComment[]): SyncedThread[] {
    const threads = new Map<number, SyncedThread>()
    for (const comment of review.toSorted((a, b) => a.created_at.localeCompare(b.created_at))) {
        const rootId = comment.in_reply_to_id ?? comment.id
        let thread = threads.get(rootId)
        if (!thread) {
            thread = {
                externalId: `review-${rootId}`,
                path: comment.path,
                line: comment.line ?? comment.original_line ?? null,
                lineFrom: comment.start_line ?? null,
                commit: comment.commit_id ?? null,
                changedCommit: null,
                changedAt: null,
                status: 'open',
                url: comment.html_url,
                fix: null,
                comments: [],
            }
            threads.set(rootId, thread)
        }
        thread.comments.push({
            externalId: String(comment.id),
            author: comment.user?.login ?? 'onbekend',
            body: comment.body,
            createdAt: comment.created_at,
        })
    }
    const general: SyncedThread[] = issue
        .filter((comment) => comment.body)
        .map((comment) => ({
            externalId: `issue-${comment.id}`,
            path: null,
            line: null,
            lineFrom: null,
            commit: null,
            changedCommit: null,
            changedAt: null,
            status: 'open',
            url: comment.html_url,
            fix: null,
            comments: [
                {
                    externalId: String(comment.id),
                    author: comment.user?.login ?? 'onbekend',
                    body: comment.body ?? '',
                    createdAt: comment.created_at,
                },
            ],
        }))
    return [...threads.values(), ...general]
}
