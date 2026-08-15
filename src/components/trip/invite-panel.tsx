import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { forgetInviteToken, readInviteToken, storeInviteToken } from '@/lib/invite-token'
import { createInvite, listInvites, revokeInvite } from '@/repositories/trips.repository'
import type { TripInvite } from '@/types/domain'

export function InvitePanel({ tripId, canManage }: { tripId: string; canManage: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [invites, setInvites] = useState<TripInvite[]>([])
  const [token, setToken] = useState<string | null>(() => readInviteToken(tripId))
  const [tokenInviteId, setTokenInviteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!canManage) return
    setLoading(true)
    try {
      setInvites(await listInvites(tripId))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '招待の一覧を取得できませんでした')
    } finally {
      setLoading(false)
    }
  }, [canManage, tripId])

  useEffect(() => {
    setToken(readInviteToken(tripId))
    setTokenInviteId(null)
  }, [tripId])

  function open() {
    setCopied(false)
    void refresh()
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const expiresAtInput = String(new FormData(event.currentTarget).get('expiresAt') ?? '')
    setBusy(true)
    setCopied(false)
    setError(null)
    try {
      const expiresAt = expiresAtInput ? new Date(expiresAtInput).toISOString() : undefined
      const issued = await createInvite(tripId, expiresAt)
      storeInviteToken(tripId, issued)
      setToken(issued)
      const nextInvites = await listInvites(tripId)
      setInvites(nextInvites)
      setTokenInviteId(nextInvites[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '招待トークンを発行できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setError(null)
    } catch {
      setCopied(false)
      setError('自動コピーできませんでした。トークンを選択して手動でコピーしてください')
    }
  }

  async function handleRevoke(invite: TripInvite) {
    if (!window.confirm('この招待トークンを失効させますか？失効後は参加に使えません。')) return
    setBusy(true)
    setError(null)
    try {
      await revokeInvite(invite.id)
      if (invite.id === tokenInviteId) {
        forgetInviteToken(tripId)
        setToken(null)
        setTokenInviteId(null)
      }
      setInvites(await listInvites(tripId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '招待トークンを失効できませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <style>{INVITE_PANEL_STYLES}</style>
      <button className="secondary-button" id="open-invite-panel" onClick={open} type="button">
        招待
      </button>
      <dialog aria-labelledby="invite-dialog-title" className="note-dialog invite-dialog" ref={dialogRef}>
        <div className="dialog-body">
          <div className="dialog-header">
            <h2 id="invite-dialog-title">メンバーを招待</h2>
            <button
              aria-label="閉じる"
              className="icon-button"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              ×
            </button>
          </div>

          <p className="invite-help">
            招待トークンはホーム画面の「旅行に参加する」に入力してもらいます。トークンは発行直後のみ表示できます。
          </p>

          {error && (
            <p className="invite-error" role="alert">
              {error}
            </p>
          )}

          {token ? (
            <div className="invite-token">
              <span className="invite-token-label">現在のトークン</span>
              <code>{token}</code>
              <div className="invite-token-actions">
                <button className="secondary-button" onClick={() => void handleCopy()} type="button">
                  コピー
                </button>
                <span aria-live="polite" className="invite-copied" role="status">
                  {copied ? 'コピーしました' : ''}
                </span>
              </div>
            </div>
          ) : (
            <p className="invite-empty">
              {canManage
                ? '表示できるトークンがありません。下のボタンから新しく発行してください。'
                : 'トークンの発行は旅行の作成者（オーナー）のみ可能です。オーナーに共有を依頼してください。'}
            </p>
          )}

          {canManage && (
            <>
              <form className="invite-form" onSubmit={handleCreate}>
                <div className="form-field">
                  <label htmlFor="invite-expires-at">有効期限（任意）</label>
                  <input id="invite-expires-at" name="expiresAt" type="datetime-local" />
                </div>
                <button className="primary-button" disabled={busy} type="submit">
                  {busy ? '処理中…' : 'トークンを発行'}
                </button>
              </form>

              <div className="invite-list">
                <h3>発行済みの招待</h3>
                {loading ? (
                  <p className="invite-empty" role="status">
                    読み込み中…
                  </p>
                ) : invites.length ? (
                  <ul>
                    {invites.map((invite) => {
                      const revoked = Boolean(invite.revoked_at)
                      const expired = Boolean(invite.expires_at && new Date(invite.expires_at) <= new Date())
                      return (
                        <li key={invite.id}>
                          <div className="invite-row-main">
                            <span className={`tag ${revoked || expired ? 'held' : ''}`}>
                              {revoked ? '失効済み' : expired ? '期限切れ' : '有効'}
                            </span>
                            <span className="invite-row-meta">
                              発行 {formatInviteDate(invite.created_at)}
                              {invite.expires_at ? ` / 期限 ${formatInviteDate(invite.expires_at)}` : ' / 期限なし'}
                            </span>
                          </div>
                          <button
                            className="secondary-button"
                            disabled={busy || revoked}
                            onClick={() => void handleRevoke(invite)}
                            type="button"
                          >
                            失効
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="invite-empty">発行済みの招待はありません。</p>
                )}
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}

function formatInviteDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const INVITE_PANEL_STYLES = String.raw`
.invite-dialog { width: min(460px, calc(100% - 30px)); }
.invite-dialog .invite-help { margin: 0 0 12px; color: #718096; font-size: 11px; line-height: 1.7; }
.invite-dialog .invite-error { margin: 0 0 12px; padding: 9px 11px; color: #8a4036; border: 1px solid #f0c7bf; border-radius: 8px; background: #fff4f1; font-size: 11px; }
.invite-dialog .invite-token { padding: 12px; border: 1px solid #cee8e3; border-radius: 10px; background: #f2faf8; }
.invite-dialog .invite-token-label { display: block; margin-bottom: 6px; color: #718096; font-size: 10px; font-weight: 700; }
.invite-dialog .invite-token code { display: block; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; }
.invite-dialog .invite-token-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.invite-dialog .invite-copied { color: #217c72; font-size: 10px; }
.invite-dialog .invite-empty { margin: 0; color: #718096; font-size: 11px; line-height: 1.7; }
.invite-dialog .invite-form { display: flex; align-items: flex-end; gap: 8px; margin-top: 16px; }
.invite-dialog .invite-form .form-field { flex: 1; margin-bottom: 0; }
.invite-dialog .invite-list { margin-top: 18px; padding-top: 14px; border-top: 1px solid #e6e9ee; }
.invite-dialog .invite-list h3 { margin: 0 0 10px; font-size: 12px; font-weight: 700; }
.invite-dialog .invite-list ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.invite-dialog .invite-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border: 1px solid #e6e9ee; border-radius: 8px; }
.invite-dialog .invite-row-main { display: grid; gap: 5px; min-width: 0; }
.invite-dialog .invite-row-main .tag { justify-self: start; }
.invite-dialog .invite-row-meta { color: #718096; font-size: 10px; }
`
