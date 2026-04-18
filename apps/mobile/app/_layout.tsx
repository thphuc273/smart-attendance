import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { defineGeofenceTask } from '../lib/geofence-notify';

// Background task must be defined at module scope, before any component mounts,
// so the TaskManager daemon can invoke it after app termination.
defineGeofenceTask();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
    </SafeAreaProvider>
  );
}
