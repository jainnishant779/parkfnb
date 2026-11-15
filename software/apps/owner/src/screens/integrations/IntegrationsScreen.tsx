import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
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
  ProgressTrack,
  EmptyState,
  IsoBlock,
} = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

// Storage keys
const INTEGRATION_DATA_KEY = 'owners:integrations_data';

// Types
interface FleetVehicle {
  id: string;
  name: string;
  type: string;
  lastCheckIn: string;
  status: 'in_use' | 'available';
  location: string;
}

interface ActivityLog {
  id: string;
  description: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
  expanded?: boolean;
}

interface IntegrationData {
  isConnected: boolean;
  gpsProgress: number;
  fleetVehicles: FleetVehicle[];
  activityLogs: ActivityLog[];
  lastUpdated: string;
}

// Mock data
const MOCK_FLEET_VEHICLES: FleetVehicle[] = [
  {
    id: '1',
    name: 'Truck 101',
    type: 'Heavy Truck',
    lastCheckIn: '10 minutes ago',
    status: 'in_use',
    location: 'Zone A',
  },
  {
    id: '2',
    name: 'Van 202',
    type: 'Delivery Van',
    lastCheckIn: '35 minutes ago',
    status: 'available',
    location: 'Zone B',
  },
  {
    id: '3',
    name: 'Truck 103',
    type: 'Medium Truck',
    lastCheckIn: '1 hour ago',
    status: 'in_use',
    location: 'Zone C',
  },
  {
    id: '4',
    name: 'Forklift 01',
    type: 'Forklift',
    lastCheckIn: '2 hours ago',
    status: 'available',
    location: 'Warehouse',
  },
  {
    id: '5',
    name: 'Van 205',
    type: 'Cargo Van',
    lastCheckIn: '3 hours ago',
    status: 'in_use',
    location: 'Zone A',
  },
];

const MOCK_ACTIVITY_LOGS: ActivityLog[] = [
  {
    id: '1',
    description: 'Vehicle Truck 101 checked in at Zone A',
    timestamp: '10 minutes ago',
    status: 'success',
  },
  {
    id: '2',
    description: 'GPS sync completed for Van 202',
    timestamp: 'Yesterday, 3:00 PM',
    status: 'success',
  },
  {
    id: '3',
    description: 'Vehicle Truck 103 exited Zone C',
    timestamp: 'Yesterday, 1:45 PM',
    status: 'success',
  },
  {
    id: '4',
    description: 'Failed to sync GPS data for Forklift 01',
    timestamp: 'Yesterday, 11:30 AM',
    status: 'failed',
  },
  {
    id: '5',
    description: 'Automatic check-out for Van 205',
    timestamp: '2 days ago',
    status: 'success',
  },
];

const GPS_SETUP_STEPS = [
  'Connect GPS Tracker',
  'Sync Vehicle Data',
  'Configure Geofencing',
  'Enable Auto Check-in',
];


// Component: Integration Status (hero) Card
interface IntegrationStatusCardProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
}

function IntegrationStatusCard({
  isConnected,
  isConnecting,
  onConnect,
}: IntegrationStatusCardProps) {
  return (
    <Card tone="blue" style={styles.hero}>
      <View style={styles.heroText}>
        <StatusTag
          label={isConnected ? 'Connected' : 'Disconnected'}
          tone={isConnected ? 'success' : 'grey'}
          style={styles.heroTag}
        />
        <T variant="h2">Fleet & GPS{'\n'}integration</T>
        <T variant="bodySmall" style={styles.heroSub}>
          Manage your fleet, track vehicles in real-time, and integrate GPS systems for automated check-ins and check-outs.
        </T>
      </View>
      <View style={styles.heroArt} pointerEvents="none">
        <IsoBlock size={140} tone="blue" />
      </View>

      {isConnected ? (
        <View style={styles.heroActive}>
          <View style={styles.heroActiveIcon}>
            <Ionicons name="checkmark" size={14} color={palette.textInverse} />
          </View>
          <Text style={styles.heroActiveText}>
            Integration Active - Real-time tracking enabled
          </Text>
        </View>
      ) : (
        <PillButton
          label="Connect Now"
          icon="zap"
          variant="ink"
          size="md"
          onPress={onConnect}
          loading={isConnecting}
          style={styles.heroButton}
        />
      )}
    </Card>
  );
}

// Component: Fleet Vehicle Card
interface FleetVehicleCardProps {
  vehicle: FleetVehicle;
  onToggleStatus: (id: string) => void;
}

function FleetVehicleCard({ vehicle, onToggleStatus }: FleetVehicleCardProps) {
  const isInUse = vehicle.status === 'in_use';

  return (
    <TouchableOpacity
      onPress={() => onToggleStatus(vehicle.id)}
      activeOpacity={0.85}
      accessibilityLabel={`${vehicle.name}, ${vehicle.status === 'in_use' ? 'In use' : 'Available'}`}
      accessibilityRole="button"
    >
      <Animated.View entering={SlideInRight.duration(300)} style={styles.vehicleCard}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="truck-outline" size={22} color={palette.text} />
        </View>
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName} numberOfLines={1}>{vehicle.name}</Text>
          <Text style={styles.vehicleType} numberOfLines={1}>{vehicle.type}</Text>
          <View style={styles.vehicleMetaRow}>
            <Ionicons name="time-outline" size={12} color={palette.textMuted} />
            <Text style={styles.vehicleMetaText}>{vehicle.lastCheckIn}</Text>
            <View style={styles.metaDot} />
            <Ionicons name="location-outline" size={12} color={palette.textMuted} />
            <Text style={styles.vehicleMetaText}>{vehicle.location}</Text>
          </View>
        </View>
        <StatusTag
          label={isInUse ? 'In Use' : 'Available'}
          tone={isInUse ? 'ink' : 'success'}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

// Component: GPS Progress Section
interface GPSProgressSectionProps {
  progress: number;
  isAnimating: boolean;
  onCompleteSetup: () => void;
}

function GPSProgressSection({
  progress,
  isAnimating,
  onCompleteSetup,
}: GPSProgressSectionProps) {
  const currentStep = Math.floor((progress / 100) * GPS_SETUP_STEPS.length);

  return (
    <Card>
      <View style={styles.cardHeader}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="satellite-variant" size={22} color={palette.text} />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle}>GPS Tracker Integration</Text>
          <Text style={styles.cardSubtitle}>Setup progress</Text>
        </View>
        <View style={styles.progressValueWrap}>
          <Text style={styles.progressValue}>{progress}</Text>
          <Text style={styles.progressPercent}>%</Text>
        </View>
      </View>

      {/* Progress track */}
      <ProgressTrack
        steps={GPS_SETUP_STEPS.length}
        current={Math.min(currentStep, GPS_SETUP_STEPS.length)}
        trackColor={palette.bgSoft}
        style={styles.progressTrack}
      />

      {/* Steps */}
      <View style={styles.stepsContainer}>
        {GPS_SETUP_STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep && progress < 100;

          return (
            <View key={step} style={styles.stepRow}>
              <View
                style={[
                  styles.stepIndicator,
                  isCompleted && styles.stepIndicatorDone,
                  isCurrent && styles.stepIndicatorCurrent,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={13} color={palette.textInverse} />
                ) : (
                  <Text style={[styles.stepNumber, isCurrent && styles.stepNumberCurrent]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepText,
                  isCompleted && styles.stepTextDone,
                  isCurrent && styles.stepTextCurrent,
                ]}
              >
                {step}
              </Text>
              {isCurrent ? <StatusTag label="Next" tone="ink" /> : null}
            </View>
          );
        })}
      </View>

      {/* Complete Setup Button */}
      {progress < 100 && (
        <PillButton
          label="Complete Setup"
          icon="settings"
          variant="ink"
          size="md"
          onPress={onCompleteSetup}
          loading={isAnimating}
        />
      )}

      {progress === 100 && (
        <View style={styles.successRow}>
          <Ionicons name="checkmark-circle" size={18} color={palette.success} />
          <Text style={styles.successRowText}>GPS Integration Complete</Text>
        </View>
      )}
    </Card>
  );
}

// Component: Activity Log Item
interface ActivityLogItemProps {
  log: ActivityLog;
  onToggle: (id: string) => void;
  isLast: boolean;
}

function ActivityLogItem({ log, onToggle, isLast }: ActivityLogItemProps) {
  const getStatusTone = () => {
    switch (log.status) {
      case 'success':
        return { fg: palette.success, bg: palette.successSoft };
      case 'failed':
        return { fg: palette.danger, bg: palette.dangerSoft };
      default:
        return { fg: palette.warning, bg: palette.warningSoft };
    }
  };

  const getStatusIcon = () => {
    switch (log.status) {
      case 'success':
        return 'checkmark';
      case 'failed':
        return 'close';
      default:
        return 'time-outline';
    }
  };

  const tone = getStatusTone();

  return (
    <TouchableOpacity
      onPress={() => onToggle(log.id)}
      activeOpacity={0.7}
      accessibilityLabel={`Activity: ${log.description}`}
      accessibilityRole="button"
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.activityLogItem, !isLast && styles.divider]}
      >
        <View style={[styles.activityIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={getStatusIcon()} size={16} color={tone.fg} />
        </View>
        <View style={styles.activityBody}>
          <Text
            style={styles.activityDescription}
            numberOfLines={log.expanded ? undefined : 2}
          >
            {log.description}
          </Text>
          <Text style={styles.activityTimestamp}>{log.timestamp}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Component: Info Sheet
interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
}

function InfoModal({ visible, onClose }: InfoModalProps) {
  return visible ? (
    <View style={styles.modalOverlay}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.sheetIcon}>
          <Ionicons name="information" size={26} color={palette.text} />
        </View>
        <Text style={styles.sheetTitle}>Fleet/GPS Integration</Text>
        <Text style={styles.sheetText}>
          This feature enables real-time fleet tracking and automated parking management.
        </Text>
        <View style={styles.featureList}>
          <Text style={styles.featureLabel}>Features include:</Text>
          {[
            'Real-time vehicle tracking',
            'Automated check-in/check-out',
            'GPS-enabled geofencing',
            'Fleet utilization analytics',
          ].map(item => (
            <View key={item} style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>{item}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.sheetNote}>Full integration coming soon.</Text>
        <PillButton
          label="Got it"
          variant="ink"
          onPress={onClose}
          style={styles.sheetButton}
        />
      </View>
    </View>
  ) : null;
}

// Main Screen Component
export default function IntegrationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // State
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAnimatingGPS, setIsAnimatingGPS] = useState(false);

  // Integration data state — TODO: populate fleetVehicles and activityLogs from API
  const [integrationData, setIntegrationData] = useState<IntegrationData>({
    isConnected: false,
    gpsProgress: 75,
    // fleetVehicles: MOCK_FLEET_VEHICLES,
    // activityLogs: MOCK_ACTIVITY_LOGS,
    fleetVehicles: [],
    activityLogs: [],
    lastUpdated: new Date().toISOString(),
  });

  // Load data from AsyncStorage
  const loadData = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(INTEGRATION_DATA_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setIntegrationData(parsed);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load integration data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Save data to AsyncStorage
  const saveData = useCallback(async (data: IntegrationData) => {
    try {
      await AsyncStorage.setItem(INTEGRATION_DATA_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save integration data:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save on data change
  useEffect(() => {
    if (!loading) {
      saveData(integrationData);
    }
  }, [integrationData, loading, saveData]);

  // Handle connect
  const handleConnect = useCallback(() => {
    setIntegrationData(prev => ({
      ...prev,
      isConnected: true,
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Handle GPS complete setup
  const handleCompleteGPSSetup = useCallback(() => {
    setIntegrationData(prev => ({
      ...prev,
      gpsProgress: 100,
    }));
  }, []);

  // Toggle vehicle status
  const handleToggleVehicleStatus = useCallback((vehicleId: string) => {
    setIntegrationData(prev => ({
      ...prev,
      fleetVehicles: prev.fleetVehicles.map(vehicle =>
        vehicle.id === vehicleId
          ? {
              ...vehicle,
              status: vehicle.status === 'in_use' ? 'available' : 'in_use',
              lastCheckIn: 'Just now',
            }
          : vehicle
      ),
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Toggle activity log expansion
  const handleToggleActivityLog = useCallback((logId: string) => {
    setIntegrationData(prev => ({
      ...prev,
      activityLogs: prev.activityLogs.map(log =>
        log.id === logId ? { ...log, expanded: !log.expanded } : log
      ),
    }));
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Handle retry on error
  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    loadData();
  }, [loadData]);

  // Navigate to fleet management
  const handleManageFleet = useCallback(() => {
    (navigation as any).navigate('FleetManagement');
  }, [navigation]);

  // Navigate to GPS configuration
  const handleConfigureGPS = useCallback(() => {
    (navigation as any).navigate('GPSConfiguration');
  }, [navigation]);


  const header = (withInfo: boolean) => (
    <ScreenHeader
      title="Fleet/GPS Integrations"
      onBack={() => navigation.goBack()}
      right={
        withInfo ? (
          <IconCircle
            icon="help-circle"
            size={40}
            onPress={() => setInfoModalVisible(true)}
          />
        ) : undefined
      }
    />
  );

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header(false)}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
          <Text style={styles.loadingText}>Loading integration data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header(false)}
        <View style={styles.errorContainer}>
          <Card padded={false}>
            <EmptyState
              title={error}
              action="Retry"
              onAction={handleRetry}
              tone="grey"
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      {header(true)}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.ink}
          />
        }
      >
        {/* Section 1: Integration Status */}
        <IntegrationStatusCard
          isConnected={integrationData.isConnected}
          isConnecting={isConnecting}
          onConnect={handleConnect}
        />

        {/* Section 2: Fleet Overview */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Fleet overview</Text>
          <Text style={styles.sectionCount}>
            {integrationData.fleetVehicles.length} vehicles
          </Text>
        </View>
        {integrationData.fleetVehicles.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              title="No vehicles yet"
              subtitle="Vehicles appear here once your fleet is connected."
              tone="grey"
            />
          </Card>
        ) : (
          <View style={styles.vehicleList}>
            {integrationData.fleetVehicles.map(vehicle => (
              <FleetVehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onToggleStatus={handleToggleVehicleStatus}
              />
            ))}
          </View>
        )}

        {/* Section 3: GPS Progress */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>GPS setup</Text>
        <GPSProgressSection
          progress={integrationData.gpsProgress}
          isAnimating={isAnimatingGPS}
          onCompleteSetup={handleCompleteGPSSetup}
        />

        {/* Section 4: Recent Activity */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Recent activity</Text>
        <Card style={styles.activityContainer}>
          {integrationData.activityLogs.length === 0 ? (
            <Text style={styles.activityEmpty}>No recent activity</Text>
          ) : (
            integrationData.activityLogs.map((log, index) => (
              <ActivityLogItem
                key={log.id}
                log={log}
                onToggle={handleToggleActivityLog}
                isLast={index === integrationData.activityLogs.length - 1}
              />
            ))
          )}
        </Card>

        {/* Section 5: CTAs */}
        <View style={styles.ctaContainer}>
          <PillButton
            label="Manage Fleet"
            icon="truck"
            variant="ink"
            onPress={handleManageFleet}
          />
          <PillButton
            label="Configure GPS"
            icon="navigation"
            variant="white"
            onPress={handleConfigureGPS}
          />
        </View>
      </ScrollView>

      {/* Info Modal */}
      <InfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
      />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  // Hero
  hero: {
    minHeight: 250,
    overflow: 'hidden',
  },
  heroText: {
    maxWidth: '66%',
  },
  heroTag: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  heroSub: {
    marginTop: 8,
    color: palette.inkSoft,
  },
  heroArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: 18,
  },
  heroActive: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '72%',
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    gap: 10,
  },
  heroActiveIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActiveText: {
    ...fonts.semibold,
    flexShrink: 1,
    fontSize: 13,
    color: palette.text,
  },

  // Sections
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    ...fonts.medium,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
  },
  sectionTitleSpaced: {
    marginTop: 28,
    marginBottom: 12,
  },
  sectionCount: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },

  // Shared icon circle
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Vehicle card
  vehicleList: {
    gap: 12,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: radii.xl,
    backgroundColor: palette.surface,
  },
  vehicleInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  vehicleName: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  vehicleType: {
    ...fonts.medium,
    fontSize: 12.5,
    color: palette.textMuted,
    marginTop: 2,
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  vehicleMetaText: {
    ...fonts.medium,
    fontSize: 11.5,
    color: palette.textMuted,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 4,
    backgroundColor: palette.textSubtle,
  },

  // GPS card
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderContent: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  cardSubtitle: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  progressValueWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  progressValue: {
    ...fonts.semibold,
    fontSize: 34,
    letterSpacing: -1,
    color: palette.text,
  },
  progressPercent: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.textMuted,
    marginTop: 6,
    marginLeft: 2,
  },
  progressTrack: {
    marginTop: 18,
    marginBottom: 18,
  },
  stepsContainer: {
    gap: 12,
    marginBottom: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.fill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepIndicatorDone: {
    backgroundColor: palette.ink,
  },
  stepIndicatorCurrent: {
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.ink,
  },
  stepNumber: {
    ...fonts.semibold,
    fontSize: 12,
    color: palette.textMuted,
  },
  stepNumberCurrent: {
    color: palette.text,
  },
  stepText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 14.5,
    color: palette.textMuted,
  },
  stepTextDone: {
    color: palette.text,
  },
  stepTextCurrent: {
    ...fonts.semibold,
    color: palette.text,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: palette.successSoft,
    gap: 8,
  },
  successRowText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.success,
  },

  // Activity
  activityContainer: {
    paddingVertical: 4,
  },
  activityLogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 12,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: {
    flex: 1,
  },
  activityDescription: {
    ...fonts.semibold,
    fontSize: 14.5,
    lineHeight: 20,
    color: palette.text,
  },
  activityTimestamp: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 3,
  },
  activityEmpty: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    paddingVertical: 18,
  },

  // CTAs
  ctaContainer: {
    gap: 12,
    marginTop: 28,
  },

  // Info sheet
  modalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginTop: 12,
    marginBottom: 20,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: palette.text,
    textAlign: 'center',
  },
  sheetText: {
    ...fonts.medium,
    fontSize: 14.5,
    lineHeight: 21,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  featureLabel: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
    marginBottom: 10,
  },
  featureList: {
    alignSelf: 'stretch',
    marginTop: 18,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.ink,
  },
  featureText: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.text,
  },
  sheetNote: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 14,
  },
  sheetButton: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
});
