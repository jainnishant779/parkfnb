import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  Animated,
  Platform,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
  Keyboard,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// CONSTANTS & CONFIG
// ============================================================================

const STORAGE_KEYS = {
  TICKETS: '@ownerapp/support_tickets_v1',
  FAQ_FEEDBACK: '@ownerapp/support_faq_feedback_v1',
};

const SUPPORT_EMAIL = 'support@parkingowner.com';
const SUPPORT_PHONE = '+91 1800-123-4567';

const CATEGORIES = [
  { key: 'account', label: 'Account & KYC', icon: 'person-outline' },
  { key: 'listings', label: 'Listing Help', icon: 'location-outline' },
  { key: 'bookings', label: 'Bookings Issues', icon: 'calendar-outline' },
  { key: 'payouts', label: 'Payment & Payouts', icon: 'wallet-outline' },
  { key: 'disputes', label: 'Disputes', icon: 'alert-circle-outline' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

const PRIORITY_OPTIONS = [
  { key: 'low', label: 'Low', color: '#10B981' },
  { key: 'medium', label: 'Medium', color: '#F59E0B' },
  { key: 'high', label: 'High', color: '#EF4444' },
] as const;

type PriorityKey = typeof PRIORITY_OPTIONS[number]['key'];

// ============================================================================
// TYPES
// ============================================================================

interface FAQ {
  id: string;
  category: CategoryKey;
  question: string;
  answer: string;
}

interface FAQFeedback {
  yesCount: number;
  noCount: number;
  userVote?: 'yes' | 'no';
  feedback?: string;
}

interface FAQFeedbackMap {
  [faqId: string]: FAQFeedback;
}

interface TimelineEntry {
  id: string;
  label: string;
  createdAt: string;
}

interface TicketComment {
  id: string;
  message: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  category: CategoryKey;
  title: string;
  description: string;
  priority: PriorityKey;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  comments: TicketComment[];
  timeline: TimelineEntry[];
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_FAQS: FAQ[] = [
  // Account & KYC
  {
    id: 'faq_1',
    category: 'account',
    question: 'How do I update my profile information?',
    answer: 'Go to More > Profile Settings. You can update your name, phone number, and profile picture. Some changes may require re-verification.',
  },
  {
    id: 'faq_2',
    category: 'account',
    question: 'What documents are required for KYC verification?',
    answer: 'You need to submit: 1) Government ID (Aadhaar/PAN/Passport), 2) Address proof, 3) Bank account details, 4) Property ownership documents for your parking spaces.',
  },
  {
    id: 'faq_3',
    category: 'account',
    question: 'How long does KYC verification take?',
    answer: 'KYC verification typically takes 24-48 business hours. You will receive a notification once your documents are verified or if additional information is needed.',
  },
  // Listings
  {
    id: 'faq_4',
    category: 'listings',
    question: 'How do I add a new parking space?',
    answer: 'Tap the + button on the Listings tab. Fill in the location details, upload photos, set pricing, and define availability. Your listing will go live after a quick review.',
  },
  {
    id: 'faq_5',
    category: 'listings',
    question: 'Can I set different prices for weekdays and weekends?',
    answer: 'Yes! In your listing settings, go to Pricing > Advanced. You can set separate rates for weekdays, weekends, and even specific holidays.',
  },
  {
    id: 'faq_6',
    category: 'listings',
    question: 'How do I temporarily disable my listing?',
    answer: 'Go to Listings > Select your listing > Settings > Toggle "Active" off. Your listing will be hidden from search but all settings are preserved.',
  },
  // Bookings
  {
    id: 'faq_7',
    category: 'bookings',
    question: 'How do I handle a booking cancellation?',
    answer: 'If a guest cancels, you will be notified immediately. Refunds are processed according to your cancellation policy. Go to Bookings > Cancelled to view details.',
  },
  {
    id: 'faq_8',
    category: 'bookings',
    question: 'What if a guest overstays their booking?',
    answer: 'You can extend the booking or report the overstay. Go to the active booking > More Options > Report Overstay. Additional charges will be applied automatically.',
  },
  {
    id: 'faq_9',
    category: 'bookings',
    question: 'Can I block specific dates for personal use?',
    answer: 'Yes! Go to Availability Calendar and tap on any date to block it. Blocked dates won\'t accept new bookings but existing ones remain unaffected.',
  },
  // Payouts
  {
    id: 'faq_10',
    category: 'payouts',
    question: 'When do I receive my earnings?',
    answer: 'Earnings are transferred to your bank account based on your payout schedule (weekly/bi-weekly/monthly). The default is weekly every Monday.',
  },
  {
    id: 'faq_11',
    category: 'payouts',
    question: 'Why is my payout on hold?',
    answer: 'Payouts may be held due to: 1) Pending KYC verification, 2) Bank account verification, 3) Disputes under review, 4) Minimum threshold not met.',
  },
  {
    id: 'faq_12',
    category: 'payouts',
    question: 'How do I change my bank account for payouts?',
    answer: 'Go to Earnings > Payouts > Payout Account > Edit. Enter your new bank details. Verification may take 1-2 business days.',
  },
  // Disputes
  {
    id: 'faq_13',
    category: 'disputes',
    question: 'How do I report damage to my property?',
    answer: 'Go to the booking > Report Issue > Property Damage. Upload photos, describe the damage, and submit. Our team will review and assist with the claim.',
  },
  {
    id: 'faq_14',
    category: 'disputes',
    question: 'What happens if a guest disputes a charge?',
    answer: 'You will be notified of the dispute. Provide any evidence (photos, communication) within 7 days. Our team will review and make a fair decision.',
  },
  {
    id: 'faq_15',
    category: 'disputes',
    question: 'How long do dispute resolutions take?',
    answer: 'Most disputes are resolved within 5-7 business days. Complex cases involving property damage may take up to 14 days.',
  },
];

const INITIAL_MOCK_TICKETS: Ticket[] = [
  {
    id: 'ticket_mock_1',
    category: 'payouts',
    title: 'Payout not received for last week',
    description: 'My payout for the week of Dec 1-7 has not been credited to my account. It usually arrives by Monday but it\'s Thursday now.',
    priority: 'high',
    status: 'open',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    comments: [
      {
        id: 'comment_1',
        message: 'We are looking into this. Your payout is being processed.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    timeline: [
      {
        id: 'tl_1',
        label: 'Ticket created',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'tl_2',
        label: 'Support responded',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 'ticket_mock_2',
    category: 'listings',
    title: 'Unable to upload photos',
    description: 'When I try to add photos to my listing, the app shows an error. I have tried multiple times.',
    priority: 'medium',
    status: 'closed',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    comments: [],
    timeline: [
      {
        id: 'tl_3',
        label: 'Ticket created',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'tl_4',
        label: 'Issue resolved',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'tl_5',
        label: 'Ticket closed',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

// ============================================================================
// UTILITIES
// ============================================================================

const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins} mins ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Safe AsyncStorage wrappers
const safeGetItem = async <T,>(key: string, defaultValue: T): Promise<T> => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const safeSetItem = async (key: string, value: any): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// THEME
// ============================================================================

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

const colors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#0D7377',
  primaryLight: '#E8F5F4',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
};

const typography = {
  title: { fontSize: 26, fontWeight: '700' as const },
  sectionHeader: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  smallMedium: { fontSize: 13, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '500' as const },
};

// ============================================================================
// TOAST COMPONENT
// ============================================================================

interface ToastProps {
  toast: ToastState;
  onHide: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onHide }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast.visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toast.visible, translateY, opacity, onHide]);

  if (!toast.visible) return null;

  const bgColor = toast.type === 'success' ? colors.successLight
    : toast.type === 'error' ? colors.dangerLight
    : colors.primaryLight;
  const textColor = toast.type === 'success' ? colors.success
    : toast.type === 'error' ? colors.danger
    : colors.primary;
  const icon = toast.type === 'success' ? 'checkmark-circle'
    : toast.type === 'error' ? 'close-circle'
    : 'information-circle';

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, transform: [{ translateY }], opacity },
      ]}
    >
      <Ionicons name={icon} size={20} color={textColor} />
      <Text style={[styles.toastText, { color: textColor }]}>{toast.message}</Text>
    </Animated.View>
  );
};

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyStateIconContainer}>
      <Ionicons name={icon as any} size={48} color={colors.textMuted} />
    </View>
    <Text style={styles.emptyStateTitle}>{title}</Text>
    {subtitle && <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>}
    {actionLabel && onAction && (
      <Pressable onPress={onAction} style={styles.emptyStateButton}>
        <Text style={styles.emptyStateButtonText}>{actionLabel}</Text>
      </Pressable>
    )}
  </View>
);

// ============================================================================
// SEARCH BAR COMPONENT
// ============================================================================

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Search...',
}) => (
  <View style={styles.searchBar}>
    <Ionicons name="search-outline" size={20} color={colors.textMuted} />
    <TextInput
      style={styles.searchInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      returnKeyType="search"
      accessibilityLabel="Search help articles"
    />
    {value.length > 0 && (
      <Pressable
        onPress={() => onChangeText('')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Clear search"
      >
        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
      </Pressable>
    )}
  </View>
);

// ============================================================================
// QUICK ACTION CHIP COMPONENT
// ============================================================================

interface QuickActionChipProps {
  icon: string;
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const QuickActionChip: React.FC<QuickActionChipProps> = ({
  icon,
  label,
  isSelected,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.quickActionChip,
      isSelected && styles.quickActionChipSelected,
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
    accessibilityLabel={label}
  >
    <Ionicons
      name={icon as any}
      size={18}
      color={isSelected ? colors.primary : colors.textSecondary}
    />
    <Text
      style={[
        styles.quickActionChipText,
        isSelected && styles.quickActionChipTextSelected,
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  </Pressable>
);

// ============================================================================
// ACCORDION ITEM COMPONENT
// ============================================================================

interface AccordionItemProps {
  faq: FAQ;
  isExpanded: boolean;
  onToggle: () => void;
  feedback?: FAQFeedback;
  onVote: (vote: 'yes' | 'no') => void;
  onSubmitFeedback: (text: string) => void;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  faq,
  isExpanded,
  onToggle,
  feedback,
  onVote,
  onSubmitFeedback,
}) => {
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const handleNoVote = () => {
    onVote('no');
    setShowFeedbackInput(true);
  };

  const handleSubmitFeedback = () => {
    if (feedbackText.trim()) {
      onSubmitFeedback(feedbackText.trim());
      setFeedbackText('');
      setShowFeedbackInput(false);
    }
  };

  return (
    <View style={styles.accordionItem}>
      <Pressable
        onPress={onToggle}
        style={styles.accordionHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.accordionQuestion}>{faq.question}</Text>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Animated.View>
      </Pressable>

      {isExpanded && (
        <View style={styles.accordionContent}>
          <Text style={styles.accordionAnswer}>{faq.answer}</Text>

          <View style={styles.helpfulSection}>
            <Text style={styles.helpfulText}>Was this helpful?</Text>
            <View style={styles.helpfulButtons}>
              <Pressable
                onPress={() => onVote('yes')}
                style={[
                  styles.helpfulButton,
                  feedback?.userVote === 'yes' && styles.helpfulButtonActive,
                ]}
                accessibilityLabel="Yes, this was helpful"
              >
                <Ionicons
                  name="thumbs-up-outline"
                  size={16}
                  color={feedback?.userVote === 'yes' ? colors.success : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.helpfulButtonText,
                    feedback?.userVote === 'yes' && { color: colors.success },
                  ]}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                onPress={handleNoVote}
                style={[
                  styles.helpfulButton,
                  feedback?.userVote === 'no' && styles.helpfulButtonActiveNo,
                ]}
                accessibilityLabel="No, this was not helpful"
              >
                <Ionicons
                  name="thumbs-down-outline"
                  size={16}
                  color={feedback?.userVote === 'no' ? colors.danger : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.helpfulButtonText,
                    feedback?.userVote === 'no' && { color: colors.danger },
                  ]}
                >
                  No
                </Text>
              </Pressable>
            </View>
          </View>

          {showFeedbackInput && (
            <View style={styles.feedbackInputContainer}>
              <Text style={styles.feedbackPrompt}>Tell us what was missing</Text>
              <TextInput
                style={styles.feedbackInput}
                value={feedbackText}
                onChangeText={setFeedbackText}
                placeholder="Your feedback..."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={200}
              />
              <Pressable
                onPress={handleSubmitFeedback}
                style={[
                  styles.feedbackSubmitButton,
                  !feedbackText.trim() && styles.feedbackSubmitButtonDisabled,
                ]}
                disabled={!feedbackText.trim()}
              >
                <Text style={styles.feedbackSubmitButtonText}>Save</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// SEGMENTED CONTROL COMPONENT
// ============================================================================

interface SegmentedControlProps {
  options: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  selectedKey,
  onSelect,
}) => (
  <View style={styles.segmentedControl}>
    {options.map((option) => (
      <Pressable
        key={option.key}
        onPress={() => onSelect(option.key)}
        style={[
          styles.segmentedOption,
          selectedKey === option.key && styles.segmentedOptionSelected,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: selectedKey === option.key }}
      >
        <Text
          style={[
            styles.segmentedOptionText,
            selectedKey === option.key && styles.segmentedOptionTextSelected,
          ]}
        >
          {option.label}
        </Text>
      </Pressable>
    ))}
  </View>
);

// ============================================================================
// TICKET CARD COMPONENT
// ============================================================================

interface TicketCardProps {
  ticket: Ticket;
  onPress: () => void;
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket, onPress }) => {
  const category = CATEGORIES.find((c) => c.key === ticket.category);
  const priority = PRIORITY_OPTIONS.find((p) => p.key === ticket.priority);

  return (
    <Pressable
      onPress={onPress}
      style={styles.ticketCard}
      accessibilityRole="button"
      accessibilityLabel={`Ticket: ${ticket.title}`}
    >
      <View style={styles.ticketCardHeader}>
        <View style={styles.ticketCardTitleRow}>
          <Text style={styles.ticketCardTitle} numberOfLines={1}>
            {ticket.title}
          </Text>
          <View
            style={[
              styles.ticketStatusPill,
              ticket.status === 'open'
                ? { backgroundColor: colors.primaryLight }
                : { backgroundColor: colors.borderLight },
            ]}
          >
            <Text
              style={[
                styles.ticketStatusText,
                ticket.status === 'open'
                  ? { color: colors.primary }
                  : { color: colors.textSecondary },
              ]}
            >
              {ticket.status === 'open' ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>
        <View style={styles.ticketCardMeta}>
          <View style={styles.ticketCardCategory}>
            <Ionicons
              name={category?.icon as any || 'help-circle-outline'}
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.ticketCardCategoryText}>{category?.label}</Text>
          </View>
          <View style={styles.ticketCardPriority}>
            <View
              style={[
                styles.priorityDot,
                { backgroundColor: priority?.color || colors.textMuted },
              ]}
            />
            <Text style={styles.ticketCardPriorityText}>{priority?.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.ticketCardFooter}>
        <Text style={styles.ticketCardDate}>
          Created {formatDate(ticket.createdAt)}
        </Text>
        {ticket.comments.length > 0 && (
          <View style={styles.ticketCardComments}>
            <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} />
            <Text style={styles.ticketCardCommentsText}>
              {ticket.comments.length}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

// ============================================================================
// BOTTOM SHEET MODAL COMPONENT
// ============================================================================

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeight?: string | number;
}

const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  title,
  children,
  maxHeight = '85%',
}) =>
  visible ? (

    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.modalContent, { maxHeight }]}
      >
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable
            onPress={onClose}
            style={styles.modalCloseButton}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.modalBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  
  ) : null;

// ============================================================================
// CONTACT CARD COMPONENT
// ============================================================================

interface ContactCardProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  copyValue?: string;
  onCopy?: () => void;
}

const ContactCard: React.FC<ContactCardProps> = ({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  copyValue,
  onCopy,
}) => (
  <View style={styles.contactCard}>
    <View style={styles.contactCardIcon}>
      <Ionicons name={icon as any} size={24} color={colors.primary} />
    </View>
    <View style={styles.contactCardContent}>
      <Text style={styles.contactCardTitle}>{title}</Text>
      <Text style={styles.contactCardSubtitle}>{subtitle}</Text>
    </View>
    <View style={styles.contactCardActions}>
      {copyValue && onCopy && (
        <Pressable
          onPress={onCopy}
          style={styles.contactCardCopyButton}
          accessibilityLabel={`Copy ${title}`}
        >
          <Ionicons name="copy-outline" size={18} color={colors.primary} />
        </Pressable>
      )}
      <Pressable
        onPress={onAction}
        style={styles.contactCardActionButton}
        accessibilityLabel={actionLabel}
      >
        <Text style={styles.contactCardActionText}>{actionLabel}</Text>
      </Pressable>
    </View>
  </View>
);

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

export default function SupportHelpCenterScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>('account');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [faqFeedback, setFaqFeedback] = useState<FAQFeedbackMap>({});
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketTab, setTicketTab] = useState<'open' | 'closed'>('open');
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [showTicketDetails, setShowTicketDetails] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCopiedModal, setShowCopiedModal] = useState(false);
  const [copiedText, setCopiedText] = useState('');
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const [storageError, setStorageError] = useState(false);

  // Create ticket form state
  const [newTicketCategory, setNewTicketCategory] = useState<CategoryKey | null>(null);
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [newTicketDescription, setNewTicketDescription] = useState('');
  const [newTicketPriority, setNewTicketPriority] = useState<PriorityKey>('medium');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // New comment state
  const [newComment, setNewComment] = useState('');

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      const [savedTickets, savedFeedback] = await Promise.all([
        safeGetItem<Ticket[]>(STORAGE_KEYS.TICKETS, []),
        safeGetItem<FAQFeedbackMap>(STORAGE_KEYS.FAQ_FEEDBACK, {}),
      ]);

      // Merge mock tickets with saved tickets (saved takes precedence)
      const ticketMap = new Map<string, Ticket>();
      INITIAL_MOCK_TICKETS.forEach((t) => ticketMap.set(t.id, t));
      savedTickets.forEach((t) => ticketMap.set(t.id, t));
      setTickets(Array.from(ticketMap.values()));

      setFaqFeedback(savedFeedback);
    };

    loadData();
  }, []);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    let result = [...MOCK_FAQS];

    if (selectedCategory) {
      result = result.filter((faq) => faq.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (faq) =>
          faq.question.toLowerCase().includes(query) ||
          faq.answer.toLowerCase().includes(query)
      );
    }

    return result;
  }, [searchQuery, selectedCategory]);

  // Grouped FAQs by category
  const groupedFaqs = useMemo(() => {
    const groups: Record<string, FAQ[]> = {};
    filteredFaqs.forEach((faq) => {
      if (!groups[faq.category]) {
        groups[faq.category] = [];
      }
      groups[faq.category].push(faq);
    });
    return groups;
  }, [filteredFaqs]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets
      .filter((t) => t.status === ticketTab)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tickets, ticketTab]);

  // Handlers
  const handleCategorySelect = useCallback((category: CategoryKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCategory((prev) => (prev === category ? null : category));
  }, []);

  const handleFaqToggle = useCallback((faqId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaqId((prev) => (prev === faqId ? null : faqId));
  }, []);

  const handleFaqVote = useCallback(
    async (faqId: string, vote: 'yes' | 'no') => {
      const updated = {
        ...faqFeedback,
        [faqId]: {
          ...faqFeedback[faqId],
          yesCount: (faqFeedback[faqId]?.yesCount || 0) + (vote === 'yes' ? 1 : 0),
          noCount: (faqFeedback[faqId]?.noCount || 0) + (vote === 'no' ? 1 : 0),
          userVote: vote,
        },
      };
      setFaqFeedback(updated);
      const success = await safeSetItem(STORAGE_KEYS.FAQ_FEEDBACK, updated);
      if (!success) setStorageError(true);
    },
    [faqFeedback]
  );

  const handleFaqFeedbackSubmit = useCallback(
    async (faqId: string, feedback: string) => {
      const updated = {
        ...faqFeedback,
        [faqId]: {
          ...faqFeedback[faqId],
          feedback,
        },
      };
      setFaqFeedback(updated);
      const success = await safeSetItem(STORAGE_KEYS.FAQ_FEEDBACK, updated);
      if (!success) setStorageError(true);
      setToast({ visible: true, message: 'Feedback saved. Thank you!', type: 'success' });
    },
    [faqFeedback]
  );

  const handleCollapseAll = useCallback(() => {
    setExpandedFaqId(null);
  }, []);

  const handleTicketPress = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowTicketDetails(true);
  }, []);

  const validateTicketForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!newTicketCategory) errors.category = 'Please select a category';
    if (newTicketTitle.trim().length < 5) errors.title = 'Title must be at least 5 characters';
    if (newTicketDescription.trim().length < 15) errors.description = 'Description must be at least 15 characters';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateTicket = useCallback(async () => {
    if (!validateTicketForm()) return;

    const newTicket: Ticket = {
      id: `ticket_${generateId()}`,
      category: newTicketCategory!,
      title: newTicketTitle.trim(),
      description: newTicketDescription.trim(),
      priority: newTicketPriority,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [],
      timeline: [
        {
          id: `tl_${generateId()}`,
          label: 'Ticket created',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const updatedTickets = [...tickets, newTicket];
    setTickets(updatedTickets);
    const success = await safeSetItem(STORAGE_KEYS.TICKETS, updatedTickets);
    if (!success) setStorageError(true);

    // Reset form
    setNewTicketCategory(null);
    setNewTicketTitle('');
    setNewTicketDescription('');
    setNewTicketPriority('medium');
    setFormErrors({});
    setShowCreateTicket(false);
    setTicketTab('open');

    setToast({ visible: true, message: 'Ticket created successfully!', type: 'success' });
  }, [newTicketCategory, newTicketTitle, newTicketDescription, newTicketPriority, tickets]);

  const handleAddComment = useCallback(async () => {
    if (!selectedTicket || !newComment.trim()) return;

    const comment: TicketComment = {
      id: `comment_${generateId()}`,
      message: newComment.trim(),
      createdAt: new Date().toISOString(),
    };

    const timelineEntry: TimelineEntry = {
      id: `tl_${generateId()}`,
      label: 'Comment added',
      createdAt: new Date().toISOString(),
    };

    const updatedTicket: Ticket = {
      ...selectedTicket,
      comments: [...selectedTicket.comments, comment],
      timeline: [...selectedTicket.timeline, timelineEntry],
      updatedAt: new Date().toISOString(),
    };

    const updatedTickets = tickets.map((t) =>
      t.id === selectedTicket.id ? updatedTicket : t
    );

    setTickets(updatedTickets);
    setSelectedTicket(updatedTicket);
    setNewComment('');
    const success = await safeSetItem(STORAGE_KEYS.TICKETS, updatedTickets);
    if (!success) setStorageError(true);
  }, [selectedTicket, newComment, tickets]);

  const handleCloseTicket = useCallback(async () => {
    if (!selectedTicket) return;

    const timelineEntry: TimelineEntry = {
      id: `tl_${generateId()}`,
      label: 'Ticket closed',
      createdAt: new Date().toISOString(),
    };

    const updatedTicket: Ticket = {
      ...selectedTicket,
      status: 'closed',
      timeline: [...selectedTicket.timeline, timelineEntry],
      updatedAt: new Date().toISOString(),
    };

    const updatedTickets = tickets.map((t) =>
      t.id === selectedTicket.id ? updatedTicket : t
    );

    setTickets(updatedTickets);
    setSelectedTicket(updatedTicket);
    const success = await safeSetItem(STORAGE_KEYS.TICKETS, updatedTickets);
    if (!success) setStorageError(true);
    setToast({ visible: true, message: 'Ticket closed', type: 'info' });
  }, [selectedTicket, tickets]);

  const handleCopyText = useCallback((text: string) => {
    setCopiedText(text);
    setShowCopiedModal(true);
  }, []);

  const handleEmailPress = useCallback(() => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
      handleCopyText(SUPPORT_EMAIL);
    });
  }, [handleCopyText]);

  const handlePhonePress = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE.replace(/[^0-9+]/g, '')}`).catch(() => {
      handleCopyText(SUPPORT_PHONE);
    });
  }, [handleCopyText]);

  const openCreateTicketWithCategory = useCallback((category: CategoryKey) => {
    setNewTicketCategory(category);
    setShowCreateTicket(true);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Toast */}
      <Toast toast={toast} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />

      {/* Storage Error Banner */}
      {storageError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.errorBannerText}>
            Couldn't save locally. Changes may not persist.
          </Text>
          <Pressable onPress={() => setStorageError(false)}>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <View style={styles.backButtonCircle}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </View>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Support & Help</Text>
          <Text style={styles.headerSubtitle}>Find answers or contact support</Text>
        </View>
        <Pressable
          onPress={() => {}}
          style={styles.settingsButton}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar */}
        <View style={styles.section}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search help articles"
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsContainer}
          >
            {CATEGORIES.map((category) => (
              <QuickActionChip
                key={category.key}
                icon={category.icon}
                label={category.label}
                isSelected={selectedCategory === category.key}
                onPress={() => handleCategorySelect(category.key)}
              />
            ))}
          </ScrollView>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              FAQs {selectedCategory && `• ${CATEGORIES.find((c) => c.key === selectedCategory)?.label}`}
            </Text>
            {expandedFaqId && (
              <Pressable onPress={handleCollapseAll}>
                <Text style={styles.collapseAllText}>Collapse all</Text>
              </Pressable>
            )}
          </View>

          {filteredFaqs.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No matches found"
              subtitle="Try different keywords or clear the search"
              actionLabel="Clear search"
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            />
          ) : (
            <View style={styles.faqContainer}>
              {Object.entries(groupedFaqs).map(([categoryKey, faqs]) => (
                <View key={categoryKey} style={styles.faqCategoryGroup}>
                  {!selectedCategory && (
                    <Text style={styles.faqCategoryTitle}>
                      {CATEGORIES.find((c) => c.key === categoryKey)?.label}
                    </Text>
                  )}
                  {faqs.map((faq) => (
                    <AccordionItem
                      key={faq.id}
                      faq={faq}
                      isExpanded={expandedFaqId === faq.id}
                      onToggle={() => handleFaqToggle(faq.id)}
                      feedback={faqFeedback[faq.id]}
                      onVote={(vote) => handleFaqVote(faq.id, vote)}
                      onSubmitFeedback={(text) => handleFaqFeedbackSubmit(faq.id, text)}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* My Tickets Section */}
        <View style={styles.section}>
          <View style={styles.ticketsSectionHeader}>
            <Text style={styles.sectionTitle}>My Tickets</Text>
            <Pressable
              onPress={() => setShowCreateTicket(true)}
              style={styles.raiseTicketButton}
              accessibilityLabel="Raise a Ticket"
            >
              <Ionicons name="add-circle" size={18} color={colors.surface} />
              <Text style={styles.raiseTicketButtonText}>Raise Ticket</Text>
            </Pressable>
          </View>
          <SegmentedControl
            options={[
              { key: 'open', label: `Open (${tickets.filter((t) => t.status === 'open').length})` },
              { key: 'closed', label: `Closed (${tickets.filter((t) => t.status === 'closed').length})` },
            ]}
            selectedKey={ticketTab}
            onSelect={(key) => setTicketTab(key as 'open' | 'closed')}
          />

          {filteredTickets.length === 0 ? (
            <EmptyState
              icon="ticket-outline"
              title={ticketTab === 'open' ? 'No open tickets' : 'No closed tickets'}
              subtitle={ticketTab === 'open' ? 'Create a ticket if you need help' : 'Your resolved tickets will appear here'}
              actionLabel={ticketTab === 'open' ? 'Create your first ticket' : undefined}
              onAction={ticketTab === 'open' ? () => setShowCreateTicket(true) : undefined}
            />
          ) : (
            <View style={styles.ticketsList}>
              {filteredTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onPress={() => handleTicketPress(ticket)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Contact Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          <View style={styles.contactCardsContainer}>
            <ContactCard
              icon="chatbubbles-outline"
              title="Chat with Support"
              subtitle="Get instant help from our team"
              actionLabel="Start Chat"
              onAction={() => {}}
            />
            <ContactCard
              icon="mail-outline"
              title="Email Support"
              subtitle={SUPPORT_EMAIL}
              actionLabel="Send Email"
              onAction={handleEmailPress}
              copyValue={SUPPORT_EMAIL}
              onCopy={() => handleCopyText(SUPPORT_EMAIL)}
            />
            <ContactCard
              icon="call-outline"
              title="Call Support"
              subtitle={SUPPORT_PHONE}
              actionLabel="Call Now"
              onAction={handlePhonePress}
              copyValue={SUPPORT_PHONE}
              onCopy={() => handleCopyText(SUPPORT_PHONE)}
            />
          </View>
        </View>

      </ScrollView>

      {/* Create Ticket Modal */}
      <BottomSheetModal
        visible={showCreateTicket}
        onClose={() => {
          setShowCreateTicket(false);
          setFormErrors({});
        }}
        title="Create Support Ticket"
        maxHeight="90%"
      >
        <View style={styles.createTicketForm}>
          {/* Category */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Category *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPicker}
            >
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  onPress={() => setNewTicketCategory(cat.key)}
                  style={[
                    styles.categoryOption,
                    newTicketCategory === cat.key && styles.categoryOptionSelected,
                  ]}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={18}
                    color={newTicketCategory === cat.key ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categoryOptionText,
                      newTicketCategory === cat.key && styles.categoryOptionTextSelected,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {formErrors.category && (
              <Text style={styles.formError}>{formErrors.category}</Text>
            )}
          </View>

          {/* Title */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Title *</Text>
            <TextInput
              style={[styles.formInput, formErrors.title && styles.formInputError]}
              value={newTicketTitle}
              onChangeText={setNewTicketTitle}
              placeholder="Brief summary of your issue"
              placeholderTextColor={colors.textMuted}
              maxLength={100}
            />
            {formErrors.title && (
              <Text style={styles.formError}>{formErrors.title}</Text>
            )}
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Description *</Text>
            <TextInput
              style={[styles.formInputMultiline, formErrors.description && styles.formInputError]}
              value={newTicketDescription}
              onChangeText={setNewTicketDescription}
              placeholder="Please provide as much detail as possible..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.formCharCount}>
              {newTicketDescription.length}/500
            </Text>
            {formErrors.description && (
              <Text style={styles.formError}>{formErrors.description}</Text>
            )}
          </View>

          {/* Priority */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Priority</Text>
            <View style={styles.priorityPicker}>
              {PRIORITY_OPTIONS.map((priority) => (
                <Pressable
                  key={priority.key}
                  onPress={() => setNewTicketPriority(priority.key)}
                  style={[
                    styles.priorityOption,
                    newTicketPriority === priority.key && {
                      backgroundColor: `${priority.color}15`,
                      borderColor: priority.color,
                    },
                  ]}
                >
                  <View
                    style={[styles.priorityDotLarge, { backgroundColor: priority.color }]}
                  />
                  <Text
                    style={[
                      styles.priorityOptionText,
                      newTicketPriority === priority.key && { color: priority.color },
                    ]}
                  >
                    {priority.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Attachments Placeholder */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Attachments</Text>
            <View style={styles.attachmentPlaceholder}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.textMuted} />
              <Text style={styles.attachmentPlaceholderText}>
                Coming soon - File attachments will be available in a future update
              </Text>
            </View>
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleCreateTicket}
            style={styles.submitButton}
            accessibilityLabel="Submit ticket"
          >
            <Text style={styles.submitButtonText}>Submit Ticket</Text>
          </Pressable>
        </View>
      </BottomSheetModal>

      {/* Ticket Details Modal */}
      <BottomSheetModal
        visible={showTicketDetails}
        onClose={() => {
          setShowTicketDetails(false);
          setSelectedTicket(null);
          setNewComment('');
        }}
        title={selectedTicket ? `Ticket #${selectedTicket.id.slice(-6).toUpperCase()}` : 'Ticket Details'}
        maxHeight="90%"
      >
        {selectedTicket && (
          <View style={styles.ticketDetailsContent}>
            {/* Ticket Info */}
            <View style={styles.ticketDetailsHeader}>
              <Text style={styles.ticketDetailsTitle}>{selectedTicket.title}</Text>
              <View
                style={[
                  styles.ticketStatusPillLarge,
                  selectedTicket.status === 'open'
                    ? { backgroundColor: colors.primaryLight }
                    : { backgroundColor: colors.borderLight },
                ]}
              >
                <Text
                  style={[
                    styles.ticketStatusTextLarge,
                    selectedTicket.status === 'open'
                      ? { color: colors.primary }
                      : { color: colors.textSecondary },
                  ]}
                >
                  {selectedTicket.status === 'open' ? 'Open' : 'Closed'}
                </Text>
              </View>
            </View>

            <View style={styles.ticketDetailsMeta}>
              <View style={styles.ticketDetailsMetaItem}>
                <Ionicons name="folder-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.ticketDetailsMetaText}>
                  {CATEGORIES.find((c) => c.key === selectedTicket.category)?.label}
                </Text>
              </View>
              <View style={styles.ticketDetailsMetaItem}>
                <View
                  style={[
                    styles.priorityDot,
                    {
                      backgroundColor:
                        PRIORITY_OPTIONS.find((p) => p.key === selectedTicket.priority)?.color,
                    },
                  ]}
                />
                <Text style={styles.ticketDetailsMetaText}>
                  {PRIORITY_OPTIONS.find((p) => p.key === selectedTicket.priority)?.label} Priority
                </Text>
              </View>
            </View>

            <View style={styles.ticketDetailsDescription}>
              <Text style={styles.ticketDetailsDescriptionText}>
                {selectedTicket.description}
              </Text>
            </View>

            {/* Timeline */}
            <View style={styles.ticketTimeline}>
              <Text style={styles.ticketTimelineTitle}>Timeline</Text>
              {selectedTicket.timeline.map((entry, index) => (
                <View key={entry.id} style={styles.ticketTimelineItem}>
                  <View style={styles.ticketTimelineDot} />
                  {index < selectedTicket.timeline.length - 1 && (
                    <View style={styles.ticketTimelineLine} />
                  )}
                  <View style={styles.ticketTimelineContent}>
                    <Text style={styles.ticketTimelineLabel}>{entry.label}</Text>
                    <Text style={styles.ticketTimelineDate}>
                      {formatDateTime(entry.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Comments */}
            {selectedTicket.comments.length > 0 && (
              <View style={styles.ticketComments}>
                <Text style={styles.ticketCommentsTitle}>Comments</Text>
                {selectedTicket.comments.map((comment) => (
                  <View key={comment.id} style={styles.ticketCommentItem}>
                    <Text style={styles.ticketCommentText}>{comment.message}</Text>
                    <Text style={styles.ticketCommentDate}>
                      {formatDateTime(comment.createdAt)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Add Comment (only for open tickets) */}
            {selectedTicket.status === 'open' && (
              <View style={styles.addCommentSection}>
                <TextInput
                  style={styles.addCommentInput}
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Add a comment..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={300}
                />
                <Pressable
                  onPress={handleAddComment}
                  style={[
                    styles.addCommentButton,
                    !newComment.trim() && styles.addCommentButtonDisabled,
                  ]}
                  disabled={!newComment.trim()}
                >
                  <Ionicons name="send" size={18} color={colors.surface} />
                </Pressable>
              </View>
            )}

            {/* Close Ticket Button */}
            {selectedTicket.status === 'open' && (
              <Pressable
                onPress={handleCloseTicket}
                style={styles.closeTicketButton}
                accessibilityLabel="Close ticket"
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.closeTicketButtonText}>Close Ticket</Text>
              </Pressable>
            )}
          </View>
        )}
      </BottomSheetModal>

      {/* Copy Text Modal */}
      {showCopiedModal ? (

        <View style={styles.copyModalOverlay}>
          <View style={styles.copyModalContent}>
            <Text style={styles.copyModalTitle}>Copy this text</Text>
            <View style={styles.copyModalTextContainer}>
              <Text style={styles.copyModalText} selectable>
                {copiedText}
              </Text>
            </View>
            <Text style={styles.copyModalHint}>
              Long press and select "Copy" to copy the text
            </Text>
            <Pressable
              onPress={() => setShowCopiedModal(false)}
              style={styles.copyModalButton}
            >
              <Text style={styles.copyModalButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      
      ) : null}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: 12,
    gap: spacing.md,
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  toastText: {
    flex: 1,
    ...typography.bodyMedium,
  },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    ...typography.small,
    color: colors.warning,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: {
    marginRight: spacing.md,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...typography.title,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
  },

  // Section
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.sectionHeader,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  collapseAllText: {
    ...typography.smallMedium,
    color: colors.primary,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },

  // Quick Actions
  quickActionsContainer: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  quickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  quickActionChipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  quickActionChipText: {
    ...typography.smallMedium,
    color: colors.textSecondary,
  },
  quickActionChipTextSelected: {
    color: colors.primary,
  },
  // Tickets Section Header
  ticketsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  raiseTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    gap: spacing.xs,
  },
  raiseTicketButtonText: {
    ...typography.smallMedium,
    color: colors.surface,
  },

  // FAQ
  faqContainer: {
    gap: spacing.lg,
  },
  faqCategoryGroup: {
    gap: spacing.sm,
  },
  faqCategoryTitle: {
    ...typography.smallMedium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },

  // Accordion
  accordionItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  accordionQuestion: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.text,
  },
  accordionContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  accordionAnswer: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    paddingTop: spacing.md,
  },
  helpfulSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  helpfulText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  helpfulButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  helpfulButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.borderLight,
    gap: spacing.xs,
  },
  helpfulButtonActive: {
    backgroundColor: colors.successLight,
  },
  helpfulButtonActiveNo: {
    backgroundColor: colors.dangerLight,
  },
  helpfulButtonText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  feedbackInputContainer: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.borderLight,
    borderRadius: 8,
  },
  feedbackPrompt: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  feedbackInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    ...typography.small,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  feedbackSubmitButton: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    marginTop: spacing.sm,
  },
  feedbackSubmitButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  feedbackSubmitButtonText: {
    ...typography.smallMedium,
    color: colors.surface,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyStateIconContainer: {
    marginBottom: spacing.lg,
  },
  emptyStateTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyStateSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyStateButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 20,
  },
  emptyStateButtonText: {
    ...typography.bodyMedium,
    color: colors.surface,
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderRadius: 10,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segmentedOption: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentedOptionSelected: {
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  segmentedOptionText: {
    ...typography.smallMedium,
    color: colors.textSecondary,
  },
  segmentedOptionTextSelected: {
    color: colors.text,
  },

  // Tickets List
  ticketsList: {
    gap: spacing.md,
  },

  // Ticket Card
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ticketCardHeader: {
    marginBottom: spacing.md,
  },
  ticketCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  ticketCardTitle: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.text,
  },
  ticketStatusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  ticketStatusText: {
    ...typography.tiny,
  },
  ticketCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  ticketCardCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ticketCardCategoryText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  ticketCardPriority: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ticketCardPriorityText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  ticketCardDate: {
    ...typography.small,
    color: colors.textMuted,
  },
  ticketCardComments: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ticketCardCommentsText: {
    ...typography.small,
    color: colors.textMuted,
  },

  // Modal
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
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    ...typography.sectionHeader,
    color: colors.text,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: spacing.lg,
  },

  // Contact Cards
  contactCardsContainer: {
    gap: spacing.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  contactCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactCardContent: {
    flex: 1,
  },
  contactCardTitle: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  contactCardSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contactCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactCardCopyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactCardActionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  contactCardActionText: {
    ...typography.smallMedium,
    color: colors.surface,
  },

  // Create Ticket Form
  createTicketForm: {
    paddingBottom: spacing.xl,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  formLabel: {
    ...typography.smallMedium,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  formInput: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  formInputMultiline: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    minHeight: 100,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  formInputError: {
    borderColor: colors.danger,
  },
  formError: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  formCharCount: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  categoryPicker: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.borderLight,
    gap: spacing.sm,
  },
  categoryOptionSelected: {
    backgroundColor: colors.primaryLight,
  },
  categoryOptionText: {
    ...typography.smallMedium,
    color: colors.textSecondary,
  },
  categoryOptionTextSelected: {
    color: colors.primary,
  },
  priorityPicker: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  priorityOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.borderLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  priorityDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  priorityOptionText: {
    ...typography.smallMedium,
    color: colors.textSecondary,
  },
  attachmentPlaceholder: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  attachmentPlaceholderText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitButtonText: {
    ...typography.bodyMedium,
    color: colors.surface,
  },

  // Ticket Details
  ticketDetailsContent: {
    paddingBottom: spacing.xl,
  },
  ticketDetailsHeader: {
    marginBottom: spacing.lg,
  },
  ticketDetailsTitle: {
    ...typography.sectionHeader,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  ticketStatusPillLarge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  ticketStatusTextLarge: {
    ...typography.smallMedium,
  },
  ticketDetailsMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  ticketDetailsMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ticketDetailsMetaText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  ticketDetailsDescription: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  ticketDetailsDescriptionText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },

  // Timeline
  ticketTimeline: {
    marginBottom: spacing.xl,
  },
  ticketTimelineTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    marginBottom: spacing.md,
  },
  ticketTimelineItem: {
    flexDirection: 'row',
    paddingLeft: spacing.sm,
  },
  ticketTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  ticketTimelineLine: {
    position: 'absolute',
    left: spacing.sm + 4,
    top: 14,
    bottom: -spacing.md,
    width: 2,
    backgroundColor: colors.border,
  },
  ticketTimelineContent: {
    flex: 1,
    marginLeft: spacing.md,
    paddingBottom: spacing.lg,
  },
  ticketTimelineLabel: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  ticketTimelineDate: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Comments
  ticketComments: {
    marginBottom: spacing.xl,
  },
  ticketCommentsTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    marginBottom: spacing.md,
  },
  ticketCommentItem: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  ticketCommentText: {
    ...typography.body,
    color: colors.text,
  },
  ticketCommentDate: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // Add Comment
  addCommentSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  addCommentInput: {
    flex: 1,
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    minHeight: 44,
    maxHeight: 100,
  },
  addCommentButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCommentButtonDisabled: {
    backgroundColor: colors.textMuted,
  },

  // Close Ticket
  closeTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: 12,
    backgroundColor: colors.borderLight,
    gap: spacing.sm,
  },
  closeTicketButtonText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },

  // Copy Modal
  copyModalOverlay: {
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
    padding: spacing.xl,
  },
  copyModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
  },
  copyModalTitle: {
    ...typography.sectionHeader,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  copyModalTextContainer: {
    backgroundColor: colors.borderLight,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  copyModalText: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
  },
  copyModalHint: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  copyModalButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  copyModalButtonText: {
    ...typography.bodyMedium,
    color: colors.surface,
  },
});
