import type { Entity, ID, Nullable, Timestamp } from '@/store/semantic'

export type PullRequestNumber = number
export type ThreadID = number
export type CommitHash = string

export type PipelineState = 'passed' | 'failed' | 'missing'
export type ReviewState = 'approved' | 'changes_requested' | 'pending' | 'none'
export type ReviewerVerdictState = 'approved' | 'changes_requested'
export type ThreadStatus = 'open' | 'recheck' | 'resolved'
export type FileStatus = 'added' | 'modified' | 'removed'
export type GroupID = 'stack' | 'other' | 'drafts'
export type Effort = 'quick' | 'short' | 'normal' | 'deep'
export type Priority = 1 | 2 | 3 | 4 | 5
export type SortMode = 'priority' | 'updated'

export type Environment = { kind: 'branch'; url: string; host: string } | { kind: 'shared' } | { kind: 'none' }

export type Ticket = {
    key: string
    old: Nullable<string>
}

export type PullRequest = {
    number: PullRequestNumber
    url: string
    step: Nullable<number>
    ticket: Nullable<Ticket>
    title: string
    base: Nullable<string>
    add: number
    rem: number
    files: number
    env: Environment
    pipeline: PipelineState
    draft: boolean
    author: string
    reviewer: Nullable<string>
    review: ReviewState
    updatedAt: Timestamp
    linkedTo: Nullable<PullRequestNumber>
}

export type PullRequestGroup = {
    id: GroupID
    title: string
    description: Nullable<string>
    prs: PullRequestNumber[]
    trailing?: PullRequestNumber[]
}

export type Board = {
    repository: string
    author: string
    fetchedAt: Timestamp
    stack: { branch: string; envUrl: string }
    groups: PullRequestGroup[]
    prs: PullRequest[]
}

export type ThreadMessage = {
    who: string
    at: Timestamp
    text: string
}

export type ReviewThread = {
    id: ThreadID
    who: string
    path: Nullable<string>
    line: Nullable<number>
    lineFrom: Nullable<number>
    created: Timestamp
    status: ThreadStatus
    changed: Nullable<CommitHash>
    changedAt: Nullable<Timestamp>
    replied: boolean
    url: string
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
    threads: Partial<Record<string, ReviewThread[]>>
    review: Partial<Record<string, ReviewerVerdict>>
    fixes: Partial<Record<string, ThreadFix>>
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

export type NoteID = ID

export type Note = Entity & {
    text: Nullable<string>
    priority: Nullable<Priority>
    effort: Nullable<Effort>
}

export type NotePatch = {
    text?: Nullable<string>
    priority?: Nullable<Priority>
    effort?: Nullable<Effort>
}
