import type {
    Environment,
    Ticket,
    FileStatus,
    PipelineState,
    ReviewerVerdictState,
    ThreadFix,
} from '@/features/board/types'
import type { ErrorCode } from '@/shared/errors/codes'
import type { Result } from '@/shared/errors/result'
import type { ID, Nullable, Timestamp } from '@/store/semantic'

export type ProviderId = 'bitbucket' | 'github' | 'snapshot'
export type ExternalID = string
export type CommitHash = string
export type PullRequestState = 'open' | 'merged' | 'declined'
export type ProviderThreadStatus = 'open' | 'resolved'

export type SyncContext = {
    correlationId: ID
    token: string
    repository: { slug: string; externalId: ExternalID }
    signal: AbortSignal
}

export type SyncedRepository = {
    externalId: ExternalID
    slug: string
    name: string
    owner: string
    url: string
    private: boolean
    updatedAt: Nullable<Timestamp>
}

export type SyncedReviewer = {
    name: string
    state: Nullable<ReviewerVerdictState>
}

export type SyncedPullRequest = {
    externalId: ExternalID
    number: number
    title: string
    url: string
    state: PullRequestState
    draft: boolean
    author: string
    sourceBranch: string
    targetBranch: string
    headCommit: Nullable<CommitHash>
    additions: Nullable<number>
    deletions: Nullable<number>
    files: Nullable<number>
    pipeline: PipelineState
    reviewers: SyncedReviewer[]
    environment: Nullable<Environment>
    ticket: Nullable<Ticket>
    createdAt: Timestamp
    updatedAt: Timestamp
    closedAt: Nullable<Timestamp>
}

export type SyncedComment = {
    externalId: ExternalID
    author: string
    body: string
    createdAt: Timestamp
}

export type SyncedThread = {
    externalId: ExternalID
    path: Nullable<string>
    line: Nullable<number>
    lineFrom: Nullable<number>
    commit: Nullable<CommitHash>
    changedCommit: Nullable<CommitHash>
    changedAt: Nullable<Timestamp>
    status: ProviderThreadStatus
    url: Nullable<string>
    fix: Nullable<ThreadFix>
    comments: SyncedComment[]
}

export type SyncedDiffFile = {
    path: string
    old: Nullable<string>
    status: FileStatus
    add: number
    rem: number
    binary: boolean
    truncated: boolean
    diff: string
}

export type WebhookEvent = {
    repositoryExternalId: ExternalID
    pullRequestExternalId: Nullable<ExternalID>
    deliveryId: Nullable<string>
}

export type ProviderAdapter = {
    id: ProviderId
    listRepositories: (ctx: SyncContext) => Promise<Result<SyncedRepository[]>>
    listPullRequests: (ctx: SyncContext) => Promise<Result<SyncedPullRequest[]>>
    listClosedPullRequests: (ctx: SyncContext, since: Timestamp) => Promise<Result<SyncedPullRequest[]>>
    getPullRequest: (ctx: SyncContext, pr: ExternalID) => Promise<Result<SyncedPullRequest>>
    enrichPullRequest: (ctx: SyncContext, pr: SyncedPullRequest) => Promise<Result<SyncedPullRequest>>
    listThreads: (ctx: SyncContext, pr: ExternalID) => Promise<Result<SyncedThread[]>>
    getDiff: (ctx: SyncContext, pr: ExternalID, commit: Nullable<CommitHash>) => Promise<Result<SyncedDiffFile[]>>
    classifyError: (response: Response) => Nullable<ErrorCode>
    parseWebhook: (request: Request, secret: string) => Promise<Result<WebhookEvent>>
}
