import type { Segment, Source } from './db'
export type Stage = 'understanding' | 'searching' | 'reviewing' | 'answering'
export interface Handlers { onStage(s: Stage): void; onText(t: string): void; onDone(d: { segments: Segment[]; sources: Source[] }): void; onError(m: string): void }

export async function ask(messages: { role: string; content: string }[], maxSearches: number, token: string, h: Handlers, signal?: AbortSignal) {
  if (!navigator.onLine) return h.onError('You are offline. Live search needs an internet connection.')
  try {
    const base = import.meta.env.VITE_API_URL || ''
    const r = await fetch(`${base}/api/ask`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-access-token': token }, body: JSON.stringify({ messages, maxSearches }) })
    if (!r.ok || !r.body) return h.onError(r.status === 401 ? 'Access token rejected. Check Settings.' : r.status === 429 ? 'Too many requests. Slow down a moment.' : 'Server error. Please retry.')
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2)
        const ev = /event: (.*)/.exec(raw)?.[1]; const data = JSON.parse(/data: (.*)/s.exec(raw)?.[1] ?? 'null')
        if (ev === 'status') h.onStage(data.stage); else if (ev === 'text') h.onText(data)
        else if (ev === 'done') h.onDone(data); else if (ev === 'error') h.onError(data.message)
      }
    }
  } catch (e: any) { if (e.name !== 'AbortError') h.onError('Could not reach the server.') }
}
