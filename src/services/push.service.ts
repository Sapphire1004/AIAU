import { savePushSubscription } from '@/repositories/notifications.repository'

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/')
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new Uint8Array(bytes.buffer)
}

export async function enablePushNotifications(): Promise<PushSubscription> {
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) {
    throw new Error('VAPID public key is not configured')
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported')
  }

  const permission = await Notification.requestPermission()
  if (permission === 'denied') {
    throw new Error('ブラウザのサイト設定で、このサイトの通知を「許可」に変更してください')
  }
  if (permission !== 'granted') {
    throw new Error('通知の許可が完了しませんでした。もう一度ベルボタンを押してください')
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(publicKey),
    }))
  await savePushSubscription(subscription)
  return subscription
}
