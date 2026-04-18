import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getApi } from './api';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const GEOFENCE_TASK = 'SA_GEOFENCE_NOTIFY';
const PREF_KEY = 'geofence_notify_enabled';
const LAST_NOTIFIED_KEY = 'geofence_last_notified';
const DEBOUNCE_MS = 30 * 60 * 1000;

type Branch = {
  id: string;
  name: string;
  geofences: { id: string; latitude: number; longitude: number; radius_m: number }[];
};
type Resp = { data: { branches: Branch[] } };
type LastNotified = Record<string, number>;

async function readLastNotified(): Promise<LastNotified> {
  const raw = await SecureStore.getItemAsync(LAST_NOTIFIED_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LastNotified;
  } catch {
    return {};
  }
}

async function writeLastNotified(map: LastNotified) {
  await SecureStore.setItemAsync(LAST_NOTIFIED_KEY, JSON.stringify(map));
}

export async function isGeofenceNotifyEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(PREF_KEY);
  return v === '1';
}

async function fetchMyGeofences(): Promise<Branch[]> {
  const resp = await getApi().get('attendance/me/geofences').json<Resp>();
  return resp.data.branches;
}

function toGeofenceRegions(
  branches: Branch[],
): (Location.LocationRegion & { branchId: string; branchName: string })[] {
  const out: (Location.LocationRegion & { branchId: string; branchName: string })[] = [];
  for (const b of branches) {
    for (const g of b.geofences) {
      out.push({
        identifier: `${b.id}:${g.id}`,
        branchId: b.id,
        branchName: b.name,
        latitude: g.latitude,
        longitude: g.longitude,
        radius: g.radius_m,
        notifyOnEnter: true,
        notifyOnExit: false,
      });
    }
  }
  return out;
}

export async function enableGeofenceNotify(): Promise<{ ok: boolean; reason?: string }> {
  if (isExpoGo) return { ok: false, reason: 'expo_go_unsupported' };
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { ok: false, reason: 'foreground_denied' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) return { ok: false, reason: 'background_denied' };
  const notif = await Notifications.requestPermissionsAsync();
  if (!notif.granted) return { ok: false, reason: 'notifications_denied' };

  const branches = await fetchMyGeofences();
  const regions = toGeofenceRegions(branches);
  if (regions.length === 0) return { ok: false, reason: 'no_geofences' };

  const running = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (running) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
  }
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  await SecureStore.setItemAsync(PREF_KEY, '1');
  return { ok: true };
}

export async function disableGeofenceNotify(): Promise<void> {
  const running = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (running) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
  }
  await SecureStore.setItemAsync(PREF_KEY, '0');
}

export function defineGeofenceTask() {
  if (TaskManager.isTaskDefined(GEOFENCE_TASK)) return;
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
    if (error) return;
    const body = data as { eventType?: Location.GeofencingEventType; region?: Location.LocationRegion & { identifier: string } };
    if (!body?.region || body.eventType !== Location.GeofencingEventType.Enter) return;

    const [branchId] = body.region.identifier.split(':');
    const last = await readLastNotified();
    const now = Date.now();
    if (last[branchId] && now - last[branchId] < DEBOUNCE_MS) return;

    last[branchId] = now;
    await writeLastNotified(last);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nhắc chấm công',
        body: 'Bạn đang gần chi nhánh, nhớ check-in nhé!',
        sound: 'default',
      },
      trigger: null,
    });
  });
}
