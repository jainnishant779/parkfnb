import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  TextInput,
  Switch,
  Animated as RNAnimated,
  LayoutAnimation,
  UIManager,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import * as Kit from '../../theme/kit';
import * as UI from '../../components/ui';
import { iotService, type IoTDevice } from '../../services/iotService';
import { AppAlert } from '../../components/common/AppAlert';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const {
  T,
  Card,
  PillButton,
  IconCircle,
  Field,
  ScreenHeader,
  StatusTag,
  InfoGrid,
  Segmented,
  EmptyState,
  IsoBlock,
} = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii, shadow } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

// Ink toggle colours shared by every Switch on this screen.
const SWITCH_TRACK = { false: palette.bgSoft, true: palette.ink };
const SWITCH_THUMB = palette.surface;

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Storage key
const IOT_INTEGRATIONS_KEY = 'owners:iot_integrations';

// Types
interface IntegrationSettings {
  [key: string]: string | number | boolean;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconFamily: 'ionicons' | 'material';
  enabled: boolean;
  lastConnected: string | null;
  settings: IntegrationSettings;
  category: 'iot' | 'pos';
}

// Default integrations data
const DEFAULT_INTEGRATIONS: Integration[] = [
  {
    id: 'iot_occupancy',
    name: 'Occupancy Sensors',
    description: 'Real-time parking space occupancy detection',
    icon: 'car-wireless',
    iconFamily: 'material',
    enabled: false,
    lastConnected: null,
    settings: {
      sensorCount: 10,
      updateInterval: 30,
    },
    category: 'iot',
  },
  {
    id: 'iot_barrier',
    name: 'Smart Barriers',
    description: 'Automated entry/exit barrier control',
    icon: 'boom-gate',
    iconFamily: 'material',
    enabled: false,
    lastConnected: null,
    settings: {
      barrierCount: 2,
      autoOpen: true,
    },
    category: 'iot',
  },
  {
    id: 'iot_camera',
    name: 'LPR Cameras',
    description: 'License plate recognition for access control',
    icon: 'camera-outline',
    iconFamily: 'ionicons',
    enabled: false,
    lastConnected: null,
    settings: {
      cameraCount: 4,
      recordingEnabled: true,
    },
    category: 'iot',
  },
  {
    id: 'pos_stripe',
    name: 'Stripe POS',
    description: 'Accept card payments via Stripe terminal',
    icon: 'card-outline',
    iconFamily: 'ionicons',
    enabled: false,
    lastConnected: null,
    settings: {
      terminalId: '',
      acceptContactless: true,
    },
    category: 'pos',
  },
  {
    id: 'pos_square',
    name: 'Square POS',
    description: 'Process payments using Square hardware',
    icon: 'square-outline',
    iconFamily: 'ionicons',
    enabled: false,
    lastConnected: null,
    settings: {
      locationId: '',
      tipEnabled: false,
    },
    category: 'pos',
  },
];


// Snackbar component
interface SnackbarProps {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  onDismiss: () => void;
}

function Snackbar({ visible, message, type, onDismiss }: SnackbarProps) {
  const translateY = useRef(new RNAnimated.Value(100)).current;

  useEffect(() => {
    if (visible) {
      RNAnimated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        RNAnimated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }).start(() => onDismiss());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible, translateY, onDismiss]);

  if (!visible) return null;

  const iconBg = type === 'success' ? palette.success : type === 'error' ? palette.danger : palette.inkSoft;

  return (
    <RNAnimated.View style={[styles.snackbar, { transform: [{ translateY }] }]}>
      <View style={[styles.snackbarIcon, { backgroundColor: iconBg }]}>
        <Ionicons
          name={type === 'success' ? 'checkmark' : type === 'error' ? 'alert' : 'information'}
          size={15}
          color={palette.textInverse}
        />
      </View>
      <Text style={styles.snackbarText}>{message}</Text>
    </RNAnimated.View>
  );
}

// Integration icon in either icon family
function IntegrationIcon({ integration, size = 22 }: { integration: Integration; size?: number }) {
  if (integration.iconFamily === 'material') {
    return (
      <MaterialCommunityIcons name={integration.icon as any} size={size} color={palette.text} />
    );
  }
  return <Ionicons name={integration.icon as any} size={size} color={palette.text} />;
}

// Integration Card Component
interface IntegrationCardProps {
  integration: Integration;
  isExpanded: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onExpand: (id: string) => void;
  onSettingsChange: (id: string, settings: IntegrationSettings) => void;
}

function IntegrationCard({
  integration,
  isExpanded,
  onToggle,
  onExpand,
  onSettingsChange,
}: IntegrationCardProps) {
  const [localSettings, setLocalSettings] = useState(integration.settings);

  useEffect(() => {
    setLocalSettings(integration.settings);
  }, [integration.settings]);

  const handleToggle = useCallback((value: boolean) => {
    onToggle(integration.id, value);
  }, [integration.id, onToggle]);

  const handleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onExpand(integration.id);
  }, [integration.id, onExpand]);

  const handleSaveSettings = useCallback(() => {
    onSettingsChange(integration.id, localSettings);
  }, [integration.id, localSettings, onSettingsChange]);

  const formatLastConnected = () => {
    if (!integration.lastConnected) return 'Never connected';
    const date = new Date(integration.lastConnected);
    return `Last: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <TouchableOpacity
      onPress={handleExpand}
      activeOpacity={0.9}
      accessibilityLabel={`${integration.name}, ${integration.enabled ? 'enabled' : 'disabled'}`}
      accessibilityRole="button"
    >
      <Animated.View entering={FadeInDown.duration(300)} style={styles.integrationCard}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, integration.enabled && styles.iconCircleActive]}>
            <IntegrationIcon integration={integration} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>{integration.name}</Text>
              <StatusTag label={integration.category.toUpperCase()} tone="grey" />
            </View>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {integration.description}
            </Text>
          </View>
          <Switch
            value={integration.enabled}
            onValueChange={handleToggle}
            trackColor={SWITCH_TRACK}
            thumbColor={SWITCH_THUMB}
            ios_backgroundColor={palette.bgSoft}
            accessibilityLabel={`Toggle ${integration.name}`}
          />
        </View>

        {/* Status + expand indicator */}
        <View style={styles.cardFooter}>
          <StatusTag
            label={integration.enabled ? 'Connected' : 'Offline'}
            tone={integration.enabled ? 'success' : 'grey'}
          />
          <Text style={styles.lastConnected} numberOfLines={1}>{formatLastConnected()}</Text>
          <View style={styles.chevronCircle}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={palette.text}
            />
          </View>
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.expandedContent}>
            <Text style={styles.expandedLabel}>Settings</Text>

            {/* Render settings based on integration type */}
            {Object.entries(localSettings).map(([key, value]) => (
              <View key={key} style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </Text>
                {typeof value === 'boolean' ? (
                  <Switch
                    value={value}
                    onValueChange={(newValue) => setLocalSettings(prev => ({ ...prev, [key]: newValue }))}
                    trackColor={SWITCH_TRACK}
                    thumbColor={SWITCH_THUMB}
                    ios_backgroundColor={palette.bgSoft}
                  />
                ) : typeof value === 'number' ? (
                  <TextInput
                    style={styles.settingInput}
                    value={String(value)}
                    onChangeText={(text) => setLocalSettings(prev => ({ ...prev, [key]: parseInt(text) || 0 }))}
                    keyboardType="numeric"
                    accessibilityLabel={key}
                  />
                ) : (
                  <TextInput
                    style={[styles.settingInput, styles.settingInputWide]}
                    value={String(value)}
                    onChangeText={(text) => setLocalSettings(prev => ({ ...prev, [key]: text }))}
                    placeholder="Enter value"
                    placeholderTextColor={palette.textSubtle}
                    accessibilityLabel={key}
                  />
                )}
              </View>
            ))}

            {/* Status indicator */}
            <View style={[styles.statusRow, integration.enabled && styles.statusRowActive]}>
              <View style={[styles.statusDot, integration.enabled && styles.statusDotActive]} />
              <Text style={[styles.statusText, integration.enabled && styles.statusTextActive]}>
                {integration.enabled ? 'Integration Active' : 'Integration Disabled'}
              </Text>
            </View>

            {/* Save button for settings */}
            <PillButton
              label="Save Settings"
              icon="check"
              variant="ink"
              size="md"
              onPress={handleSaveSettings}
            />
          </Animated.View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// Sheet shell shared by the modals below
function Sheet({
  title,
  onClose,
  onBackdropPress,
  children,
}: {
  title?: string;
  onClose?: () => void;
  onBackdropPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.modalOverlay}>
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onBackdropPress}
        disabled={!onBackdropPress}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheet}
      >
        <View style={styles.grabber} />
        {title ? (
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>{title}</Text>
            {onClose ? (
              <IconCircle icon="x" variant="grey" size={38} onPress={onClose} />
            ) : null}
          </View>
        ) : null}
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

// Add Integration Modal
interface AddIntegrationModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (integration: Integration) => void;
  existingIds: string[];
}

function AddIntegrationModal({ visible, onClose, onAdd, existingIds }: AddIntegrationModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<'iot' | 'pos'>('iot');

  const availableIntegrations = DEFAULT_INTEGRATIONS.filter(
    int => int.category === selectedCategory && !existingIds.includes(int.id)
  );

  const handleAdd = (integration: Integration) => {
    onAdd({
      ...integration,
      enabled: true,
      lastConnected: new Date().toISOString(),
    });
    onClose();
  };

  return visible ? (
    <Sheet title="Add Integration" onClose={onClose}>
      {/* Category tabs */}
      <Segmented
        options={[
          { id: 'iot', label: 'IoT Devices' },
          { id: 'pos', label: 'POS Systems' },
        ]}
        value={selectedCategory}
        onChange={(id: string) => setSelectedCategory(id as 'iot' | 'pos')}
        style={styles.sheetSegmented}
      />

      {/* Available integrations */}
      <ScrollView style={styles.integrationsList} showsVerticalScrollIndicator={false}>
        {availableIntegrations.length === 0 ? (
          <EmptyState
            title={`All ${selectedCategory.toUpperCase()} integrations added`}
            tone="grey"
          />
        ) : (
          availableIntegrations.map((integration, index) => (
            <TouchableOpacity
              key={integration.id}
              onPress={() => handleAdd(integration)}
              activeOpacity={0.7}
              style={[
                styles.integrationOption,
                index < availableIntegrations.length - 1 && styles.divider,
              ]}
              accessibilityLabel={`Add ${integration.name}`}
              accessibilityRole="button"
            >
              <View style={styles.iconCircle}>
                <IntegrationIcon integration={integration} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{integration.name}</Text>
                <Text style={styles.optionDescription}>{integration.description}</Text>
              </View>
              <View style={styles.addCircle}>
                <Ionicons name="add" size={18} color={palette.textInverse} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </Sheet>
  ) : null;
}

// Info Modal
interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
}

function InfoModal({ visible, onClose }: InfoModalProps) {
  return visible ? (
    <Sheet onBackdropPress={onClose}>
      <View style={styles.infoBody}>
        <View style={styles.infoIconContainer}>
          <Ionicons name="information" size={26} color={palette.text} />
        </View>
        <Text style={styles.infoTitle}>IoT/POS Integrations</Text>
        <Text style={styles.infoText}>
          Connect your parking facility with smart devices and payment systems.
        </Text>
        <View style={styles.infoBlock}>
          <Text style={styles.infoBlockTitle}>IoT Devices:</Text>
          <Text style={styles.infoBlockText}>
            Occupancy sensors, smart barriers, and LPR cameras for automated operations.
          </Text>
          <View style={styles.infoBlockDivider} />
          <Text style={styles.infoBlockTitle}>POS Systems:</Text>
          <Text style={styles.infoBlockText}>
            Accept payments via Stripe, Square, or other payment terminals.
          </Text>
        </View>
        <PillButton
          label="Got it"
          variant="ink"
          onPress={onClose}
          style={styles.infoButton}
        />
      </View>
    </Sheet>
  ) : null;
}

// Pair Smart Barrier Modal
interface PairDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  onPair: () => void;
  deviceId: string;
  setDeviceId: (val: string) => void;
  deviceName: string;
  setDeviceName: (val: string) => void;
}

function PairDeviceModal({
  visible,
  onClose,
  onPair,
  deviceId,
  setDeviceId,
  deviceName,
  setDeviceName,
}: PairDeviceModalProps) {
  return visible ? (
    <Sheet title="Pair Smart Barrier (ESP32)" onClose={onClose}>
      <View style={styles.pairBody}>
        <Text style={styles.pairModalSubtitle}>
          Enter the Device ID configured in your ESP32 firmware (e.g. pb-001).
        </Text>

        <Field
          label="Device ID *"
          icon="cpu"
          placeholder="e.g. pb-001"
          value={deviceId}
          onChangeText={setDeviceId}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Field
          label="Barrier Label (Optional)"
          icon="tag"
          placeholder="e.g. Main Gate Barrier"
          value={deviceName}
          onChangeText={setDeviceName}
          style={styles.fieldGap}
        />

        <View style={styles.pairModalActions}>
          <PillButton
            label="Cancel"
            variant="grey"
            onPress={onClose}
            style={styles.flex1}
          />
          <PillButton
            label="Pair Hardware"
            icon="link"
            variant="ink"
            onPress={onPair}
            style={styles.flex1}
          />
        </View>
      </View>
    </Sheet>
  ) : null;
}

// Main Screen Component
export default function IoTIntegrationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Real IoT Smart Barriers state
  const [realDevices, setRealDevices] = useState<IoTDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [commandingDeviceId, setCommandingDeviceId] = useState<string | null>(null);

  // Original data for comparison
  const [originalData, setOriginalData] = useState<Integration[]>([]);

  const loadRealDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await iotService.getMyDevices();
      setRealDevices(res.devices || []);
    } catch (err: any) {
      console.warn('Failed to load real IoT devices:', err?.message);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  const handleDeviceCommand = async (deviceId: string, cmd: 'open' | 'close' | 'stop' | 'cal') => {
    setCommandingDeviceId(deviceId);
    try {
      const res = await iotService.sendCommand(deviceId, cmd);
      setSnackbar({
        visible: true,
        message: res.message || `Command '${cmd}' sent`,
        type: 'success',
      });
      setTimeout(loadRealDevices, 1200);
    } catch (err: any) {
      AppAlert.alert('Command Failed', err?.message || 'Could not send command to barrier');
    } finally {
      setCommandingDeviceId(null);
    }
  };

  const handlePairDevice = async () => {
    if (!newDeviceId.trim()) {
      AppAlert.alert('Missing ID', 'Please enter a device ID (e.g. pb-001)');
      return;
    }
    try {
      await iotService.pairDevice({
        device_id: newDeviceId.trim(),
        name: newDeviceName.trim() || undefined,
      });
      setShowPairModal(false);
      setNewDeviceId('');
      setNewDeviceName('');
      setSnackbar({ visible: true, message: 'Smart barrier paired successfully!', type: 'success' });
      loadRealDevices();
    } catch (err: any) {
      AppAlert.alert('Pairing Failed', err?.message || 'Could not pair device');
    }
  };

  const handleUnpairDevice = async (deviceId: string) => {
    try {
      await iotService.unpairDevice(deviceId);
      setSnackbar({ visible: true, message: 'Device unpaired', type: 'info' });
      loadRealDevices();
    } catch (err: any) {
      AppAlert.alert('Unpair Failed', err?.message || 'Could not unpair device');
    }
  };

  // Load integrations from AsyncStorage
  const loadIntegrations = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(IOT_INTEGRATIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setIntegrations(parsed);
        setOriginalData(parsed);
      }
    } catch (err) {
      console.error('Failed to load integrations:', err);
      setSnackbar({ visible: true, message: 'Failed to load integrations', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Save integrations to AsyncStorage
  const saveIntegrations = useCallback(async (data: Integration[]) => {
    try {
      await AsyncStorage.setItem(IOT_INTEGRATIONS_KEY, JSON.stringify(data));
      setOriginalData(data);
      setHasChanges(false);
      return true;
    } catch (err) {
      console.error('Failed to save integrations:', err);
      return false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadIntegrations();
    loadRealDevices();
  }, [loadIntegrations, loadRealDevices]);

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(integrations) !== JSON.stringify(originalData);
    setHasChanges(changed);
  }, [integrations, originalData]);

  // Handle toggle
  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    const updatedIntegrations = integrations.map(int =>
      int.id === id
        ? { ...int, enabled, lastConnected: enabled ? new Date().toISOString() : int.lastConnected }
        : int
    );
    setIntegrations(updatedIntegrations);

    // Auto-save toggle changes
    const success = await saveIntegrations(updatedIntegrations);
    if (success) {
      setSnackbar({
        visible: true,
        message: `${enabled ? 'Enabled' : 'Disabled'} integration`,
        type: 'success',
      });
    }
  }, [integrations, saveIntegrations]);

  // Handle expand
  const handleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  // Handle settings change
  const handleSettingsChange = useCallback(async (id: string, settings: IntegrationSettings) => {
    const updatedIntegrations = integrations.map(int =>
      int.id === id ? { ...int, settings } : int
    );
    setIntegrations(updatedIntegrations);

    const success = await saveIntegrations(updatedIntegrations);
    if (success) {
      setSnackbar({ visible: true, message: 'Settings saved', type: 'success' });
    } else {
      setSnackbar({ visible: true, message: 'Failed to save settings', type: 'error' });
    }
  }, [integrations, saveIntegrations]);

  // Handle add integration
  const handleAddIntegration = useCallback(async (integration: Integration) => {
    const updatedIntegrations = [...integrations, integration];
    setIntegrations(updatedIntegrations);

    const success = await saveIntegrations(updatedIntegrations);
    if (success) {
      setSnackbar({ visible: true, message: `Added ${integration.name}`, type: 'success' });
    }
  }, [integrations, saveIntegrations]);

  // Handle save all
  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    const success = await saveIntegrations(integrations);
    setSaving(false);

    if (success) {
      setSnackbar({ visible: true, message: 'All changes saved', type: 'success' });
    } else {
      setSnackbar({ visible: true, message: 'Failed to save changes', type: 'error' });
    }
  }, [integrations, saveIntegrations]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setIntegrations(originalData);
    setHasChanges(false);
    setSnackbar({ visible: true, message: 'Changes discarded', type: 'info' });
  }, [originalData]);

  // Dismiss snackbar
  const dismissSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, visible: false }));
  }, []);

  // Get existing integration IDs
  const existingIds = useMemo(() => integrations.map(int => int.id), [integrations]);


  const iotIntegrations = integrations.filter(int => int.category === 'iot');
  const posIntegrations = integrations.filter(int => int.category === 'pos');
  const activeCount = integrations.filter(int => int.enabled).length;

  const header = (withInfo: boolean) => (
    <ScreenHeader
      title="Integrations"
      onBack={() => navigation.goBack()}
      right={
        withInfo ? (
          <IconCircle icon="help-circle" size={40} onPress={() => setShowInfoModal(true)} />
        ) : undefined
      }
    />
  );

  const renderIntegrationCard = (integration: Integration) => (
    <IntegrationCard
      key={integration.id}
      integration={integration}
      isExpanded={expandedId === integration.id}
      onToggle={handleToggle}
      onExpand={handleExpand}
      onSettingsChange={handleSettingsChange}
    />
  );

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header(false)}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
          <Text style={styles.loadingText}>Loading integrations...</Text>
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
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Card tone="peach" style={styles.hero}>
          <View style={styles.heroText}>
            <T variant="h2">Devices &{'\n'}payments</T>
            <T variant="bodySmall" style={styles.heroSub}>
              Manage your IoT/POS integrations
            </T>
          </View>
          <View style={styles.heroStats}>
            <View>
              <Text style={styles.heroStatValue}>{realDevices.length}</Text>
              <Text style={styles.heroStatLabel}>Barriers</Text>
            </View>
            <View>
              <Text style={styles.heroStatValue}>{activeCount}</Text>
              <Text style={styles.heroStatLabel}>Active</Text>
            </View>
          </View>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={140} tone="peach" />
          </View>
        </Card>

        {/* Smart Barriers (ESP32 Hardware) Section */}
        <View style={styles.hardwareHeaderRow}>
          <View style={styles.hardwareHeaderLeft}>
            <Text style={styles.sectionTitle}>Smart Barriers (ESP32)</Text>
            <StatusTag
              label={String(realDevices.length)}
              tone={realDevices.length > 0 ? 'ink' : 'grey'}
            />
          </View>
          <PillButton
            label="Pair Barrier"
            icon="plus"
            variant="ink"
            size="sm"
            onPress={() => setShowPairModal(true)}
          />
        </View>

        {loadingDevices ? (
          <ActivityIndicator size="small" color={palette.ink} style={styles.devicesLoader} />
        ) : realDevices.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              title="No Smart Barriers Paired"
              subtitle="Connect physical ESP32 barrier controllers to automate vehicle entry and spot locking."
              action="Pair ESP32 Controller"
              onAction={() => setShowPairModal(true)}
              tone="grey"
            />
          </Card>
        ) : (
          <View style={styles.cardList}>
            {realDevices.map(device => {
              const isOnline = device.status === 'online';
              const isCommanding = commandingDeviceId === device.device_id;
              const angle = device.last_state?.angle !== undefined ? `${device.last_state.angle}°` : (isOnline ? '0°' : '--');
              const isUpright = device.last_state?.angle !== undefined && device.last_state.angle > 45;
              const rssi = device.last_state?.rssi ? `${device.last_state.rssi} dBm` : '-60 dBm';
              const battery = device.last_state?.battery_level !== undefined ? `${device.last_state.battery_level}%` : '100%';
              const fw = device.last_state?.fw_version || '1.0.0';

              return (
                <View key={device._id || device.device_id} style={styles.deviceCard}>
                  <View style={styles.deviceCardTitleRow}>
                    <View style={[styles.iconCircle, isOnline && styles.iconCircleActive]}>
                      <MaterialCommunityIcons
                        name={isUpright ? 'boom-gate-up' : 'boom-gate-down'}
                        size={22}
                        color={palette.text}
                      />
                    </View>
                    <View style={styles.deviceTitleBlock}>
                      <Text style={styles.deviceTitle} numberOfLines={1}>
                        {device.name || device.device_id}
                      </Text>
                      <Text style={styles.deviceIdText} numberOfLines={1}>
                        ID: {device.device_id} • FW: v{fw}
                      </Text>
                    </View>
                    <StatusTag
                      label={isOnline ? 'Online' : 'Offline'}
                      tone={isOnline ? 'success' : 'grey'}
                    />
                  </View>

                  {/* Telemetry row */}
                  <InfoGrid
                    columns={3}
                    items={[
                      { label: 'Barrier Arm', value: angle },
                      { label: 'Signal (WiFi)', value: rssi },
                      { label: 'Battery', value: battery },
                    ]}
                    style={styles.telemetryGrid}
                  />

                  {/* Manual Controls */}
                  <View style={styles.deviceActionsRow}>
                    <PillButton
                      label="Open (0°)"
                      icon="arrow-down-circle"
                      variant="ink"
                      size="sm"
                      onPress={() => handleDeviceCommand(device.device_id, 'open')}
                      disabled={isCommanding}
                      style={styles.flex1}
                    />
                    <PillButton
                      label="Secure (90°)"
                      icon="shield"
                      variant="ink"
                      size="sm"
                      onPress={() => handleDeviceCommand(device.device_id, 'close')}
                      disabled={isCommanding}
                      style={styles.flex1}
                    />
                  </View>
                  <View style={styles.deviceActionsRow}>
                    <PillButton
                      label="Stop"
                      icon="stop-circle"
                      variant="grey"
                      size="sm"
                      onPress={() => handleDeviceCommand(device.device_id, 'stop')}
                      disabled={isCommanding}
                      style={styles.flex1}
                    />
                    <TouchableOpacity
                      style={styles.unpairButton}
                      activeOpacity={0.75}
                      accessibilityLabel="Unpair barrier"
                      accessibilityRole="button"
                      onPress={() => {
                        AppAlert.alert(
                          'Unpair Barrier?',
                          `Disconnect device ${device.device_id}? Drivers will not be able to auto-unlock this bay.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Unpair', style: 'destructive', onPress: () => handleUnpairDevice(device.device_id) },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={17} color={palette.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Empty State */}
        {integrations.length === 0 ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Integrations</Text>
            <Card padded={false}>
              <EmptyState
                title="No integrations set up yet"
                subtitle="Connect IoT devices and POS systems to automate your parking facility"
                action="Add New Integration"
                onAction={() => setShowAddModal(true)}
                tone="peach"
              />
            </Card>
          </>
        ) : (
          <>
            {/* IoT Section */}
            {iotIntegrations.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, styles.sectionSpaced]}>IoT Devices</Text>
                <View style={styles.cardList}>{iotIntegrations.map(renderIntegrationCard)}</View>
              </>
            )}

            {/* POS Section */}
            {posIntegrations.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, styles.sectionSpaced]}>POS Systems</Text>
                <View style={styles.cardList}>{posIntegrations.map(renderIntegrationCard)}</View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Save/Cancel buttons (show only when there are changes) */}
      {hasChanges && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
        >
          <PillButton
            label="Cancel"
            variant="grey"
            onPress={handleCancel}
            style={styles.flex1}
          />
          <PillButton
            label="Save Changes"
            icon="check"
            variant="ink"
            onPress={handleSaveAll}
            loading={saving}
            style={styles.flex1}
          />
        </Animated.View>
      )}

      {/* FAB for adding integrations */}
      <TouchableOpacity
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.85}
        style={[styles.fab, { bottom: hasChanges ? 100 + insets.bottom : 24 + insets.bottom }]}
        accessibilityLabel="Add new integration"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={palette.textInverse} />
      </TouchableOpacity>

      {/* Modals */}
      <AddIntegrationModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddIntegration}
        existingIds={existingIds}
      />
      <InfoModal
        visible={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
      <PairDeviceModal
        visible={showPairModal}
        onClose={() => setShowPairModal(false)}
        onPair={handlePairDevice}
        deviceId={newDeviceId}
        setDeviceId={setNewDeviceId}
        deviceName={newDeviceName}
        setDeviceName={setNewDeviceName}
      />

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        type={snackbar.type}
        onDismiss={dismissSnackbar}
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
  flex1: {
    flex: 1,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },

  // Hero
  hero: {
    minHeight: 220,
    overflow: 'hidden',
  },
  heroText: {
    maxWidth: '62%',
  },
  heroSub: {
    marginTop: 8,
    color: palette.inkSoft,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 'auto',
    paddingTop: 20,
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
  },
  sectionSpaced: {
    marginTop: 28,
    marginBottom: 12,
  },
  cardList: {
    gap: 12,
  },
  hardwareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
    gap: 8,
  },
  hardwareHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 8,
  },
  devicesLoader: {
    marginVertical: 16,
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
  iconCircleActive: {
    backgroundColor: palette.peachSoft,
  },

  // Device card
  deviceCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
  },
  deviceCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceTitleBlock: {
    flex: 1,
    marginHorizontal: 12,
  },
  deviceTitle: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  deviceIdText: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  telemetryGrid: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  deviceActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  unpairButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Integration card
  integrationCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...fonts.semibold,
    flexShrink: 1,
    fontSize: 16,
    color: palette.text,
  },
  cardDescription: {
    ...fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
    marginTop: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  lastConnected: {
    ...fonts.medium,
    flex: 1,
    fontSize: 12,
    color: palette.textMuted,
  },
  chevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedContent: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  expandedLabel: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    marginBottom: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  settingLabel: {
    ...fonts.medium,
    flex: 1,
    fontSize: 14,
    color: palette.text,
  },
  settingInput: {
    ...fonts.semibold,
    minWidth: 72,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    fontSize: 14,
    color: palette.text,
    textAlign: 'center',
  },
  settingInputWide: {
    minWidth: 150,
    textAlign: 'left',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 10,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
  },
  statusRowActive: {
    backgroundColor: palette.successSoft,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.textMuted,
  },
  statusDotActive: {
    backgroundColor: palette.success,
  },
  statusText: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.textMuted,
  },
  statusTextActive: {
    color: palette.success,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    ...shadow.lifted,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.ink,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.lifted,
  },

  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    gap: 12,
    ...shadow.lifted,
  },
  snackbarIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snackbarText: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 14,
    color: palette.textInverse,
  },

  // Sheets
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
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 4,
    paddingBottom: 14,
  },
  sheetTitle: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  sheetSegmented: {
    marginBottom: 8,
  },
  integrationsList: {
    flexGrow: 0,
  },
  integrationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  optionContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  optionTitle: {
    ...fonts.semibold,
    fontSize: 15.5,
    color: palette.text,
  },
  optionDescription: {
    ...fonts.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.textMuted,
    marginTop: 2,
  },
  addCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Info sheet
  infoBody: {
    alignItems: 'center',
    paddingTop: 8,
  },
  infoIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.peachSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  infoTitle: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: palette.text,
    textAlign: 'center',
  },
  infoText: {
    ...fonts.medium,
    fontSize: 14.5,
    lineHeight: 21,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  infoBlock: {
    alignSelf: 'stretch',
    marginTop: 18,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
  },
  infoBlockTitle: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  infoBlockText: {
    ...fonts.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textMuted,
    marginTop: 4,
  },
  infoBlockDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
    marginVertical: 12,
  },
  infoButton: {
    alignSelf: 'stretch',
    marginTop: 20,
  },

  // Pair sheet
  pairBody: {
    paddingBottom: 4,
  },
  pairModalSubtitle: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMuted,
    marginBottom: 16,
  },
  fieldGap: {
    marginTop: 14,
  },
  pairModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
});
