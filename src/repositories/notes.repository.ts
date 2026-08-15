import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireData, throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Note, NoteAttributes } from '@/types/domain'

export type NoteDraft = {
  title: string
  memo?: string | null
  attrs?: NoteAttributes
  x?: number
  y?: number
}

export async function listNotes(tripId: string): Promise<Note[]> {
  const { data, error } = await getSupabase()
    .from('notes')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  throwIfError(error)
  return data ?? []
}

export async function createNote(tripId: string, authorId: string, draft: NoteDraft): Promise<Note> {
  const { data, error } = await getSupabase()
    .from('notes')
    .insert({
      trip_id: tripId,
      author_id: authorId,
      title: draft.title,
      memo: draft.memo,
      attrs: draft.attrs ?? {},
      origin: 'user',
      user_touched: true,
      x: draft.x ?? 0,
      y: draft.y ?? 0,
    })
    .select()
    .single()
  throwIfError(error)
  return requireData(data, 'Note creation did not return data')
}

export async function updateNote(noteId: string, updates: Partial<NoteDraft>): Promise<Note> {
  const { data, error } = await getSupabase()
    .from('notes')
    .update({ ...updates, user_touched: true })
    .eq('id', noteId)
    .select()
    .single()
  throwIfError(error)
  return requireData(data, 'Note update did not return data')
}

export async function moveNote(noteId: string, x: number, y: number): Promise<Note> {
  const { data, error } = await getSupabase()
    .from('notes')
    .update({ x, y, user_touched: true })
    .eq('id', noteId)
    .select()
    .single()
  throwIfError(error)
  return requireData(data, 'Note move did not return data')
}

export async function holdNote(noteId: string, reason: string): Promise<Note> {
  const { data, error } = await getSupabase()
    .from('notes')
    .update({ status: 'held', hold_reason: reason, user_touched: true })
    .eq('id', noteId)
    .select()
    .single()
  throwIfError(error)
  return requireData(data, 'Note hold did not return data')
}

export async function activateNote(noteId: string): Promise<Note> {
  const { data, error } = await getSupabase()
    .from('notes')
    .update({ status: 'active', hold_reason: null, user_touched: true })
    .eq('id', noteId)
    .select()
    .single()
  throwIfError(error)
  return requireData(data, 'Note activation did not return data')
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notes')
    .update({ deleted_at: new Date().toISOString(), user_touched: true })
    .eq('id', noteId)
  throwIfError(error)
}

export async function undoNoteOperation(operationId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('undo_note_operation', { p_operation_id: operationId })
  throwIfError(error)
  return requireData(data, 'Undo did not return a note ID')
}

export function createNoteChannel(
  tripId: string,
  onChange: (payload: RealtimePostgresChangesPayload<Note>) => void,
  onDrag: (payload: { noteId: string; x: number; y: number; userId: string }) => void,
): RealtimeChannel {
  return getSupabase()
    .channel(`trip:${tripId}:notes`, { config: { broadcast: { self: false } } })
    .on<Note>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes', filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .on('broadcast', { event: 'note_drag' }, ({ payload }) => onDrag(payload))
    .subscribe()
}

export async function broadcastNoteDrag(
  channel: RealtimeChannel,
  payload: { noteId: string; x: number; y: number; userId: string },
): Promise<void> {
  const status = await channel.send({ type: 'broadcast', event: 'note_drag', payload })
  if (status !== 'ok') {
    throw new Error(`Note drag broadcast failed: ${status}`)
  }
}
