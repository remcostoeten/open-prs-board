import type { PipelineState, ReviewerVerdictState } from '@/features/board/types'
import type { BitbucketComment, BitbucketPullRequest, BitbucketRepository } from '@/features/providers/bitbucket/schema'
import type {
    PullRequestState,
    SyncedComment,
    SyncedPullRequest,
    SyncedRepository,
    SyncedReviewer,
    SyncedThread,
} from '@/features/providers/types'
import type { Nullable } from '@/store/semantic'

function prState(state: BitbucketPullRequest['state']): PullRequestState {
    if (state === 'OPEN') return 'open'
    if (state === 'MERGED') return 'merged'
    return 'declined'
}

function verdict(approved: boolean, state: Nullable<string> | undefined): Nullable<ReviewerVerdictState> {
    if (state === 'changes_requested') return 'changes_requested'
    if (approved || state === 'approved') return 'approved'
    return null
}

/**
 * @name mapRepository
 * @description Maps a Bitbucket repository to the normalized repository model.
 *
 * @example
 * mapRepository(raw).slug // 'acme/website'
 */
export function mapRepository(raw: BitbucketRepository): SyncedRepository {
    return {
        externalId: raw.uuid,
        slug: raw.full_name,
        name: raw.name,
        owner: raw.workspace?.slug ?? raw.full_name.split('/')[0] ?? '',
        url: raw.links.html.href,
        private: raw.is_private,
        updatedAt: raw.updated_on ?? null,
    }
}

/**
 * @name mapPullRequest
 * @description Maps a Bitbucket pull request to the normalized model. Line counts and pipeline stay empty until
 * `enrichPullRequest` fills them.
 *
 * @example
 * mapPullRequest(raw).state // 'open'
 */
export function mapPullRequest(raw: BitbucketPullRequest): SyncedPullRequest {
    const state = prState(raw.state)
    const reviewers: SyncedReviewer[] = raw.participants
        .filter((participant) => participant.role === 'REVIEWER' || participant.approved || participant.state)
        .map((participant) => ({
            name: participant.user?.display_name ?? 'Onbekend',
            state: verdict(participant.approved, participant.state),
        }))
    return {
        externalId: String(raw.id),
        number: raw.id,
        title: raw.title,
        url: raw.links.html.href,
        state,
        draft: raw.draft,
        author: raw.author?.display_name ?? 'Onbekend',
        sourceBranch: raw.source.branch.name,
        targetBranch: raw.destination.branch.name,
        headCommit: raw.source.commit?.hash ?? null,
        additions: null,
        deletions: null,
        files: null,
        pipeline: 'missing',
        reviewers,
        environment: null,
        ticket: null,
        createdAt: raw.created_on,
        updatedAt: raw.updated_on,
        closedAt: state === 'open' ? null : raw.updated_on,
    }
}

/**
 * @name pipelineFromStatuses
 * @description Reduces Bitbucket commit build statuses to one pipeline state: any failure is failed, all
 * successful is passed, anything else (none, in progress) is missing.
 *
 * @example
 * pipelineFromStatuses(['SUCCESSFUL', 'FAILED']) // 'failed'
 */
export function pipelineFromStatuses(states: string[]): PipelineState {
    if (states.some((state) => state === 'FAILED' || state === 'STOPPED')) return 'failed'
    if (states.length > 0 && states.every((state) => state === 'SUCCESSFUL')) return 'passed'
    return 'missing'
}

function toComment(raw: BitbucketComment): SyncedComment {
    return {
        externalId: String(raw.id),
        author: raw.user?.display_name ?? 'Onbekend',
        body: raw.content.raw,
        createdAt: raw.created_on,
    }
}

/**
 * @name groupThreads
 * @description Groups a flat Bitbucket comment list into threads: every root comment starts a thread and replies
 * attach to their root through any depth of `parent`. Deleted comments are dropped, and a thread whose root was
 * deleted keeps its remaining replies.
 *
 * @example
 * const threads = groupThreads(comments, pr.url)
 */
export function groupThreads(raw: BitbucketComment[], prUrl: string): SyncedThread[] {
    const byId = new Map(raw.map((comment) => [comment.id, comment]))
    function rootOf(comment: BitbucketComment): BitbucketComment {
        let current = comment
        const seen = new Set<number>()
        while (current.parent && byId.has(current.parent.id) && !seen.has(current.id)) {
            seen.add(current.id)
            current = byId.get(current.parent.id) ?? current
        }
        return current
    }
    const threads = new Map<number, SyncedThread>()
    for (const comment of raw.toSorted((a, b) => a.created_on.localeCompare(b.created_on))) {
        const root = rootOf(comment)
        let thread = threads.get(root.id)
        if (!thread) {
            thread = {
                externalId: String(root.id),
                path: root.inline?.path ?? null,
                line: root.inline?.to ?? root.inline?.from ?? null,
                lineFrom: null,
                commit: null,
                changedCommit: null,
                changedAt: null,
                status: root.resolution ? 'resolved' : 'open',
                url: root.links?.html?.href ?? `${prUrl}#comment-${root.id}`,
                fix: null,
                comments: [],
            }
            threads.set(root.id, thread)
        }
        if (!comment.deleted) thread.comments.push(toComment(comment))
    }
    return [...threads.values()].filter((thread) => thread.comments.length > 0)
}
