import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/layout/states'
import { listMessages, sendMessage, subscribeToMessages } from '@/repositories/messages.repository'
import {
  activateNote,
  createNote,
  createNoteChannel,
  deleteNote,
  holdNote,
  listNotes,
  moveNote,
  updateNote,
} from '@/repositories/notes.repository'
import { getTrip, getTripMembers } from '@/repositories/trips.repository'
import { extractNotes } from '@/services/ai.service'
import type { Message, Note, NoteAttributes, Trip, TripMember } from '@/types/domain'

type NoteEditorDraft = {
  title: string
  memo: string
  attrs: string
}

const EMPTY_NOTE_DRAFT: NoteEditorDraft = { title: '', memo: '', attrs: '' }

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
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [noteDraft, setNoteDraft] = useState<NoteEditorDraft>(EMPTY_NOTE_DRAFT)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteDialogRef = useRef<HTMLDialogElement>(null)
  const noteTitleRef = useRef<HTMLInputElement>(null)
  const handledHashRef = useRef('')
  const noteDragRef = useRef<{ sourceId: string; targetId: string } | null>(null)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [dragTargetNoteId, setDragTargetNoteId] = useState<string | null>(null)

  const nickname = useMemo(
    () => members.find((member) => member.user_id === userId)?.nickname ?? '匿名ユーザー',
    [members, userId],
  )
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.nickname])),
    [members],
  )
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
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
      setNotes(sortNotesByPosition(noteData))
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

  useEffect(() => {
    const hash = readLocationHash()
    if (!hash || handledHashRef.current === hash) return
    const target = document.getElementById(hash)
    if (!target) return
    handledHashRef.current = hash
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [messages, notes])

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
    const title = noteDraft.title.trim()
    if (!title) return

    setBusy(true)
    try {
      const memo = noteDraft.memo.trim() || null
      const attrs = resolveNoteAttributes(noteDraft.attrs, editingNote?.attrs)
      if (editingNote) {
        await updateNote(editingNote.id, { title, memo, attrs })
      } else {
        await createNote(tripId, userId, { title, memo, attrs })
      }
      await refresh()
      noteDialogRef.current?.close()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : editingNote
            ? '付箋を更新できませんでした'
            : '付箋を追加できませんでした',
      )
    } finally {
      setBusy(false)
    }
  }

  function openNoteEditor(note: Note | null) {
    setEditingNote(note)
    setNoteDraft({
      title: note?.title ?? '',
      memo: note?.memo ?? '',
      attrs: note ? noteAttributeLabels(note.attrs).join('、') : '',
    })
    window.requestAnimationFrame(() => {
      const dialog = noteDialogRef.current
      if (dialog && !dialog.open) dialog.showModal()
      noteTitleRef.current?.focus()
    })
  }

  async function toggleHeld(note: Note) {
    setBusy(true)
    try {
      if (note.status === 'held') await activateNote(note.id)
      else await holdNote(note.id, 'ユーザーが保留にしました')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋の状態を変更できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function removeNote(note: Note) {
    if (!window.confirm(`「${note.title}」を削除しますか？`)) return
    setBusy(true)
    try {
      await deleteNote(note.id)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋を削除できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function persistNoteOrder(nextNotes: Note[]) {
    const positioned = nextNotes.map((note, index) => ({ note, x: index % 2, y: Math.floor(index / 2) }))
    setNotes(positioned.map(({ note, x, y }) => ({ ...note, x, y })))
    setBusy(true)
    setError(null)
    try {
      await Promise.all(
        positioned
          .filter(({ note, x, y }) => note.x !== x || note.y !== y)
          .map(({ note, x, y }) => moveNote(note.id, x, y)),
      )
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '付箋の並び順を保存できませんでした')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  function reorderNote(sourceId: string, targetId: string) {
    const sourceIndex = notes.findIndex((note) => note.id === sourceId)
    const targetIndex = notes.findIndex((note) => note.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
    const nextNotes = [...notes]
    const [moved] = nextNotes.splice(sourceIndex, 1)
    nextNotes.splice(targetIndex, 0, moved)
    void persistNoteOrder(nextNotes)
  }

  function moveNoteByOffset(noteId: string, offset: number) {
    const sourceIndex = notes.findIndex((note) => note.id === noteId)
    const target = notes[sourceIndex + offset]
    if (sourceIndex < 0 || !target) return
    reorderNote(noteId, target.id)
  }

  function beginNoteDrag(event: ReactPointerEvent<HTMLElement>, noteId: string) {
    if (busy || event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, textarea')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    noteDragRef.current = { sourceId: noteId, targetId: noteId }
    setDraggedNoteId(noteId)
    setDragTargetNoteId(noteId)
  }

  function updateNoteDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!noteDragRef.current) return
    event.preventDefault()
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-note-id]')
    if (!target?.dataset.noteId || target.dataset.noteId === noteDragRef.current.targetId) return
    noteDragRef.current.targetId = target.dataset.noteId
    setDragTargetNoteId(target.dataset.noteId)
  }

  function finishNoteDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = noteDragRef.current
    if (!drag) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    noteDragRef.current = null
    setDraggedNoteId(null)
    setDragTargetNoteId(null)
    reorderNote(drag.sourceId, drag.targetId)
  }

  if (loading) return <LoadingState />
  if (!trip) return <ErrorState message={error ?? '旅行が見つかりません'} />

  return (
    <>
      <style>{IDEAS_PAGE_STYLES}</style>
      <div className="ideas-page page-shell">
        <div className="page-title">
          <div>
            <span className="eyebrow">SCREEN 01 · IDEA BOARD</span>
            <h1>アイデアを集める</h1>
            <p>チャットから見つけた「やりたい」を、みんなで育てよう。</p>
          </div>
          <div className="title-actions">
            <button
              className="secondary-button"
              id="add-note-button"
              onClick={() => openNoteEditor(null)}
              type="button"
            >
              ＋ 付箋を追加
            </button>
            <button
              className="primary-button"
              onClick={() => navigate(`/trips/${tripId}/plan`)}
              type="button"
            >
              プランを確認 →
            </button>
          </div>
        </div>

        {error && (
          <div className="page-error" role="alert">
            <strong>処理に失敗しました</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="board-chat">
          <section aria-labelledby="idea-board-heading" className="surface-card board-panel">
            <div className="board-toolbar">
              <div className="section-heading">
                <div>
                  <h2 id="idea-board-heading">アイデアボード</h2>
                  <p>付箋をドラッグして並べ替えられます</p>
                </div>
                <span aria-live="polite" className="tag ai" hidden={!aiBusy} role="status">
                  <span aria-hidden="true" className="dot" />
                  AI 整理中
                </span>
              </div>
            </div>
            <div className="board-canvas" id="board-canvas">
              <div aria-label="旅行のアイデア付箋" className="note-list" id="note-list">
                {notes.length === 0 && <p className="board-empty">チャットや手動追加から付箋を作成できます。</p>}
                {notes.map((note, index) => {
                  const held = note.status === 'held'
                  const attributes = noteAttributeLabels(note.attrs)
                  const sourceMessage = note.source_message_id ? messagesById.get(note.source_message_id) : undefined
                  const author = note.author_id ? membersById.get(note.author_id) : undefined
                  return (
                    <article
                      className={`note-card${held ? ' held' : ''}${note.origin === 'user' ? ' user-note' : ''}${draggedNoteId === note.id ? ' dragging' : ''}${dragTargetNoteId === note.id && draggedNoteId !== note.id ? ' drop-target' : ''}`}
                      data-note-id={note.id}
                      id={note.id}
                      key={note.id}
                      onPointerCancel={finishNoteDrag}
                      onPointerDown={(event) => beginNoteDrag(event, note.id)}
                      onPointerMove={updateNoteDrag}
                      onPointerUp={finishNoteDrag}
                    >
                      <span aria-hidden="true" className="pin">●</span>
                      <span className={`tag ${held ? 'held' : note.origin === 'ai' ? 'ai' : 'manual'}`}>
                        {held ? '保留中' : note.origin === 'ai' ? 'AI 抽出' : '手動作成'}
                      </span>
                      <h3 className="note-title">{note.title}</h3>
                      <p className="note-memo">{note.memo || 'メモはありません。'}</p>
                      <div className="note-attrs">
                        {attributes.map((attribute, index) => (
                          <span key={`${note.id}-attribute-${index}`}>{attribute}</span>
                        ))}
                      </div>
                      <div className="note-footer">
                        {note.source_message_id ? (
                          <a className="source-link" href={`#message-${note.source_message_id}`}>
                            根拠：{sourceMessage?.author_name ?? '発言'} ↗
                          </a>
                        ) : (
                          <span className="source-link">
                            作成者：{note.author_id === userId ? 'あなた' : author ?? '参加者'}
                          </span>
                        )}
                        <span className="note-actions">
                          <button
                            aria-label={`「${note.title}」を前へ移動`}
                            disabled={busy || index === 0}
                            onClick={() => moveNoteByOffset(note.id, -1)}
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`「${note.title}」を後ろへ移動`}
                            disabled={busy || index === notes.length - 1}
                            onClick={() => moveNoteByOffset(note.id, 1)}
                            type="button"
                          >
                            ↓
                          </button>
                          <button
                            aria-label={`「${note.title}」を編集`}
                            disabled={busy}
                            onClick={() => openNoteEditor(note)}
                            type="button"
                          >
                            編集
                          </button>
                          <button
                            aria-label={`「${note.title}」を${held ? '保留解除' : '保留'}`}
                            disabled={busy}
                            onClick={() => void toggleHeld(note)}
                            type="button"
                          >
                            {held ? '復帰' : '保留'}
                          </button>
                          <button
                            aria-label={`「${note.title}」を削除`}
                            disabled={busy}
                            onClick={() => void removeNote(note)}
                            type="button"
                          >
                            削除
                          </button>
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
              <div aria-live="polite" className="ai-status" hidden={!aiBusy} role="status">
                <span aria-hidden="true" className="ai-pulse" />
                <span>AI 整理中</span>
                <span className="ai-status-detail">新しい発言を確認しています</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="trip-chat-heading" className="surface-card chat-panel">
            <div className="chat-toolbar">
              <div className="section-heading">
                <div>
                  <h2 id="trip-chat-heading">旅のチャット</h2>
                  <div className="chat-members">
                    <span
                      aria-label={members.map((member) => member.nickname).join('、')}
                      className="avatar-stack"
                      role="img"
                    >
                      {members.slice(0, 3).map((member) => (
                        <span aria-hidden="true" className="avatar" key={member.user_id} title={member.nickname}>
                          {initialOf(member.nickname)}
                        </span>
                      ))}
                    </span>
                    {members.length}人が参加中
                  </div>
                </div>
                <button aria-label="チャットメニュー（準備中）" className="icon-button" disabled type="button">
                  •••
                </button>
              </div>
            </div>
            <div aria-live="polite" className="chat-messages" id="chat-messages">
              {messages.length === 0 && <p className="chat-empty">まだ発言はありません。行きたい場所を話してみましょう。</p>}
              {messages.map((message, index) => {
                const showDay = index === 0 || messageDayKey(messages[index - 1].created_at) !== messageDayKey(message.created_at)
                const mine = message.author_id === userId
                return (
                  <Fragment key={message.id}>
                    {showDay && <div className="chat-day">{formatMessageDay(message.created_at)}</div>}
                    <article className={`message${mine ? ' mine' : ''}`} id={`message-${message.id}`}>
                      <div aria-hidden="true" className="message-avatar">{initialOf(message.author_name)}</div>
                      <div className="message-content">
                        <div className="message-meta">
                          <strong>{message.author_name}</strong>
                          <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
                        </div>
                        <div className="message-bubble">{message.text}</div>
                      </div>
                    </article>
                  </Fragment>
                )
              })}
            </div>
            <form className="chat-composer" id="chat-form" onSubmit={handleMessage}>
              <div className="reply-preview" hidden />
              <div className="mention-suggestions" hidden />
              <div className="composer-wrap">
                <label className="sr-only" htmlFor="chat-input">メッセージ</label>
                <textarea
                  id="chat-input"
                  maxLength={500}
                  name="message"
                  placeholder="#で付箋、@で参加者をメンション"
                  required
                  rows={1}
                />
                <button aria-label="送信" className="send-button" disabled={busy} type="submit">
                  <span aria-hidden="true">↑</span>
                </button>
              </div>
            </form>
          </section>
        </div>

        <dialog
          aria-labelledby="dialog-title"
          className="note-dialog"
          id="note-dialog"
          onClose={() => {
            setEditingNote(null)
            setNoteDraft(EMPTY_NOTE_DRAFT)
          }}
          ref={noteDialogRef}
        >
          <form className="dialog-body" id="note-form" method="dialog" onSubmit={handleNote}>
            <div className="dialog-header">
              <h2 id="dialog-title">{editingNote ? '付箋を編集' : '付箋を追加'}</h2>
              <button
                aria-label="閉じる"
                className="icon-button"
                disabled={busy}
                onClick={() => noteDialogRef.current?.close()}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="form-field">
              <label htmlFor="note-title-input">タイトル *</label>
              <input
                id="note-title-input"
                maxLength={60}
                onChange={(event) => setNoteDraft((draft) => ({ ...draft, title: event.target.value }))}
                placeholder="例：東京タワー"
                ref={noteTitleRef}
                required
                value={noteDraft.title}
              />
            </div>
            <div className="form-field">
              <label htmlFor="note-memo-input">補足メモ</label>
              <textarea
                id="note-memo-input"
                onChange={(event) => setNoteDraft((draft) => ({ ...draft, memo: event.target.value }))}
                placeholder="わかっていることをメモ"
                value={noteDraft.memo}
              />
            </div>
            <div className="form-field">
              <label htmlFor="note-attrs-input">属性（読点「、」区切り）</label>
              <input
                id="note-attrs-input"
                onChange={(event) => setNoteDraft((draft) => ({ ...draft, attrs: event.target.value }))}
                placeholder="場所、所要時間、希望時間帯"
                value={noteDraft.attrs}
              />
            </div>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => noteDialogRef.current?.close()}
                type="button"
              >
                キャンセル
              </button>
              <button className="primary-button" disabled={busy} id="save-note" type="submit">
                保存する
              </button>
            </div>
          </form>
        </dialog>
      </div>
    </>
  )
}

function sortNotesByPosition(notes: Note[]): Note[] {
  if (!notes.some((note) => note.x !== 0 || note.y !== 0)) return notes
  return [...notes].sort((left, right) => left.y - right.y || left.x - right.x || left.updated_at.localeCompare(right.updated_at))
}

function readLocationHash() {
  try {
    return decodeURIComponent(window.location.hash.slice(1))
  } catch {
    return window.location.hash.slice(1)
  }
}

function initialOf(name: string) {
  return Array.from(name.trim())[0] ?? '？'
}

function messageDayKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatMessageDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function noteAttributeLabels(attrs: Note['attrs']): string[] {
  if (Array.isArray(attrs)) return attrs.flatMap(formatAttributeValue)
  if (!attrs || typeof attrs !== 'object') return formatAttributeValue(attrs)
  return Object.values(attrs).flatMap(formatAttributeValue)
}

function formatAttributeValue(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) return value.flatMap(formatAttributeValue)
  if (typeof value === 'object') {
    return Object.values(value).flatMap(formatAttributeValue)
  }
  return [String(value)]
}

function resolveNoteAttributes(input: string, original?: Note['attrs']): NoteAttributes {
  const normalized = input
    .split('、')
    .map((value) => value.trim())
    .filter(Boolean)

  if (original && normalized.join('、') === noteAttributeLabels(original).join('、')) {
    return original as unknown as NoteAttributes
  }

  return Object.fromEntries(normalized.map((value, index) => [`item_${index + 1}`, value])) as NoteAttributes
}

const IDEAS_PAGE_STYLES = String.raw`
.ideas-page {
  --ink: #263238;
  --muted: #718096;
  --line: #e6e9ee;
  --surface: #ffffff;
  --canvas: #f6f8fb;
  --teal: #2a9d8f;
  --teal-dark: #217c72;
  --shadow: 0 10px 30px rgba(36, 52, 71, 0.08);
  color: var(--ink);
  background: var(--canvas);
  font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
  font-synthesis: none;
}
.ideas-page *, .ideas-page *::before, .ideas-page *::after { box-sizing: border-box; }
.ideas-page button, .ideas-page input, .ideas-page textarea { font: inherit; }
.ideas-page button { cursor: pointer; }
.ideas-page [hidden] { display: none !important; }
.ideas-page.page-shell {
  width: 100%;
  max-width: 1440px;
  min-width: 0;
  min-height: calc(100vh - 72px);
  margin: 0 auto;
  padding: 26px 32px 40px;
}
.ideas-page .page-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.ideas-page .eyebrow { display: block; color: var(--muted); font-size: 11px; letter-spacing: .08em; }
.ideas-page .page-title h1 { margin: 5px 0 0; font-size: 25px; font-weight: 700; letter-spacing: -.02em; line-height: 1.3; }
.ideas-page .page-title p { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
.ideas-page .title-actions { display: flex; gap: 8px; align-items: center; }
.ideas-page .icon-button,
.ideas-page .secondary-button,
.ideas-page .primary-button {
  border: 0;
  border-radius: 8px;
  color: var(--ink);
}
.ideas-page .icon-button { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; background: transparent; font-size: 17px; }
.ideas-page .icon-button:hover:not(:disabled), .ideas-page .secondary-button:hover:not(:disabled) { background: #f0f4f6; }
.ideas-page .primary-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  color: #fff;
  background: var(--teal);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}
.ideas-page .primary-button:hover:not(:disabled) { background: var(--teal-dark); }
.ideas-page .secondary-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 9px 14px;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 12px;
  font-weight: 700;
}
.ideas-page button:disabled { cursor: not-allowed; opacity: .55; }
.ideas-page :where(button, a, input, textarea):focus-visible {
  outline: 2px solid var(--teal-dark);
  outline-offset: 2px;
}
.ideas-page .page-error {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: -8px 0 16px;
  padding: 10px 13px;
  color: #8a4036;
  border: 1px solid #f0c7bf;
  border-radius: 8px;
  background: #fff4f1;
  font-size: 12px;
}
.ideas-page .page-error span { color: #715d59; }
.ideas-page .surface-card { max-width: 100%; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.ideas-page .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
.ideas-page .section-heading h2 { margin: 0; font-size: 15px; font-weight: 700; }
.ideas-page .section-heading p { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
.ideas-page .tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 20px;
  background: #eef7f5;
  color: var(--teal-dark);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}
.ideas-page .tag.ai { color: #7c5715; background: #fff6d9; }
.ideas-page .tag.manual { color: #586a7b; background: #edf1f5; }
.ideas-page .tag.held { color: #666; background: #eceef0; }
.ideas-page .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ideas-page .board-chat { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(380px, .85fr); gap: 18px; min-height: 670px; min-width: 0; }
.ideas-page .board-panel, .ideas-page .chat-panel { overflow: hidden; }
.ideas-page .board-panel { display: flex; flex-direction: column; }
.ideas-page .board-toolbar, .ideas-page .chat-toolbar { min-height: 66px; padding: 15px 18px; border-bottom: 1px solid var(--line); background: #fff; }
.ideas-page .board-toolbar .section-heading, .ideas-page .chat-toolbar .section-heading { align-items: flex-start; }
.ideas-page .board-canvas {
  position: relative;
  flex: 1;
  min-height: 600px;
  overflow: auto;
  background-color: #fcfdfd;
  background-image: radial-gradient(#dbe5e4 1px, transparent 1px);
  background-size: 20px 20px;
}
.ideas-page .board-canvas::before { content: "IDEAS"; position: absolute; top: 20px; right: 22px; color: #dce9e6; font-size: 56px; font-weight: 900; letter-spacing: .14em; }
.ideas-page .note-list {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 16px;
  padding: 22px;
}
.ideas-page .board-empty, .ideas-page .chat-empty {
  margin: 0;
  padding: 24px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}
.ideas-page .board-empty { grid-column: 1 / -1; border: 1px dashed #dce9e6; border-radius: 8px; background: rgba(255, 255, 255, .78); }
.ideas-page .ai-status {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 0 16px 16px;
  padding: 8px 11px;
  color: #526160;
  border: 1px solid #dfeae8;
  border-radius: 8px;
  background: rgba(255,255,255,.92);
  font-size: 11px;
}
.ideas-page .ai-status-detail { color: var(--muted); }
.ideas-page .ai-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--teal); box-shadow: 0 0 0 4px rgba(42,157,143,.13); animation: ideas-ai-pulse 1.4s ease-in-out infinite; }
@keyframes ideas-ai-pulse { 50% { box-shadow: 0 0 0 7px rgba(42,157,143,.06); } }
.ideas-page .note-card {
  position: relative;
  width: auto;
  min-width: 0;
  min-height: 154px;
  padding: 14px;
  border: 1px solid #eadfba;
  border-radius: 3px;
  background: #fff9d9;
  box-shadow: 3px 5px 12px rgba(75, 65, 30, .13);
}
.ideas-page .note-card:nth-of-type(2n) { background: #fff4c7; }
.ideas-page .note-card.user-note { background: #e5f4f1; border-color: #c5e5df; }
.ideas-page .note-card.held { color: #747474; background: #e8e8e6; border-color: #d7d7d3; filter: saturate(.2); }
.ideas-page .note-card.held .note-title, .ideas-page .note-card.held .note-memo { text-decoration: line-through; }
.ideas-page .note-card .pin { position: absolute; top: 9px; right: 10px; color: #b08d20; font-size: 12px; }
.ideas-page .note-title { margin: 9px 0 5px; padding-right: 18px; overflow-wrap: anywhere; font-size: 15px; font-weight: 800; line-height: 1.4; }
.ideas-page .note-memo { min-height: 32px; margin: 0 0 10px; color: #555a55; font-size: 11px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.ideas-page .note-attrs { display: flex; flex-wrap: wrap; gap: 4px; }
.ideas-page .note-attrs span { padding: 3px 6px; color: #6f674c; background: rgba(255,255,255,.64); border-radius: 3px; font-size: 9px; }
.ideas-page .note-footer { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; margin-top: 11px; padding-top: 8px; border-top: 1px dashed rgba(110,100,60,.2); }
.ideas-page .note-actions { display: flex; flex: 0 0 auto; gap: 4px; }
.ideas-page .note-actions button { min-width: 32px; min-height: 32px; padding: 3px 4px; border: 0; border-radius: 5px; background: transparent; color: #625f51; font-size: 10px; }
.ideas-page .note-actions button:hover:not(:disabled) { background: rgba(255, 255, 255, .68); }
.ideas-page .source-link { display: inline-flex; min-width: 0; min-height: 32px; align-items: center; overflow: hidden; max-width: 120px; color: #6f673f; white-space: nowrap; text-overflow: ellipsis; font-size: 9px; text-decoration: underline; }
.ideas-page .chat-panel { display: flex; flex-direction: column; }
.ideas-page .chat-members { display: flex; align-items: center; gap: 8px; margin-top: 5px; color: var(--muted); font-size: 11px; }
.ideas-page .avatar-stack { display: flex; }
.ideas-page .avatar { width: 28px; height: 28px; margin-left: -5px; display: grid; place-items: center; border: 2px solid var(--surface); border-radius: 50%; color: #fff; background: #e5a36f; font-size: 11px; font-weight: 700; }
.ideas-page .avatar:first-child { margin-left: 0; background: #668db9; }
.ideas-page .avatar:last-child { background: #8d77b3; }
.ideas-page .chat-messages { flex: 1; min-height: 0; overflow: auto; padding: 19px 18px; background: #fbfcfd; scroll-padding-block: 20px; }
.ideas-page .chat-day { margin: 2px 0 16px; color: var(--muted); font-size: 10px; text-align: center; }
.ideas-page .message { display: flex; gap: 9px; margin-bottom: 17px; scroll-margin-block: 20px; }
.ideas-page .message.mine { flex-direction: row-reverse; }
.ideas-page .message-avatar { flex: 0 0 30px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: #e8eef5; color: #58718c; font-size: 11px; font-weight: 700; }
.ideas-page .message:nth-of-type(2n) .message-avatar { color: #765b38; background: #f6e9d9; }
.ideas-page .message:nth-of-type(3n) .message-avatar { color: #725b9a; background: #eee7f7; }
.ideas-page .message-content { min-width: 0; max-width: 83%; }
.ideas-page .message-meta { display: flex; align-items: baseline; gap: 7px; margin-bottom: 4px; color: var(--muted); font-size: 10px; }
.ideas-page .mine .message-meta { justify-content: flex-end; }
.ideas-page .message-bubble { padding: 10px 12px; color: #3f4a54; border: 1px solid var(--line); border-radius: 4px 12px 12px 12px; background: #fff; font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.ideas-page .mine .message-bubble { border-color: #cee8e3; border-radius: 12px 4px 12px 12px; background: #e9f6f3; }
.ideas-page .message:target { animation: ideas-message-jump 1.5s ease; }
@keyframes ideas-message-jump { 0%, 100% { filter: none; } 30% { filter: drop-shadow(0 0 4px rgba(42,157,143,.55)); } }
.ideas-page .chat-composer { padding: 13px 15px 15px; border-top: 1px solid var(--line); background: #fff; }
.ideas-page .composer-wrap { display: flex; align-items: flex-end; gap: 8px; padding: 8px 9px 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fcfdfd; }
.ideas-page .composer-wrap:focus-within { border-color: #87c9c0; box-shadow: 0 0 0 2px rgba(42,157,143,.12); }
.ideas-page .composer-wrap textarea { flex: 1; min-width: 0; min-height: 44px; max-height: 76px; padding: 10px 0; border: 0; outline: 0; resize: vertical; color: var(--ink); background: transparent; font-size: 12px; line-height: 1.5; }
.ideas-page .composer-wrap textarea::placeholder { color: #87939e; }
.ideas-page .send-button { width: 44px; height: 44px; flex: 0 0 44px; border: 0; border-radius: 8px; color: white; background: var(--teal); font-size: 18px; font-weight: 700; }
.ideas-page .send-button:hover:not(:disabled) { background: var(--teal-dark); }
.ideas-page .note-dialog { width: min(420px, calc(100% - 30px)); max-height: min(90vh, 620px); margin: auto; padding: 0; overflow: auto; color: var(--ink); border: 0; border-radius: 14px; background: #fff; box-shadow: 0 20px 70px rgba(36,52,71,.3); font-family: inherit; }
.ideas-page .note-dialog::backdrop { background: rgba(36,52,71,.36); }
.ideas-page .dialog-body { padding: 20px; }
.ideas-page .dialog-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
.ideas-page .dialog-header h2 { margin: 0; font-size: 16px; font-weight: 700; }
.ideas-page .form-field { margin-bottom: 12px; }
.ideas-page .form-field label { display: block; margin-bottom: 5px; color: var(--muted); font-size: 10px; font-weight: 700; }
.ideas-page .form-field input, .ideas-page .form-field textarea { width: 100%; min-height: 44px; padding: 9px 10px; color: var(--ink); border: 1px solid var(--line); border-radius: 7px; background: #fff; outline-color: var(--teal); font-size: 12px; }
.ideas-page .form-field textarea { min-height: 72px; resize: vertical; }
.ideas-page .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 17px; }
@media (max-width: 980px) {
  .ideas-page .board-chat { grid-template-columns: 1fr; }
  .ideas-page .board-canvas { min-height: 570px; }
}
@media (max-width: 640px) {
  .ideas-page.page-shell { padding: 19px 12px 28px; }
  .ideas-page .page-title { display: block; margin-bottom: 16px; }
  .ideas-page .page-title h1 { font-size: 21px; }
  .ideas-page .title-actions { flex-wrap: wrap; margin-top: 13px; }
  .ideas-page .board-chat { display: flex; flex-direction: column; min-height: 0; gap: 12px; }
  .ideas-page .board-panel { height: 620px; min-height: 620px; }
  .ideas-page .chat-panel { min-height: 570px; }
  .ideas-page .board-canvas { min-height: 0; overflow: auto; }
  .ideas-page .note-list { grid-template-columns: 1fr; padding: 16px; }
  .ideas-page .note-card { min-height: 145px; }
  .ideas-page .ai-status { margin: 0 16px 16px; }
  .ideas-page .board-canvas::before { font-size: 36px; }
  .ideas-page .page-error { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  .ideas-page .ai-pulse, .ideas-page .message:target { animation: none; }
  .ideas-page * { scroll-behavior: auto !important; }
}
`
