import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/app-shell'
import { ErrorState, LoadingState } from '@/components/layout/states'
import { useSession } from '@/hooks/use-session'

const CalendarPage = lazy(() => import('@/pages/calendar-page').then((module) => ({ default: module.CalendarPage })))
const HomePage = lazy(() => import('@/pages/home-page').then((module) => ({ default: module.HomePage })))
const IdeasPage = lazy(() => import('@/pages/ideas-page').then((module) => ({ default: module.IdeasPage })))
const PlanPage = lazy(() => import('@/pages/plan-page').then((module) => ({ default: module.PlanPage })))

function App() {
  const sessionState = useSession()

  if (!sessionState.configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
        <ErrorState message="VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を設定してください" />
      </main>
    )
  }
  if (sessionState.loading) return <LoadingState label="匿名セッションを準備中" />
  if (sessionState.error || !sessionState.session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
        <ErrorState message={sessionState.error ?? '匿名セッションを開始できませんでした'} />
      </main>
    )
  }

  const userId = sessionState.session.user.id
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingState label="画面を読み込み中" />}>
        <Routes>
        <Route
          path="/"
          element={
            <AppShell>
              <HomePage />
            </AppShell>
          }
        />
        <Route path="/trips/:tripId/ideas" element={<TripPage><IdeasPage userId={userId} /></TripPage>} />
        <Route path="/trips/:tripId/plan" element={<TripPage><PlanPage userId={userId} /></TripPage>} />
        <Route
          path="/calendar"
          element={
            <AppShell>
              <CalendarPage userId={userId} />
            </AppShell>
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  )
}

function TripPage({ children }: { children: ReactNode }) {
  const { tripId } = useParams()
  if (!tripId) return <Navigate replace to="/" />
  return <AppShell tripId={tripId}>{children}</AppShell>
}

export default App
