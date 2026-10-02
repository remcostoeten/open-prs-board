import { eq } from 'drizzle-orm'

import { DUMMY_EXTERNAL_ID, SNAPSHOT_EXTERNAL_ID } from '@/features/providers/snapshot/adapter'
import { seedDataset } from '@/features/providers/snapshot/seed'
import { organization } from '@/server/db/auth-schema'
import { closeDatabase, db } from '@/server/db/client'

const slug = process.argv[2]
const dataset = process.argv[3] ?? SNAPSHOT_EXTERNAL_ID
if (!slug || (dataset !== SNAPSHOT_EXTERNAL_ID && dataset !== DUMMY_EXTERNAL_ID)) {
    console.error('Usage: bun run db:seed <workspace-slug> [snapshot|dummy]')
    process.exit(1)
}

const [workspace] = await db.select().from(organization).where(eq(organization.slug, slug))
if (!workspace) {
    console.error(`No workspace with slug ${slug}`)
    process.exit(1)
}

const count = await seedDataset(workspace.id, dataset)
console.log(`Seeded ${count} PRs, groups, links and notes into ${workspace.name}`)
await closeDatabase()
