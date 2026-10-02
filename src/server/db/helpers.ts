import { customType, text } from 'drizzle-orm/pg-core'

import type { Timestamp } from '@/store/semantic'

function now() {
    return new Date().toISOString()
}

function newId() {
    return crypto.randomUUID()
}

/**
 * @name timestamp
 * @description A `timestamptz` column that reads and writes ISO 8601 strings, so domain code keeps working with the
 * `Timestamp` alias instead of `Date` objects.
 *
 * @example
 * export const runs = pgTable('runs', {
 *     startedAt: timestamp('started_at'),
 * })
 */
export const timestamp = customType<{ data: Timestamp; driverData: string }>({
    dataType() {
        return 'timestamp with time zone'
    },
    fromDriver(value) {
        return new Date(value).toISOString()
    },
})

/**
 * @name baseEntitySchema
 * @description Returns the managed `id`, `createdAt` and `updatedAt` columns shared by every domain table. The id
 * defaults to a random UUID. Spread it into a table definition.
 *
 * @example
 * export const notes = pgTable('notes', {
 *     ...baseEntitySchema(),
 *     text: text('text'),
 * })
 */
export function baseEntitySchema() {
    return {
        id: text('id').primaryKey().$defaultFn(newId),
        createdAt: timestamp('created_at').notNull().$defaultFn(now),
        updatedAt: timestamp('updated_at').notNull().$defaultFn(now).$onUpdateFn(now),
    }
}
