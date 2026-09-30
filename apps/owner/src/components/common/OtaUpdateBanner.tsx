import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import * as otaService from '../../services/otaService';
import { palette, radii, fonts, shadow } from '../../theme/kit';

export const OtaUpdateBanner = () => {
  const [updateReady, setUpdateReady] = useState<any>(null);
  const slideAnim = useState(new Animated.Value(-100))[0];

  useEffect(() => {
    otaService.initOtaCrashGuard();

    const timer = setTimeout(async () => {
      try {
        const update = await otaService.checkOtaUpdate();
        if (update && update.hasUpdate) {
          const success = await otaService.downloadAndApplyUpdate(update);
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
        console.log('[OTA] Owner banner check error:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!updateReady) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon name="download-cloud" size={16} color={palette.textInverse} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Update Available (v{updateReady.bundleVersion})</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {updateReady.releaseNotes || 'Tap to restart and apply update'}
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
    borderRadius: radii.lg,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 10,
    ...shadow.lifted,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  subtitle: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 1,
  },
  restartButton: {
    backgroundColor: palette.ink,
    paddingHorizontal: 14,
    height: 34,
    justifyContent: 'center',
    borderRadius: radii.pill,
    marginRight: 6,
  },
  restartText: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.textInverse,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
