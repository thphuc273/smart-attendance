import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
// NOTE: Require "expo-camera" installed
import { CameraView as CameraViewBase, useCameraPermissions } from 'expo-camera';
const CameraView = CameraViewBase as unknown as React.ComponentType<any>;
import * as Location from 'expo-location';
import { getApi } from '../lib/api';
import { getDeviceFingerprint } from '../lib/device';
import { colors, radius } from '../lib/theme';

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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Cần vị trí để check-in');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      const body = {
        token: data,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        device_fingerprint: await getDeviceFingerprint(),
      };

      await getApi().post('attendance/qr-check-in', { json: body });
      
      Alert.alert('Thành công', 'Quét QR Kiosk thành công!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Lỗi', (e as Error).message, [
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
