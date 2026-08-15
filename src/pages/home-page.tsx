import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { ArrowRight, Link2, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/layout/states'
import { createTrip, joinTrip, listTrips } from '@/repositories/trips.repository'
import type { Trip } from '@/types/domain'

export function HomePage() {
  const navigate = useNavigate()
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
      sessionStorage.setItem(`aiau:invite:${result.tripId}`, result.inviteToken)
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
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-muted-foreground">共同旅行プランナー</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">行きたいを、みんなの予定へ。</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          チャットから付箋を整理し、投票できる時間軸とカレンダーへつなげます。
        </p>
      </section>

      {error && <ErrorState message={error} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <form className="space-y-4 rounded-xl border bg-card p-5" onSubmit={handleCreate}>
          <div className="flex items-center gap-2">
            <Plus aria-hidden="true" className="size-5" />
            <h2 className="text-lg font-semibold">旅行を作る</h2>
          </div>
          <Field label="旅行名" name="title" placeholder="週末の東京アート旅" required />
          <Field label="あなたのニックネーム" name="nickname" placeholder="あい" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="開始" name="startsAt" type="datetime-local" />
            <Field label="終了" name="endsAt" type="datetime-local" />
          </div>
          <Button className="min-h-11 w-full" disabled={busy} type="submit">
            旅行を作成
          </Button>
        </form>

        <form className="space-y-4 rounded-xl border bg-card p-5" onSubmit={handleJoin}>
          <div className="flex items-center gap-2">
            <Link2 aria-hidden="true" className="size-5" />
            <h2 className="text-lg font-semibold">招待から参加</h2>
          </div>
          <Field label="招待トークン" name="token" placeholder="共有されたトークン" required />
          <Field label="あなたのニックネーム" name="nickname" placeholder="ゆき" required />
          <Button className="min-h-11 w-full" disabled={busy} type="submit" variant="secondary">
            参加する
          </Button>
        </form>
      </div>

      <section>
        <h2 className="text-lg font-semibold">参加中の旅行</h2>
        {loading ? (
          <LoadingState />
        ) : trips.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <button
                className="flex min-h-24 items-center justify-between rounded-xl border bg-card p-4 text-left hover:border-primary/50"
                key={trip.id}
                onClick={() => navigate(`/trips/${trip.id}/ideas`)}
                type="button"
              >
                <span>
                  <strong className="block">{trip.title}</strong>
                  <span className="mt-1 block text-sm text-muted-foreground">{trip.timezone}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-5" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">まだ旅行がありません。</p>
        )}
      </section>
    </div>
  )
}

function Field({ label, name, ...props }: { label: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium">
      <span>{label}</span>
      <input
        className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        name={name}
        {...props}
      />
    </label>
  )
}
