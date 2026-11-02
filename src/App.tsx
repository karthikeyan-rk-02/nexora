import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Search, Bookmark, Settings as Cog, PanelLeft, Copy, Share2, RefreshCw, Trash2, Pencil, Send, X, Download, Upload, WifiOff, Sun, Moon } from 'lucide-react'
import { db, uid, exportAll, importAll, deleteConversation, clearChats, type Message, type Source } from './lib/db'
import { ask, type Stage } from './lib/api'

const STAGES: Record<Stage, string> = { understanding: 'Understanding your question...', searching: 'Searching the web...', reviewing: 'Reviewing relevant sources...', answering: 'Preparing your answer...' }
const SUGGESTIONS = ['How does artificial intelligence work?', 'What are the latest developments in space exploration?', 'Explain quantum computing.', 'What are the differences between Python and JavaScript?', 'What are the most important technology developments this year?']
type View = 'chat' | 'saved' | 'settings'
const pref = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem('nx_' + k) ?? '') } catch { return d } }
const setPref = (k: string, v: unknown) => localStorage.setItem('nx_' + k, JSON.stringify(v))

function Answer({ m }: { m: Message }) {
  const md = useMemo(() => (m.segments?.length ? m.segments.map(s => s.text + s.refs.map(r => ` [[${r}]](${m.sources?.[r - 1]?.url})`).join('')).join('') : m.text), [m])
  return <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{md}</ReactMarkdown></div>
}
function Sources({ s }: { s: Source[] }) {
  if (!s.length) return null
  return <div className="mt-4 grid gap-2 sm:grid-cols-2">{s.map((x, i) => (
    <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" className="flex gap-2 rounded-xl border border-line bg-card p-3 hover:border-accent">
      <img src={`https://www.google.com/s2/favicons?domain=${x.domain}&sz=32`} alt="" width={16} height={16} className="mt-1 h-4 w-4" />
      <div className="min-w-0"><div className="truncate text-sm font-medium">[{i + 1}] {x.title}</div><div className="truncate text-xs text-mute">{x.domain}</div>{x.snippet && <div className="line-clamp-2 text-xs text-mute">{x.snippet}</div>}</div>
    </a>))}</div>
}

export default function App() {
  const [view, setView] = useState<View>('chat')
  const [convId, setConvId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(window.innerWidth > 900)
  const [stage, setStage] = useState<Stage | null>(null)
  const [stream, setStream] = useState('')
  const [err, setErr] = useState<{ text: string; retry: string } | null>(null)
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(pref('theme', 'dark'))
  const [maxSearches, setMax] = useState<number>(pref('max', 5))
  const [token, setToken] = useState<string>(pref('token', ''))
  const [online, setOnline] = useState(navigator.onLine)
  const [installEv, setInstallEv] = useState<any>(null)
  const abort = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const convs = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray(), []) ?? []
  const msgs = useLiveQuery(() => convId ? db.messages.where('convId').equals(convId).sortBy('ts') : [], [convId]) ?? []
  const saved = useLiveQuery(() => db.saved.orderBy('savedAt').reverse().toArray(), []) ?? []
  const savedIds = new Set(saved.map(s => s.id))

  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark); setPref('theme', theme)
  }, [theme])
  useEffect(() => { setPref('max', maxSearches); setPref('token', token) }, [maxSearches, token])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false), bip = (e: Event) => { e.preventDefault(); setInstallEv(e) }
    addEventListener('online', on); addEventListener('offline', off); addEventListener('beforeinstallprompt', bip)
    return () => { removeEventListener('online', on); removeEventListener('offline', off); removeEventListener('beforeinstallprompt', bip) }
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, stream])

  const grouped = useMemo(() => {
    const day = 864e5, start = new Date().setHours(0, 0, 0, 0)
    const g: Record<string, typeof convs> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] }
    convs.filter(c => c.title.toLowerCase().includes(q.toLowerCase())).forEach(c => {
      const k = c.updatedAt >= start ? 'Today' : c.updatedAt >= start - day ? 'Yesterday' : c.updatedAt >= start - 7 * day ? 'Previous 7 days' : 'Older'
      g[k].push(c)
    }); return g
  }, [convs, q])

  async function run(question: string, id: string | null, history: Message[], skipUser = false) {
    question = question.trim(); if (!question || stage) return
    setErr(null); setStream(''); setStage('understanding'); setView('chat')
    let cid = id
    try {
      if (!cid) { cid = uid(); await db.conversations.add({ id: cid, title: question.slice(0, 60), createdAt: Date.now(), updatedAt: Date.now() }); setConvId(cid) }
      if (!skipUser) await db.messages.add({ id: uid(), convId: cid, role: 'user', text: question, ts: Date.now() })
    } catch { setStage(null); return setErr({ text: 'Could not save to local storage.', retry: question }) }
    const payload = [...history.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: question }]
    abort.current = new AbortController(); let acc = ''
    await ask(payload, maxSearches, token, {
      onStage: setStage, onText: t => { acc += t; setStream(acc) },
      onDone: async d => {
        try { await db.messages.add({ id: uid(), convId: cid!, role: 'assistant', text: acc, segments: d.segments, sources: d.sources, ts: Date.now() }); await db.conversations.update(cid!, { updatedAt: Date.now() }) }
        catch { setErr({ text: 'Answer received but could not be saved locally.', retry: question }) }
      },
      onError: m => setErr({ text: m, retry: question })
    }, abort.current.signal)
    setStage(null); setStream('')
  }
  const submit = () => { const t = input; setInput(''); run(t, convId, msgs) }
  const regenerate = async (i: number) => {
    const userMsg = msgs[i - 1]; if (!userMsg) return
    await db.messages.delete(msgs[i].id); run(userMsg.text, convId, msgs.slice(0, i - 1), true)
  }
  const toggleSave = async (i: number) => {
    const a = msgs[i], u = msgs[i - 1]; if (!a) return
    if (savedIds.has(a.id)) await db.saved.delete(a.id)
    else await db.saved.add({ id: a.id, convId: a.convId, question: u?.text ?? '', answer: a.text, segments: a.segments, sources: a.sources ?? [], savedAt: Date.now() })
  }
  const share = async (t: string) => { try { navigator.share ? await navigator.share({ text: t }) : await navigator.clipboard.writeText(t) } catch {} }
  const newChat = () => { setConvId(null); setView('chat'); setErr(null) }
  const current = convs.find(c => c.id === convId)

  const box = (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-card p-2">
        <textarea aria-label="Ask anything" rows={1} value={input} onChange={e => setInput(e.target.value)} placeholder={convId ? 'Ask a follow-up...' : 'Ask anything...'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} className="max-h-40 flex-1 resize-none bg-transparent p-2 outline-none" />
        {input && <button aria-label="Clear input" onClick={() => setInput('')} className="p-2 text-mute"><X size={18} /></button>}
        <button aria-label="Search" disabled={!!stage || !input.trim()} onClick={submit} className="rounded-xl bg-accent p-2 text-white disabled:opacity-40"><Send size={18} /></button>
      </div>
      {!online && <p className="mt-2 flex items-center gap-1 text-xs text-mute"><WifiOff size={12} /> Offline: live search is unavailable. Saved chats are still readable.</p>}
    </div>)

  const navBtn = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-card'
  return (
    <div className="flex h-screen overflow-hidden">
      {open && <div className="fixed inset-0 z-10 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full md:hidden'} fixed z-20 flex h-full w-72 flex-col border-r border-line bg-side p-3 transition-transform md:static`}>
        <div className="mb-3 px-2 text-lg font-bold tracking-wide">NEXORA</div>
        <button className={navBtn} onClick={() => { newChat(); window.innerWidth < 768 && setOpen(false) }}><Plus size={16} /> New Chat</button>
        <div className="relative my-2"><Search size={14} className="absolute left-3 top-2.5 text-mute" /><input aria-label="Search chats" value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" className="w-full rounded-lg border border-line bg-card py-2 pl-8 pr-2 text-sm outline-none" /></div>
        <nav className="flex-1 overflow-y-auto" aria-label="Recent chats">
          {Object.entries(grouped).map(([k, list]) => list.length > 0 && <div key={k} className="mb-3"><div className="px-3 py-1 text-xs text-mute">{k}</div>
            {list.map(c => <div key={c.id} className={`group flex items-center rounded-lg ${c.id === convId && view === 'chat' ? 'bg-card' : 'hover:bg-card'}`}>
              <button className="flex-1 truncate px-3 py-2 text-left text-sm" onClick={() => { setConvId(c.id); setView('chat'); window.innerWidth < 768 && setOpen(false) }}>{c.title}</button>
              <button aria-label="Rename chat" className="p-1 text-mute opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={async () => { const t = prompt('Rename chat', c.title); if (t?.trim()) await db.conversations.update(c.id, { title: t.trim() }) }}><Pencil size={13} /></button>
              <button aria-label="Delete chat" className="p-1 pr-2 text-mute opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={async () => { if (confirm('Delete this chat?')) { await deleteConversation(c.id); if (c.id === convId) newChat() } }}><Trash2 size={13} /></button>
            </div>)}</div>)}
        </nav>
        <button className={navBtn} onClick={() => setView('saved')}><Bookmark size={16} /> Saved Answers</button>
        <button className={navBtn} onClick={() => setView('settings')}><Cog size={16} /> Settings</button>
        <div className="mt-2 flex items-center gap-3 border-t border-line px-2 pt-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-accent font-semibold text-white">K</div><div><div className="text-sm font-medium">Karthikeyan</div><div className="text-xs text-mute">Personal Workspace</div></div></div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <button aria-label="Toggle sidebar" onClick={() => setOpen(o => !o)} className="rounded-lg p-2 hover:bg-card"><PanelLeft size={18} /></button>
          <h1 className="flex-1 truncate text-sm font-medium">{view === 'chat' ? current?.title ?? 'NEXORA' : view === 'saved' ? 'Saved Answers' : 'Settings'}</h1>
          <button aria-label="Toggle theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="rounded-lg p-2 hover:bg-card">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button aria-label="New chat" onClick={newChat} className="rounded-lg p-2 hover:bg-card"><Plus size={18} /></button>
        </header>

        {view === 'chat' && (!convId && !stage ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <h2 className="text-4xl font-bold tracking-wide">NEXORA</h2>
            <p className="text-lg">Explore the web. Understand everything.</p>
            <p className="text-sm text-mute">Ask anything. Get intelligent answers backed by real sources.</p>
            <div className="w-full">{box}</div>
            {err && <p role="alert" className="text-sm text-red-400">{err.text} <button className="underline" onClick={() => run(err.retry, null, [])}>Retry</button></p>}
            <div className="flex max-w-3xl flex-wrap justify-center gap-2">{SUGGESTIONS.map(s => <button key={s} onClick={() => run(s, null, [])} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:border-accent">{s}</button>)}</div>
          </div>
        ) : (<>
          <div className="flex-1 overflow-y-auto"><div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
            {msgs.map((m, i) => m.role === 'user' ? <h2 key={m.id} className="text-2xl font-semibold">{m.text}</h2> : (
              <section key={m.id}><Answer m={m} /><Sources s={m.sources ?? []} />
                {!m.sources?.length && <p className="mt-2 text-xs text-mute">No web sources were used for this answer.</p>}
                <div className="mt-3 flex gap-1 text-mute">
                  <button aria-label="Copy answer" className="rounded p-2 hover:bg-card" onClick={() => navigator.clipboard.writeText(m.text)}><Copy size={16} /></button>
                  <button aria-label="Save answer" className={`rounded p-2 hover:bg-card ${savedIds.has(m.id) ? 'text-accent' : ''}`} onClick={() => toggleSave(i)}><Bookmark size={16} /></button>
                  <button aria-label="Share answer" className="rounded p-2 hover:bg-card" onClick={() => share(m.text)}><Share2 size={16} /></button>
                  <button aria-label="Regenerate" className="rounded p-2 hover:bg-card" disabled={!!stage || i !== msgs.length - 1} onClick={() => regenerate(i)}><RefreshCw size={16} /></button>
                </div></section>))}
            {stage && <section aria-live="polite"><p className="mb-2 text-sm text-accent">{STAGES[stage]}</p>{stream && <div className="md whitespace-pre-wrap">{stream}</div>}</section>}
            {err && <p role="alert" className="text-sm text-red-400">{err.text} <button className="underline" onClick={() => run(err.retry, convId, msgs, msgs.at(-1)?.role === 'user')}>Retry</button></p>}
            <div ref={endRef} />
          </div></div>
          <div className="pb-3 pt-2">{box}</div></>))}

        {view === 'saved' && <SavedView saved={saved} onOpen={id => { setConvId(id); setView('chat') }} />}
        {view === 'settings' && <div className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto p-4">
          <Sec title="Appearance"><select aria-label="Theme" value={theme} onChange={e => setTheme(e.target.value as any)} className="rounded-lg border border-line bg-card p-2"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></Sec>
          <Sec title="Search"><label className="text-sm">Max searches per question: {maxSearches}<input type="range" min={1} max={10} value={maxSearches} onChange={e => setMax(+e.target.value)} className="block w-full" /></label>
            <label className="mt-3 block text-sm">Access token (matches server ACCESS_TOKEN)<input type="password" value={token} onChange={e => setToken(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-card p-2" /></label></Sec>
          <Sec title="Storage"><div className="flex flex-wrap gap-2 text-sm">
            <button className="flex items-center gap-1 rounded-lg border border-line px-3 py-2" onClick={async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await exportAll()], { type: 'application/json' })); a.download = `nexora-backup-${Date.now()}.json`; a.click() }}><Download size={14} /> Export</button>
            <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-3 py-2"><Upload size={14} /> Import<input type="file" accept="application/json" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) try { await importAll(await f.text()); alert('Imported') } catch (x: any) { alert(x.message) } }} /></label>
            <button className="rounded-lg border border-line px-3 py-2" onClick={async () => { if (confirm('Delete ALL chats?')) { await clearChats(); newChat() } }}>Clear chats</button>
            <button className="rounded-lg border border-line px-3 py-2" onClick={async () => { if (confirm('Clear all saved answers?')) await db.saved.clear() }}>Clear saved</button></div>
            <p className="mt-2 text-xs text-mute">Data lives in this browser only. Clearing site data deletes it, so export backups regularly.</p></Sec>
          <Sec title="Application">
            {installEv ? <button className="rounded-lg bg-accent px-3 py-2 text-sm text-white" onClick={() => installEv.prompt()}>Install NEXORA</button> : <p className="text-sm text-mute">Install via your browser menu. On iOS: Share, then Add to Home Screen.</p>}
            <p className="mt-2 text-sm text-mute">Status: {online ? 'Online' : 'Offline'} · {matchMedia('(display-mode: standalone)').matches ? 'Running as installed app' : 'Running in browser'}</p>
            <p className="mt-2 text-xs text-mute">NEXORA is a local, single-user app with no accounts. Questions are sent to your own backend and Anthropic. Keep the backend private.</p></Sec>
        </div>}
      </main>
    </div>)
}
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-xl border border-line bg-card p-4"><h3 className="mb-3 font-semibold">{title}</h3>{children}</section>
function SavedView({ saved, onOpen }: { saved: import('./lib/db').Saved[]; onOpen: (id: string) => void }) {
  const [s, setS] = useState(''); const list = saved.filter(x => (x.question + x.answer).toLowerCase().includes(s.toLowerCase()))
  return <div className="mx-auto w-full max-w-3xl space-y-3 overflow-y-auto p-4">
    <input aria-label="Search saved answers" value={s} onChange={e => setS(e.target.value)} placeholder="Search saved answers" className="w-full rounded-lg border border-line bg-card p-2 outline-none" />
    {list.length === 0 && <p className="text-sm text-mute">No saved answers.</p>}
    {list.map(x => <article key={x.id} className="rounded-xl border border-line bg-card p-4"><h3 className="font-semibold">{x.question}</h3>
      <p className="mt-1 line-clamp-4 text-sm text-mute">{x.answer}</p><p className="mt-2 text-xs text-mute">{x.sources.length} sources · saved {new Date(x.savedAt).toLocaleDateString()}</p>
      <div className="mt-2 flex gap-3 text-sm"><button className="text-accent" onClick={() => onOpen(x.convId)}>Open conversation</button><button className="text-mute" onClick={() => db.saved.delete(x.id)}>Remove</button></div></article>)}</div>
}
