import type { ProviderId, PullRequestState } from '@/features/providers/types'
import type { RepositoryStatus, SyncPhase, SyncStatus, ThreadOrigin } from '@/features/sync/types'
import type { ErrorCode } from '@/shared/errors/codes'
import type { Entity, ID, Nullable, Timestamp } from '@/store/semantic'

export type PullRequestID = ID
export type ThreadID = ID
export type RepositoryID = ID
export type GroupID = ID
export type CommitHash = string

export type PipelineState = 'passed' | 'failed' | 'missing'
export type ReviewState = 'approved' | 'changes_requested' | 'pending' | 'none'
export type ReviewerVerdictState = 'approved' | 'changes_requested'
export type ThreadStatus = 'open' | 'recheck' | 'resolved'
export type FileStatus = 'added' | 'modified' | 'removed'
export type Effort = 'quick' | 'short' | 'normal' | 'deep'
export type Priority = 1 | 2 | 3 | 4 | 5
export type SortMode = 'priority' | 'updated'
export type BoardView = 'active' | 'archive'
export type Role = 'owner' | 'admin' | 'member'

export type Environment = { kind: 'branch'; url: string; host: string } | { kind: 'shared' } | { kind: 'none' }

export type Ticket = {
    key: string
    old: Nullable<string>
}

export type PullRequest = {
    id: PullRequestID
    repositoryId: RepositoryID
    repository: string
    provider: ProviderId
    number: number
    url: string
    step: Nullable<number>
    ticket: Nullable<Ticket>
    title: string
    base: string
    source: string
    add: Nullable<number>
    rem: Nullable<number>
    files: Nullable<number>
    env: Environment
    pipeline: PipelineState
    draft: boolean
    author: string
    reviewer: Nullable<string>
    review: ReviewState
    state: PullRequestState
    updatedAt: Timestamp
    closedAt: Nullable<Timestamp>
    threadsError: Nullable<ErrorCode>
    unread: number
    readOnly: boolean
}

export type PullRequestGroup = {
    id: GroupID
    kind: 'custom' | 'open' | 'drafts' | 'archive'
    title: string
    description: Nullable<string>
    prs: PullRequestID[]
}

export type Link = {
    id: ID
    fromId: PullRequestID
    toId: PullRequestID
    label: Nullable<string>
    origin: 'derived' | 'manual'
}

export type RepositorySummary = {
    id: RepositoryID
    slug: string
    name: string
    url: string
    provider: ProviderId
    status: RepositoryStatus
    lastSyncedAt: Nullable<Timestamp>
    lastErrorCode: Nullable<ErrorCode>
    purgeAfter: Nullable<Timestamp>
    sync: Nullable<{
        status: SyncStatus
        phase: Nullable<SyncPhase>
        errorCode: Nullable<ErrorCode>
        reference: string
    }>
}

export type Member = {
    id: ID
    name: string
    email: string
    role: Role
}

export type ThreadMessage = {
    id: ID
    who: string
    authorId: Nullable<ID>
    origin: ThreadOrigin
    at: Timestamp
    text: string
}

export type ReviewThread = {
    id: ThreadID
    origin: ThreadOrigin
    who: string
    path: Nullable<string>
    line: Nullable<number>
    lineFrom: Nullable<number>
    created: Timestamp
    status: ThreadStatus
    changed: Nullable<CommitHash>
    changedAt: Nullable<Timestamp>
    replied: boolean
    url: Nullable<string>
    resolvedBy: Nullable<string>
    messages: ThreadMessage[]
}

export type ReviewerVerdict = {
    who: string
    state: Nullable<ReviewerVerdictState>
}

export type FixExcerpt = {
    start: number
    lines: string[]
    from: Nullable<number>
    to: Nullable<number>
}

export type ThreadFix = {
    fromCommit: CommitHash
    toCommit: CommitHash
    diff?: string
    binary?: boolean
    deleted?: boolean
    excerpt?: Nullable<FixExcerpt>
}

export type ReviewData = {
    threads: Partial<Record<PullRequestID, ReviewThread[]>>
    review: Partial<Record<PullRequestID, ReviewerVerdict>>
    fixes: Partial<Record<ThreadID, ThreadFix>>
}

export type DiffFile = {
    path: string
    old: Nullable<string>
    status: FileStatus
    add: number
    rem: number
    binary: boolean
    truncated: boolean
    diff: string
}

export type Viewer = {
    id: ID
    name: string
    role: Role
}

export type Board = {
    workspace: { id: ID; name: string }
    viewer: Viewer
    view: BoardView
    filter: RepositoryID[]
    mine: boolean
    repositories: RepositorySummary[]
    members: Member[]
    prs: PullRequest[]
    groups: PullRequestGroup[]
    links: Link[]
    review: ReviewData
    notes: Note[]
}

export type NoteID = string

export type Note = Entity & {
    text: Nullable<string>
    priority: Nullable<Priority>
    effort: Nullable<Effort>
    updatedBy: Nullable<string>
}

export type NotePatch = {
    text?: Nullable<string>
    priority?: Nullable<Priority>
    effort?: Nullable<Effort>
}
