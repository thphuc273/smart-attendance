import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getStoredUser, hasToken, homeFor } from './_lib/api';
import { colors } from './_lib/theme';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      if (!(await hasToken())) {
        router.replace('/login' as never);
        return;
      }
      const user = await getStoredUser();
      if (!user) {
        router.replace('/login' as never);
        return;
      }
      router.replace(homeFor(user) as never);
    })();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brand600} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
