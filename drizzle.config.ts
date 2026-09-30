import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'turso',
    schema: ['./src/server/db/auth-schema.ts', './src/server/db/board-schema.ts'],
    out: './drizzle',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'file:data/board.db',
        authToken: process.env.DATABASE_AUTH_TOKEN,
    },
})
