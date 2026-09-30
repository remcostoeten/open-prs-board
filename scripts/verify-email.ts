import { eq } from 'drizzle-orm'

import { user } from '@/server/db/auth-schema'
import { db } from '@/server/db/client'

const email = process.argv[2]?.toLowerCase()
if (!email) {
    console.error('Usage: bun run user:verify <email>')
    process.exit(1)
}
const updated = await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email))
    .returning({ id: user.id })
console.log(updated.length > 0 ? `Marked ${email} as verified` : `No user with email ${email}`)
