import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { ApiClient } from './api';
import { newConversationId } from './chatHistory';

const installationKey = 'lekka_push_installation';
export function pushInstallationId() {
  let id = localStorage.getItem(installationKey);
  if (!id) { id = newConversationId(); localStorage.setItem(installationKey, id); }
  return id;
}

export function startRemotePush(api: ApiClient, handlers: {
  status: (status: string) => void;
  received: (title: string) => void;
  opened: (screen: string) => void;
  error: (detail: string) => void;
}) {
  let disposed = false;
  const listeners: PluginListenerHandle[] = [];
  const add = async (listener: Promise<PluginListenerHandle>) => {
    const handle = await listener;
    if (disposed) await handle.remove(); else listeners.push(handle);
  };
  const register = async () => {
    const status = await api.pushStatus(pushInstallationId());
    if (disposed) return;
    if (!status.configured) { handlers.status('Firebase setup needed'); return; }
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
    if (disposed) return;
    if (permission.receive !== 'granted') { handlers.status('Permission denied'); return; }
    await PushNotifications.createChannel({ id: 'lekka_alerts', name: 'Lekka alerts', importance: 4, visibility: 0, vibration: true });
    await add(PushNotifications.addListener('registration', async ({ value }) => {
      try {
        await api.registerPushDevice(pushInstallationId(), value);
        if (!disposed) handlers.status('Connected');
      } catch (error) {
        if (!disposed) { handlers.status('Registration failed'); handlers.error(error instanceof Error ? error.message : 'Phone registration failed'); }
      }
    }));
    await add(PushNotifications.addListener('registrationError', () => {
      if (!disposed) { handlers.status('Registration failed'); handlers.error('FCM registration failed. Check Android Firebase configuration.'); }
    }));
    await add(PushNotifications.addListener('pushNotificationReceived', (notification) => {
      if (!disposed) handlers.received(notification.title || 'New Lekka notification');
    }));
    await add(PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      if (!disposed) handlers.opened(notification.data?.screen || 'review');
    }));
    if (!disposed) { handlers.status('Connecting'); await PushNotifications.register(); }
  };
  if (Capacitor.isNativePlatform()) register().catch((error) => {
    if (!disposed) { handlers.status('Unavailable'); handlers.error(error instanceof Error ? error.message : 'Push setup failed'); }
  });
  else handlers.status('Android app required');
  return () => { disposed = true; listeners.forEach((listener) => void listener.remove()); };
}

export async function stopRemotePush(api: ApiClient) {
  await api.unregisterPushDevice(pushInstallationId());
  if (Capacitor.isNativePlatform()) await PushNotifications.unregister();
}
