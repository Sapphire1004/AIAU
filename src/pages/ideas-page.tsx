import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Bot, Check, CirclePause, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/layout/states'
import { extractNotes } from '@/services/ai.service'
import { listMessages, sendMessage, subscribeToMessages } from '@/repositories/messages.repository'
import {
  activateNote,
  createNote,
  createNoteChannel,
  deleteNote,
  holdNote,
  listNotes,
  updateNote,
} from '@/repositories/notes.repository'
import { getTrip, getTripMembers } from '@/repositories/trips.repository'
import type { Message, Note, Trip, TripMember } from '@/types/domain'

export function IdeasPage({ userId }: { userId: string }) {
  const { tripId = '' } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<TripMember[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const nickname = useMemo(
    () => members.find((member) => member.user_id === userId)?.nickname ?? '匿名ユーザー',
    [members, userId],
  )

  const refresh = useCallback(async () => {
    try {
      const [tripData, memberData, messageData, noteData] = await Promise.all([
        getTrip(tripId),
        getTripMembers(tripId),
        listMessages(tripId),
        listNotes(tripId),
      ])
      setTrip(tripData)
      setMembers(memberData)
      setMessages(messageData)
      setNotes(noteData)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'データを読み込めませんでした')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    void refresh()
    const messageChannel = subscribeToMessages(tripId, () => void refresh())
    const noteChannel = createNoteChannel(tripId, () => void refresh(), () => undefined)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void messageChannel.unsubscribe()
      void noteChannel.unsubscribe()
    }
  }, [refresh, tripId])

  function scheduleExtraction() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setAiBusy(true)
      try {
        await extractNotes(tripId, crypto.randomUUID())
        await refresh()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'AI整理に失敗しました')
      } finally {
        setAiBusy(false)
      }
    }, 2500)
  }

  async function handleMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const text = String(values.get('message')).trim()
    if (!text) return
    setBusy(true)
    try {
      await sendMessage(tripId, userId, nickname, text)
      form.reset()
      scheduleExtraction()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'メッセージを送信できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function handleNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title')).trim()
    if (!title) return
    setBusy(true)
    try {
      await createNote(tripId, userId, { title, memo: String(values.get('memo')).trim() || null })
      form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋を追加できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function editNote(note: Note) {
    const title = window.prompt('付箋のタイトル', note.title)?.trim()
    if (!title) return
    const memo = window.prompt('補足メモ', note.memo ?? '')
    try {
      await updateNote(note.id, { title, memo })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋を更新できませんでした')
    }
  }

  async function toggleHeld(note: Note) {
    try {
      if (note.status === 'held') await activateNote(note.id)
      else await holdNote(note.id, 'ユーザーが保留にしました')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋の状態を変更できませんでした')
    }
  }

  async function removeNote(note: Note) {
    if (!window.confirm(`「${note.title}」を削除しますか？`)) return
    try {
      await deleteNote(note.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋を削除できませんでした')
    }
  }

  if (loading) return <LoadingState />
  if (!trip) return <ErrorState message={error ?? '旅行が見つかりません'} />

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{trip.title}</p>
          <h1 className="text-2xl font-bold tracking-tight">アイデアボード + チャット</h1>
          <p className="mt-1 text-sm text-muted-foreground">{members.map((member) => member.nickname).join('・')}</p>
        </div>
        <Button className="min-h-11" onClick={() => navigate(`/trips/${tripId}/plan`)}>
          プランへ反映
        </Button>
      </header>

      {error && <ErrorState message={error} />}

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-start justify-between border-b p-4">
            <div>
              <h2 className="font-semibold">行きたい付箋</h2>
              <p className="text-sm text-muted-foreground">AI抽出と手動追加を同じように編集できます</p>
            </div>
            {aiBusy && (
              <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs" role="status">
                <Bot aria-hidden="true" className="size-4" /> AI整理中
              </span>
            )}
          </div>
          <form className="grid gap-2 border-b p-4 sm:grid-cols-[1fr_1.5fr_auto]" onSubmit={handleNote}>
            <label className="sr-only" htmlFor="note-title">付箋タイトル</label>
            <input className="min-h-11 rounded-md border bg-background px-3" id="note-title" name="title" placeholder="付箋タイトル" required />
            <label className="sr-only" htmlFor="note-memo">補足メモ</label>
            <input className="min-h-11 rounded-md border bg-background px-3" id="note-memo" name="memo" placeholder="補足メモ" />
            <Button className="min-h-11" disabled={busy} type="submit" variant="secondary">
              <Plus aria-hidden="true" className="size-4" /> 追加
            </Button>
          </form>
          <div className="grid gap-3 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <article
                className={`min-h-44 rounded-md border p-4 shadow-sm ${
                  note.status === 'held' ? 'bg-muted text-muted-foreground' : note.origin === 'ai' ? 'bg-amber-50' : 'bg-emerald-50'
                }`}
                id={note.id}
                key={note.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                    {note.origin === 'ai' ? 'AI抽出' : '手動'}
                  </span>
                  <div className="flex gap-1">
                    <IconAction label="編集" onClick={() => void editNote(note)}><Pencil className="size-4" /></IconAction>
                    <IconAction label={note.status === 'held' ? '保留解除' : '保留'} onClick={() => void toggleHeld(note)}>
                      {note.status === 'held' ? <Check className="size-4" /> : <CirclePause className="size-4" />}
                    </IconAction>
                    <IconAction label="削除" onClick={() => void removeNote(note)}><Trash2 className="size-4" /></IconAction>
                  </div>
                </div>
                <h3 className={`mt-3 font-bold ${note.status === 'held' ? 'line-through' : ''}`}>{note.title}</h3>
                <p className={`mt-2 text-sm ${note.status === 'held' ? 'line-through' : 'text-muted-foreground'}`}>{note.memo}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {Object.entries(note.attrs as Record<string, unknown>).map(([key, value]) => (
                    <span className="rounded bg-background/70 px-2 py-1 text-xs" key={key}>{String(value)}</span>
                  ))}
                </div>
                {note.source_message_id && (
                  <a className="mt-3 inline-block text-xs font-medium underline" href={`#message-${note.source_message_id}`}>{note.title}の根拠発言を見る</a>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">チャット</h2>
            <p className="text-sm text-muted-foreground">発言後にAIが付箋を自動整理します</p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4">
            {messages.map((message) => (
              <article className={message.author_id === userId ? 'ml-auto max-w-[85%]' : 'max-w-[85%]'} id={`message-${message.id}`} key={message.id}>
                <p className="mb-1 text-xs text-muted-foreground">{message.author_name}</p>
                <p className={`rounded-xl border p-3 text-sm ${message.author_id === userId ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                  {message.text}
                </p>
              </article>
            ))}
          </div>
          <form className="flex gap-2 border-t p-3" onSubmit={handleMessage}>
            <label className="sr-only" htmlFor="message-input">メッセージ</label>
            <textarea className="min-h-11 flex-1 resize-none rounded-md border bg-background px-3 py-2" id="message-input" name="message" placeholder="行きたい場所を話してみよう" required />
            <Button aria-label="送信" className="size-11 p-0" disabled={busy} type="submit"><Send className="size-4" /></Button>
          </form>
        </section>
      </div>
    </div>
  )
}

function IconAction({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className="grid size-8 place-items-center rounded-md hover:bg-background/70" onClick={onClick} type="button">{children}</button>
}
