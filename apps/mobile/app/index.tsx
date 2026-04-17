import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { hasToken } from './_lib/api';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // expo-router generates typed routes via `expo start`; cast until first run.
      if (await hasToken()) {
        router.replace('/checkin' as never);
      } else {
        router.replace('/login' as never);
      }
    })();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
});
