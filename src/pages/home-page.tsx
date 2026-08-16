import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { ArrowRight, Link2, Plus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { INVITE_QUERY_PARAM } from '@/lib/invite-link'
import { storeInviteToken } from '@/lib/invite-token'
import { createTrip, joinTrip, listTrips } from '@/repositories/trips.repository'
import type { Trip } from '@/types/domain'

export function HomePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invitedToken = searchParams.get(INVITE_QUERY_PARAM)?.trim() ?? ''
  const [token, setToken] = useState(invitedToken)
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      setTrips(await listTrips())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '旅行を取得できませんでした')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (invitedToken) setToken(invitedToken)
  }, [invitedToken])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const result = await createTrip({
        title: String(form.get('title')),
        nickname: String(form.get('nickname')),
        startsAt: form.get('startsAt') ? new Date(String(form.get('startsAt'))).toISOString() : undefined,
        endsAt: form.get('endsAt') ? new Date(String(form.get('endsAt'))).toISOString() : undefined,
      })
      storeInviteToken(result.tripId, result.inviteToken)
      navigate(`/trips/${result.tripId}/ideas`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '旅行を作成できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const tripId = await joinTrip(String(form.get('token')).trim(), String(form.get('nickname')).trim())
      navigate(`/trips/${tripId}/ideas`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '旅行へ参加できませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="home-page page-shell">
      <div className="page-title">
        <div>
          <span className="eyebrow">AIAU · COLLABORATIVE TRIP PLANNER</span>
          <h1>お出かけを、みんなで組み立てる</h1>
          <p>チャットのアイデアを付箋に集め、プランとカレンダーへつなぎます。</p>
        </div>
      </div>

      <div className="home-intro-note mock-note">
        <span>旅行を新しく作るか、共有された招待トークンで参加してください。</span>
      </div>

      {error && <p className="home-feedback" role="alert">{error}</p>}

      <section aria-labelledby="home-actions-heading" className="home-action-card surface-card">
        <div className="home-section-heading section-heading">
          <div>
            <span className="eyebrow">GET STARTED</span>
            <h2 id="home-actions-heading">旅行を始める</h2>
            <p>新しい旅行を作成するか、参加中の旅行へ合流します。</p>
          </div>
          <span className="tag"><span aria-hidden="true" className="dot" />匿名で利用できます</span>
        </div>

        <div className="home-actions-grid">
          <form className="home-form-card surface-card" onSubmit={handleCreate}>
            <div className="home-form-heading">
              <span className="tag"><Plus aria-hidden="true" />新しい旅行</span>
              <h3>旅行を作る</h3>
              <p>旅行名とニックネームを決めると、アイデアボードが開きます。</p>
            </div>
            <Field label="旅行名" name="title" placeholder="週末の東京アート旅" required />
            <Field id="home-create-nickname" label="あなたのニックネーム" name="nickname" placeholder="あい" required />
            <div className="home-date-grid">
              <Field label="開始" name="startsAt" type="datetime-local" />
              <Field label="終了" name="endsAt" type="datetime-local" />
            </div>
            <button className="home-submit primary-button" disabled={busy} type="submit">
              {busy ? '処理中…' : '旅行を作成'}
            </button>
          </form>

          <form className="home-form-card surface-card" onSubmit={handleJoin}>
            <div className="home-form-heading">
              <span className="tag manual"><Link2 aria-hidden="true" />招待から参加</span>
              <h3>旅行に参加する</h3>
              <p>メンバーから共有された招待リンクを開くか、招待トークンと表示する名前を入力します。</p>
            </div>
            {invitedToken && (
              <p className="home-invite-note" role="status">
                招待リンクからトークンを読み込みました。ニックネームを入力して参加してください。
              </p>
            )}
            <Field
              label="招待トークン"
              name="token"
              onChange={(event) => setToken(event.currentTarget.value)}
              placeholder="共有されたトークン"
              required
              value={token}
            />
            <Field
              autoFocus={Boolean(invitedToken)}
              id="home-join-nickname"
              label="あなたのニックネーム"
              name="nickname"
              placeholder="ゆき"
              required
            />
            <button className="home-submit secondary-button" disabled={busy} type="submit">
              {busy ? '処理中…' : '参加する'}
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="joined-trips-heading" className="home-trips-card surface-card">
        <div className="home-section-heading section-heading">
          <div>
            <span className="eyebrow">YOUR TRIPS</span>
            <h2 id="joined-trips-heading">参加中の旅行</h2>
          </div>
          {!loading && <span className="tag"><span aria-hidden="true" className="dot" />{trips.length}件</span>}
        </div>
        {loading ? (
          <p className="home-feedback" role="status">旅行を読み込み中…</p>
        ) : trips.length ? (
          <div className="home-trip-list">
            {trips.map((trip, index) => (
              <button
                className="home-trip-card surface-card"
                key={trip.id}
                onClick={() => navigate(`/trips/${trip.id}/ideas`)}
                type="button"
              >
                <span className="eyebrow">TRIP {String(index + 1).padStart(2, '0')}</span>
                <h3>{trip.title}</h3>
                <p>{trip.timezone}</p>
                <span className="text-button">アイデアボードを開く <ArrowRight aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        ) : (
          <p className="home-empty">まだ参加中の旅行はありません。上のフォームから旅行を作成または参加できます。</p>
        )}
      </section>
    </div>
  )
}

function Field({ label, name, id, ...props }: { label: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = id ?? `home-${name}`
  return (
    <div className="form-field home-field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} name={name} {...props} />
    </div>
  )
}
