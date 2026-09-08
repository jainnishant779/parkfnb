import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  SlideInRight,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';

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

// Component: Integration Status Card
interface IntegrationStatusCardProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  theme: ReturnType<typeof getTheme>;
}

function IntegrationStatusCard({
  isConnected,
  isConnecting,
  onConnect,
  theme,
}: IntegrationStatusCardProps) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (!isConnected) {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
    }
  }, [scale, isConnected]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.card, { backgroundColor: theme.surface }, animatedStyle]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconContainer, { backgroundColor: isConnected ? theme.successLight : theme.warningLight }]}>
          <MaterialCommunityIcons
            name={isConnected ? 'link-variant' : 'link-variant-off'}
            size={24}
            color={isConnected ? theme.success : theme.warning}
          />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Integration Status</Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? theme.success : theme.warning },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: isConnected ? theme.success : theme.warning },
              ]}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>
      </View>

      {isConnected ? (
        <View style={[styles.integrationActiveContainer, { backgroundColor: theme.successLight }]}>
          <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          <Text style={[styles.integrationActiveText, { color: theme.success }]}>
            Integration Active - Real-time tracking enabled
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onConnect}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={isConnecting}
          accessibilityLabel="Connect to fleet integration"
          accessibilityRole="button"
          style={[styles.connectButton, { backgroundColor: theme.primary }]}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#FFFFFF" />
              <Text style={styles.connectButtonText}>Connect Now</Text>
            </>
          )}
        </Pressable>
      )}
    </Animated.View>
  );
}

// Component: Fleet Vehicle Card
interface FleetVehicleCardProps {
  vehicle: FleetVehicle;
  onToggleStatus: (id: string) => void;
  theme: ReturnType<typeof getTheme>;
}

function FleetVehicleCard({ vehicle, onToggleStatus, theme }: FleetVehicleCardProps) {
  const scale = useSharedValue(1);
  const isInUse = vehicle.status === 'in_use';

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
      onPress={() => onToggleStatus(vehicle.id)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={`${vehicle.name}, ${vehicle.status === 'in_use' ? 'In use' : 'Available'}`}
      accessibilityRole="button"
    >
      <Animated.View
        entering={SlideInRight.duration(300)}
        style={[styles.vehicleCard, { backgroundColor: theme.surface }, animatedStyle]}
      >
        <View style={styles.vehicleCardLeft}>
          <View style={[styles.vehicleIconContainer, { backgroundColor: theme.primaryLight }]}>
            <MaterialCommunityIcons name="truck" size={24} color={theme.primary} />
          </View>
          <View style={styles.vehicleInfo}>
            <Text style={[styles.vehicleName, { color: theme.text }]}>{vehicle.name}</Text>
            <Text style={[styles.vehicleType, { color: theme.textMuted }]}>{vehicle.type}</Text>
            <View style={styles.vehicleMetaRow}>
              <Ionicons name="time-outline" size={12} color={theme.textMuted} />
              <Text style={[styles.vehicleMetaText, { color: theme.textMuted }]}>
                {vehicle.lastCheckIn}
              </Text>
              <View style={[styles.metaDot, { backgroundColor: theme.textMuted }]} />
              <Ionicons name="location-outline" size={12} color={theme.textMuted} />
              <Text style={[styles.vehicleMetaText, { color: theme.textMuted }]}>
                {vehicle.location}
              </Text>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: isInUse ? theme.primaryLight : theme.successLight,
            },
          ]}
        >
          <View
            style={[
              styles.pillDot,
              { backgroundColor: isInUse ? theme.primary : theme.success },
            ]}
          />
          <Text
            style={[
              styles.statusPillText,
              { color: isInUse ? theme.primary : theme.success },
            ]}
          >
            {isInUse ? 'In Use' : 'Available'}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// Component: GPS Progress Section
interface GPSProgressSectionProps {
  progress: number;
  isAnimating: boolean;
  onCompleteSetup: () => void;
  theme: ReturnType<typeof getTheme>;
}

function GPSProgressSection({
  progress,
  isAnimating,
  onCompleteSetup,
  theme,
}: GPSProgressSectionProps) {
  const progressWidth = useSharedValue(progress);
  const currentStep = Math.floor((progress / 100) * GPS_SETUP_STEPS.length);

  useEffect(() => {
    progressWidth.value = withTiming(progress, { duration: 500 });
  }, [progress, progressWidth]);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as any,
  }));

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.cardIconContainer, { backgroundColor: theme.infoLight }]}>
          <MaterialCommunityIcons name="satellite-variant" size={24} color={theme.info} />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>GPS Tracker Integration</Text>
          <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>
            {progress}% Complete
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressBarContainer, { backgroundColor: theme.borderLight }]}>
        <Animated.View
          style={[
            styles.progressBarFill,
            { backgroundColor: progress === 100 ? theme.success : theme.primary },
            progressAnimatedStyle,
          ]}
        />
      </View>

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
                  {
                    backgroundColor: isCompleted
                      ? theme.success
                      : isCurrent
                      ? theme.primary
                      : theme.borderLight,
                  },
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      { color: isCurrent ? '#FFFFFF' : theme.textMuted },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepText,
                  {
                    color: isCompleted
                      ? theme.success
                      : isCurrent
                      ? theme.text
                      : theme.textMuted,
                    fontWeight: isCurrent ? '600' : '400',
                  },
                ]}
              >
                {step}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Complete Setup Button */}
      {progress < 100 && (
        <Pressable
          onPress={onCompleteSetup}
          disabled={isAnimating}
          accessibilityLabel="Complete GPS setup"
          accessibilityRole="button"
          style={[
            styles.setupButton,
            { backgroundColor: theme.primary, opacity: isAnimating ? 0.7 : 1 },
          ]}
        >
          {isAnimating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
              <Text style={styles.setupButtonText}>Complete Setup</Text>
            </>
          )}
        </Pressable>
      )}

      {progress === 100 && (
        <View style={[styles.setupCompleteContainer, { backgroundColor: theme.successLight }]}>
          <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          <Text style={[styles.setupCompleteText, { color: theme.success }]}>
            GPS Integration Complete
          </Text>
        </View>
      )}
    </View>
  );
}

// Component: Activity Log Item
interface ActivityLogItemProps {
  log: ActivityLog;
  onToggle: (id: string) => void;
  theme: ReturnType<typeof getTheme>;
}

function ActivityLogItem({ log, onToggle, theme }: ActivityLogItemProps) {
  const getStatusColor = () => {
    switch (log.status) {
      case 'success':
        return theme.success;
      case 'failed':
        return theme.danger;
      default:
        return theme.warning;
    }
  };

  const getStatusIcon = () => {
    switch (log.status) {
      case 'success':
        return 'checkmark-circle';
      case 'failed':
        return 'close-circle';
      default:
        return 'time';
    }
  };

  return (
    <Pressable
      onPress={() => onToggle(log.id)}
      accessibilityLabel={`Activity: ${log.description}`}
      accessibilityRole="button"
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.activityLogItem, { borderLeftColor: getStatusColor() }]}
      >
        <View style={styles.activityLogHeader}>
          <View style={[styles.activityDot, { backgroundColor: getStatusColor() }]} />
          <Text style={[styles.activityTimestamp, { color: theme.textMuted }]}>
            {log.timestamp}
          </Text>
          <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
        </View>
        <Text
          style={[styles.activityDescription, { color: theme.text }]}
          numberOfLines={log.expanded ? undefined : 2}
        >
          {log.description}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// Component: Info Modal
interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ReturnType<typeof getTheme>;
}

function InfoModal({ visible, onClose, theme }: InfoModalProps) {
  return visible ? (

      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconContainer, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="information-circle" size={28} color={theme.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Fleet/GPS Integration
            </Text>
          </View>
          <Text style={[styles.modalText, { color: theme.textSecondary }]}>
            This feature enables real-time fleet tracking and automated parking management.
            {'\n\n'}
            <Text style={{ fontWeight: '600' }}>Features include:</Text>
            {'\n'}• Real-time vehicle tracking
            {'\n'}• Automated check-in/check-out
            {'\n'}• GPS-enabled geofencing
            {'\n'}• Fleet utilization analytics
            {'\n\n'}
            <Text style={{ fontStyle: 'italic', color: theme.textMuted }}>
              Full integration coming soon.
            </Text>
          </Text>
          <Pressable
            onPress={onClose}
            style={[styles.modalButton, { backgroundColor: theme.primary }]}
            accessibilityLabel="Close info modal"
            accessibilityRole="button"
          >
            <Text style={styles.modalButtonText}>Got it</Text>
          </Pressable>
        </View>
      </Pressable>
    
    ) : null;
}

// Main Screen Component
export default function IntegrationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

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

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Fleet/GPS Integrations"
          leftAction={{
            icon: 'back',
            label: 'Back',
            onPress: () => navigation.goBack(),
            showBackground: true,
          }}
          showDivider={false}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            Loading integration data...
          </Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Fleet/GPS Integrations"
          leftAction={{
            icon: 'back',
            label: 'Back',
            onPress: () => navigation.goBack(),
            showBackground: true,
          }}
          showDivider={false}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="standard"
        title="Fleet/GPS Integrations"
        leftAction={{
          icon: 'back',
          label: 'Back',
          onPress: () => navigation.goBack(),
          showBackground: true,
        }}
        rightActions={[
          {
            icon: 'help',
            label: 'Info',
            onPress: () => setInfoModalVisible(true),
          },
        ]}
        showDivider={false}
      />

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing[6] },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header Description */}
        <View style={styles.headerDescription}>
          <Text style={[styles.headerDescriptionText, { color: theme.textSecondary }]}>
            Manage your fleet, track vehicles in real-time, and integrate GPS systems for automated check-ins and check-outs.
          </Text>
        </View>

        {/* Section 1: Integration Status */}
        <IntegrationStatusCard
          isConnected={integrationData.isConnected}
          isConnecting={isConnecting}
          onConnect={handleConnect}
          theme={theme}
        />

        {/* Section 2: Fleet Overview */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Fleet Overview</Text>
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>
              {integrationData.fleetVehicles.length} vehicles
            </Text>
          </View>
          <View style={styles.vehicleList}>
            {integrationData.fleetVehicles.map(vehicle => (
              <FleetVehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onToggleStatus={handleToggleVehicleStatus}
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Section 3: GPS Progress */}
        <View style={styles.section}>
          <GPSProgressSection
            progress={integrationData.gpsProgress}
            isAnimating={isAnimatingGPS}
            onCompleteSetup={handleCompleteGPSSetup}
            theme={theme}
          />
        </View>

        {/* Section 4: Recent Activity */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Activity</Text>
          <View style={[styles.activityContainer, { backgroundColor: theme.surface }]}>
            {integrationData.activityLogs.map(log => (
              <ActivityLogItem
                key={log.id}
                log={log}
                onToggle={handleToggleActivityLog}
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Section 5: CTAs */}
        <View style={styles.ctaContainer}>
          <Pressable
            onPress={handleManageFleet}
            accessibilityLabel="Manage Fleet"
            accessibilityRole="button"
            style={[styles.ctaButton, { backgroundColor: theme.primary }]}
          >
            <MaterialCommunityIcons name="truck-delivery" size={20} color="#FFFFFF" />
            <Text style={styles.ctaButtonText}>Manage Fleet</Text>
          </Pressable>
          <Pressable
            onPress={handleConfigureGPS}
            accessibilityLabel="Configure GPS Integration"
            accessibilityRole="button"
            style={[styles.ctaButtonSecondary, { borderColor: theme.primary }]}
          >
            <MaterialCommunityIcons name="satellite-uplink" size={20} color={theme.primary} />
            <Text style={[styles.ctaButtonSecondaryText, { color: theme.primary }]}>
              Configure GPS
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Info Modal */}
      <InfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        theme={theme}
      />
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
  headerDescription: {
    marginBottom: spacing[4],
  },
  headerDescriptionText: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
  },
  loadingText: {
    fontSize: fontSize.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[4],
  },
  errorText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // Card styles
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderContent: {
    marginLeft: spacing[3],
    flex: 1,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing[2],
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  integrationActiveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
  },
  integrationActiveText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    minHeight: 48,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // Section styles
  section: {
    marginBottom: spacing[4],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  sectionCount: {
    fontSize: fontSize.sm,
  },

  // Vehicle card styles
  vehicleList: {
    gap: spacing[3],
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  vehicleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vehicleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: {
    marginLeft: spacing[3],
    flex: 1,
  },
  vehicleName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  vehicleType: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
    gap: spacing[1],
  },
  vehicleMetaText: {
    fontSize: 11,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: spacing[1],
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    gap: spacing[1],
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },

  // Progress bar styles
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing[4],
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  stepsContainer: {
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  stepIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  stepText: {
    fontSize: fontSize.sm,
  },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    minHeight: 48,
  },
  setupButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  setupCompleteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
  },
  setupCompleteText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Activity log styles
  activityContainer: {
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
  activityLogItem: {
    padding: spacing[4],
    borderLeftWidth: 3,
  },
  activityLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
    gap: spacing[2],
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityTimestamp: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  activityDescription: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.4,
  },

  // CTA styles
  ctaContainer: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    minHeight: 56,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  ctaButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    gap: spacing[2],
    minHeight: 56,
  },
  ctaButtonSecondaryText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // Modal styles
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    textAlign: 'center',
  },
  modalText: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.6,
    textAlign: 'left',
  },
  modalButton: {
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing[5],
    minHeight: 48,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
