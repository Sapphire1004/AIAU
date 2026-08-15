import { useEffect, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import '@/mockups.css'
import { getTrip, getTripMembers } from '@/repositories/trips.repository'
import { enablePushNotifications } from '@/services/push.service'

type HeaderTrip = {
  id: string
  title: string
  memberNames: string[]
}

export function AppShell({ children, tripId }: { children: ReactNode; tripId?: string }) {
  const [searchParams] = useSearchParams()
  const activeTripId = tripId ?? searchParams.get('tripId') ?? undefined
  const [pushBusy, setPushBusy] = useState(false)
  const [headerTrip, setHeaderTrip] = useState<HeaderTrip | null>(null)
  const [headerLoading, setHeaderLoading] = useState(Boolean(activeTripId))
  const [headerLoadFailed, setHeaderLoadFailed] = useState(false)
  const navigation = activeTripId
    ? [
        { to: `/trips/${activeTripId}/ideas`, label: 'アイデア' },
        { to: `/trips/${activeTripId}/plan`, label: 'プラン' },
        { to: `/calendar?tripId=${encodeURIComponent(activeTripId)}`, label: 'カレンダー' },
      ]
    : [{ to: '/', label: '旅行一覧' }]
  const currentHeaderTrip = headerTrip?.id === activeTripId ? headerTrip : null
  const memberNames = currentHeaderTrip?.memberNames ?? []
  const tripName = activeTripId
    ? currentHeaderTrip?.title ?? (headerLoading ? '読み込み中…' : '旅行')
    : '旅行を選択・作成'

  useEffect(() => {
    let active = true
    if (!activeTripId) {
      setHeaderTrip(null)
      setHeaderLoading(false)
      setHeaderLoadFailed(false)
      return () => {
        active = false
      }
    }

    setHeaderLoading(true)
    setHeaderLoadFailed(false)
    void Promise.all([getTrip(activeTripId), getTripMembers(activeTripId)])
      .then(([trip, members]) => {
        if (!active) return
        setHeaderTrip({
          id: activeTripId,
          title: trip.title,
          memberNames: members.map((member) => member.nickname),
        })
      })
      .catch(() => {
        if (active) {
          setHeaderTrip(null)
          setHeaderLoadFailed(true)
        }
      })
      .finally(() => {
        if (active) setHeaderLoading(false)
      })

    return () => {
      active = false
    }
  }, [activeTripId])

  async function enablePush() {
    setPushBusy(true)
    try {
      await enablePushNotifications()
      toast.success('Web Push通知を有効にしました')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Web Push通知を有効にできませんでした')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <Link className="brand" to="/">
          <span className="brand-mark">A</span>
          <span className="brand-name">AIAU</span>
        </Link>
        <div className="trip-switcher">
          <small>
            {activeTripId
              ? headerLoading
                ? '旅行を読み込み中'
                : headerLoadFailed
                  ? '旅行情報を取得できません'
                  : `旅行 / 参加中 ${memberNames.length}人`
              : '共同旅行プランナー'}
          </small>
          <span className="trip-name app-trip-name">{tripName}</span>
        </div>
        <nav aria-label="メインナビゲーション" className="main-nav">
          {navigation.map(({ to, label }) => (
            <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} end={to === '/'} key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          {memberNames.length > 0 && (
            <div aria-label={`参加者 ${memberNames.length}人`} className="avatar-stack" role="group">
              {memberNames.slice(0, 3).map((name, index) => (
                <span className="avatar" key={`${name}-${index}`} title={name}>
                  {Array.from(name.trim())[0] ?? '旅'}
                </span>
              ))}
            </div>
          )}
          <button
            aria-busy={pushBusy}
            aria-label="Web Push通知を有効にする"
            className="icon-button app-push-button"
            disabled={pushBusy}
            onClick={() => void enablePush()}
            title="Web Push通知を有効にする"
            type="button"
          >
            <Bell aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </>
  )
}
