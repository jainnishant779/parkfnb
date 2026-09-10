import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { palette, fontStacks } from '../theme';
import * as otaService from '../services/otaService';

export const OtaUpdateBanner = () => {
  const [updateReady, setUpdateReady] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const slideAnim = useState(new Animated.Value(-100))[0];

  useEffect(() => {
    // 1. Run crash guard check
    otaService.initOtaCrashGuard();

    // 2. Check for update after 2 seconds to not block startup
    const timer = setTimeout(async () => {
      try {
        const update = await otaService.checkOtaUpdate();
        if (update && update.hasUpdate) {
          setIsDownloading(true);
          const success = await otaService.downloadAndApplyUpdate(update);
          setIsDownloading(false);

          if (success) {
            setUpdateReady(update);
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 8,
            }).start();
          }
        }
      } catch (err) {
        console.log('[OTA] Banner check error:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!updateReady) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon name="download-cloud" size={16} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Update Available (v{updateReady.bundleVersion})</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {updateReady.releaseNotes || 'Tap to restart and apply the update'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.restartButton}
          onPress={() => otaService.restartApp()}
          activeOpacity={0.8}
        >
          <Text style={styles.restartText}>Restart</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => {
            Animated.timing(slideAnim, {
              toValue: -100,
              duration: 250,
              useNativeDriver: true,
            }).start(() => setUpdateReady(null));
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="x" size={16} color={palette.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 45,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontFamily: fontStacks.medium,
    fontSize: 13,
    fontWeight: '700',
    color: palette.text,
  },
  subtitle: {
    fontFamily: fontStacks.regular,
    fontSize: 11,
    color: palette.textMuted,
    marginTop: 1,
  },
  restartButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  restartText: {
    fontFamily: fontStacks.medium,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dismissButton: {
    padding: 4,
  },
});
