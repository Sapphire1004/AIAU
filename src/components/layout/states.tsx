import { AlertCircle, LoaderCircle } from 'lucide-react'

export function LoadingState({ label = '読み込み中' }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-sm" role="alert">
      <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
      <div>
        <p className="font-semibold">処理に失敗しました</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
