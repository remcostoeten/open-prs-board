'use client'

import Link from 'next/link'
import { useState } from 'react'

import { markNotificationsReadAction } from '@/features/board/actions'
import { formatDateTime } from '@/features/board/format'
import type { NotificationItem } from '@/features/notifications/queries'

type Props = {
    items: NotificationItem[]
}

export function NotificationBell({ items }: Props) {
    const [animate, setAnimate] = useState(false)
    const [open, setOpen] = useState(false)
    const unread = items.filter((item) => !item.read).length
    return (
        <details className="bell" data-motion={animate} onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary aria-label={`${unread} ongelezen meldingen`} onClick={(event) => setAnimate(event.detail > 0)}>
                Meldingen
                {unread > 0 && <span className="unread">{unread}</span>}
            </summary>
            <div className="bell-panel" inert={!open}>
                {items.length === 0 ? (
                    <p className="note-empty">Nog geen meldingen. Je krijgt er een als iemand je noemt met @naam.</p>
                ) : (
                    <ul>
                        {items.map((item) => (
                            <li key={item.id} className={item.read ? 'read' : ''}>
                                <Link href={item.pullRequestId ? `/board?pr=${item.pullRequestId}` : '/board'}>
                                    <b>{item.actor}</b> noemde je bij {item.number ? `#${item.number} ` : ''}
                                    {item.title}
                                </Link>
                                <time>{formatDateTime(item.at)}</time>
                            </li>
                        ))}
                    </ul>
                )}
                {unread > 0 && (
                    <button type="button" onClick={() => void markNotificationsReadAction()}>
                        Alles gelezen
                    </button>
                )}
            </div>
        </details>
    )
}
