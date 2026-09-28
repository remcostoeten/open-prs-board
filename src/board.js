import { noop } from './shared/helpers/noop.js'

;(() => {
    const cache = new Map()
    const review = JSON.parse(document.getElementById('review-data').textContent)
    const STATUS = { open: 'Open, jij bent aan zet', recheck: 'Daan moet opnieuw kijken', resolved: 'Resolved' }
    const cols = document.querySelector('thead tr').children.length

    function load(id) {
        if (!cache.has(id))
            cache.set(
                id,
                fetch(`diffs/${id}.json`).then((r) => {
                    if (!r.ok) throw new Error(r.status)
                    return r.json()
                }),
            )
        return cache.get(id)
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag)
        if (cls) n.className = cls
        if (text != null) n.textContent = text
        return n
    }

    function parseDiff(diff) {
        const rows = []
        let o = 0,
            n = 0
        for (const text of diff.split('\n')) {
            if (text === '') continue
            if (text.startsWith('@@')) {
                const m = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\s?(.*)/.exec(text)
                if (m) {
                    o = +m[1]
                    n = +m[3]
                }
                const len = m ? +(m[4] ?? 1) : 0
                const label = !m
                    ? text
                    : +m[1] === 0 && m[2] === '0'
                      ? `Nieuw bestand · regel 1–${len}`
                      : len
                        ? `Regel ${n}–${n + len - 1}`
                        : `Regel ${n}`
                rows.push({ cls: 'h', label, ctx: m?.[5] || '' })
            } else if (text.startsWith('+')) rows.push({ cls: 'a', o: '', n: n++, sign: '+', text: text.slice(1) })
            else if (text.startsWith('-')) rows.push({ cls: 'r', o: o++, n: '', sign: '−', text: text.slice(1) })
            else if (text.startsWith('\\')) rows.push({ cls: '', o: '', n: '', sign: '', text })
            else rows.push({ cls: '', o: o++, n: n++, sign: '', text: text.slice(1) })
        }
        return rows
    }

    function diffRow(r) {
        const tr = el('tr', r.cls)
        if (r.cls === 'h') {
            const td = el('td', 'hunk')
            td.colSpan = 4
            td.append(el('span', null, r.label))
            if (r.ctx) td.append(el('span', 'ctx', r.ctx))
            tr.append(td)
            return tr
        }
        tr.append(
            el('td', 'n o', String(r.o)),
            el('td', 'n', String(r.n)),
            el('td', 's', r.sign),
            el('td', null, r.text),
        )
        return tr
    }

    function codeBox(file) {
        const wrap = el('div', 'code')
        if (file.status === 'added') wrap.classList.add('only-new')
        return wrap
    }

    function renderDiff(file, host, threads = []) {
        if (file.binary) {
            threads.forEach((th) => host.append(threadCard(th, true)))
            host.append(el('div', 'msg', 'Binair bestand, geen tekst-diff.'))
            return
        }
        if (!file.diff) {
            threads.forEach((th) => host.append(threadCard(th, true)))
            host.append(el('div', 'msg', 'Geen inhoudelijke wijzigingen (alleen mode of rename).'))
            return
        }
        const wrap = codeBox(file)
        const t = el('table')
        for (const r of parseDiff(file.diff)) {
            t.append(diffRow(r))
            if (r.n !== '' && r.n != null) {
                const hits = threads.filter((th) => th.line === r.n)
                hits.forEach((th) => {
                    th.placed = true
                    t.append(inlineThread(th))
                })
            }
        }
        wrap.append(t)
        const loose = threads.filter((th) => !th.placed)
        loose.forEach((th) => host.append(threadCard(th, true)))
        host.append(wrap)
        if (file.truncated)
            host.append(el('div', 'msg', 'Diff afgekapt op 150 KB. Open de PR in Bitbucket voor de rest.'))
    }

    function fmtDate(iso) {
        return new Date(iso).toLocaleString('nl-NL', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Amsterdam',
        })
    }

    function statusNote(th) {
        if (th.status === 'resolved') return 'Thread staat op resolved in Bitbucket.'
        if (th.status === 'open')
            return `Nog geen reactie van Remco en geen wijziging aan dit bestand sinds de comment van ${th.who}.`
        const bits = []
        if (th.changed) bits.push(`bestand gewijzigd in ${th.changed} op ${fmtDate(th.changedAt)}`)
        if (th.replied) bits.push('Remco heeft geantwoord')
        return `${bits.join(' en ').replace(/^./, (c) => c.toUpperCase())} na de comment van ${th.who}. ${th.who} is aan zet om opnieuw te kijken.`
    }

    function diffExcerpt(file, line) {
        const rows = parseDiff(file.diff)
        const at = line ? rows.findIndex((r) => r.n === line) : -1
        const pick = at >= 0 ? rows.slice(Math.max(0, at - 8), at + 7) : rows
        const wrap = el('div', 'tdiff')
        const head = el('div', 'tdiff-head')
        head.append(
            el('b', null, file.path.split('/').pop()),
            el(
                'span',
                null,
                at >= 0
                    ? `regel ${line}`
                    : line
                      ? `regel ${line} zit niet meer in de diff, hieronder het hele bestand`
                      : 'hele bestand',
            ),
        )
        wrap.append(head)
        const code = codeBox(file)
        const t = el('table')
        pick.forEach((r) => {
            const tr = diffRow(r)
            if (r === rows[at]) tr.classList.add('hit')
            t.append(tr)
        })
        code.append(t)
        wrap.append(code)
        return wrap
    }

    function plainRow(n, text, hit) {
        const tr = el('tr', hit ? 'hit' : '')
        tr.append(el('td', 'n o', ''), el('td', 'n', String(n)), el('td', 's', ''), el('td', null, text))
        return tr
    }

    function fixBlock(th, fix) {
        const wrap = el('div', 'fix-wrap')
        if (fix.binary) {
            wrap.append(el('div', 'msg', `Binair bestand, opnieuw aangeleverd in ${fix.now}.`))
            return wrap
        }
        if (fix.excerpt) {
            const then = el('div', 'tdiff')
            const head = el('div', 'tdiff-head')
            const range =
                fix.excerpt.from && fix.excerpt.from !== fix.excerpt.to
                    ? `regel ${fix.excerpt.from}–${fix.excerpt.to}`
                    : `regel ${th.line}`
            head.append(
                el('b', null, `Toen ${th.who} dit schreef`),
                el('span', null, `${fix.then} · ${range}, de gemarkeerde regels zijn wat ${th.who} selecteerde`),
            )
            then.append(head)
            const code = el('div', 'code')
            const t = el('table')
            const lo = fix.excerpt.from || th.line,
                hi = fix.excerpt.to || th.line
            fix.excerpt.lines.forEach((text, i) => {
                const n = fix.excerpt.start + i
                t.append(plainRow(n, text, n >= lo && n <= hi))
            })
            code.append(t)
            then.append(code)
            wrap.append(then)
        }
        const since = el('div', 'tdiff')
        const head = el('div', 'tdiff-head')
        head.append(
            el('b', null, 'Wat ik daarna veranderde'),
            el('span', null, `${fix.then} → ${fix.now}, hele bestand, dus ook wijzigingen die via master binnenkwamen`),
        )
        since.append(head)
        if (fix.deleted) since.append(el('div', 'msg', `Bestand is verwijderd in ${fix.now}.`))
        else if (!fix.diff) since.append(el('div', 'msg', 'Geen wijzigingen aan dit bestand sinds de comment.'))
        else {
            const code = el('div', 'code')
            const t = el('table')
            parseDiff(fix.diff).forEach((r) => t.append(diffRow(r)))
            code.append(t)
            since.append(code)
        }
        wrap.append(since)
        return wrap
    }

    function threadCard(th, compact, file) {
        const card = el('div', `thread s-${th.status}`)
        const top = el('div', 'thread-top')
        top.append(el('span', `tstat ${th.status}`, STATUS[th.status].replace('Daan', th.who)))
        const mine = th.messages.filter((m) => m.who === 'Remco')
        if (mine.length) {
            const badge = el('span', 'tstat replied', `✓ Remco heeft gereageerd · ${fmtDate(mine[mine.length - 1].at)}`)
            badge.title = 'Remco heeft op deze opmerking geantwoord. Scroll naar het oranje bericht.'
            top.append(badge)
        }
        const where = el(
            'span',
            'twhere',
            th.path
                ? `${th.path}${th.line ? `:${th.lineFrom ? `${th.lineFrom}–` : ''}${th.line}` : ''}`
                : 'Algemene comment',
        )
        if (th.path && !compact) {
            const jump = el('button', 'tjump')
            jump.type = 'button'
            jump.append(where)
            jump.title = 'Open dit bestand in de diff hieronder'
            jump.addEventListener('click', () => {
                const panel = card.closest('.files-panel')
                const target = [...panel.querySelectorAll('details.file')].find((d) => d.dataset.path === th.path)
                if (!target) {
                    jump.classList.add('missing')
                    jump.title = 'Dit bestand zit niet in de huidige diff'
                    return
                }
                target.open = true
                requestAnimationFrame(() => {
                    const hit = target.querySelector(`tr.thread-row[data-thread="${th.id}"]`) || target
                    hit.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
            })
            top.append(jump)
        } else top.append(where)
        const link = el('a', 'tlink', 'Bitbucket ↗')
        link.href = th.url
        link.target = '_blank'
        link.rel = 'noopener'
        top.append(link)
        card.append(top)
        if (th.siblings?.length) {
            const same = el('div', 'tsame')
            same.append(el('span', null, `Zelfde thread op ${th.siblings.length + 1} bestanden:`))
            const list = el('ul')
            ;[th, ...th.siblings].forEach((t) => {
                const li = el('li')
                const a = el('a', null, t.path)
                a.href = t.url
                a.target = '_blank'
                a.rel = 'noopener'
                li.append(a)
                list.append(li)
            })
            same.append(list)
            card.append(same)
        }
        const msgs = el('div', 'tmsgs')
        th.messages.forEach((m) => {
            const row = el('div', `tmsg ${m.who === 'Remco' ? 'me' : ''}`)
            const by = el('span', 'tby')
            by.append(el('b', null, m.who), el('time', null, fmtDate(m.at)))
            row.append(el('span', 'tav', m.who.slice(0, 1)), by, el('p', null, m.text))
            msgs.append(row)
        })
        card.append(msgs)
        const fix = review.fixes?.[th.id]
        if (fix) card.append(fixBlock(th, fix))
        else if (file?.diff) card.append(diffExcerpt(file, th.line))
        card.append(el('p', `tnote ${th.replied ? 'replied' : ''}`, statusNote(th)))
        return card
    }

    function groupThreads(threads) {
        const groups = new Map()
        threads.forEach((th) => {
            const key = JSON.stringify([th.status, th.replied, th.messages.map((m) => [m.who, m.text])])
            const group = groups.get(key)
            if (group) group.siblings.push(th)
            else groups.set(key, { ...th, siblings: [] })
        })
        return [...groups.values()]
    }

    function inlineThread(th) {
        const tr = el('tr', 'thread-row')
        tr.dataset.thread = th.id
        const td = el('td')
        td.colSpan = 4
        td.append(threadCard(th, true))
        tr.append(td)
        return tr
    }

    function fileNode(file, max, threads = []) {
        const d = el('details', 'file')
        d.dataset.path = file.path
        const s = el('summary')
        s.append(el('span', `st ${file.status}`, file.status))
        const p = el('span', 'fpath')
        const bdi = el('bdi')
        const cut = file.path.lastIndexOf('/')
        if (cut >= 0) bdi.append(el('span', 'dir', file.path.slice(0, cut + 1)))
        bdi.append(document.createTextNode(file.path.slice(cut + 1)))
        if (file.old) bdi.append(el('span', 'dir', `  ← ${file.old}`))
        p.title = file.path
        p.append(bdi)
        s.append(p)
        const st = el('span', 'fstat')
        if (threads.length) {
            const worst = ['open', 'recheck', 'resolved'].find((k) => threads.some((t) => t.status === k))
            const mark = el('span', `cmark ${worst}`, `${threads.length} comment${threads.length === 1 ? '' : 's'}`)
            mark.title = threads.map((t) => `${STATUS[t.status]}${t.line ? ` (regel ${t.line})` : ''}`).join('\n')
            st.append(mark, document.createTextNode(' '))
            const answered = threads.filter((t) => t.replied).length
            if (answered) {
                const rep = el(
                    'span',
                    'cmark replied',
                    answered === threads.length ? '✓ beantwoord' : `✓ ${answered} beantwoord`,
                )
                rep.title = 'Remco heeft hierop geantwoord'
                st.append(rep, document.createTextNode(' '))
            }
        }
        st.append(el('span', 'add', `+${file.add}`), document.createTextNode(' '), el('span', 'rem', `−${file.rem}`))
        s.append(st)
        const bar = el('span', 'bar')
        const total = file.add + file.rem
        const w = Math.max(total / max, total ? 0.06 : 0) * 100
        const ai = el('i', 'a'),
            ri = el('i', 'r')
        ai.style.width = `${total ? (file.add / total) * w : 0}%`
        ri.style.width = `${total ? (file.rem / total) * w : 0}%`
        bar.append(ai, ri)
        s.append(bar)
        d.append(s)
        d.addEventListener('toggle', () => {
            if (d.open && !d.dataset.rendered) {
                d.dataset.rendered = '1'
                renderDiff(
                    file,
                    d,
                    threads.map((t) => ({ ...t })),
                )
            }
        })
        return d
    }

    function renderPanel(id, files, host) {
        host.replaceChildren()
        const head = el('div', 'files-head')
        const add = files.reduce((t, f) => t + f.add, 0),
            rem = files.reduce((t, f) => t + f.rem, 0)
        head.append(
            el(
                'span',
                null,
                `${files.length} gewijzigd${files.length === 1 ? ' bestand' : 'e bestanden'} · +${add.toLocaleString('en')} −${rem.toLocaleString('en')}`,
            ),
        )
        const expand = el('button', null, 'Alles openklappen')
        const collapse = el('button', null, 'Alles dichtklappen')
        expand.type = collapse.type = 'button'
        expand.addEventListener('click', () =>
            host.querySelectorAll('details.file').forEach((d) => {
                d.open = true
            }),
        )
        collapse.addEventListener('click', () =>
            host.querySelectorAll('details.file').forEach((d) => {
                d.open = false
            }),
        )
        if (files.length <= 60) head.append(expand)
        head.append(collapse)
        const threads = review.threads[id] || []
        const rv = review.review[id]
        if (rv && (threads.length || rv.state)) {
            const box = el('div', 'review-box')
            const h = el('div', 'files-head')
            const label =
                { changes_requested: 'heeft changes requested', approved: 'heeft approved, klaar' }[rv.state] ||
                'heeft nog niet gereviewd'
            h.append(
                el(
                    'span',
                    null,
                    `${rv.who} ${label} · ${threads.length} review thread${threads.length === 1 ? '' : 's'}`,
                ),
            )
            box.append(h)
            const order = { open: 0, recheck: 1, resolved: 2 }
            groupThreads(threads)
                .toSorted((a, b) => order[a.status] - order[b.status])
                .forEach((th) =>
                    box.append(
                        threadCard(th, false, th.path && files.find((f) => f.path === th.path || f.old === th.path)),
                    ),
                )
            host.append(box)
        }
        host.append(head)
        const max = Math.max(1, ...files.map((f) => f.add + f.rem))
        const frag = document.createDocumentFragment()
        files.forEach((f) =>
            frag.append(
                fileNode(
                    f,
                    max,
                    threads.filter((t) => t.path === f.path || t.path === f.old),
                ),
            ),
        )
        host.append(frag)
    }

    function toggle(row) {
        const open = row.getAttribute('aria-expanded') === 'true'
        const next = row.nextElementSibling
        if (open) {
            row.setAttribute('aria-expanded', 'false')
            if (next?.classList.contains('detail')) next.hidden = true
            return
        }
        row.setAttribute('aria-expanded', 'true')
        if (next?.classList.contains('detail')) {
            next.hidden = false
            return
        }
        const tr = el('tr', 'detail')
        const td = el('td')
        td.colSpan = cols
        const panel = el('div', 'files-panel')
        panel.append(el('div', 'loading'))
        const id = row.dataset.pr
        const noteHost = el('div', 'note-host')
        noteHost.dataset.pr = id
        renderNote(noteHost)
        td.append(noteHost, panel)
        tr.append(td)
        row.after(tr)
        load(id)
            .then((files) => renderPanel(id, files, panel))
            .catch(() => {
                cache.delete(id)
                panel.replaceChildren(
                    el(
                        'div',
                        'msg err',
                        'Kon de gewijzigde bestanden niet laden. Klap de rij dicht en weer open om het opnieuw te proberen.',
                    ),
                )
            })
    }

    const notes = new Map()
    const notesSnapshot = (() => {
        try {
            return JSON.parse(document.getElementById('notes-snapshot')?.textContent || '{}')
        } catch {
            return {}
        }
    })()
    Object.entries(notesSnapshot).forEach(([id, v]) => notes.set(id, v))
    let notesDb = null
    let canWrite = false
    let notesReady = false

    function fmtNoteDate(iso) {
        return iso
            ? new Date(iso).toLocaleString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Amsterdam',
              })
            : ''
    }

    const EFFORT = {
        quick: 'Very fast · 1 min',
        short: 'Quick · 5 min',
        normal: 'Normal · 15 min',
        deep: 'Long · 30+ min',
    }

    async function saveDoc(id, patch) {
        const ref = notesDb.collection('notes').doc(id)
        const next = { ...notes.get(id), ...patch, updatedAt: new Date().toISOString() }
        if (!next.text) delete next.text
        if (!next.effort) delete next.effort
        if (!next.priority) delete next.priority
        if (!next.text && !next.effort && !next.priority) {
            await ref.delete()
            return
        }
        await ref.set(next)
    }

    const PRIO = { 1: '1 · eerst', 2: '2', 3: '3', 4: '4', 5: '5 · later' }
    const SORT_KEY = 'open-prs-sort'
    let sortMode = 'priority'
    try {
        sortMode = localStorage.getItem(SORT_KEY) || 'priority'
    } catch {
        sortMode = 'priority'
    }

    function renderPrio(row) {
        const td = row.querySelector('td.prio')
        if (!td) return
        const id = row.dataset.pr
        const current = notes.get(id)?.priority || ''
        if (canWrite) {
            let sel = td.querySelector('select')
            if (!sel) {
                sel = el('select', 'effort-select prio-select')
                sel.title = 'Prioriteit voor Daan: 1 pakt hij als eerste op'
                sel.setAttribute('aria-label', `Prioriteit voor PR ${id}`)
                sel.append(new Option('Prio', ''))
                Object.entries(PRIO).forEach(([k, v]) => sel.append(new Option(v, k)))
                sel.addEventListener('change', async () => {
                    sel.disabled = true
                    try {
                        await saveDoc(id, { priority: sel.value ? Number(sel.value) : '' })
                    } catch {
                        sel.value = notes.get(id)?.priority || ''
                    }
                    sel.disabled = false
                })
                td.replaceChildren(sel)
            }
            if (document.activeElement !== sel) sel.value = current
            sel.className = `effort-select prio-select ${current ? `set p-${current}` : ''}`
        } else if (current) {
            td.replaceChildren(el('span', `pill p-${current}`, `P${current}`))
        } else td.replaceChildren()
    }

    function groupRows(head) {
        const rows = []
        for (let n = head.nextElementSibling; n && !n.classList.contains('group-head'); n = n.nextElementSibling) {
            if (n.classList.contains('row')) rows.push(n)
        }
        return rows
    }

    function sortGroups() {
        document.querySelectorAll('tr.group-head [data-sort]').forEach((btn) => {
            const head = btn.closest('tr.group-head')
            const rows = groupRows(head)
            const anyPrio = rows.some((r) => notes.get(r.dataset.pr)?.priority)
            btn.hidden = !anyPrio
            btn.textContent = sortMode === 'priority' ? 'Volgorde: prioriteit' : 'Volgorde: bijgewerkt'
            btn.classList.toggle('on', sortMode === 'priority')
            btn.title =
                sortMode === 'priority' ? 'Klik om op bijgewerkt te sorteren' : 'Klik om op prioriteit te sorteren'
            rows.forEach((r, i) => {
                if (!r.dataset.order) r.dataset.order = String(i)
            })
            const sorted = rows.toSorted((a, b) => {
                if (sortMode === 'priority') {
                    const pa = notes.get(a.dataset.pr)?.priority || 99,
                        pb = notes.get(b.dataset.pr)?.priority || 99
                    if (pa !== pb) return pa - pb
                }
                return Number(a.dataset.order) - Number(b.dataset.order)
            })
            let anchor = head
            sorted.forEach((r) => {
                const detail = r.nextElementSibling?.classList.contains('detail') ? r.nextElementSibling : null
                anchor.after(r)
                anchor = r
                if (detail) {
                    r.after(detail)
                    anchor = detail
                }
            })
        })
        window.dispatchEvent(new Event('resize'))
    }

    document.querySelectorAll('tr.group-head [data-sort]').forEach((btn) =>
        btn.addEventListener('click', () => {
            sortMode = sortMode === 'priority' ? 'updated' : 'priority'
            try {
                localStorage.setItem(SORT_KEY, sortMode)
            } catch {
                noop()
            }
            sortGroups()
        }),
    )

    function renderEffort(row) {
        const td = row.querySelector('td.effort')
        if (!td) return
        const id = row.dataset.pr
        const current = notes.get(id)?.effort || ''
        if (canWrite) {
            let sel = td.querySelector('select')
            if (!sel) {
                sel = el('select', 'effort-select')
                sel.title = 'Hoeveel reviewtijd kost deze PR Daan ongeveer?'
                sel.setAttribute('aria-label', `Reviewtijd voor PR ${id}`)
                sel.append(new Option('Reviewtijd', ''))
                Object.entries(EFFORT).forEach(([k, v]) => sel.append(new Option(v, k)))
                sel.addEventListener('change', async () => {
                    sel.disabled = true
                    try {
                        await saveDoc(id, { effort: sel.value })
                    } catch {
                        sel.value = notes.get(id)?.effort || ''
                    }
                    sel.disabled = false
                })
                td.replaceChildren(sel)
            }
            if (document.activeElement !== sel) sel.value = current
            sel.className = `effort-select ${current ? `set e-${current}` : ''}`
        } else if (current) {
            td.replaceChildren(el('span', `pill e-${current}`, EFFORT[current]))
        } else td.replaceChildren()
    }

    const STACK_COPY = {
        label: 'Notitie voor Daan bij de hele stack',
        placeholder:
            'Geef Daan context bij de hele APP-stack: wat er sinds zijn laatste ronde is veranderd, in welke volgorde hij het beste kan kijken en wat je van hem nodig hebt.',
        srLabel: 'Notitie voor Daan bij de hele APP-stack',
        empty: 'Geen notitie bij de stack.',
    }
    const PR_COPY = {
        label: 'Notitie voor Daan',
        placeholder:
            'Geef Daan context bij deze PR: wat er is veranderd sinds zijn review, wat hij moet testen en wat je van hem nodig hebt.',
        empty: 'Geen notitie bij deze PR.',
    }

    function renderNote(host) {
        const id = host.dataset.pr
        const copy = id === 'stack' ? STACK_COPY : PR_COPY
        const note = notes.get(id)
        const ta = host.querySelector('textarea')
        if (ta && (document.activeElement === ta || ta.dataset.dirty)) return
        host.replaceChildren()
        const box = el('div', 'note-box')
        const head = el('div', 'note-head')
        head.append(el('span', 'note-label', copy.label))
        if (note?.text && note?.updatedAt)
            head.append(el('span', 'note-meta', `bijgewerkt ${fmtNoteDate(note.updatedAt)}`))
        box.append(head)
        if (!notesReady) {
            box.append(
                el(
                    'p',
                    'note-empty',
                    notesDb === false ? 'Notities zijn niet beschikbaar in deze weergave.' : 'Notitie laden…',
                ),
            )
        } else if (canWrite) {
            const area = el('textarea')
            area.id = `note-${id}`
            area.rows = 3
            area.placeholder = copy.placeholder
            area.value = note?.text || ''
            const label = el('label', 'sr-only', copy.srLabel || `Notitie voor Daan bij PR ${id}`)
            label.htmlFor = area.id
            const bar = el('div', 'note-bar')
            const save = el('button', 'note-save', 'Notitie opslaan')
            save.type = 'button'
            const status = el('span', 'note-status')
            status.setAttribute('aria-live', 'polite')
            const clear = el('button', 'note-clear', 'Wissen')
            clear.type = 'button'
            clear.hidden = !note?.text
            area.addEventListener('input', () => {
                area.dataset.dirty = '1'
                status.textContent = 'Niet opgeslagen wijzigingen'
            })
            async function persist(text) {
                save.disabled = clear.disabled = true
                status.textContent = 'Opslaan…'
                try {
                    await saveDoc(id, { text })
                    delete area.dataset.dirty
                    status.textContent = text
                        ? 'Opgeslagen. Daan ziet dit als hij de pagina opent.'
                        : 'Notitie verwijderd.'
                    clear.hidden = !text
                } catch (e) {
                    status.textContent =
                        e?.code === 'not_granted'
                            ? 'Je hebt geen rechten om notities te wijzigen.'
                            : 'Opslaan mislukt. Probeer het opnieuw.'
                    status.classList.add('bad')
                } finally {
                    save.disabled = clear.disabled = false
                }
            }
            save.addEventListener('click', () => persist(area.value.trim()))
            clear.addEventListener('click', () => {
                area.value = ''
                persist('')
            })
            area.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    persist(area.value.trim())
                }
            })
            bar.append(save, clear, status)
            box.append(label, area, bar)
        } else if (note?.text) {
            box.append(el('p', 'note-text', note.text))
        } else {
            box.append(el('p', 'note-empty', copy.empty))
        }
        box.classList.toggle('has-note', !!note?.text)
        host.append(box)
    }

    function refreshNotes() {
        document.querySelectorAll('tr.row').forEach((row) => {
            const text = notes.get(row.dataset.pr)?.text || ''
            const has = !!text
            row.classList.toggle('has-note', has)
            let flag = row.querySelector('.note-flag')
            let peek = row.querySelector('.note-peek')
            if (has && !flag) {
                flag = el('button', 'note-flag')
                flag.type = 'button'
                flag.append(document.createTextNode('✎ Notitie voor Daan · lees'))
                flag.title = 'Er staat een notitie van Remco bij deze PR. Klik om hem helemaal te lezen.'
                flag.addEventListener('click', () => {
                    if (row.getAttribute('aria-expanded') !== 'true') toggle(row)
                    row.nextElementSibling
                        ?.querySelector('.note-box')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
                row.querySelector('.row-actions').append(flag)
            } else if (!has && flag) flag.remove()
            if (has) {
                if (!peek) {
                    peek = el('span', 'note-peek')
                    row.querySelector('td.title').append(peek)
                }
                peek.textContent = text
            } else if (peek) peek.remove()
            renderEffort(row)
            renderPrio(row)
        })
        sortGroups()
        document.querySelectorAll('.note-host').forEach(renderNote)
    }

    document.querySelectorAll('tr.row').forEach((row) => {
        const box = row.querySelector('.tcounts')
        const threads = review.threads[row.dataset.pr] || []
        if (!box || !threads.length) return
        const answered = threads.filter((t) => t.replied).length
        const pill = row.querySelector('td.rev .pill.bad')
        if (pill && answered === threads.length) {
            pill.className = 'pill wait rereview'
            pill.textContent = `Aan ${review.review[row.dataset.pr]?.who || 'Daan'}: re-review`
            pill.title = 'Alle opmerkingen zijn beantwoord of verwerkt. De reviewer moet opnieuw kijken.'
        }
        const show = el('button', 'tshow')
        show.type = 'button'
        show.title = 'Toon de opmerkingen en mijn reacties'
        show.append(
            document.createTextNode(`${threads.length} ${threads.length === 1 ? 'opmerking' : 'opmerkingen'}, `),
            el(
                'span',
                answered === threads.length ? 't-resolved' : answered ? 't-recheck' : 't-open',
                `${answered} door mij beantwoord`,
            ),
        )
        show.addEventListener('click', () => {
            if (row.getAttribute('aria-expanded') !== 'true') toggle(row)
            load(row.dataset.pr)
                .then(() =>
                    requestAnimationFrame(() => {
                        row.nextElementSibling
                            ?.querySelector('.review-box')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }),
                )
                .catch(() => {})
        })
        const bb = el('a', null, 'Bitbucket ↗')
        bb.href = row.querySelector('.prlink').href
        bb.target = '_blank'
        bb.rel = 'noopener'
        bb.title = 'Open de PR met alle comments in Bitbucket'
        box.replaceChildren(show, document.createTextNode('·'), bb)
    })

    document.querySelectorAll('tr.row').forEach((row) => {
        const actions = el('div', 'row-actions')
        const open = el('button', 'row-open')
        open.type = 'button'
        open.title = 'Open of sluit de review threads, de diff en de notitie'
        open.setAttribute('aria-label', `Details van PR ${row.dataset.pr}`)
        open.append(el('span', 'chev', '▾'), document.createTextNode('Details'))
        open.addEventListener('click', () => toggle(row))
        actions.append(open)
        row.querySelector('td.title').append(actions)
    })

    document.querySelectorAll('.note-host').forEach(renderNote)

    ;(async () => {
        const db = null
        if (!db) {
            notesDb = false
            notesReady = true
            refreshNotes()
            return
        }
        notesDb = db
        const user = await window.claude.use('user')
        const allowed = await (user?.can('data.write') ?? null)
        canWrite = allowed === null ? !!(await user?.canEdit()) : allowed
        db.collection('notes').onSnapshot(
            (snap) => {
                if (!snap.docs.length && !canWrite) {
                    notesReady = true
                    refreshNotes()
                    return
                }
                notes.clear()
                snap.docs.forEach((d) => {
                    const v = d.data()
                    if (v?.text || v?.effort || v?.priority) notes.set(d.id, v)
                })
                notesReady = true
                refreshNotes()
            },
            () => {
                notesReady = true
                refreshNotes()
            },
        )
    })()

    document.querySelector('tbody').addEventListener('click', (e) => {
        if (e.target.closest('a, button, select, tr.detail, textarea')) return
        const row = e.target.closest('tr.row')
        if (row) toggle(row)
    })
    document.querySelector('tbody').addEventListener('keydown', (e) => {
        if (e.target.matches('tr.row') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            toggle(e.target)
        }
    })
})()
