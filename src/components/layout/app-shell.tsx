import { useState, type ReactNode } from 'react'
import { Bell, CalendarDays, Lightbulb, Map, Users } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { enablePushNotifications } from '@/services/push.service'

export function AppShell({ children, tripId }: { children: ReactNode; tripId?: string }) {
  const [pushBusy, setPushBusy] = useState(false)
  const navigation = tripId
    ? [
        { to: `/trips/${tripId}/ideas`, label: 'アイデア', icon: Lightbulb },
        { to: `/trips/${tripId}/plan`, label: 'プラン', icon: Map },
        { to: '/calendar', label: 'カレンダー', icon: CalendarDays },
      ]
    : [{ to: '/', label: '旅行一覧', icon: Users }]

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
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-4 md:px-8">
          <Link className="flex min-h-11 items-center gap-2 font-bold tracking-wide" to="/">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">A</span>
            <span>AIAU</span>
          </Link>
          <nav aria-label="メインナビゲーション" className="ml-auto flex items-center gap-1 overflow-x-auto">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    isActive && 'bg-accent text-accent-foreground',
                  )
                }
                key={to}
                to={to}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <button
            aria-label="Web Push通知を有効にする"
            className="grid size-11 shrink-0 place-items-center rounded-md border hover:bg-accent disabled:opacity-50"
            disabled={pushBusy}
            onClick={() => void enablePush()}
            title="Web Push通知を有効にする"
            type="button"
          >
            <Bell aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] p-4 md:p-8">{children}</main>
    </div>
  )
}
