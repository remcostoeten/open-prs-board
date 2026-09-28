;(() => {
    const wrap = document.querySelector('.table-wrap')
    const table = wrap?.querySelector('table')
    if (!wrap || !table) return
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.classList.add('stack-links')
    svg.setAttribute('aria-hidden', 'true')
    const defs = document.createElementNS(NS, 'defs')
    const marker = document.createElementNS(NS, 'marker')
    marker.id = 'stack-arrow'
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', '7')
    marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '10')
    marker.setAttribute('markerHeight', '10')
    marker.setAttribute('orient', 'auto-start-reverse')
    marker.setAttribute('markerUnits', 'userSpaceOnUse')
    const head = document.createElementNS(NS, 'path')
    head.setAttribute('d', 'M3.5 1.5 L7 5 L3.5 8.5')
    head.setAttribute('class', 'stack-head')
    marker.append(head)
    defs.append(marker)
    svg.append(defs)
    const group = document.createElementNS(NS, 'g')
    svg.append(group)
    wrap.append(svg)

    function draw() {
        const steps = [...table.querySelectorAll('tbody .step')].filter((s) => s.offsetParent)
        const base = wrap.getBoundingClientRect()
        svg.setAttribute('width', table.offsetWidth)
        svg.setAttribute('height', table.offsetHeight)
        group.replaceChildren()
        for (let i = 0; i < steps.length - 1; i++) {
            const next = steps[i].closest('tr')?.nextElementSibling
            if (next?.classList.contains('detail') && !next.hidden) continue
            const a = steps[i].getBoundingClientRect()
            const b = steps[i + 1].getBoundingClientRect()
            const x1 = a.left + a.width / 2 - base.left + wrap.scrollLeft
            const x2 = b.left + b.width / 2 - base.left + wrap.scrollLeft
            const y1 = a.bottom - base.top + 5
            const y2 = b.top - base.top - 11
            if (y2 - y1 < 10) continue
            const my = (y1 + y2) / 2
            const path = document.createElementNS(NS, 'path')
            path.setAttribute(
                'd',
                `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
            )
            path.setAttribute('class', 'stack-line')
            path.setAttribute('marker-end', 'url(#stack-arrow)')
            group.append(path)
        }
        table.querySelectorAll('tr.row[data-link]').forEach((row) => {
            const target = table.querySelector(`tr.row[data-pr="${row.dataset.link}"]`)
            const from = row.querySelector('.prlink'),
                to = target?.querySelector('.prlink')
            if (!from || !to || !from.offsetParent || !to.offsetParent) return
            const a = from.getBoundingClientRect(),
                b = to.getBoundingClientRect()
            const x = Math.min(a.left, b.left) - base.left + wrap.scrollLeft - 6
            const y1 = a.top + a.height / 2 - base.top
            const y2 = b.top + b.height / 2 - base.top
            const bend = x - 26
            const path = document.createElementNS(NS, 'path')
            path.setAttribute(
                'd',
                `M${x.toFixed(1)} ${y1.toFixed(1)} C${bend.toFixed(1)} ${(y1 + 24).toFixed(1)} ${bend.toFixed(1)} ${(y2 - 24).toFixed(1)} ${(x - 2).toFixed(1)} ${y2.toFixed(1)}`,
            )
            path.setAttribute('class', 'stack-line link-line')
            path.setAttribute('marker-end', 'url(#stack-arrow)')
            const title = document.createElementNS(NS, 'title')
            title.textContent = row.dataset.linkTitle || ''
            path.append(title)
            group.append(path)
        })
    }

    let queued = false
    function schedule() {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            draw()
        })
    }
    new ResizeObserver(schedule).observe(table)
    window.addEventListener('resize', schedule)
    document.fonts?.ready.then(schedule)
    schedule()
})()
