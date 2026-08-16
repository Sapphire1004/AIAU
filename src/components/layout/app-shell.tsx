import { useEffect, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import '@/mockups.css'
import { avatarToneClass } from '@/lib/avatar-tone'
import { getTrip, getTripMembers, subscribeToTripMembers } from '@/repositories/trips.repository'
import { enablePushNotifications } from '@/services/push.service'

type HeaderMember = {
  userId: string
  nickname: string
}

type HeaderTrip = {
  id: string
  title: string
  members: HeaderMember[]
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
  const members = currentHeaderTrip?.members ?? []
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

    const headerTripId = activeTripId
    setHeaderLoading(true)
    setHeaderLoadFailed(false)

    function loadHeader() {
      return Promise.all([getTrip(headerTripId), getTripMembers(headerTripId)])
        .then(([trip, tripMembers]) => {
          if (!active) return
          setHeaderTrip({
            id: headerTripId,
            title: trip.title,
            members: tripMembers.map((member) => ({ userId: member.user_id, nickname: member.nickname })),
          })
          setHeaderLoadFailed(false)
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
    }

    void loadHeader()
    const memberChannel = subscribeToTripMembers(headerTripId, 'header', () => void loadHeader())

    return () => {
      active = false
      void memberChannel.unsubscribe()
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
          <span className="brand-mark">旅</span>
          <span className="brand-name">タビアミ</span>
        </Link>
        <div className="trip-switcher">
          <small>
            {activeTripId
              ? headerLoading
                ? '旅行を読み込み中'
                : headerLoadFailed
                  ? '旅行情報を取得できません'
                  : `旅行 / 参加中 ${members.length}人`
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
          {members.length > 0 && (
            <div aria-label={`参加者 ${members.length}人`} className="avatar-stack" role="group">
              {members.slice(0, 3).map((member) => (
                <span className={`avatar ${avatarToneClass(member.userId)}`} key={member.userId} title={member.nickname}>
                  {Array.from(member.nickname.trim())[0] ?? '旅'}
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
