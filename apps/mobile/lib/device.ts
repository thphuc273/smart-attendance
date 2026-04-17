import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

const FP_KEY = 'device_fingerprint';

/**
 * Returns a stable per-app-install device fingerprint.
 * Seeded from a UUID persisted in SecureStore, combined with OS build id.
 */
export async function getDeviceFingerprint(): Promise<string> {
  let fp = await SecureStore.getItemAsync(FP_KEY);
  if (!fp) {
    const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const osBuild = Device.osInternalBuildId ?? Device.osBuildId ?? 'unknown';
    fp = `${Device.osName?.toLowerCase() ?? 'native'}-${osBuild}-${uuid}`;
    await SecureStore.setItemAsync(FP_KEY, fp);
  }
  return fp;
}

export function getDeviceName(): string {
  return Device.deviceName ?? `${Device.manufacturer ?? 'Unknown'} ${Device.modelName ?? ''}`.trim();
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  const osName = (Device.osName ?? '').toLowerCase();
  if (osName.includes('ios') || osName.includes('iphone') || osName.includes('ipad')) return 'ios';
  if (osName.includes('android')) return 'android';
  return 'web';
}
