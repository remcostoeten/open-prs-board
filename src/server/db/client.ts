import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from '@/server/db/schema'

const client = createClient({
    url: process.env.DATABASE_URL ?? 'file:data/board.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
