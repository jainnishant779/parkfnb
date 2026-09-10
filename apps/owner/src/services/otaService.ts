import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

const { OtaModule } = NativeModules;

const OTA_BOOT_KEY = 'ota:last_boot_time';
const OTA_CRASH_COUNT_KEY = 'ota:crash_count';

export const isOtaSupported = (): boolean => {
  return Platform.OS === 'android' && !!OtaModule;
};

export const getCurrentBundleInfo = async () => {
  if (!isOtaSupported()) {
    return { hasOtaBundle: false, bundleVersion: 'base' };
  }
  try {
    const info = await OtaModule.getBundleInfo();
    let meta: any = {};
    if (info.meta) {
      try {
        meta = JSON.parse(info.meta);
      } catch (e) {}
    }
    return {
      hasOtaBundle: info.hasOtaBundle,
      bundlePath: info.bundlePath,
      bundleVersion: meta.version || 'base',
      meta,
    };
  } catch (err) {
    console.warn('[OTA] getBundleInfo error:', err);
    return { hasOtaBundle: false, bundleVersion: 'base' };
  }
};

export const checkOtaUpdate = async () => {
  if (!isOtaSupported()) {
    return { hasUpdate: false };
  }

  try {
    const currentInfo = await getCurrentBundleInfo();
    const url = `${API_BASE_URL}/api/v1/ota/check?app=owner&bundleVersion=${encodeURIComponent(currentInfo.bundleVersion)}`;

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      return { hasUpdate: false };
    }

    const data = await res.json();
    return {
      hasUpdate: !!data.hasUpdate,
      bundleVersion: data.bundleVersion,
      bundleUrl: data.bundleUrl,
      mandatory: data.mandatory,
      releaseNotes: data.releaseNotes,
      checksum: data.checksum,
    };
  } catch (err) {
    console.warn('[OTA] checkOtaUpdate network error:', (err as any)?.message);
    return { hasUpdate: false };
  }
};

export const downloadAndApplyUpdate = async (update: any): Promise<boolean> => {
  if (!isOtaSupported() || !update?.bundleUrl) {
    return false;
  }

  try {
    const metaJson = JSON.stringify({
      version: update.bundleVersion,
      bundleUrl: update.bundleUrl,
      releaseNotes: update.releaseNotes,
      mandatory: update.mandatory,
      appliedAt: new Date().toISOString(),
    });

    console.log('[OTA] Downloading bundle from:', update.bundleUrl);
    await OtaModule.downloadAndApply(update.bundleUrl, metaJson);
    console.log('[OTA] Bundle downloaded and applied successfully.');
    return true;
  } catch (err) {
    console.error('[OTA] downloadAndApplyUpdate failed:', err);
    return false;
  }
};

export const restartApp = () => {
  if (isOtaSupported()) {
    OtaModule.restartApp();
  }
};

export const rollbackOta = async () => {
  if (isOtaSupported()) {
    try {
      await OtaModule.rollback();
      OtaModule.restartApp();
    } catch (e) {
      console.warn('[OTA] rollback failed:', e);
    }
  }
};

export const initOtaCrashGuard = async () => {
  if (!isOtaSupported()) return;

  try {
    const info = await getCurrentBundleInfo();
    if (!info.hasOtaBundle) return;

    const now = Date.now();
    const lastBoot = await AsyncStorage.getItem(OTA_BOOT_KEY);
    const crashCount = parseInt((await AsyncStorage.getItem(OTA_CRASH_COUNT_KEY)) || '0', 10);

    if (lastBoot && now - parseInt(lastBoot, 10) < 5000) {
      const newCount = crashCount + 1;
      await AsyncStorage.setItem(OTA_CRASH_COUNT_KEY, String(newCount));

      if (newCount >= 2) {
        console.warn('[OTA] Detected repeated crash on OTA bundle. Rolling back!');
        await AsyncStorage.removeItem(OTA_CRASH_COUNT_KEY);
        await rollbackOta();
        return;
      }
    } else {
      setTimeout(() => {
        AsyncStorage.setItem(OTA_CRASH_COUNT_KEY, '0').catch(() => {});
      }, 8000);
    }

    await AsyncStorage.setItem(OTA_BOOT_KEY, String(now));
  } catch (err) {
    console.warn('[OTA] Crash guard error:', err);
  }
};
