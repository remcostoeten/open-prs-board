import { eq } from 'drizzle-orm'

import { DUMMY_EXTERNAL_ID } from '@/features/providers/snapshot/adapter'
import { seedDataset } from '@/features/providers/snapshot/seed'
import { auth } from '@/server/auth'
import { user } from '@/server/db/auth-schema'
import { closeDatabase, db } from '@/server/db/client'

const EMAIL = 'demo@example.com'
const PASSWORD = 'demo-password'

const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL))
if (existing) {
    console.log(`The demo account already exists. Sign in with ${EMAIL} and ${PASSWORD}.`)
    await closeDatabase()
    process.exit(0)
}

const created = await auth.api.signUpEmail({ body: { name: 'Sanne de Vries', email: EMAIL, password: PASSWORD } })
await db.update(user).set({ emailVerified: true }).where(eq(user.id, created.user.id))
const workspace = await auth.api.createOrganization({
    body: { name: 'Demo', slug: `demo-${crypto.randomUUID().slice(0, 6)}`, userId: created.user.id },
})
if (!workspace) throw new Error('the demo workspace was not created')

const count = await seedDataset(workspace.id, DUMMY_EXTERNAL_ID)
console.log(`Seeded ${count} dummy PRs into the Demo workspace. Sign in with ${EMAIL} and ${PASSWORD}.`)
await closeDatabase()
