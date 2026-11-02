import Dexie, { type Table } from 'dexie'
export interface Source { url: string; title: string; domain: string; snippet?: string }
export interface Segment { text: string; refs: number[] }
export interface Message { id: string; convId: string; role: 'user' | 'assistant'; text: string; segments?: Segment[]; sources?: Source[]; ts: number; error?: boolean }
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number }
export interface Saved { id: string; convId: string; question: string; answer: string; segments?: Segment[]; sources: Source[]; savedAt: number }

class NexoraDB extends Dexie {
  conversations!: Table<Conversation, string>
  messages!: Table<Message, string>
  saved!: Table<Saved, string>
  constructor() {
    super('nexora')
    this.version(1).stores({ conversations: 'id, updatedAt', messages: 'id, convId, ts', saved: 'id, convId, savedAt' })
  }
}
export const db = new NexoraDB()
export const uid = () => crypto.randomUUID()

export async function exportAll() {
  const [conversations, messages, saved] = await Promise.all([db.conversations.toArray(), db.messages.toArray(), db.saved.toArray()])
  return JSON.stringify({ app: 'nexora', version: 1, conversations, messages, saved })
}
export async function importAll(json: string) {
  const d = JSON.parse(json)
  if (d.app !== 'nexora' || !Array.isArray(d.conversations)) throw new Error('Not a NEXORA backup')
  await db.transaction('rw', db.conversations, db.messages, db.saved, async () => {
    await db.conversations.bulkPut(d.conversations); await db.messages.bulkPut(d.messages ?? []); await db.saved.bulkPut(d.saved ?? [])
  })
}
export async function deleteConversation(id: string) {
  await db.transaction('rw', db.conversations, db.messages, async () => { await db.messages.where('convId').equals(id).delete(); await db.conversations.delete(id) })
}
export async function clearChats() { await db.transaction('rw', db.conversations, db.messages, async () => { await db.conversations.clear(); await db.messages.clear() }) }
