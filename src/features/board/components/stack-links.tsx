'use client'

import { type RefObject, useEffect, useRef } from 'react'

const NS = 'http://www.w3.org/2000/svg'

type Props = {
    wrap: RefObject<HTMLDivElement | null>
    layout: string
}

function curve(points: number[]) {
    const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = points.map((value) => value.toFixed(1))
    return `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`
}

function line(d: string, className: string, title?: string) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('class', className)
    path.setAttribute('marker-end', 'url(#stack-arrow)')
    if (title !== undefined) {
        const tooltip = document.createElementNS(NS, 'title')
        tooltip.textContent = title
        path.append(tooltip)
    }
    return path
}

function isVisible(node: Element | null | undefined): node is HTMLElement {
    return node instanceof HTMLElement && node.offsetParent !== null
}

function draw(wrap: HTMLDivElement, svg: SVGSVGElement, group: SVGGElement) {
    const table = wrap.querySelector('table')
    if (!table) return
    const base = wrap.getBoundingClientRect()
    svg.setAttribute('width', String(table.offsetWidth))
    svg.setAttribute('height', String(table.offsetHeight))
    const paths: SVGPathElement[] = []

    const steps = [...table.querySelectorAll('tbody .step')].filter(isVisible)
    steps.forEach((step, index) => {
        const next = steps[index + 1]
        if (!next) return
        const detail = step.closest('tr')?.nextElementSibling
        if (detail instanceof HTMLElement && detail.classList.contains('detail') && !detail.hidden) return
        const a = step.getBoundingClientRect()
        const b = next.getBoundingClientRect()
        const x1 = a.left + a.width / 2 - base.left + wrap.scrollLeft
        const x2 = b.left + b.width / 2 - base.left + wrap.scrollLeft
        const y1 = a.bottom - base.top + 5
        const y2 = b.top - base.top - 11
        if (y2 - y1 < 10) return
        const middle = (y1 + y2) / 2
        paths.push(line(curve([x1, y1, x1, middle, x2, middle, x2, y2]), 'stack-line'))
    })

    table.querySelectorAll<HTMLElement>('tr.row[data-link]').forEach((row) => {
        const target = table.querySelector(`tr.row[data-pr="${row.dataset.link}"]`)
        const from = row.querySelector('.prlink')
        const to = target?.querySelector('.prlink')
        if (!isVisible(from) || !isVisible(to)) return
        const a = from.getBoundingClientRect()
        const b = to.getBoundingClientRect()
        const x = Math.min(a.left, b.left) - base.left + wrap.scrollLeft - 6
        const y1 = a.top + a.height / 2 - base.top
        const y2 = b.top + b.height / 2 - base.top
        const bend = x - 26
        paths.push(
            line(
                curve([x, y1, bend, y1 + 24, bend, y2 - 24, x - 2, y2]),
                'stack-line link-line',
                row.dataset.linkTitle ?? '',
            ),
        )
    })

    group.replaceChildren(...paths)
}

export function StackLinks({ wrap, layout }: Props) {
    const svg = useRef<SVGSVGElement>(null)
    const group = useRef<SVGGElement>(null)

    useEffect(() => {
        const host = wrap.current
        const table = host?.querySelector('table')
        if (!host || !table) return
        let frame = 0
        function schedule() {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
                if (host && svg.current && group.current) draw(host, svg.current, group.current)
            })
        }
        const observer = new ResizeObserver(schedule)
        observer.observe(table)
        window.addEventListener('resize', schedule)
        document.fonts?.ready.then(schedule).catch((error: Error) => console.warn(error))
        schedule()
        return () => {
            cancelAnimationFrame(frame)
            observer.disconnect()
            window.removeEventListener('resize', schedule)
        }
    }, [wrap, layout])

    return (
        <svg ref={svg} className="stack-links" aria-hidden="true">
            <defs>
                <marker
                    id="stack-arrow"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="10"
                    markerHeight="10"
                    orient="auto-start-reverse"
                    markerUnits="userSpaceOnUse"
                >
                    <path d="M3.5 1.5 L7 5 L3.5 8.5" className="stack-head" />
                </marker>
            </defs>
            <g ref={group} />
        </svg>
    )
}
