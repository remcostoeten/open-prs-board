import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'postgresql',
    schema: ['./src/server/db/auth-schema.ts', './src/server/db/board-schema.ts'],
    out: './drizzle',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'postgres://board:board@localhost:5435/board',
    },
})
