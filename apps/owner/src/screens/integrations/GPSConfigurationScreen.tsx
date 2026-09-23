import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Kit from '../../theme/kit';
import * as UI from '../../components/ui';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const {
  T,
  Card,
  PillButton,
  IconCircle,
  ScreenHeader,
  StatusTag,
  ListRow,
  IsoBlock,
} = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

// Ink toggle colours shared by every Switch on this screen.
const SWITCH_TRACK = { false: palette.bgSoft, true: palette.ink };

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
  isLast: boolean;
}

function SettingItem({ option, onToggle, isLast }: SettingItemProps) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(option.id)}
      activeOpacity={0.7}
      accessibilityLabel={`${option.title}, ${option.enabled ? 'enabled' : 'disabled'}`}
      accessibilityRole="switch"
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.row, !isLast && styles.rowDivider]}
      >
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name={option.icon as any} size={20} color={palette.text} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle}>{option.title}</Text>
          <Text style={styles.rowSubtitle}>{option.description}</Text>
        </View>
        <Switch
          value={option.enabled}
          onValueChange={() => onToggle(option.id)}
          trackColor={SWITCH_TRACK}
          thumbColor={palette.surface}
          ios_backgroundColor={palette.bgSoft}
        />
      </Animated.View>
    </TouchableOpacity>
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
  isLast: boolean;
}

function GeofenceItem({ zone, onToggle, isLast }: GeofenceItemProps) {
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

  const getTypeTone = () => {
    switch (zone.type) {
      case 'entry':
        return 'success';
      case 'exit':
        return 'warning';
      default:
        return 'ink';
    }
  };

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name="map-marker-radius" size={20} color={palette.text} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{zone.name}</Text>
        <View style={styles.geofenceMeta}>
          <StatusTag label={getTypeLabel()} tone={getTypeTone()} />
          <Text style={styles.rowSubtitle}>{zone.radius}m radius</Text>
        </View>
      </View>
      <Switch
        value={zone.active}
        onValueChange={() => onToggle(zone.id)}
        trackColor={SWITCH_TRACK}
        thumbColor={palette.surface}
        ios_backgroundColor={palette.bgSoft}
      />
    </View>
  );
}

export default function GPSConfigurationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="GPS Configuration" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Summary */}
        <Card tone="blue" style={styles.hero}>
          <StatusTag label="Online" tone="success" style={styles.heroTag} />
          <T variant="h2" style={styles.heroTitle}>GPS System{'\n'}Active</T>
          <View style={styles.heroStats}>
            <View>
              <Text style={styles.heroStatValue}>{enabledFeaturesCount}</Text>
              <Text style={styles.heroStatLabel}>features enabled</Text>
            </View>
            <View>
              <Text style={styles.heroStatValue}>{activeZonesCount}</Text>
              <Text style={styles.heroStatLabel}>zones active</Text>
            </View>
          </View>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={140} tone="blue" />
          </View>
        </Card>

        {/* Tracking Settings */}
        <Text style={styles.sectionTitle}>Tracking settings</Text>
        <Text style={styles.sectionSubtitle}>Configure GPS tracking behavior and alerts</Text>
        <Card style={styles.listCard}>
          {configOptions.map((option, index) => (
            <SettingItem
              key={option.id}
              option={option}
              onToggle={handleToggleConfig}
              isLast={index === configOptions.length - 1}
            />
          ))}
        </Card>

        {/* Geofence Zones */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={[styles.sectionTitle, styles.sectionTitleFlush]}>Geofence zones</Text>
            <Text style={styles.sectionSubtitle}>Define areas for automatic tracking events</Text>
          </View>
          <IconCircle icon="plus" variant="ink" size={40} />
        </View>
        <Card style={styles.listCard}>
          {geofenceZones.map((zone, index) => (
            <GeofenceItem
              key={zone.id}
              zone={zone}
              onToggle={handleToggleGeofence}
              isLast={index === geofenceZones.length - 1}
            />
          ))}
        </Card>

        {/* Advanced Settings */}
        <Text style={[styles.sectionTitle, styles.sectionTitleGap]}>Advanced settings</Text>
        <Card style={styles.listCard}>
          <ListRow icon="refresh-cw" title="Update Interval" subtitle="Every 30 seconds" />
          <ListRow icon="battery-charging" title="Power Mode" subtitle="Balanced" />
          <ListRow icon="upload-cloud" title="Data Sync" subtitle="Last synced: 2 min ago" isLast />
        </Card>

        {/* Save Button */}
        <PillButton
          label="Save Configuration"
          icon="check"
          variant="ink"
          style={styles.saveButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Hero
  hero: {
    minHeight: 220,
    overflow: 'hidden',
  },
  heroTag: {
    alignSelf: 'flex-start',
  },
  heroTitle: {
    marginTop: 12,
    maxWidth: '62%',
  },
  heroStats: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 'auto',
    paddingTop: 18,
  },
  heroStatValue: {
    ...fonts.semibold,
    fontSize: 34,
    letterSpacing: -1,
    color: palette.text,
  },
  heroStatLabel: {
    ...fonts.medium,
    fontSize: 12.5,
    color: palette.inkSoft,
  },
  heroArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },

  // Sections
  sectionTitle: {
    ...fonts.medium,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
    marginTop: 28,
  },
  sectionTitleFlush: {
    marginTop: 0,
  },
  sectionTitleGap: {
    marginBottom: 12,
  },
  sectionSubtitle: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
  },
  sectionHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  listCard: {
    paddingVertical: 4,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  rowTitle: {
    ...fonts.semibold,
    fontSize: 15.5,
    color: palette.text,
  },
  rowSubtitle: {
    ...fonts.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.textMuted,
    marginTop: 2,
  },
  geofenceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },

  saveButton: {
    marginTop: 28,
  },
});
