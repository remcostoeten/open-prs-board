import Link from 'next/link'

import { signOutAction } from '@/features/auth/actions'
import { NotificationBell } from '@/features/notifications/notification-bell'
import type { NotificationItem } from '@/features/notifications/queries'
import type { Viewer, Workspace } from '@/server/session'

type Props = {
    viewer: Viewer
    workspace: Workspace
    notifications: NotificationItem[]
    current: 'board' | 'settings'
}

export function AppHeader({ viewer, workspace, notifications, current }: Props) {
    return (
        <nav className="app-nav">
            <span className="workspace-name">{workspace.name}</span>
            <Link href="/board" aria-current={current === 'board' ? 'page' : undefined}>
                Bord
            </Link>
            <Link href="/settings" aria-current={current === 'settings' ? 'page' : undefined}>
                Instellingen
            </Link>
            <span className="nav-space" />
            <NotificationBell items={notifications} />
            <span className="who-am-i" title={viewer.email}>
                {viewer.name} · {workspace.role}
            </span>
            <form action={signOutAction}>
                <button type="submit">Uitloggen</button>
            </form>
        </nav>
    )
}
