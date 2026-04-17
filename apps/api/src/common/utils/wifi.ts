/**
 * WiFi matching utility — pure, no side effects.
 * Used to validate check-in against branch WiFi whitelist.
 */

export interface WifiConfig {
  ssid: string;
  bssid: string | null;
  isActive: boolean;
}

/**
 * Check if the given BSSID matches any active WiFi config (case-insensitive).
 */
export function isBssidWhitelisted(
  bssid: string | null | undefined,
  configs: WifiConfig[],
): boolean {
  if (!bssid) return false;
  const normalised = bssid.toLowerCase().trim();
  return configs.some(
    (c) => c.isActive && c.bssid && c.bssid.toLowerCase().trim() === normalised,
  );
}

/**
 * Check if the given SSID matches any active WiFi config.
 * Weaker than BSSID match (SSID can be spoofed), used as fallback.
 */
export function isSsidMatch(
  ssid: string | null | undefined,
  configs: WifiConfig[],
): boolean {
  if (!ssid) return false;
  const normalised = ssid.trim();
  return configs.some((c) => c.isActive && c.ssid.trim() === normalised);
}

/**
 * Day 5: iterate a full BSSID scan and return the first hit in the whitelist.
 * Mobile sends all nearby APs — matching any one passes WiFi validation.
 */
export function findWifiScanMatch(
  scan: { ssid: string; bssid: string }[] | null | undefined,
  configs: WifiConfig[],
): { ssid: string; bssid: string } | null {
  if (!scan || scan.length === 0) return null;
  for (const entry of scan) {
    if (isBssidWhitelisted(entry.bssid, configs)) return entry;
  }
  return null;
}
