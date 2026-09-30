import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
    title: 'Open PRs board',
    description: 'Open pull requests met review threads, diffs en notities voor de reviewer.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="nl">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap"
                />
            </head>
            <body>{children}</body>
        </html>
    )
}
