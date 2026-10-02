import { Suspense } from 'react'

import { BoardScreen } from '@/features/board/components/board-screen'

export default function BoardPage({ searchParams }: PageProps<'/board'>) {
    return (
        <main>
            <Suspense fallback={<div className="loading page-loading" />}>
                <BoardScreen searchParams={searchParams} />
            </Suspense>
        </main>
    )
}
