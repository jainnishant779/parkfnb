import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Animated as RNAnimated,
  LayoutAnimation,
  UIManager,
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
  FadeInDown,
  FadeOut,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';
import { iotService, type IoTDevice } from '../../services/iotService';
import { AppAlert } from '../../components/common/AppAlert';

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
  const theme = useMemo(() => getTheme(false), []);
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

  const bgColor = type === 'success' ? theme.success : type === 'error' ? theme.danger : theme.info;

  return (
    <RNAnimated.View
      style={[
        styles.snackbar,
        { backgroundColor: bgColor, transform: [{ translateY }] },
      ]}
    >
      <Ionicons
        name={type === 'success' ? 'checkmark-circle' : type === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color="#FFFFFF"
      />
      <Text style={styles.snackbarText}>{message}</Text>
    </RNAnimated.View>
  );
}

// Integration Card Component
interface IntegrationCardProps {
  integration: Integration;
  isExpanded: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onExpand: (id: string) => void;
  onSettingsChange: (id: string, settings: IntegrationSettings) => void;
  theme: ReturnType<typeof getTheme>;
}

function IntegrationCard({
  integration,
  isExpanded,
  onToggle,
  onExpand,
  onSettingsChange,
  theme,
}: IntegrationCardProps) {
  const scale = useSharedValue(1);
  const [localSettings, setLocalSettings] = useState(integration.settings);

  useEffect(() => {
    setLocalSettings(integration.settings);
  }, [integration.settings]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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

  const renderIcon = () => {
    if (integration.iconFamily === 'material') {
      return (
        <MaterialCommunityIcons
          name={integration.icon as any}
          size={24}
          color={integration.enabled ? theme.primary : theme.textMuted}
        />
      );
    }
    return (
      <Ionicons
        name={integration.icon as any}
        size={24}
        color={integration.enabled ? theme.primary : theme.textMuted}
      />
    );
  };

  const formatLastConnected = () => {
    if (!integration.lastConnected) return 'Never connected';
    const date = new Date(integration.lastConnected);
    return `Last: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <Pressable
      onPress={handleExpand}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={`${integration.name}, ${integration.enabled ? 'enabled' : 'disabled'}`}
      accessibilityRole="button"
    >
      <Animated.View
        entering={FadeInDown.duration(300)}
        style={[styles.integrationCard, { backgroundColor: theme.surface }, animatedStyle]}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={[
            styles.iconContainer,
            { backgroundColor: integration.enabled ? theme.primaryLight : theme.borderLight }
          ]}>
            {renderIcon()}
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{integration.name}</Text>
              <View style={[
                styles.categoryBadge,
                { backgroundColor: integration.category === 'iot' ? theme.infoLight : theme.successLight }
              ]}>
                <Text style={[
                  styles.categoryText,
                  { color: integration.category === 'iot' ? theme.info : theme.success }
                ]}>
                  {integration.category.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: theme.textMuted }]} numberOfLines={2}>
              {integration.description}
            </Text>
            <Text style={[styles.lastConnected, { color: theme.textMuted }]}>
              {formatLastConnected()}
            </Text>
          </View>
          <View style={styles.toggleContainer}>
            <Switch
              value={integration.enabled}
              onValueChange={handleToggle}
              trackColor={{ false: theme.borderLight, true: theme.primary + '40' }}
              thumbColor={integration.enabled ? theme.primary : theme.textMuted}
              accessibilityLabel={`Toggle ${integration.name}`}
            />
          </View>
        </View>

        {/* Expand Indicator */}
        <View style={styles.expandIndicator}>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.textMuted}
          />
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.expandedContent, { borderTopColor: theme.borderLight }]}
          >
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Settings</Text>

            {/* Render settings based on integration type */}
            {Object.entries(localSettings).map(([key, value]) => (
              <View key={key} style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </Text>
                {typeof value === 'boolean' ? (
                  <Switch
                    value={value}
                    onValueChange={(newValue) => setLocalSettings(prev => ({ ...prev, [key]: newValue }))}
                    trackColor={{ false: theme.borderLight, true: theme.primary + '40' }}
                    thumbColor={value ? theme.primary : theme.textMuted}
                  />
                ) : typeof value === 'number' ? (
                  <TextInput
                    style={[styles.settingInput, { color: theme.text, borderColor: theme.border }]}
                    value={String(value)}
                    onChangeText={(text) => setLocalSettings(prev => ({ ...prev, [key]: parseInt(text) || 0 }))}
                    keyboardType="numeric"
                    accessibilityLabel={key}
                  />
                ) : (
                  <TextInput
                    style={[styles.settingInput, styles.settingInputWide, { color: theme.text, borderColor: theme.border }]}
                    value={String(value)}
                    onChangeText={(text) => setLocalSettings(prev => ({ ...prev, [key]: text }))}
                    placeholder="Enter value"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel={key}
                  />
                )}
              </View>
            ))}

            {/* Status indicator */}
            <View style={[styles.statusRow, { backgroundColor: integration.enabled ? theme.successLight : theme.borderLight }]}>
              <View style={[styles.statusDot, { backgroundColor: integration.enabled ? theme.success : theme.textMuted }]} />
              <Text style={[styles.statusText, { color: integration.enabled ? theme.success : theme.textMuted }]}>
                {integration.enabled ? 'Integration Active' : 'Integration Disabled'}
              </Text>
            </View>

            {/* Save button for settings */}
            <Pressable
              onPress={handleSaveSettings}
              style={[styles.saveSettingsButton, { backgroundColor: theme.primary }]}
              accessibilityLabel="Save settings"
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.saveSettingsText}>Save Settings</Text>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Add Integration Modal
interface AddIntegrationModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (integration: Integration) => void;
  existingIds: string[];
  theme: ReturnType<typeof getTheme>;
}

function AddIntegrationModal({ visible, onClose, onAdd, existingIds, theme }: AddIntegrationModalProps) {
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

      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Integration</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </Pressable>
          </View>

          {/* Category tabs */}
          <View style={styles.categoryTabs}>
            <Pressable
              onPress={() => setSelectedCategory('iot')}
              style={[
                styles.categoryTab,
                selectedCategory === 'iot' && { backgroundColor: theme.primaryLight },
              ]}
            >
              <MaterialCommunityIcons
                name="access-point"
                size={20}
                color={selectedCategory === 'iot' ? theme.primary : theme.textMuted}
              />
              <Text style={[
                styles.categoryTabText,
                { color: selectedCategory === 'iot' ? theme.primary : theme.textMuted }
              ]}>IoT Devices</Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedCategory('pos')}
              style={[
                styles.categoryTab,
                selectedCategory === 'pos' && { backgroundColor: theme.primaryLight },
              ]}
            >
              <Ionicons
                name="card-outline"
                size={20}
                color={selectedCategory === 'pos' ? theme.primary : theme.textMuted}
              />
              <Text style={[
                styles.categoryTabText,
                { color: selectedCategory === 'pos' ? theme.primary : theme.textMuted }
              ]}>POS Systems</Text>
            </Pressable>
          </View>

          {/* Available integrations */}
          <ScrollView style={styles.integrationsList}>
            {availableIntegrations.length === 0 ? (
              <View style={styles.noIntegrationsAvailable}>
                <Ionicons name="checkmark-circle" size={48} color={theme.success} />
                <Text style={[styles.noIntegrationsText, { color: theme.textMuted }]}>
                  All {selectedCategory.toUpperCase()} integrations added
                </Text>
              </View>
            ) : (
              availableIntegrations.map(integration => (
                <Pressable
                  key={integration.id}
                  onPress={() => handleAdd(integration)}
                  style={[styles.integrationOption, { borderColor: theme.border }]}
                  accessibilityLabel={`Add ${integration.name}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.optionIcon, { backgroundColor: theme.primaryLight }]}>
                    {integration.iconFamily === 'material' ? (
                      <MaterialCommunityIcons name={integration.icon as any} size={24} color={theme.primary} />
                    ) : (
                      <Ionicons name={integration.icon as any} size={24} color={theme.primary} />
                    )}
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={[styles.optionTitle, { color: theme.text }]}>{integration.name}</Text>
                    <Text style={[styles.optionDescription, { color: theme.textMuted }]}>
                      {integration.description}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={theme.primary} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    
    ) : null;
}

// Info Modal
interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ReturnType<typeof getTheme>;
}

function InfoModal({ visible, onClose, theme }: InfoModalProps) {
  return visible ? (

      <Pressable style={styles.infoModalOverlay} onPress={onClose}>
        <View style={[styles.infoModalContent, { backgroundColor: theme.surface }]}>
          <View style={[styles.infoIconContainer, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="information-circle" size={32} color={theme.primary} />
          </View>
          <Text style={[styles.infoTitle, { color: theme.text }]}>IoT/POS Integrations</Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Connect your parking facility with smart devices and payment systems.
            {'\n\n'}
            <Text style={{ fontWeight: '600' }}>IoT Devices:</Text>
            {'\n'}Occupancy sensors, smart barriers, and LPR cameras for automated operations.
            {'\n\n'}
            <Text style={{ fontWeight: '600' }}>POS Systems:</Text>
            {'\n'}Accept payments via Stripe, Square, or other payment terminals.
          </Text>
          <Pressable
            onPress={onClose}
            style={[styles.infoButton, { backgroundColor: theme.primary }]}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Text style={styles.infoButtonText}>Got it</Text>
          </Pressable>
        </View>
      </Pressable>
    
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
  theme: ReturnType<typeof getTheme>;
}

function PairDeviceModal({
  visible,
  onClose,
  onPair,
  deviceId,
  setDeviceId,
  deviceName,
  setDeviceName,
  theme,
}: PairDeviceModalProps) {
  return visible ? (
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Pair Smart Barrier (ESP32)</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
            <Ionicons name="close" size={24} color={theme.textMuted} />
          </Pressable>
        </View>
        <Text style={[styles.pairModalSubtitle, { color: theme.textSecondary }]}>
          Enter the Device ID configured in your ESP32 firmware (e.g. pb-001).
        </Text>

        <Text style={[styles.inputLabel, { color: theme.text }]}>Device ID *</Text>
        <TextInput
          style={[styles.pairInput, { color: theme.text, borderColor: theme.border }]}
          placeholder="e.g. pb-001"
          placeholderTextColor={theme.textMuted}
          value={deviceId}
          onChangeText={setDeviceId}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.inputLabel, { color: theme.text, marginTop: spacing[3] }]}>
          Barrier Label (Optional)
        </Text>
        <TextInput
          style={[styles.pairInput, { color: theme.text, borderColor: theme.border }]}
          placeholder="e.g. Main Gate Barrier"
          placeholderTextColor={theme.textMuted}
          value={deviceName}
          onChangeText={setDeviceName}
        />

        <View style={styles.pairModalActions}>
          <Pressable
            style={[styles.pairCancelBtn, { borderColor: theme.border }]}
            onPress={onClose}
          >
            <Text style={[styles.pairCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.pairSubmitBtn, { backgroundColor: '#0D7377' }]}
            onPress={onPair}
          >
            <Ionicons name="link" size={16} color="#FFFFFF" />
            <Text style={styles.pairSubmitBtnText}>Pair Hardware</Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : null;
}

// Main Screen Component
export default function IoTIntegrationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

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

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Integrations"
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
            Loading integrations...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="standard"
        title="Integrations"
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
            onPress: () => setShowInfoModal(true),
          },
        ]}
        showDivider={false}
      />

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing[20] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle */}
        <View style={styles.subtitleContainer}>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Manage your IoT/POS integrations
          </Text>
        </View>

        {/* Smart Barriers (ESP32 Hardware) Section */}
        <View style={styles.section}>
          <View style={styles.hardwareHeaderRow}>
            <View style={styles.hardwareHeaderLeft}>
              <MaterialCommunityIcons name="boom-gate" size={22} color="#0D7377" />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Smart Barriers (ESP32)</Text>
              <View style={[styles.hardwareCountBadge, { backgroundColor: realDevices.length > 0 ? '#E0F2F1' : '#F1F5F9' }]}>
                <Text style={[styles.hardwareCountBadgeText, { color: realDevices.length > 0 ? '#0D7377' : '#64748B' }]}>
                  {realDevices.length}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.pairHardwareSmallBtn}
              onPress={() => setShowPairModal(true)}
              accessibilityLabel="Pair ESP32 barrier"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.pairHardwareSmallBtnText}>Pair Barrier</Text>
            </Pressable>
          </View>

          {loadingDevices ? (
            <ActivityIndicator size="small" color="#0D7377" style={{ marginVertical: spacing[4] }} />
          ) : realDevices.length === 0 ? (
            <View style={[styles.hardwareEmptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="boom-gate-outline" size={36} color={theme.textMuted} />
              <Text style={[styles.hardwareEmptyTitle, { color: theme.text }]}>No Smart Barriers Paired</Text>
              <Text style={[styles.hardwareEmptyText, { color: theme.textMuted }]}>
                Connect physical ESP32 barrier controllers to automate vehicle entry and spot locking.
              </Text>
              <Pressable
                style={[styles.pairHardwareSmallBtn, { alignSelf: 'center', marginTop: spacing[2] }]}
                onPress={() => setShowPairModal(true)}
              >
                <Ionicons name="link" size={16} color="#FFFFFF" />
                <Text style={styles.pairHardwareSmallBtnText}>Pair ESP32 Controller</Text>
              </Pressable>
            </View>
          ) : (
            realDevices.map(device => {
              const isOnline = device.status === 'online';
              const isCommanding = commandingDeviceId === device.device_id;
              const angle = device.last_state?.angle !== undefined ? `${device.last_state.angle}°` : (isOnline ? '0°' : '--');
              const isUpright = device.last_state?.angle !== undefined && device.last_state.angle > 45;
              const rssi = device.last_state?.rssi ? `${device.last_state.rssi} dBm` : '-60 dBm';
              const battery = device.last_state?.battery_level !== undefined ? `${device.last_state.battery_level}%` : '100%';
              const fw = device.last_state?.fw_version || '1.0.0';

              return (
                <View
                  key={device._id || device.device_id}
                  style={[styles.deviceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.deviceCardHeader}>
                    <View style={styles.deviceCardTitleRow}>
                      <View style={[styles.deviceIconBox, { backgroundColor: isOnline ? '#E0F2F1' : '#F1F5F9' }]}>
                        <MaterialCommunityIcons
                          name={isUpright ? 'boom-gate-up' : 'boom-gate-down'}
                          size={24}
                          color={isOnline ? '#0D7377' : '#64748B'}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing[3] }}>
                        <Text style={[styles.deviceTitle, { color: theme.text }]}>
                          {device.name || device.device_id}
                        </Text>
                        <Text style={[styles.deviceIdText, { color: theme.textMuted }]}>
                          ID: {device.device_id} • FW: v{fw}
                        </Text>
                      </View>
                      <View style={isOnline ? styles.onlineBadge : styles.offlineBadge}>
                        <View style={isOnline ? styles.onlineBadgeDot : styles.offlineBadgeDot} />
                        <Text style={isOnline ? styles.onlineBadgeText : styles.offlineBadgeText}>
                          {isOnline ? 'Online' : 'Offline'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Telemetry row */}
                  <View style={[styles.deviceTelemetryGrid, { borderColor: theme.borderLight }]}>
                    <View style={styles.telemetryItem}>
                      <Text style={[styles.telemetryLabel, { color: theme.textMuted }]}>Barrier Arm</Text>
                      <Text style={[styles.telemetryValue, { color: theme.text }]}>{angle}</Text>
                    </View>
                    <View style={styles.telemetryItem}>
                      <Text style={[styles.telemetryLabel, { color: theme.textMuted }]}>Signal (WiFi)</Text>
                      <Text style={[styles.telemetryValue, { color: theme.text }]}>{rssi}</Text>
                    </View>
                    <View style={styles.telemetryItem}>
                      <Text style={[styles.telemetryLabel, { color: theme.textMuted }]}>Battery</Text>
                      <Text style={[styles.telemetryValue, { color: theme.text }]}>{battery}</Text>
                    </View>
                  </View>

                  {/* Manual Controls */}
                  <View style={styles.deviceActionsRow}>
                    <Pressable
                      style={[styles.cmdBtnOpen, isCommanding && { opacity: 0.5 }]}
                      onPress={() => handleDeviceCommand(device.device_id, 'open')}
                      disabled={isCommanding}
                    >
                      <Ionicons name="arrow-down-circle" size={16} color="#FFFFFF" />
                      <Text style={styles.cmdBtnText}>Open (0°)</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.cmdBtnClose, isCommanding && { opacity: 0.5 }]}
                      onPress={() => handleDeviceCommand(device.device_id, 'close')}
                      disabled={isCommanding}
                    >
                      <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" />
                      <Text style={styles.cmdBtnText}>Secure (90°)</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.cmdBtnStop, isCommanding && { opacity: 0.5 }]}
                      onPress={() => handleDeviceCommand(device.device_id, 'stop')}
                      disabled={isCommanding}
                    >
                      <Ionicons name="stop-circle" size={16} color="#475569" />
                      <Text style={[styles.cmdBtnText, { color: '#475569' }]}>Stop</Text>
                    </Pressable>

                    <Pressable
                      style={styles.cmdBtnUnpair}
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
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Empty State */}
        {integrations.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconContainer, { backgroundColor: theme.primaryLight }]}>
              <MaterialCommunityIcons name="connection" size={48} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No integrations set up yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Connect IoT devices and POS systems to automate your parking facility
            </Text>
            <Pressable
              onPress={() => setShowAddModal(true)}
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              accessibilityLabel="Add new integration"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.emptyButtonText}>Add New Integration</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* IoT Section */}
            {integrations.filter(int => int.category === 'iot').length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="access-point" size={20} color={theme.info} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>IoT Devices</Text>
                </View>
                {integrations
                  .filter(int => int.category === 'iot')
                  .map(integration => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      isExpanded={expandedId === integration.id}
                      onToggle={handleToggle}
                      onExpand={handleExpand}
                      onSettingsChange={handleSettingsChange}
                      theme={theme}
                    />
                  ))}
              </View>
            )}

            {/* POS Section */}
            {integrations.filter(int => int.category === 'pos').length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="card-outline" size={20} color={theme.success} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>POS Systems</Text>
                </View>
                {integrations
                  .filter(int => int.category === 'pos')
                  .map(integration => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      isExpanded={expandedId === integration.id}
                      onToggle={handleToggle}
                      onExpand={handleExpand}
                      onSettingsChange={handleSettingsChange}
                      theme={theme}
                    />
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Save/Cancel buttons (show only when there are changes) */}
      {hasChanges && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={[styles.bottomBar, { backgroundColor: theme.surface, paddingBottom: insets.bottom + spacing[4] }]}
        >
          <Pressable
            onPress={handleCancel}
            style={[styles.cancelButton, { borderColor: theme.border }]}
            accessibilityLabel="Cancel changes"
            accessibilityRole="button"
          >
            <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveAll}
            disabled={saving}
            style={[styles.saveButton, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
            accessibilityLabel="Save all changes"
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* FAB for adding integrations */}
      <Pressable
        onPress={() => setShowAddModal(true)}
        style={[styles.fab, { backgroundColor: theme.primary, bottom: hasChanges ? 100 + insets.bottom : 24 + insets.bottom }]}
        accessibilityLabel="Add new integration"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      {/* Modals */}
      <AddIntegrationModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddIntegration}
        existingIds={existingIds}
        theme={theme}
      />
      <InfoModal
        visible={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        theme={theme}
      />
      <PairDeviceModal
        visible={showPairModal}
        onClose={() => setShowPairModal(false)}
        onPair={handlePairDevice}
        deviceId={newDeviceId}
        setDeviceId={setNewDeviceId}
        deviceName={newDeviceName}
        setDeviceName={setNewDeviceName}
        theme={theme}
      />

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        type={snackbar.type}
        onDismiss={dismissSnackbar}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
  },
  loadingText: {
    fontSize: fontSize.sm,
  },
  subtitleContainer: {
    marginBottom: spacing[4],
  },
  subtitle: {
    fontSize: fontSize.sm,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[6],
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[5],
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold as any,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[6],
    lineHeight: fontSize.sm * 1.5,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // Section
  section: {
    marginBottom: spacing[5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },

  // Integration Card
  integrationCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
    overflow: 'hidden',
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
    padding: spacing[4],
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginHorizontal: spacing[3],
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  categoryBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: fontWeight.bold as any,
  },
  cardDescription: {
    fontSize: fontSize.xs,
    marginBottom: spacing[1],
  },
  lastConnected: {
    fontSize: 11,
  },
  toggleContainer: {
    marginLeft: spacing[2],
  },
  expandIndicator: {
    alignItems: 'center',
    paddingBottom: spacing[2],
  },

  // Expanded content
  expandedContent: {
    borderTopWidth: 1,
    padding: spacing[4],
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  settingLabel: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  settingInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: fontSize.sm,
    width: 80,
    textAlign: 'center',
  },
  settingInputWide: {
    width: 150,
    textAlign: 'left',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  saveSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  saveSettingsText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: spacing[4],
    gap: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing[4],
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },

  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 100,
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    gap: spacing[3],
  },
  snackbarText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    flex: 1,
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  categoryTabs: {
    flexDirection: 'row',
    padding: spacing[4],
    gap: spacing[3],
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  categoryTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  integrationsList: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
  },
  integrationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
    gap: spacing[3],
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: fontSize.xs,
  },
  noIntegrationsAvailable: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    gap: spacing[3],
  },
  noIntegrationsText: {
    fontSize: fontSize.sm,
  },

  // Info modal
  infoModalOverlay: {
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
  infoModalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    alignItems: 'center',
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
  infoIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  infoTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[3],
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.6,
    textAlign: 'left',
  },
  infoButton: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
    borderRadius: borderRadius.lg,
    marginTop: spacing[5],
  },
  infoButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // Smart Barriers (ESP32) Styles
  hardwareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  hardwareHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  hardwareCountBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginLeft: spacing[1],
  },
  hardwareCountBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold as any,
  },
  pairHardwareSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D7377',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  pairHardwareSmallBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  hardwareEmptyCard: {
    padding: spacing[6],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: spacing[2],
  },
  hardwareEmptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginTop: spacing[2],
  },
  hardwareEmptyText: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  deviceCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing[4],
    marginBottom: spacing[3],
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
  deviceCardHeader: {
    marginBottom: spacing[3],
  },
  deviceCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold as any,
  },
  deviceIdText: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 5,
  },
  onlineBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  onlineBadgeText: {
    color: '#16A34A',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 5,
  },
  offlineBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  offlineBadgeText: {
    color: '#64748B',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  deviceTelemetryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing[3],
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  telemetryValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  deviceActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cmdBtnOpen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  cmdBtnClose: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D7377',
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    gap: spacing[1],
  },
  cmdBtnStop: {
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cmdBtnUnpair: {
    padding: 10,
    borderRadius: borderRadius.lg,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cmdBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },

  // Pair Modal Extra Styles
  pairModalSubtitle: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginBottom: spacing[4],
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[1],
  },
  pairInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    fontSize: fontSize.sm,
  },
  pairModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    marginTop: spacing[5],
    marginBottom: spacing[2],
  },
  pairCancelBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
  },
  pairCancelBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  pairSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    gap: 6,
  },
  pairSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
});
