// NotificationPreferencesScreen - Manage notification preferences for all owner types
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';

// Storage key
const NOTIFICATION_PREFS_KEY = 'owners:notification_preferences';

// Notification category types
type NotificationCategory = 'bookings' | 'payments' | 'property' | 'system';

// Individual preference type
interface NotificationPreference {
  id: string;
  title: string;
  description: string;
  category: NotificationCategory;
  pushEnabled: boolean;
  emailEnabled: boolean;
  icon: string;
}

// Default notification preferences
const DEFAULT_PREFERENCES: NotificationPreference[] = [
  // Bookings Category
  {
    id: 'booking_confirmed',
    title: 'Booking Confirmations',
    description: 'When a new booking is confirmed for your space',
    category: 'bookings',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'checkmark-circle-outline',
  },
  {
    id: 'booking_cancelled',
    title: 'Booking Cancellations',
    description: 'When a customer cancels their booking',
    category: 'bookings',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'close-circle-outline',
  },
  {
    id: 'booking_modified',
    title: 'Booking Modifications',
    description: 'When a booking is modified or extended',
    category: 'bookings',
    pushEnabled: true,
    emailEnabled: false,
    icon: 'create-outline',
  },
  {
    id: 'booking_reminder',
    title: 'Upcoming Booking Reminders',
    description: 'Reminders for bookings starting soon',
    category: 'bookings',
    pushEnabled: true,
    emailEnabled: false,
    icon: 'alarm-outline',
  },
  {
    id: 'no_show',
    title: 'No-Show Alerts',
    description: 'When a customer fails to arrive for their booking',
    category: 'bookings',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'alert-circle-outline',
  },
  // Payments Category
  {
    id: 'payment_received',
    title: 'Payment Received',
    description: 'When payment is successfully processed',
    category: 'payments',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'card-outline',
  },
  {
    id: 'payout_completed',
    title: 'Payout Completed',
    description: 'When funds are transferred to your bank account',
    category: 'payments',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'wallet-outline',
  },
  {
    id: 'payout_scheduled',
    title: 'Payout Scheduled',
    description: 'When a payout is scheduled for processing',
    category: 'payments',
    pushEnabled: false,
    emailEnabled: true,
    icon: 'calendar-outline',
  },
  {
    id: 'payment_failed',
    title: 'Payment Issues',
    description: 'When there are problems with a payment',
    category: 'payments',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'warning-outline',
  },
  // Property Category
  {
    id: 'review_received',
    title: 'New Reviews',
    description: 'When a customer leaves a review',
    category: 'property',
    pushEnabled: true,
    emailEnabled: false,
    icon: 'star-outline',
  },
  {
    id: 'listing_views',
    title: 'Listing Activity',
    description: 'Weekly summary of views and inquiries',
    category: 'property',
    pushEnabled: false,
    emailEnabled: true,
    icon: 'eye-outline',
  },
  {
    id: 'availability_alert',
    title: 'Availability Alerts',
    description: 'When your space has high demand periods',
    category: 'property',
    pushEnabled: true,
    emailEnabled: false,
    icon: 'trending-up-outline',
  },
  {
    id: 'promo_expiring',
    title: 'Promotion Expiry',
    description: 'When your promotions are about to expire',
    category: 'property',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'pricetag-outline',
  },
  // System Category
  {
    id: 'account_security',
    title: 'Security Alerts',
    description: 'Important account security notifications',
    category: 'system',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'kyc_updates',
    title: 'KYC Updates',
    description: 'Status updates on your verification',
    category: 'system',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'document-text-outline',
  },
  {
    id: 'app_updates',
    title: 'App Updates',
    description: 'New features and improvements',
    category: 'system',
    pushEnabled: false,
    emailEnabled: true,
    icon: 'download-outline',
  },
  {
    id: 'support_messages',
    title: 'Support Messages',
    description: 'Replies to your support tickets',
    category: 'system',
    pushEnabled: true,
    emailEnabled: true,
    icon: 'chatbubble-outline',
  },
];

// Category configuration
const CATEGORIES: { key: NotificationCategory; title: string; icon: string; description: string }[] = [
  {
    key: 'bookings',
    title: 'Bookings',
    icon: 'car-outline',
    description: 'Notifications about parking bookings',
  },
  {
    key: 'payments',
    title: 'Payments & Payouts',
    icon: 'cash-outline',
    description: 'Financial transactions and payouts',
  },
  {
    key: 'property',
    title: 'Property & Listings',
    icon: 'business-outline',
    description: 'Reviews, views, and property updates',
  },
  {
    key: 'system',
    title: 'System & Security',
    icon: 'settings-outline',
    description: 'Account security and app updates',
  },
];

// Global settings interface
interface GlobalSettings {
  allPushEnabled: boolean;
  allEmailEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  allPushEnabled: true,
  allEmailEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

// Toggle item component
interface ToggleItemProps {
  preference: NotificationPreference;
  onTogglePush: (id: string, value: boolean) => void;
  onToggleEmail: (id: string, value: boolean) => void;
  theme: ReturnType<typeof getTheme>;
  isLast: boolean;
}

function ToggleItem({ preference, onTogglePush, onToggleEmail, theme, isLast }: ToggleItemProps) {
  return (
    <View
      style={[
        styles.toggleItem,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight },
      ]}
    >
      <View style={styles.toggleItemHeader}>
        <View style={[styles.toggleItemIcon, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name={preference.icon} size={18} color={theme.primary} />
        </View>
        <View style={styles.toggleItemText}>
          <Text style={[styles.toggleItemTitle, { color: theme.text }]}>
            {preference.title}
          </Text>
          <Text style={[styles.toggleItemDescription, { color: theme.textMuted }]} numberOfLines={2}>
            {preference.description}
          </Text>
        </View>
      </View>
      <View style={styles.toggleItemControls}>
        <View style={styles.toggleControl}>
          <Ionicons name="phone-portrait-outline" size={16} color={theme.textMuted} />
          <Text style={[styles.toggleLabel, { color: theme.textSecondary }]}>Push</Text>
          <Switch
            value={preference.pushEnabled}
            onValueChange={(value) => onTogglePush(preference.id, value)}
            trackColor={{ false: theme.borderLight, true: theme.primaryLight }}
            thumbColor={preference.pushEnabled ? theme.primary : theme.textMuted}
            ios_backgroundColor={theme.borderLight}
            style={styles.switch}
          />
        </View>
        <View style={[styles.toggleControl, styles.toggleControlLast]}>
          <Ionicons name="mail-outline" size={16} color={theme.textMuted} />
          <Text style={[styles.toggleLabel, { color: theme.textSecondary }]}>Email</Text>
          <Switch
            value={preference.emailEnabled}
            onValueChange={(value) => onToggleEmail(preference.id, value)}
            trackColor={{ false: theme.borderLight, true: theme.primaryLight }}
            thumbColor={preference.emailEnabled ? theme.primary : theme.textMuted}
            ios_backgroundColor={theme.borderLight}
            style={styles.switch}
          />
        </View>
      </View>
    </View>
  );
}

// Category section component
interface CategorySectionProps {
  category: typeof CATEGORIES[0];
  preferences: NotificationPreference[];
  onTogglePush: (id: string, value: boolean) => void;
  onToggleEmail: (id: string, value: boolean) => void;
  theme: ReturnType<typeof getTheme>;
  index: number;
}

function CategorySection({
  category,
  preferences,
  onTogglePush,
  onToggleEmail,
  theme,
  index,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Animated.View
      entering={FadeInDown.delay(100 + index * 100).duration(400)}
      style={[styles.categorySection, { backgroundColor: theme.surface }]}
    >
      {/* Category Header */}
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={styles.categoryHeader}
        accessibilityLabel={`${category.title} notifications section, ${isExpanded ? 'expanded' : 'collapsed'}`}
        accessibilityRole="button"
      >
        <View style={styles.categoryHeaderLeft}>
          <View style={[styles.categoryIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name={category.icon} size={20} color={theme.primary} />
          </View>
          <View style={styles.categoryHeaderText}>
            <Text style={[styles.categoryTitle, { color: theme.text }]}>
              {category.title}
            </Text>
            <Text style={[styles.categoryDescription, { color: theme.textMuted }]}>
              {category.description}
            </Text>
          </View>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.textMuted}
        />
      </Pressable>

      {/* Category Items */}
      {isExpanded && (
        <View style={styles.categoryItems}>
          {preferences.map((pref, idx) => (
            <ToggleItem
              key={pref.id}
              preference={pref}
              onTogglePush={onTogglePush}
              onToggleEmail={onToggleEmail}
              theme={theme}
              isLast={idx === preferences.length - 1}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// Global toggle section
interface GlobalToggleSectionProps {
  settings: GlobalSettings;
  onToggleAllPush: (value: boolean) => void;
  onToggleAllEmail: (value: boolean) => void;
  onToggleQuietHours: (value: boolean) => void;
  theme: ReturnType<typeof getTheme>;
}

function GlobalToggleSection({
  settings,
  onToggleAllPush,
  onToggleAllEmail,
  onToggleQuietHours,
  theme,
}: GlobalToggleSectionProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(50).duration(400)}
      style={[styles.globalSection, { backgroundColor: theme.surface }]}
    >
      <View style={styles.globalHeader}>
        <View style={[styles.globalIcon, { backgroundColor: theme.infoLight }]}>
          <Ionicons name="options-outline" size={20} color={theme.info} />
        </View>
        <Text style={[styles.globalTitle, { color: theme.text }]}>
          Global Settings
        </Text>
      </View>

      {/* Master Push Toggle */}
      <View style={[styles.globalItem, { borderBottomColor: theme.borderLight }]}>
        <View style={styles.globalItemLeft}>
          <Ionicons name="notifications-outline" size={20} color={theme.textSecondary} />
          <View style={styles.globalItemText}>
            <Text style={[styles.globalItemTitle, { color: theme.text }]}>
              Push Notifications
            </Text>
            <Text style={[styles.globalItemDescription, { color: theme.textMuted }]}>
              Receive push notifications on your device
            </Text>
          </View>
        </View>
        <Switch
          value={settings.allPushEnabled}
          onValueChange={onToggleAllPush}
          trackColor={{ false: theme.borderLight, true: theme.primaryLight }}
          thumbColor={settings.allPushEnabled ? theme.primary : theme.textMuted}
          ios_backgroundColor={theme.borderLight}
        />
      </View>

      {/* Master Email Toggle */}
      <View style={[styles.globalItem, { borderBottomColor: theme.borderLight }]}>
        <View style={styles.globalItemLeft}>
          <Ionicons name="mail-outline" size={20} color={theme.textSecondary} />
          <View style={styles.globalItemText}>
            <Text style={[styles.globalItemTitle, { color: theme.text }]}>
              Email Notifications
            </Text>
            <Text style={[styles.globalItemDescription, { color: theme.textMuted }]}>
              Receive notifications via email
            </Text>
          </View>
        </View>
        <Switch
          value={settings.allEmailEnabled}
          onValueChange={onToggleAllEmail}
          trackColor={{ false: theme.borderLight, true: theme.primaryLight }}
          thumbColor={settings.allEmailEnabled ? theme.primary : theme.textMuted}
          ios_backgroundColor={theme.borderLight}
        />
      </View>

      {/* Quiet Hours Toggle */}
      <View style={styles.globalItemLast}>
        <View style={styles.globalItemLeft}>
          <Ionicons name="moon-outline" size={20} color={theme.textSecondary} />
          <View style={styles.globalItemText}>
            <Text style={[styles.globalItemTitle, { color: theme.text }]}>
              Quiet Hours
            </Text>
            <Text style={[styles.globalItemDescription, { color: theme.textMuted }]}>
              Mute notifications from {settings.quietHoursStart} to {settings.quietHoursEnd}
            </Text>
          </View>
        </View>
        <Switch
          value={settings.quietHoursEnabled}
          onValueChange={onToggleQuietHours}
          trackColor={{ false: theme.borderLight, true: theme.primaryLight }}
          thumbColor={settings.quietHoursEnabled ? theme.primary : theme.textMuted}
          ios_backgroundColor={theme.borderLight}
        />
      </View>
    </Animated.View>
  );
}

// Snackbar component
interface SnackbarProps {
  visible: boolean;
  message: string;
  variant: 'success' | 'error' | 'info';
  onDismiss: () => void;
  theme: ReturnType<typeof getTheme>;
}

function Snackbar({ visible, message, variant, onDismiss, theme }: SnackbarProps) {
  const translateY = useSharedValue(100);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15 });
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(100, { duration: 200 });
    }
  }, [visible, translateY, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const bgColor = variant === 'success' ? theme.success : variant === 'error' ? theme.danger : theme.primary;

  if (!visible) return null;

  return (
    <Animated.View style={[styles.snackbar, { backgroundColor: bgColor }, animatedStyle]}>
      <Ionicons
        name={variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color="#FFFFFF"
      />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
}

// Main Screen
export default function NotificationPreferencesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference[]>(DEFAULT_PREFERENCES);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', variant: 'info' });

  // Load preferences from storage
  const loadPreferences = useCallback(async () => {
    try {
      setError(null);
      const stored = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences(parsed.preferences || DEFAULT_PREFERENCES);
        setGlobalSettings(parsed.globalSettings || DEFAULT_GLOBAL_SETTINGS);
      }
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
      setError('Unable to load preferences. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Show snackbar
  const showSnackbar = useCallback((message: string, variant: 'success' | 'error' | 'info') => {
    setSnackbar({ visible: true, message, variant });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, visible: false }));
  }, []);

  // Save preferences to storage
  const savePreferences = useCallback(async () => {
    setIsSaving(true);
    try {
      const data = {
        preferences,
        globalSettings,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(data));
      setHasChanges(false);
      showSnackbar('Preferences saved successfully', 'success');
    } catch (err) {
      console.error('Failed to save preferences:', err);
      showSnackbar('Failed to save preferences', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [preferences, globalSettings, showSnackbar]);

  // Toggle handlers
  const handleTogglePush = useCallback((id: string, value: boolean) => {
    setPreferences(prev =>
      prev.map(p => (p.id === id ? { ...p, pushEnabled: value } : p))
    );
    setHasChanges(true);
  }, []);

  const handleToggleEmail = useCallback((id: string, value: boolean) => {
    setPreferences(prev =>
      prev.map(p => (p.id === id ? { ...p, emailEnabled: value } : p))
    );
    setHasChanges(true);
  }, []);

  const handleToggleAllPush = useCallback((value: boolean) => {
    setGlobalSettings(prev => ({ ...prev, allPushEnabled: value }));
    if (!value) {
      // Disable all push notifications
      setPreferences(prev => prev.map(p => ({ ...p, pushEnabled: false })));
    }
    setHasChanges(true);
  }, []);

  const handleToggleAllEmail = useCallback((value: boolean) => {
    setGlobalSettings(prev => ({ ...prev, allEmailEnabled: value }));
    if (!value) {
      // Disable all email notifications
      setPreferences(prev => prev.map(p => ({ ...p, emailEnabled: false })));
    }
    setHasChanges(true);
  }, []);

  const handleToggleQuietHours = useCallback((value: boolean) => {
    setGlobalSettings(prev => ({ ...prev, quietHoursEnabled: value }));
    setHasChanges(true);
  }, []);

  // Group preferences by category
  const groupedPreferences = useMemo(() => {
    return CATEGORIES.map(category => ({
      category,
      preferences: preferences.filter(p => p.category === category.key),
    }));
  }, [preferences]);

  // Reset to defaults
  const handleResetToDefaults = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
    setHasChanges(true);
    showSnackbar('Preferences reset to defaults', 'info');
  }, [showSnackbar]);

  // Retry loading
  const handleRetry = useCallback(() => {
    setIsLoading(true);
    loadPreferences();
  }, [loadPreferences]);

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <AppHeader
          variant="standard"
          title="Notifications"
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
            Loading preferences...
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
          title="Notifications"
          leftAction={{
            icon: 'back',
            label: 'Back',
            onPress: () => navigation.goBack(),
            showBackground: true,
          }}
          showDivider={false}
        />
        <View style={styles.errorContainer}>
          <View style={[styles.errorIcon, { backgroundColor: theme.dangerLight }]}>
            <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
          </View>
          <Text style={[styles.errorTitle, { color: theme.text }]}>
            Something went wrong
          </Text>
          <Text style={[styles.errorText, { color: theme.textMuted }]}>
            {error}
          </Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Try Again</Text>
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
        title="Notifications"
        subtitle="Manage your preferences"
        leftAction={{
          icon: 'back',
          label: 'Back',
          onPress: () => navigation.goBack(),
          showBackground: true,
        }}
        rightActions={[
          {
            icon: 'refresh',
            label: 'Reset to defaults',
            onPress: handleResetToDefaults,
          },
        ]}
        showDivider={false}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (hasChanges ? 100 : spacing[6]) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Banner */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={[styles.infoBanner, { backgroundColor: theme.infoLight }]}
        >
          <Ionicons name="information-circle" size={20} color={theme.info} />
          <Text style={[styles.infoBannerText, { color: theme.info }]}>
            Configure how and when you receive notifications about your parking spaces.
          </Text>
        </Animated.View>

        {/* Global Settings */}
        <GlobalToggleSection
          settings={globalSettings}
          onToggleAllPush={handleToggleAllPush}
          onToggleAllEmail={handleToggleAllEmail}
          onToggleQuietHours={handleToggleQuietHours}
          theme={theme}
        />

        {/* Category Sections */}
        {groupedPreferences.map((group, index) => (
          <CategorySection
            key={group.category.key}
            category={group.category}
            preferences={group.preferences}
            onTogglePush={handleTogglePush}
            onToggleEmail={handleToggleEmail}
            theme={theme}
            index={index}
          />
        ))}

        {/* Privacy Note */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(400)}
          style={[styles.privacyNote, { borderColor: theme.borderLight }]}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.textMuted} />
          <Text style={[styles.privacyNoteText, { color: theme.textMuted }]}>
            Your notification preferences are stored locally on your device. We respect your privacy and will only send notifications according to your settings.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Save Button - Fixed at bottom when changes exist */}
      {hasChanges && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[
            styles.saveButtonContainer,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + spacing[4],
              borderTopColor: theme.borderLight,
            },
          ]}
        >
          <Pressable
            onPress={savePreferences}
            disabled={isSaving}
            style={[
              styles.saveButton,
              { backgroundColor: theme.primary },
              isSaving && { opacity: 0.7 },
            ]}
            accessibilityLabel="Save preferences"
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        variant={snackbar.variant}
        onDismiss={hideSnackbar}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    fontSize: fontSize.base,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    textAlign: 'center',
  },
  errorText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[4],
  },
  infoBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  // Global Section
  globalSection: {
    borderRadius: borderRadius.xl,
    marginBottom: spacing[4],
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  globalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  globalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globalTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  globalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  globalItemLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  globalItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginRight: spacing[3],
  },
  globalItemText: {
    flex: 1,
    gap: 2,
  },
  globalItemTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  globalItemDescription: {
    fontSize: fontSize.xs,
  },
  // Category Section
  categorySection: {
    borderRadius: borderRadius.xl,
    marginBottom: spacing[4],
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
  },
  categoryHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryHeaderText: {
    flex: 1,
    gap: 2,
  },
  categoryTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  categoryDescription: {
    fontSize: fontSize.xs,
  },
  categoryItems: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  // Toggle Item
  toggleItem: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  toggleItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  toggleItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleItemText: {
    flex: 1,
    gap: 2,
  },
  toggleItemTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  toggleItemDescription: {
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  toggleItemControls: {
    flexDirection: 'row',
    marginLeft: 44,
    gap: spacing[4],
  },
  toggleControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  toggleControlLast: {
    marginLeft: spacing[2],
  },
  toggleLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  switch: {
    transform: Platform.OS === 'ios' ? [{ scaleX: 0.8 }, { scaleY: 0.8 }] : [],
  },
  // Privacy Note
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    padding: spacing[4],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginTop: spacing[2],
  },
  privacyNoteText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  // Save Button Container
  saveButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    minHeight: 52,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 100,
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  snackbarText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
});
