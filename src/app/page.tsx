import { BoardTable } from '@/features/board/components/board-table'
import { CanWriteProvider } from '@/features/board/components/editable'
import { EditorAccess } from '@/features/board/components/editor-access'
import { Explanation } from '@/features/board/components/explanation'
import { listNotes } from '@/server/notes'
import { canEdit, isEditingEnabled } from '@/server/session'
import { loadBoard, loadReview } from '@/server/snapshot'

const fetchedFormat = new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
})

const fetchedDay = new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
})

export default async function Page() {
    const [board, review, notes] = await Promise.all([loadBoard(), loadReview(), listNotes()])
    const fetchedAt = new Date(board.fetchedAt)

    return (
        <CanWriteProvider value={canEdit()}>
            <main>
                <header className="dots">
                    <span className="context">
                        <span className="live" aria-hidden="true" />
                        {board.repository} · auteur {board.author} · bijgewerkt {fetchedFormat.format(fetchedAt)}
                    </span>
                    <h1>Alle open pull requests van Remco</h1>
                    <p className="lede">
                        Alle open PR&apos;s van Remco. Elke rij klapt open: klik op de rij of op <b>Details</b> voor de
                        review threads, de diff en mijn notitie. Een oranje <b>Notitie</b>-label betekent dat er een
                        bericht voor Daan bij die PR staat; de eerste regels staan alvast in de rij. Boven de APP-stack
                        staat een notitie voor de stack als geheel.
                    </p>
                    <EditorAccess enabled={isEditingEnabled()} />
                </header>

                <section>
                    <h2>Pull requests</h2>
                    <BoardTable board={board} review={review} initialNotes={notes} />
                </section>

                <Explanation />

                <footer className="dots">
                    Opgehaald op {fetchedDay.format(fetchedAt)} uit Bitbucket (PR&apos;s, reviewers, build statussen per
                    commit) en Jira. Test envs zijn gecontroleerd met een live request per branch host.
                </footer>
            </main>
        </CanWriteProvider>
    )
}
