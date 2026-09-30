import { text } from 'drizzle-orm/sqlite-core'

function now() {
    return new Date().toISOString()
}

/**
 * @name baseEntitySchema
 * @description Returns the managed `id`, `createdAt` and `updatedAt` columns shared by every table, plus
 * `deletedAt` when the table soft-deletes. Spread it into a table definition.
 *
 * @example
 * export const notes = sqliteTable('notes', {
 *     ...baseEntitySchema(),
 *     text: text('text'),
 * })
 */
export function baseEntitySchema() {
    return {
        id: text('id').primaryKey(),
        createdAt: text('created_at').notNull().$defaultFn(now),
        updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdateFn(now),
    }
}
