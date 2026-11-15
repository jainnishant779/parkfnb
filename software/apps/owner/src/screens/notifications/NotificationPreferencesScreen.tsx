// NotificationPreferencesScreen - Manage notification preferences for all owner types
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { palette, radii, fonts } from '../../theme/kit';
import { ScreenHeader, PillButton, EmptyState } from '../../components/ui';

// Ink toggle shared by every switch on this screen.
const SWITCH_PROPS = {
  trackColor: { false: palette.line, true: palette.ink },
  thumbColor: palette.surface,
  ios_backgroundColor: palette.line,
};

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
  isLast: boolean;
}

function ToggleItem({ preference, onTogglePush, onToggleEmail, isLast }: ToggleItemProps) {
  return (
    <View style={[styles.toggleItem, !isLast && styles.divider]}>
      <View style={styles.toggleItemHeader}>
        <View style={styles.rowIcon}>
          <Ionicons name={preference.icon} size={18} color={palette.text} />
        </View>
        <View style={styles.toggleItemText}>
          <Text style={styles.toggleItemTitle}>{preference.title}</Text>
          <Text style={styles.toggleItemDescription} numberOfLines={2}>
            {preference.description}
          </Text>
        </View>
      </View>
      <View style={styles.toggleItemControls}>
        <View style={styles.toggleControl}>
          <Ionicons name="phone-portrait-outline" size={15} color={palette.textMuted} />
          <Text style={styles.toggleLabel}>Push</Text>
          <Switch
            value={preference.pushEnabled}
            onValueChange={(value) => onTogglePush(preference.id, value)}
            {...SWITCH_PROPS}
            style={styles.switch}
          />
        </View>
        <View style={styles.toggleControl}>
          <Ionicons name="mail-outline" size={15} color={palette.textMuted} />
          <Text style={styles.toggleLabel}>Email</Text>
          <Switch
            value={preference.emailEnabled}
            onValueChange={(value) => onToggleEmail(preference.id, value)}
            {...SWITCH_PROPS}
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
  index: number;
}

function CategorySection({
  category,
  preferences,
  onTogglePush,
  onToggleEmail,
  index,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Animated.View
      entering={FadeInDown.delay(100 + index * 100).duration(400)}
      style={styles.card}
    >
      {/* Category Header */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        style={[styles.categoryHeader, isExpanded && styles.divider]}
        accessibilityLabel={`${category.title} notifications section, ${isExpanded ? 'expanded' : 'collapsed'}`}
        accessibilityRole="button"
      >
        <View style={styles.categoryIcon}>
          <Ionicons name={category.icon} size={20} color={palette.text} />
        </View>
        <View style={styles.categoryHeaderText}>
          <Text style={styles.categoryTitle}>{category.title}</Text>
          <Text style={styles.categoryDescription}>{category.description}</Text>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={palette.textSubtle}
        />
      </TouchableOpacity>

      {/* Category Items */}
      {isExpanded && (
        <View>
          {preferences.map((pref, idx) => (
            <ToggleItem
              key={pref.id}
              preference={pref}
              onTogglePush={onTogglePush}
              onToggleEmail={onToggleEmail}
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
}

function GlobalRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  isLast,
}: {
  icon: string;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.globalItem, !isLast && styles.divider]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={palette.text} />
      </View>
      <View style={styles.globalItemText}>
        <Text style={styles.globalItemTitle}>{title}</Text>
        <Text style={styles.globalItemDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} {...SWITCH_PROPS} />
    </View>
  );
}

function GlobalToggleSection({
  settings,
  onToggleAllPush,
  onToggleAllEmail,
  onToggleQuietHours,
}: GlobalToggleSectionProps) {
  return (
    <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.card}>
      <Text style={styles.cardTitle}>Global settings</Text>
      <GlobalRow
        icon="notifications-outline"
        title="Push Notifications"
        description="Receive push notifications on your device"
        value={settings.allPushEnabled}
        onValueChange={onToggleAllPush}
      />
      <GlobalRow
        icon="mail-outline"
        title="Email Notifications"
        description="Receive notifications via email"
        value={settings.allEmailEnabled}
        onValueChange={onToggleAllEmail}
      />
      <GlobalRow
        icon="moon-outline"
        title="Quiet Hours"
        description={`Mute notifications from ${settings.quietHoursStart} to ${settings.quietHoursEnd}`}
        value={settings.quietHoursEnabled}
        onValueChange={onToggleQuietHours}
        isLast
      />
    </Animated.View>
  );
}

// Snackbar component
interface SnackbarProps {
  visible: boolean;
  message: string;
  variant: 'success' | 'error' | 'info';
  onDismiss: () => void;
  bottom: number;
}

function Snackbar({ visible, message, variant, onDismiss, bottom }: SnackbarProps) {
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

  const iconColor = variant === 'success' ? palette.success : variant === 'error' ? palette.danger : palette.peach;

  if (!visible) return null;

  return (
    <Animated.View style={[styles.snackbar, { bottom }, animatedStyle]}>
      <Ionicons
        name={variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color={iconColor}
      />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
}

// Main Screen
export default function NotificationPreferencesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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

  const header = (withReset: boolean) => (
    <ScreenHeader
      title="Notifications"
      onBack={() => navigation.goBack()}
      right={
        withReset ? (
          <TouchableOpacity
            onPress={handleResetToDefaults}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityLabel="Reset to defaults"
            accessibilityRole="button"
          >
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        ) : null
      }
    />
  );

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header(false)}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header(false)}
        <View style={styles.errorContainer}>
          <EmptyState
            tone="grey"
            title="Something went wrong"
            subtitle={error}
            action="Try Again"
            onAction={handleRetry}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      {header(true)}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (hasChanges ? 110 : 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.intro}>
          <Text style={styles.introTitle}>Stay in the loop</Text>
          <Text style={styles.introText}>
            Configure how and when you receive notifications about your parking spaces.
          </Text>
        </Animated.View>

        {/* Global Settings */}
        <GlobalToggleSection
          settings={globalSettings}
          onToggleAllPush={handleToggleAllPush}
          onToggleAllEmail={handleToggleAllEmail}
          onToggleQuietHours={handleToggleQuietHours}
        />

        {/* Category Sections */}
        {groupedPreferences.map((group, index) => (
          <CategorySection
            key={group.category.key}
            category={group.category}
            preferences={group.preferences}
            onTogglePush={handleTogglePush}
            onToggleEmail={handleToggleEmail}
            index={index}
          />
        ))}

        {/* Privacy Note */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(400)}
          style={styles.privacyNote}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={palette.textMuted} />
          <Text style={styles.privacyNoteText}>
            Your notification preferences are stored locally on your device. We respect your privacy and will only send notifications according to your settings.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Save Button - Fixed at bottom when changes exist */}
      {hasChanges && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.saveButtonContainer, { paddingBottom: insets.bottom + 16 }]}
        >
          <PillButton
            label="Save Changes"
            icon="check"
            variant="ink"
            onPress={savePreferences}
            loading={isSaving}
            disabled={isSaving}
          />
        </Animated.View>
      )}

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        variant={snackbar.variant}
        onDismiss={hideSnackbar}
        bottom={insets.bottom + (hasChanges ? 100 : 24)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  resetText: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.textMuted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  intro: {
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  introTitle: {
    ...fonts.semibold,
    fontSize: 28,
    letterSpacing: -0.6,
    color: palette.text,
  },
  introText: {
    ...fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    color: palette.textMuted,
    marginTop: 6,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardTitle: {
    ...fonts.semibold,
    fontSize: 17,
    color: palette.text,
    paddingTop: 18,
    paddingBottom: 4,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Global Section
  globalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  globalItemText: {
    flex: 1,
    gap: 2,
  },
  globalItemTitle: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  globalItemDescription: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  // Category Section
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryHeaderText: {
    flex: 1,
    gap: 2,
  },
  categoryTitle: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  categoryDescription: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  // Toggle Item
  toggleItem: {
    paddingVertical: 14,
  },
  toggleItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  toggleItemText: {
    flex: 1,
    gap: 2,
  },
  toggleItemTitle: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  toggleItemDescription: {
    ...fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
  },
  toggleItemControls: {
    flexDirection: 'row',
    marginLeft: 52,
    gap: 18,
  },
  toggleControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceDim,
  },
  toggleLabel: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  switch: {
    transform: Platform.OS === 'ios' ? [{ scaleX: 0.8 }, { scaleY: 0.8 }] : [],
  },
  // Privacy Note
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.bgSoft,
    marginTop: 4,
  },
  privacyNoteText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: palette.textMuted,
  },
  // Save Button Container
  saveButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },
  // Snackbar
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  snackbarText: {
    ...fonts.medium,
    flex: 1,
    color: palette.textInverse,
    fontSize: 14,
  },
});
