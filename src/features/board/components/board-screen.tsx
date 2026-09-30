import { BoardControls } from '@/features/board/components/board-controls'
import { BoardProvider } from '@/features/board/components/board-context'
import { BoardTable } from '@/features/board/components/board-table'
import { Explanation } from '@/features/board/components/explanation'
import { loadBoard } from '@/features/board/queries'
import { loadNotifications } from '@/features/notifications/queries'
import { AppHeader } from '@/features/shell/app-header'
import { SyncPanel } from '@/features/sync/components/sync-panel'
import { requireWorkspace } from '@/server/session'

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
}

export async function BoardScreen({ searchParams }: Props) {
    const params = await searchParams
    const { viewer, workspace } = await requireWorkspace('/board')
    const view = single(params.view) === 'archive' ? 'archive' : 'active'
    const filter = (single(params.repo) ?? '').split(',').filter(Boolean)
    const mine = single(params.mine) === '1'
    const [board, notifications] = await Promise.all([
        loadBoard(
            { id: workspace.id, name: workspace.name },
            { id: viewer.id, name: viewer.name, role: workspace.role },
            { view, filter, mine },
        ),
        loadNotifications(viewer.id, workspace.id),
    ])
    const focus = single(params.pr) ?? null
    return (
        <>
            <AppHeader viewer={viewer} workspace={workspace} notifications={notifications} current="board" />
            <header className="dots">
                <span className="context">
                    <span className="live" aria-hidden="true" />
                    {board.repositories.length} {board.repositories.length === 1 ? 'repository' : 'repositories'} ·{' '}
                    {board.prs.length} {board.view === 'archive' ? 'gesloten' : 'open'} PR&apos;s
                </span>
                <h1>Pull requests van {workspace.name}</h1>
                <p className="lede">
                    Elke rij klapt open voor de review threads, de diff en de notitie. Reacties en notities blijven op
                    dit bord en gaan niet naar de provider.
                </p>
            </header>
            <SyncPanel repositories={board.repositories} role={workspace.role} />
            <BoardProvider board={board}>
                <BoardControls board={board} />
                <section>
                    <BoardTable
                        key={`${board.view}-${board.filter.join(',')}-${board.mine}`}
                        board={board}
                        focus={focus}
                    />
                </section>
            </BoardProvider>
            <Explanation />
        </>
    )
}
