import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as authSchema from '@/server/db/auth-schema'
import * as boardSchema from '@/server/db/board-schema'

const DEFAULT_URL = 'postgres://board:board@localhost:5435/board'

const client = postgres(process.env.DATABASE_URL ?? DEFAULT_URL, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    connection: { TimeZone: 'UTC' },
    onnotice: () => undefined,
})

export const db = drizzle(client, { schema: { ...authSchema, ...boardSchema } })

export type Database = typeof db

/**
 * @name closeDatabase
 * @description Ends the connection pool. Scripts and tests call it so the process can exit.
 *
 * @example
 * await closeDatabase()
 */
export async function closeDatabase() {
    await client.end({ timeout: 5 })
}
