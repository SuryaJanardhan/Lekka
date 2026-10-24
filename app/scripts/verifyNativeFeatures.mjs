import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const apiSource = readFileSync(resolve(root, 'src/api.ts'), 'utf8');
const capacitorConfig = readFileSync(resolve(root, 'capacitor.config.json'), 'utf8');
const androidManifest = readFileSync(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const remotePushSource = readFileSync(resolve(root, 'src/remotePush.ts'), 'utf8');

const checks = [
  {
    name: 'enabled biometrics auto-prompt once on a native locked launch without overlapping requests',
    pass: appSource.includes('autoBiometricAttempted.current = true') && appSource.includes('void biometricUnlock()') && appSource.includes('if (biometricBusy.current) return;')
  },
  {
    name: 'cache-first hydration replaces startup health checks and repeated entity reads',
    pass: appSource.includes('dataSync.hydrate()') && appSource.includes('dataSync.synchronize(force)') && !appSource.includes('checkConnection()') && !appSource.includes('api.getEntries()')
  },
  {
    name: 'cached push registration preserves native listeners without per-open backend status calls',
    pass: remotePushSource.includes('cached?.hash === hash') && remotePushSource.includes("addListener('pushNotificationReceived'") && !remotePushSource.includes('api.pushStatus(')
  },
  {
    name: 'native foreground push alerts and high-importance Android channel are configured',
    pass: JSON.parse(capacitorConfig).plugins?.PushNotifications?.presentationOptions?.includes('alert') && remotePushSource.includes('importance: 4')
  },
  {
    name: 'biometric unlock requires checkBiometry availability',
    pass: appSource.includes('if (!check.isAvailable)')
  },
  {
    name: 'biometric unlock waits for authenticate before unlocking',
    pass: /await BiometricAuth\.authenticate[\s\S]*setIsUnlocked\(true\)/.test(appSource)
  },
  {
    name: 'biometric unlock does not allow device credential fallback',
    pass: appSource.includes('allowDeviceCredential: false')
  },
  {
    name: 'local notifications create Android channel',
    pass: appSource.includes('LocalNotifications.createChannel') && appSource.includes("id: notificationChannelId")
  },
  {
    name: 'local notifications check and request permission',
    pass: appSource.includes('LocalNotifications.checkPermissions') && appSource.includes('LocalNotifications.requestPermissions')
  },
  {
    name: 'local notifications schedule with channel id',
    pass: appSource.includes('channelId: notificationChannelId')
  },
  {
    name: 'real app flows can trigger device notifications',
    pass: appSource.includes("'Gmail sync', true") && appSource.includes("'Lekka transaction', true")
  },
  {
    name: 'settings verifies biometric before enabling preference',
    pass: appSource.includes('setBiometricPreference') && appSource.includes('Confirm Lekka biometrics')
  },
  {
    name: 'capacitor has local notification android config',
    pass: capacitorConfig.includes('"LocalNotifications"') && capacitorConfig.includes('"ic_stat_lekka"')
  },
  {
    name: 'Android keyboard resizes content and hides bottom navigation',
    pass: androidManifest.includes('android:windowSoftInputMode="adjustResize"') && appSource.includes('window.visualViewport') && appSource.includes('keyboard-editing')
  },
  {
    name: 'AI assistant calls backend chat endpoint',
    pass: appSource.includes('api.sendChatMessage') && apiSource.includes("'/api/chat'")
  }
];

const failed = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
