import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ky from 'ky';
import { homeFor, storeUser } from '../lib/api';
import { colors, radius, shadow } from '../lib/theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type Form = z.infer<typeof schema>;

interface LoginResponse {
  data: {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; full_name: string; roles: string[] };
  };
}

export default function LoginScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@demo.com', password: 'Admin@123' },
  });

  const onSubmit = async (form: Form) => {
    setSubmitting(true);
    try {
      const res = await ky.post(`${API_BASE_URL}/auth/login`, { json: form }).json<LoginResponse>();
      await SecureStore.setItemAsync('access_token', res.data.access_token);
      await SecureStore.setItemAsync('refresh_token', res.data.refresh_token);
      await storeUser(res.data.user);
      router.replace(homeFor(res.data.user) as never);
    } catch (e) {
      Alert.alert('Đăng nhập thất bại', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.blob, { top: -80, right: -60, backgroundColor: colors.brand400, opacity: 0.18 }]} />
      <View style={[styles.blob, { bottom: -100, left: -80, backgroundColor: colors.pink500, opacity: 0.12 }]} />

      <View style={styles.content}>
        <View style={styles.hero}>
          <Image
            source={require('../assets/finos-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Smart Attendance</Text>
          <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="admin@demo.com"
                placeholderTextColor={colors.slate400}
                keyboardType="email-address"
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {formState.errors.email && <Text style={styles.error}>{formState.errors.email.message}</Text>}

          <Text style={[styles.label, { marginTop: 14 }]}>Mật khẩu</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.slate400}
                secureTextEntry
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {formState.errors.password && (
            <Text style={styles.error}>{formState.errors.password.message}</Text>
          )}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            disabled={submitting}
            onPress={handleSubmit(onSubmit)}
          >
            <Text style={styles.buttonText}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text>
          </Pressable>

          <Text style={styles.hint}>
            Demo: <Text style={styles.hintMono}>admin@demo.com</Text> / Admin@123
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', overflow: 'hidden' },
  blob: { position: 'absolute', width: 260, height: 260, borderRadius: 999 },
  content: { padding: 24 },
  hero: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 150, height: 48, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '700', color: colors.slate900 },
  subtitle: { marginTop: 4, fontSize: 14, color: colors.slate500 },
  card: { backgroundColor: colors.surface, padding: 22, borderRadius: radius.xl, ...shadow.card },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.slate900,
  },
  error: { color: colors.rose700, fontSize: 12, marginTop: 4 },
  button: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brand600,
    alignItems: 'center',
    ...shadow.button,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { marginTop: 14, textAlign: 'center', fontSize: 11, color: colors.slate400 },
  hintMono: { fontFamily: 'Menlo', color: colors.slate600 },
});
