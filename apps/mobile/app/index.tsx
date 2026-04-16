import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Smart Attendance</Text>
      <Text style={styles.subtitle}>Nhân viên — Day 1 skeleton</Text>
      <Link href="/login" style={styles.link}>
        → Đăng nhập
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { marginTop: 4, color: '#64748b' },
  link: { marginTop: 24, color: '#0f172a', textDecorationLine: 'underline' },
});
