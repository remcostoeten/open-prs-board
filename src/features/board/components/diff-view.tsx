import type { ReactNode } from 'react'

import { type DiffRow, parseDiff } from '@/features/board/diff'
import type { DiffFile, ReviewThread, ThreadFix } from '@/features/board/types'
import type { Nullable } from '@/store/semantic'

export function DiffLine({
    row,
    hit = false,
    onComment,
}: {
    row: DiffRow
    hit?: boolean
    onComment?: (line: number) => void
}) {
    if (row.kind === 'hunk')
        return (
            <tr className="h">
                <td className="hunk" colSpan={4}>
                    <span>{row.label}</span>
                    {row.context && <span className="ctx">{row.context}</span>}
                </td>
            </tr>
        )
    return (
        <tr className={[row.tone, hit ? 'hit' : ''].filter(Boolean).join(' ') || undefined}>
            <td className="n o">{row.old ?? ''}</td>
            <td className="n">
                {onComment && row.new !== null ? (
                    <button
                        type="button"
                        className="line-comment"
                        title={`Opmerking bij regel ${row.new}`}
                        onClick={() => row.new !== null && onComment(row.new)}
                    >
                        {row.new}
                    </button>
                ) : (
                    (row.new ?? '')
                )}
            </td>
            <td className="s">{row.sign}</td>
            <td>{row.text}</td>
        </tr>
    )
}

export function Code({ added = false, children }: { added?: boolean; children: ReactNode }) {
    return (
        <div className={added ? 'code only-new' : 'code'}>
            <table>
                <tbody>{children}</tbody>
            </table>
        </div>
    )
}

function Excerpt({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
    return (
        <div className="tdiff">
            <div className="tdiff-head">
                <b>{title}</b>
                <span>{detail}</span>
            </div>
            {children}
        </div>
    )
}

export function DiffExcerpt({ file, line }: { file: DiffFile; line: Nullable<number> }) {
    const rows = parseDiff(file.diff)
    const at = line ? rows.findIndex((row) => row.kind === 'line' && row.new === line) : -1
    const pick = at >= 0 ? rows.slice(Math.max(0, at - 8), at + 7) : rows
    const detail =
        at >= 0
            ? `regel ${line}`
            : line
              ? `regel ${line} zit niet meer in de diff, hieronder het hele bestand`
              : 'hele bestand'
    return (
        <Excerpt title={file.path.split('/').pop() ?? file.path} detail={detail}>
            <Code added={file.status === 'added'}>
                {pick.map((row, index) => (
                    <DiffLine key={index} row={row} hit={row === rows[at]} />
                ))}
            </Code>
        </Excerpt>
    )
}

export function FixBlock({ thread, fix }: { thread: ReviewThread; fix: ThreadFix }) {
    if (fix.binary)
        return (
            <div className="fix-wrap">
                <div className="msg">Binair bestand, opnieuw aangeleverd in {fix.toCommit}.</div>
            </div>
        )
    const excerpt = fix.excerpt
    const low = excerpt?.from || thread.line || 0
    const high = excerpt?.to || thread.line || 0
    const range =
        excerpt?.from && excerpt.from !== excerpt.to ? `regel ${excerpt.from}–${excerpt.to}` : `regel ${thread.line}`
    return (
        <div className="fix-wrap">
            {excerpt && (
                <Excerpt
                    title={`Toen ${thread.who} dit schreef`}
                    detail={`${fix.fromCommit} · ${range}, de gemarkeerde regels zijn wat ${thread.who} selecteerde`}
                >
                    <Code>
                        {excerpt.lines.map((text, index) => {
                            const line = excerpt.start + index
                            return (
                                <tr key={line} className={line >= low && line <= high ? 'hit' : undefined}>
                                    <td className="n o"></td>
                                    <td className="n">{line}</td>
                                    <td className="s"></td>
                                    <td>{text}</td>
                                </tr>
                            )
                        })}
                    </Code>
                </Excerpt>
            )}
            <Excerpt
                title="Wat ik daarna veranderde"
                detail={`${fix.fromCommit} → ${fix.toCommit}, hele bestand, dus ook wijzigingen die via master binnenkwamen`}
            >
                {fix.deleted ? (
                    <div className="msg">Bestand is verwijderd in {fix.toCommit}.</div>
                ) : !fix.diff ? (
                    <div className="msg">Geen wijzigingen aan dit bestand sinds de comment.</div>
                ) : (
                    <Code>
                        {parseDiff(fix.diff).map((row, index) => (
                            <DiffLine key={index} row={row} />
                        ))}
                    </Code>
                )}
            </Excerpt>
        </div>
    )
}
