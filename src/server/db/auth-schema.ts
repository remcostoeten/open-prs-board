import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

function timestamps() {
    return {
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    }
}

export const user = pgTable('user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    ...timestamps(),
})

export const session = pgTable(
    'session',
    {
        id: text('id').primaryKey(),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
        token: text('token').notNull().unique(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        activeOrganizationId: text('active_organization_id'),
        ...timestamps(),
    },
    (table) => [index('session_user_idx').on(table.userId)],
)

export const account = pgTable(
    'account',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true, mode: 'date' }),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true, mode: 'date' }),
        scope: text('scope'),
        password: text('password'),
        ...timestamps(),
    },
    (table) => [index('account_user_idx').on(table.userId)],
)

export const verification = pgTable('verification', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ...timestamps(),
})

export const organization = pgTable('organization', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export const member = pgTable(
    'member',
    {
        id: text('id').primaryKey(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        role: text('role').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    },
    (table) => [uniqueIndex('member_org_user_idx').on(table.organizationId, table.userId)],
)

export const invitation = pgTable(
    'invitation',
    {
        id: text('id').primaryKey(),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        email: text('email').notNull(),
        role: text('role'),
        status: text('status').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
        inviterId: text('inviter_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (table) => [index('invitation_org_idx').on(table.organizationId)],
)
