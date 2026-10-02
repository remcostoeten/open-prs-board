import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

import type {
    Effort,
    Environment,
    PipelineState,
    Priority,
    ReviewerVerdictState,
    ReviewState,
    ThreadFix,
} from '@/features/board/types'
import type { ProviderId, ProviderThreadStatus, PullRequestState } from '@/features/providers/types'
import type {
    LinkOrigin,
    RepositoryStatus,
    SyncPhase,
    SyncStats,
    SyncStatus,
    SyncTrigger,
    ThreadOrigin,
} from '@/features/sync/types'
import type { ErrorCode } from '@/shared/errors/codes'
import { organization, user } from './auth-schema'
import { baseEntitySchema, timestamp } from './helpers'

export const repositories = pgTable(
    'repositories',
    {
        ...baseEntitySchema(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        provider: text('provider').$type<ProviderId>().notNull(),
        externalId: text('external_id').notNull(),
        slug: text('slug').notNull(),
        name: text('name').notNull(),
        url: text('url').notNull(),
        connectedBy: text('connected_by').references(() => user.id, { onDelete: 'set null' }),
        status: text('status').$type<RepositoryStatus>().notNull().default('pending'),
        lastErrorCode: text('last_error_code').$type<ErrorCode>(),
        closedCursor: text('closed_cursor'),
        lastSyncedAt: timestamp('last_synced_at'),
        disconnectedAt: timestamp('disconnected_at'),
        purgeAfter: timestamp('purge_after'),
        webhookSecret: text('webhook_secret')
            .notNull()
            .$defaultFn(() => crypto.randomUUID().replaceAll('-', '')),
    },
    (table) => [
        uniqueIndex('repositories_org_external_idx').on(table.organizationId, table.provider, table.externalId),
    ],
)

export const pullRequests = pgTable(
    'pull_requests',
    {
        ...baseEntitySchema(),
        repositoryId: text('repository_id')
            .notNull()
            .references(() => repositories.id, { onDelete: 'cascade' }),
        externalId: text('external_id').notNull(),
        number: integer('number').notNull(),
        title: text('title').notNull(),
        url: text('url').notNull(),
        state: text('state').$type<PullRequestState>().notNull(),
        draft: boolean('draft').notNull().default(false),
        author: text('author').notNull(),
        sourceBranch: text('source_branch').notNull(),
        targetBranch: text('target_branch').notNull(),
        headCommit: text('head_commit'),
        additions: integer('additions'),
        deletions: integer('deletions'),
        files: integer('files'),
        pipeline: text('pipeline').$type<PipelineState>().notNull().default('missing'),
        review: text('review').$type<ReviewState>().notNull().default('none'),
        environment: jsonb('environment').$type<Environment>(),
        ticketKey: text('ticket_key'),
        ticketOld: text('ticket_old'),
        providerCreatedAt: timestamp('provider_created_at').notNull(),
        providerUpdatedAt: timestamp('provider_updated_at').notNull(),
        threadsSyncedAt: timestamp('threads_synced_at'),
        threadsErrorCode: text('threads_error_code').$type<ErrorCode>(),
        closedAt: timestamp('closed_at'),
    },
    (table) => [
        uniqueIndex('pull_requests_repo_number_idx').on(table.repositoryId, table.number),
        index('pull_requests_state_idx').on(table.repositoryId, table.state),
    ],
)

export const reviewers = pgTable(
    'pull_request_reviewers',
    {
        ...baseEntitySchema(),
        pullRequestId: text('pull_request_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        state: text('state').$type<ReviewerVerdictState>(),
    },
    (table) => [uniqueIndex('reviewers_pr_name_idx').on(table.pullRequestId, table.name)],
)

export const threads = pgTable(
    'threads',
    {
        ...baseEntitySchema(),
        pullRequestId: text('pull_request_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        origin: text('origin').$type<ThreadOrigin>().notNull(),
        externalId: text('external_id'),
        path: text('path'),
        line: integer('line'),
        lineFrom: integer('line_from'),
        commit: text('commit'),
        changedCommit: text('changed_commit'),
        changedAt: timestamp('changed_at'),
        url: text('url'),
        providerStatus: text('provider_status').$type<ProviderThreadStatus>(),
        fix: jsonb('fix').$type<ThreadFix>(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        resolvedAt: timestamp('resolved_at'),
        resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
    },
    (table) => [
        uniqueIndex('threads_external_idx').on(table.pullRequestId, table.origin, table.externalId),
        index('threads_pr_idx').on(table.pullRequestId),
    ],
)

export const comments = pgTable(
    'comments',
    {
        ...baseEntitySchema(),
        threadId: text('thread_id')
            .notNull()
            .references(() => threads.id, { onDelete: 'cascade' }),
        origin: text('origin').$type<ThreadOrigin>().notNull(),
        externalId: text('external_id'),
        authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
        authorName: text('author_name').notNull(),
        body: text('body').notNull(),
        postedAt: timestamp('posted_at').notNull(),
        deletedAt: timestamp('deleted_at'),
    },
    (table) => [
        uniqueIndex('comments_external_idx').on(table.threadId, table.origin, table.externalId),
        index('comments_thread_idx').on(table.threadId),
    ],
)

export const groups = pgTable(
    'groups',
    {
        ...baseEntitySchema(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        description: text('description'),
        position: integer('position').notNull().default(0),
    },
    (table) => [index('groups_org_idx').on(table.organizationId)],
)

export const groupMembers = pgTable(
    'group_members',
    {
        ...baseEntitySchema(),
        groupId: text('group_id')
            .notNull()
            .references(() => groups.id, { onDelete: 'cascade' }),
        pullRequestId: text('pull_request_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        position: integer('position').notNull().default(0),
    },
    (table) => [uniqueIndex('group_members_pr_idx').on(table.pullRequestId)],
)

export const links = pgTable(
    'pull_request_links',
    {
        ...baseEntitySchema(),
        fromId: text('from_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        toId: text('to_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        label: text('label'),
        origin: text('origin').$type<LinkOrigin>().notNull(),
        hidden: boolean('hidden').notNull().default(false),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    },
    (table) => [uniqueIndex('links_pair_idx').on(table.fromId, table.toId)],
)

export const notes = pgTable(
    'notes',
    {
        ...baseEntitySchema(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        pullRequestId: text('pull_request_id').references(() => pullRequests.id, { onDelete: 'cascade' }),
        groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
        text: text('text'),
        priority: integer('priority').$type<Priority>(),
        effort: text('effort').$type<Effort>(),
        updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    },
    (table) => [uniqueIndex('notes_pr_idx').on(table.pullRequestId), uniqueIndex('notes_group_idx').on(table.groupId)],
)

export const pullRequestReads = pgTable(
    'pull_request_reads',
    {
        ...baseEntitySchema(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        pullRequestId: text('pull_request_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        lastReadAt: timestamp('last_read_at').notNull(),
    },
    (table) => [uniqueIndex('reads_user_pr_idx').on(table.userId, table.pullRequestId)],
)

export const notifications = pgTable(
    'notifications',
    {
        ...baseEntitySchema(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
        kind: text('kind').$type<'mention'>().notNull(),
        pullRequestId: text('pull_request_id').references(() => pullRequests.id, { onDelete: 'cascade' }),
        commentId: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
        readAt: timestamp('read_at'),
    },
    (table) => [index('notifications_user_idx').on(table.userId, table.readAt)],
)

export const diffCache = pgTable(
    'diff_cache',
    {
        ...baseEntitySchema(),
        pullRequestId: text('pull_request_id')
            .notNull()
            .references(() => pullRequests.id, { onDelete: 'cascade' }),
        commit: text('commit').notNull(),
        status: text('status').$type<'ok' | 'failed'>().notNull(),
        files: text('files'),
        errorCode: text('error_code').$type<ErrorCode>(),
    },
    (table) => [uniqueIndex('diff_cache_pr_commit_idx').on(table.pullRequestId, table.commit)],
)

export const syncRuns = pgTable(
    'sync_runs',
    {
        ...baseEntitySchema(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        repositoryId: text('repository_id')
            .notNull()
            .references(() => repositories.id, { onDelete: 'cascade' }),
        correlationId: text('correlation_id').notNull(),
        trigger: text('trigger').$type<SyncTrigger>().notNull(),
        pullRequestExternalId: text('pull_request_external_id'),
        status: text('status').$type<SyncStatus>().notNull().default('queued'),
        phase: text('phase').$type<SyncPhase>(),
        attempt: integer('attempt').notNull().default(0),
        leaseExpiresAt: timestamp('lease_expires_at'),
        nextAttemptAt: timestamp('next_attempt_at'),
        stats: jsonb('stats').$type<SyncStats>(),
        errorCode: text('error_code').$type<ErrorCode>(),
        errorDetail: text('error_detail'),
        startedAt: timestamp('started_at'),
        finishedAt: timestamp('finished_at'),
    },
    (table) => [
        index('sync_runs_repo_idx').on(table.repositoryId, table.status),
        index('sync_runs_correlation_idx').on(table.correlationId),
    ],
)
