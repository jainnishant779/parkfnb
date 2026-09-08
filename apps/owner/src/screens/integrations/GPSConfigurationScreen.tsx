import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';

// Configuration options
interface ConfigOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
}

interface SettingItemProps {
  option: ConfigOption;
  onToggle: (id: string) => void;
  theme: ReturnType<typeof getTheme>;
}

function SettingItem({ option, onToggle, theme }: SettingItemProps) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={() => onToggle(option.id)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={`${option.title}, ${option.enabled ? 'enabled' : 'disabled'}`}
      accessibilityRole="switch"
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.settingItem, { backgroundColor: theme.surface }, animatedStyle]}
      >
        <View style={[styles.settingIcon, { backgroundColor: theme.primaryLight }]}>
          <MaterialCommunityIcons name={option.icon as any} size={22} color={theme.primary} />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, { color: theme.text }]}>{option.title}</Text>
          <Text style={[styles.settingDescription, { color: theme.textMuted }]}>
            {option.description}
          </Text>
        </View>
        <Switch
          value={option.enabled}
          onValueChange={() => onToggle(option.id)}
          trackColor={{ false: theme.borderLight, true: theme.primary + '40' }}
          thumbColor={option.enabled ? theme.primary : theme.textMuted}
        />
      </Animated.View>
    </Pressable>
  );
}

// Geofence zone item
interface GeofenceZone {
  id: string;
  name: string;
  type: 'entry' | 'exit' | 'both';
  radius: number;
  active: boolean;
}

interface GeofenceItemProps {
  zone: GeofenceZone;
  onToggle: (id: string) => void;
  theme: ReturnType<typeof getTheme>;
}

function GeofenceItem({ zone, onToggle, theme }: GeofenceItemProps) {
  const getTypeLabel = () => {
    switch (zone.type) {
      case 'entry':
        return 'Entry Only';
      case 'exit':
        return 'Exit Only';
      default:
        return 'Entry & Exit';
    }
  };

  const getTypeColor = () => {
    switch (zone.type) {
      case 'entry':
        return theme.success;
      case 'exit':
        return theme.warning;
      default:
        return theme.primary;
    }
  };

  return (
    <View style={[styles.geofenceItem, { backgroundColor: theme.surface }]}>
      <View style={[styles.geofenceIcon, { backgroundColor: getTypeColor() + '20' }]}>
        <MaterialCommunityIcons name="map-marker-radius" size={20} color={getTypeColor()} />
      </View>
      <View style={styles.geofenceContent}>
        <Text style={[styles.geofenceTitle, { color: theme.text }]}>{zone.name}</Text>
        <View style={styles.geofenceMeta}>
          <Text style={[styles.geofenceType, { color: getTypeColor() }]}>{getTypeLabel()}</Text>
          <Text style={[styles.geofenceRadius, { color: theme.textMuted }]}>
            {zone.radius}m radius
          </Text>
        </View>
      </View>
      <Switch
        value={zone.active}
        onValueChange={() => onToggle(zone.id)}
        trackColor={{ false: theme.borderLight, true: theme.primary + '40' }}
        thumbColor={zone.active ? theme.primary : theme.textMuted}
      />
    </View>
  );
}

export default function GPSConfigurationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

  // Configuration options state
  const [configOptions, setConfigOptions] = useState<ConfigOption[]>([
    {
      id: 'realtime_tracking',
      title: 'Real-time Tracking',
      description: 'Enable continuous GPS tracking for all vehicles',
      icon: 'crosshairs-gps',
      enabled: true,
    },
    {
      id: 'auto_checkin',
      title: 'Auto Check-in',
      description: 'Automatically check-in vehicles when entering zones',
      icon: 'login-variant',
      enabled: true,
    },
    {
      id: 'auto_checkout',
      title: 'Auto Check-out',
      description: 'Automatically check-out vehicles when leaving zones',
      icon: 'logout-variant',
      enabled: false,
    },
    {
      id: 'speed_alerts',
      title: 'Speed Alerts',
      description: 'Get notified when vehicles exceed speed limits',
      icon: 'speedometer-slow',
      enabled: true,
    },
    {
      id: 'idle_detection',
      title: 'Idle Detection',
      description: 'Detect when vehicles are idling for extended periods',
      icon: 'timer-sand',
      enabled: false,
    },
    {
      id: 'route_optimization',
      title: 'Route Optimization',
      description: 'Suggest optimal routes based on traffic data',
      icon: 'routes',
      enabled: true,
    },
  ]);

  // Geofence zones state
  const [geofenceZones, setGeofenceZones] = useState<GeofenceZone[]>([
    { id: '1', name: 'Zone A - Main Entrance', type: 'both', radius: 50, active: true },
    { id: '2', name: 'Zone B - Loading Dock', type: 'entry', radius: 30, active: true },
    { id: '3', name: 'Zone C - Warehouse', type: 'both', radius: 100, active: false },
    { id: '4', name: 'Exit Gate', type: 'exit', radius: 25, active: true },
  ]);

  const handleToggleConfig = useCallback((id: string) => {
    setConfigOptions(prev =>
      prev.map(opt => (opt.id === id ? { ...opt, enabled: !opt.enabled } : opt))
    );
  }, []);

  const handleToggleGeofence = useCallback((id: string) => {
    setGeofenceZones(prev =>
      prev.map(zone => (zone.id === id ? { ...zone, active: !zone.active } : zone))
    );
  }, []);

  const activeZonesCount = geofenceZones.filter(z => z.active).length;
  const enabledFeaturesCount = configOptions.filter(o => o.enabled).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <AppHeader
        variant="standard"
        title="GPS Configuration"
        leftAction={{
          icon: 'back',
          label: 'Back',
          onPress: () => navigation.goBack(),
          showBackground: true,
        }}
        showDivider={false}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing[6] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Summary */}
        <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.summaryIcon, { backgroundColor: theme.successLight }]}>
            <MaterialCommunityIcons name="satellite-variant" size={28} color={theme.success} />
          </View>
          <View style={styles.summaryContent}>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>GPS System Active</Text>
            <Text style={[styles.summarySubtitle, { color: theme.textMuted }]}>
              {enabledFeaturesCount} features enabled • {activeZonesCount} zones active
            </Text>
          </View>
          <View style={[styles.summaryBadge, { backgroundColor: theme.successLight }]}>
            <Text style={[styles.summaryBadgeText, { color: theme.success }]}>Online</Text>
          </View>
        </View>

        {/* Tracking Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Tracking Settings</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
            Configure GPS tracking behavior and alerts
          </Text>
          <View style={styles.settingsList}>
            {configOptions.map(option => (
              <SettingItem
                key={option.id}
                option={option}
                onToggle={handleToggleConfig}
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Geofence Zones */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Geofence Zones</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                Define areas for automatic tracking events
              </Text>
            </View>
            <Pressable
              style={[styles.addZoneButton, { backgroundColor: theme.primaryLight }]}
              accessibilityLabel="Add new geofence zone"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={20} color={theme.primary} />
            </Pressable>
          </View>
          <View style={styles.geofenceList}>
            {geofenceZones.map(zone => (
              <GeofenceItem
                key={zone.id}
                zone={zone}
                onToggle={handleToggleGeofence}
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Advanced Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Advanced Settings</Text>
          <View style={[styles.advancedCard, { backgroundColor: theme.surface }]}>
            <Pressable style={styles.advancedItem}>
              <View style={[styles.advancedIcon, { backgroundColor: theme.infoLight }]}>
                <Ionicons name="refresh" size={20} color={theme.info} />
              </View>
              <View style={styles.advancedContent}>
                <Text style={[styles.advancedTitle, { color: theme.text }]}>Update Interval</Text>
                <Text style={[styles.advancedValue, { color: theme.textMuted }]}>
                  Every 30 seconds
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

            <Pressable style={styles.advancedItem}>
              <View style={[styles.advancedIcon, { backgroundColor: theme.warningLight }]}>
                <Ionicons name="battery-half" size={20} color={theme.warning} />
              </View>
              <View style={styles.advancedContent}>
                <Text style={[styles.advancedTitle, { color: theme.text }]}>Power Mode</Text>
                <Text style={[styles.advancedValue, { color: theme.textMuted }]}>Balanced</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

            <Pressable style={styles.advancedItem}>
              <View style={[styles.advancedIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="cloud-upload" size={20} color={theme.primary} />
              </View>
              <View style={styles.advancedContent}>
                <Text style={[styles.advancedTitle, { color: theme.text }]}>Data Sync</Text>
                <Text style={[styles.advancedValue, { color: theme.textMuted }]}>
                  Last synced: 2 min ago
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Save Button */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: theme.primary }]}
          accessibilityLabel="Save configuration"
          accessibilityRole="button"
        >
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>Save Configuration</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[5],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryContent: {
    flex: 1,
    marginLeft: spacing[3],
  },
  summaryTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  summarySubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  summaryBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  summaryBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  section: {
    marginBottom: spacing[5],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    marginBottom: spacing[3],
  },
  settingsList: {
    gap: spacing[3],
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
    marginHorizontal: spacing[3],
  },
  settingTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  settingDescription: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  addZoneButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  geofenceList: {
    gap: spacing[3],
  },
  geofenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  geofenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  geofenceContent: {
    flex: 1,
    marginHorizontal: spacing[3],
  },
  geofenceTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  geofenceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
    gap: spacing[2],
  },
  geofenceType: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  geofenceRadius: {
    fontSize: fontSize.xs,
  },
  advancedCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  advancedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
  },
  advancedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  advancedContent: {
    flex: 1,
    marginHorizontal: spacing[3],
  },
  advancedTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  advancedValue: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing[4] + 40 + spacing[3],
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    marginTop: spacing[2],
    minHeight: 56,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
