import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as authSchema from '@/server/db/auth-schema'
import * as boardSchema from '@/server/db/board-schema'

const client = createClient({
    url: process.env.DATABASE_URL ?? 'file:data/board.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
})

await client.execute('PRAGMA foreign_keys = ON')

export const db = drizzle(client, { schema: { ...authSchema, ...boardSchema } })

export type Database = typeof db
