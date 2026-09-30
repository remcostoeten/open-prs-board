import { connection } from 'next/server'

import { listNotes } from '@/server/notes'

export async function GET() {
    await connection()
    return Response.json(await listNotes(), { headers: { 'cache-control': 'no-store' } })
}
