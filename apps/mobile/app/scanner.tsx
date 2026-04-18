import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
// NOTE: Require "expo-camera" installed
import { CameraView as CameraViewBase, useCameraPermissions } from 'expo-camera';
const CameraView = CameraViewBase as unknown as React.ComponentType<any>;
import * as Location from 'expo-location';
import { HTTPError } from 'ky';
import { getApi } from '../lib/api';
import { getDeviceFingerprint } from '../lib/device';
import { colors, radius } from '../lib/theme';

const ERROR_MESSAGES: Record<string, string> = {
  DEVICE_NOT_TRUSTED: 'Thiết bị này chưa từng check-in thủ công thành công. Hãy check-in manual trước, rồi thử quét kiosk QR.',
  BRANCH_NOT_ASSIGNED: 'Bạn không thuộc chi nhánh của mã QR này.',
  INVALID_LOCATION: 'Vị trí GPS/WiFi không khớp chi nhánh. Kiểm tra lại vị trí + mạng.',
  NOT_ASSIGNED_TO_BRANCH: 'Tài khoản chưa được gán chi nhánh.',
  ALREADY_CHECKED_IN: 'Bạn đã check-in hôm nay rồi.',
  QR_ALREADY_USED_TODAY: 'Bạn đã dùng kiosk QR hôm nay rồi.',
  QR_EXPIRED: 'Mã QR đã hết hạn — kiosk sẽ tự refresh, quét lại.',
  QR_BAD_SIGNATURE: 'Mã QR không đúng (secret đã bị xoay?). Kiosk sẽ tự cập nhật.',
  QR_BRANCH_MISMATCH: 'Mã QR không khớp chi nhánh.',
  QR_MALFORMED: 'Mã QR hỏng.',
  QR_BAD_VERSION: 'Mã QR phiên bản lạ.',
  RATE_LIMIT_EXCEEDED: 'Bạn thử quá nhiều lần. Đợi ~1 phút rồi thử lại.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi quét QR.',
};

async function extractApiError(e: unknown): Promise<string> {
  if (e instanceof HTTPError) {
    try {
      const body = (await e.response.clone().json()) as { error?: { code?: string; message?: string } };
      const code = body?.error?.code;
      const msg = body?.error?.message;
      if (code && ERROR_MESSAGES[code]) return `${ERROR_MESSAGES[code]}\n(${code})`;
      if (code || msg) return `${msg ?? 'Lỗi API'}\n(${code ?? e.response.status})`;
    } catch {
      // fall through
    }
    return `Lỗi API ${e.response.status}`;
  }
  return (e as Error).message;
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  // RN/Hermes expose global atob; fall back to Buffer if missing.
  const g = globalThis as any;
  if (typeof g.atob === 'function') return g.atob(b64);
  if (typeof g.Buffer !== 'undefined') return g.Buffer.from(b64, 'base64').toString('utf8');
  throw new Error('No base64 decoder available');
}

function parseKioskPayload(raw: string): { branch_id: string; qr_token: string } {
  const trimmed = raw.trim();

  // Format 1: JSON wrapper `{b, t}` or `{branch_id, token}`
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj.b === 'string' && typeof obj.t === 'string') {
        return { branch_id: obj.b, qr_token: obj.t };
      }
      if (obj && typeof obj.branch_id === 'string' && typeof obj.token === 'string') {
        return { branch_id: obj.branch_id, qr_token: obj.token };
      }
    } catch {
      // fall through
    }
  }

  // Format 2: raw `v1.<base64url-payload>.<sig>` — decode branch_id from payload
  if (trimmed.startsWith('v1.')) {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      try {
        const decoded = base64UrlDecode(parts[1]);
        const payloadParts = decoded.split('.');
        // payload: `${branchId}.${bucket}.${nonce}` — branchId is a UUID (36 chars)
        if (payloadParts.length === 3 && /^[0-9a-f-]{20,}$/i.test(payloadParts[0])) {
          return { branch_id: payloadParts[0], qr_token: trimmed };
        }
      } catch {
        // fall through
      }
    }
  }

  // Surface a snippet of what we actually got so the user/dev can tell what went wrong.
  const preview = trimmed.length > 48 ? trimmed.slice(0, 45) + '…' : trimmed;
  console.warn('[scanner] unrecognized QR payload:', preview);
  throw new Error(`Mã QR không hợp lệ (không phải Kiosk QR của FinOS).\nNội dung: ${preview}`);
}

export default function ScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center' }}>Chúng tôi cần quyền truy cập Camera để quét Kiosk QR.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Cấp quyền</Text>
        </Pressable>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const { branch_id, qr_token } = parseKioskPayload(data);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Cần vị trí để check-in');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      const body = {
        qr_token,
        branch_id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
        device_fingerprint: await getDeviceFingerprint(),
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      };

      await getApi().post('attendance/qr-check-in', { json: body });

      Alert.alert('Thành công', 'Quét QR Kiosk thành công!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      const msg = await extractApiError(e);
      Alert.alert('Không check-in được', msg, [
        { text: 'Thử lại', onPress: () => setScanned(false) }
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.scanBox} />
        <Text style={styles.text}>Hướng camera về bề mặt mã QR trên Kiosk</Text>
        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Trở về</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.brand500,
    backgroundColor: 'transparent',
    borderRadius: radius.md,
    marginBottom: 20
  },
  text: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  btn: {
    marginTop: 20,
    backgroundColor: colors.brand600,
    padding: 12,
    borderRadius: radius.md,
    alignSelf: 'center',
  },
  btnText: { color: 'white', fontWeight: 'bold' },
  cancelBtn: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.full,
  },
  cancelText: {
    color: 'white',
    fontWeight: '600'
  }
});
