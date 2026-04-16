import { isBssidWhitelisted, isSsidMatch, type WifiConfig } from './wifi';

describe('wifi utilities', () => {
  const configs: WifiConfig[] = [
    { ssid: 'FinOS-HCM-5G', bssid: 'AA:BB:CC:DD:EE:01', isActive: true },
    { ssid: 'FinOS-HCM-2G', bssid: 'aa:bb:cc:dd:ee:02', isActive: true },
    { ssid: 'FinOS-Guest', bssid: 'aa:bb:cc:dd:ee:ff', isActive: false },
  ];

  describe('isBssidWhitelisted', () => {
    it('should match exact BSSID (case-insensitive)', () => {
      expect(isBssidWhitelisted('aa:bb:cc:dd:ee:01', configs)).toBe(true);
    });

    it('should match uppercase BSSID', () => {
      expect(isBssidWhitelisted('AA:BB:CC:DD:EE:02', configs)).toBe(true);
    });

    it('should return false for non-matching BSSID', () => {
      expect(isBssidWhitelisted('ff:ff:ff:ff:ff:ff', configs)).toBe(false);
    });

    it('should return false for null/undefined BSSID', () => {
      expect(isBssidWhitelisted(null, configs)).toBe(false);
      expect(isBssidWhitelisted(undefined, configs)).toBe(false);
    });

    it('should NOT match inactive config', () => {
      expect(isBssidWhitelisted('aa:bb:cc:dd:ee:ff', configs)).toBe(false);
    });
  });

  describe('isSsidMatch', () => {
    it('should match active SSID', () => {
      expect(isSsidMatch('FinOS-HCM-5G', configs)).toBe(true);
    });

    it('should return false for non-matching SSID', () => {
      expect(isSsidMatch('SomeOtherNetwork', configs)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isSsidMatch(null, configs)).toBe(false);
      expect(isSsidMatch(undefined, configs)).toBe(false);
    });

    it('should NOT match inactive SSID', () => {
      expect(isSsidMatch('FinOS-Guest', configs)).toBe(false);
    });
  });
});
