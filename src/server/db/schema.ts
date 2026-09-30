import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { Effort, Priority } from '@/features/board/types'
import { baseEntitySchema } from '@/server/db/helpers'

export const notes = sqliteTable('notes', {
    ...baseEntitySchema(),
    text: text('text'),
    priority: integer('priority').$type<Priority>(),
    effort: text('effort').$type<Effort>(),
})
