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
  TouchableOpacity,
  Animated,
  Platform,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
  Linking,
  DimensionValue,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as Kit from '../../theme/kit';
import * as UI from '../../components/ui';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const {
  T,
  Card,
  PillButton,
  IconCircle,
  SearchPill,
  Field,
  ScreenHeader,
  SectionTitle,
  StatusTag,
  InfoGrid,
  ListRow,
  TimelineItem,
  Segmented,
  EmptyState: KitEmptyState,
  IsoBlock,
} = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii, shadow } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

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
  { key: 'low', label: 'Low', color: palette.success },
  { key: 'medium', label: 'Medium', color: palette.warning },
  { key: 'high', label: 'High', color: palette.danger },
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
  xl: 20,
  xxl: 28,
};

const PRIORITY_SOFT: Record<PriorityKey, string> = {
  low: palette.successSoft,
  medium: palette.warningSoft,
  high: palette.dangerSoft,
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

  const iconBg = toast.type === 'success' ? palette.success
    : toast.type === 'error' ? palette.danger
    : palette.ink;
  const icon = toast.type === 'success' ? 'checkmark'
    : toast.type === 'error' ? 'close'
    : 'information';

  return (
    <Animated.View
      style={[
        styles.toast,
        { transform: [{ translateY }], opacity },
      ]}
    >
      <View style={[styles.toastIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={palette.textInverse} />
      </View>
      <Text style={styles.toastText}>{toast.message}</Text>
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

// `icon` is kept for API parity; the kit empty state draws the car illustration.
const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  subtitle,
  actionLabel,
  onAction,
}) => (
  <Card padded={false} style={styles.emptyCard}>
    <KitEmptyState
      title={title}
      subtitle={subtitle}
      action={actionLabel && onAction ? actionLabel : undefined}
      onAction={onAction}
      tone="grey"
    />
  </Card>
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
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.75}
    style={[
      styles.chip,
      isSelected && styles.chipSelected,
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
    accessibilityLabel={label}
  >
    <Ionicons
      name={icon}
      size={16}
      color={isSelected ? palette.textInverse : palette.text}
    />
    <Text
      style={[
        styles.chipText,
        isSelected && styles.chipTextSelected,
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  </TouchableOpacity>
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
  isLast?: boolean;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  faq,
  isExpanded,
  onToggle,
  feedback,
  onVote,
  onSubmitFeedback,
  isLast,
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

  const votedYes = feedback?.userVote === 'yes';
  const votedNo = feedback?.userVote === 'no';

  return (
    <View style={[styles.accordionItem, !isLast && styles.divider]}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={styles.accordionHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.accordionQuestion}>{faq.question}</Text>
        <Animated.View style={[styles.chevronCircle, { transform: [{ rotate: rotation }] }]}>
          <Ionicons name="chevron-down" size={18} color={palette.text} />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.accordionContent}>
          <Text style={styles.accordionAnswer}>{faq.answer}</Text>

          <View style={styles.helpfulSection}>
            <Text style={styles.helpfulText}>Was this helpful?</Text>
            <View style={styles.helpfulButtons}>
              <TouchableOpacity
                onPress={() => onVote('yes')}
                activeOpacity={0.75}
                style={[styles.helpfulButton, votedYes && styles.helpfulButtonActive]}
                accessibilityLabel="Yes, this was helpful"
              >
                <Ionicons
                  name="thumbs-up-outline"
                  size={15}
                  color={votedYes ? palette.textInverse : palette.text}
                />
                <Text style={[styles.helpfulButtonText, votedYes && styles.helpfulButtonTextActive]}>
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNoVote}
                activeOpacity={0.75}
                style={[styles.helpfulButton, votedNo && styles.helpfulButtonActive]}
                accessibilityLabel="No, this was not helpful"
              >
                <Ionicons
                  name="thumbs-down-outline"
                  size={15}
                  color={votedNo ? palette.textInverse : palette.text}
                />
                <Text style={[styles.helpfulButtonText, votedNo && styles.helpfulButtonTextActive]}>
                  No
                </Text>
              </TouchableOpacity>
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
                placeholderTextColor={palette.textSubtle}
                multiline
                maxLength={200}
              />
              <PillButton
                label="Save"
                variant="ink"
                size="sm"
                onPress={handleSubmitFeedback}
                disabled={!feedbackText.trim()}
                style={styles.feedbackSubmitButton}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.ticketCard}
      accessibilityRole="button"
      accessibilityLabel={`Ticket: ${ticket.title}`}
    >
      <View style={styles.ticketCardTop}>
        <Text style={styles.ticketCardId}>#{ticket.id.slice(-6).toUpperCase()}</Text>
        <StatusTag
          label={ticket.status === 'open' ? 'Open' : 'Closed'}
          tone={ticket.status === 'open' ? 'ink' : 'grey'}
        />
      </View>
      <Text style={styles.ticketCardTitle} numberOfLines={2}>
        {ticket.title}
      </Text>
      <View style={styles.ticketCardMeta}>
        <View style={styles.metaPill}>
          <Ionicons
            name={category?.icon || 'help-circle-outline'}
            size={14}
            color={palette.text}
          />
          <Text style={styles.metaPillText}>{category?.label}</Text>
        </View>
        <View style={styles.metaPill}>
          <View
            style={[
              styles.priorityDot,
              { backgroundColor: priority?.color || palette.textMuted },
            ]}
          />
          <Text style={styles.metaPillText}>{priority?.label}</Text>
        </View>
      </View>
      <View style={styles.ticketCardFooter}>
        <Text style={styles.ticketCardDate}>
          Created {formatDate(ticket.createdAt)}
        </Text>
        {ticket.comments.length > 0 && (
          <View style={styles.ticketCardComments}>
            <Ionicons name="chatbubble-outline" size={13} color={palette.textMuted} />
            <Text style={styles.ticketCardCommentsText}>
              {ticket.comments.length}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
  maxHeight?: DimensionValue;
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
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.modalContent, { maxHeight }]}
      >
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={1}>{title}</Text>
          <IconCircle icon="x" variant="grey" size={38} onPress={onClose} />
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
// CONTACT ROW COMPONENT
// ============================================================================

interface ContactCardProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  copyValue?: string;
  onCopy?: () => void;
  isLast?: boolean;
}

const ContactCard: React.FC<ContactCardProps> = ({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  copyValue,
  onCopy,
  isLast,
}) => (
  <ListRow
    icon={icon}
    title={title}
    subtitle={subtitle}
    isLast={isLast}
    right={
      <View style={styles.contactActions}>
        {copyValue && onCopy && (
          <IconCircle icon="copy" variant="grey" size={36} onPress={onCopy} />
        )}
        <PillButton
          label={actionLabel}
          variant="ink"
          size="sm"
          onPress={onAction}
          style={styles.contactActionButton}
          textStyle={styles.contactActionText}
        />
      </View>
    }
  />
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


  const openCount = tickets.filter((t) => t.status === 'open').length;
  const closedCount = tickets.filter((t) => t.status === 'closed').length;
  const selectedPriority = selectedTicket
    ? PRIORITY_OPTIONS.find((p) => p.key === selectedTicket.priority)
    : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Toast */}
      <Toast toast={toast} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />

      {/* Header */}
      <ScreenHeader
        title="Support & Help"
        onBack={() => navigation.goBack()}
        right={<IconCircle icon="settings" size={40} onPress={() => {}} />}
      />

      {/* Storage Error Banner */}
      {storageError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={palette.warning} />
          <Text style={styles.errorBannerText}>
            Couldn't save locally. Changes may not persist.
          </Text>
          <TouchableOpacity onPress={() => setStorageError(false)} hitSlop={8}>
            <Ionicons name="close" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero + search */}
        <Card tone="peach" style={styles.hero}>
          <View style={styles.heroText}>
            <T variant="h2">How can we{'\n'}help?</T>
            <T variant="bodySmall" style={styles.heroSub}>
              Find answers or contact support
            </T>
          </View>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={140} tone="peach" />
          </View>
          <SearchPill
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search help articles"
            returnKeyType="search"
            accessibilityLabel="Search help articles"
            style={styles.heroSearch}
            right={
              searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={10}
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={20} color={palette.textMuted} />
                </TouchableOpacity>
              ) : null
            }
          />
        </Card>

        {/* Quick Actions */}
        <SectionTitle title="Quick actions" style={styles.sectionTitle} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
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

        {/* FAQ Section */}
        <SectionTitle
          title={`FAQs${selectedCategory ? ` · ${CATEGORIES.find((c) => c.key === selectedCategory)?.label}` : ''}`}
          action={expandedFaqId ? 'Collapse all' : undefined}
          onAction={handleCollapseAll}
          style={styles.sectionTitle}
        />

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
              <View key={categoryKey}>
                {!selectedCategory && (
                  <Text style={styles.faqCategoryTitle}>
                    {CATEGORIES.find((c) => c.key === categoryKey)?.label}
                  </Text>
                )}
                <Card style={styles.listCard}>
                  {faqs.map((faq, index) => (
                    <AccordionItem
                      key={faq.id}
                      faq={faq}
                      isExpanded={expandedFaqId === faq.id}
                      onToggle={() => handleFaqToggle(faq.id)}
                      feedback={faqFeedback[faq.id]}
                      onVote={(vote) => handleFaqVote(faq.id, vote)}
                      onSubmitFeedback={(text) => handleFaqFeedbackSubmit(faq.id, text)}
                      isLast={index === faqs.length - 1}
                    />
                  ))}
                </Card>
              </View>
            ))}
          </View>
        )}

        {/* My Tickets Section */}
        <View style={styles.ticketsSectionHeader}>
          <Text style={styles.sectionHeading}>My tickets</Text>
          <PillButton
            label="Raise Ticket"
            icon="plus"
            variant="ink"
            size="sm"
            onPress={() => setShowCreateTicket(true)}
          />
        </View>
        <Segmented
          options={[
            { id: 'open', label: `Open (${openCount})` },
            { id: 'closed', label: `Closed (${closedCount})` },
          ]}
          value={ticketTab}
          onChange={(key: string) => setTicketTab(key as 'open' | 'closed')}
          style={styles.segmented}
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

        {/* Contact Options */}
        <SectionTitle title="Contact us" style={styles.sectionTitle} />
        <Card style={styles.listCard}>
          <ContactCard
            icon="message-circle"
            title="Chat with Support"
            subtitle="Get instant help from our team"
            actionLabel="Start Chat"
            onAction={() => {}}
          />
          <ContactCard
            icon="mail"
            title="Email Support"
            subtitle={SUPPORT_EMAIL}
            actionLabel="Send Email"
            onAction={handleEmailPress}
            copyValue={SUPPORT_EMAIL}
            onCopy={() => handleCopyText(SUPPORT_EMAIL)}
          />
          <ContactCard
            icon="phone"
            title="Call Support"
            subtitle={SUPPORT_PHONE}
            actionLabel="Call Now"
            onAction={handlePhonePress}
            copyValue={SUPPORT_PHONE}
            onCopy={() => handleCopyText(SUPPORT_PHONE)}
            isLast
          />
        </Card>
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
                <QuickActionChip
                  key={cat.key}
                  icon={cat.icon}
                  label={cat.label}
                  isSelected={newTicketCategory === cat.key}
                  onPress={() => setNewTicketCategory(cat.key)}
                />
              ))}
            </ScrollView>
            {formErrors.category && (
              <Text style={styles.formError}>{formErrors.category}</Text>
            )}
          </View>

          {/* Title */}
          <View style={styles.formGroup}>
            <Field
              label="Title *"
              icon="edit-3"
              value={newTicketTitle}
              onChangeText={setNewTicketTitle}
              placeholder="Brief summary of your issue"
              maxLength={100}
            />
            {formErrors.title && (
              <Text style={styles.formError}>{formErrors.title}</Text>
            )}
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Description *</Text>
            <View style={[styles.textAreaWrap, !!formErrors.description && styles.inputError]}>
              <TextInput
                style={styles.textArea}
                value={newTicketDescription}
                onChangeText={setNewTicketDescription}
                placeholder="Please provide as much detail as possible..."
                placeholderTextColor={palette.textSubtle}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
            </View>
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
              {PRIORITY_OPTIONS.map((priority) => {
                const active = newTicketPriority === priority.key;
                return (
                  <TouchableOpacity
                    key={priority.key}
                    onPress={() => setNewTicketPriority(priority.key)}
                    activeOpacity={0.75}
                    style={[
                      styles.priorityOption,
                      active && { backgroundColor: PRIORITY_SOFT[priority.key] },
                    ]}
                  >
                    <View style={[styles.priorityDotLarge, { backgroundColor: priority.color }]} />
                    <Text style={[styles.priorityOptionText, active && { color: priority.color }]}>
                      {priority.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Attachments Placeholder */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Attachments</Text>
            <View style={styles.attachmentPlaceholder}>
              <View style={styles.attachmentIcon}>
                <Ionicons name="cloud-upload-outline" size={20} color={palette.textMuted} />
              </View>
              <Text style={styles.attachmentPlaceholderText}>
                Coming soon - File attachments will be available in a future update
              </Text>
            </View>
          </View>

          {/* Submit Button */}
          <PillButton
            label="Submit Ticket"
            icon="send"
            variant="ink"
            onPress={handleCreateTicket}
            style={styles.submitButton}
          />
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
            <StatusTag
              label={selectedTicket.status === 'open' ? 'Open' : 'Closed'}
              tone={selectedTicket.status === 'open' ? 'ink' : 'grey'}
              style={styles.detailsTag}
            />
            <Text style={styles.ticketDetailsTitle}>{selectedTicket.title}</Text>

            <InfoGrid
              items={[
                {
                  label: 'Category',
                  value: CATEGORIES.find((c) => c.key === selectedTicket.category)?.label,
                },
                {
                  label: 'Priority',
                  value: selectedPriority ? `${selectedPriority.label} Priority` : undefined,
                },
                { label: 'Created', value: formatDateTime(selectedTicket.createdAt) },
                { label: 'Updated', value: formatDate(selectedTicket.updatedAt) },
              ]}
              style={styles.detailsGrid}
            />

            <View style={styles.ticketDetailsDescription}>
              <Text style={styles.ticketDetailsDescriptionText}>
                {selectedTicket.description}
              </Text>
            </View>

            {/* Timeline */}
            <Text style={styles.detailsSectionTitle}>Timeline</Text>
            <View style={styles.ticketTimeline}>
              {selectedTicket.timeline.map((entry, index) => (
                <TimelineItem
                  key={entry.id}
                  title={entry.label}
                  date={formatDateTime(entry.createdAt)}
                  active={index === selectedTicket.timeline.length - 1}
                  isLast={index === selectedTicket.timeline.length - 1}
                />
              ))}
            </View>

            {/* Comments */}
            {selectedTicket.comments.length > 0 && (
              <View style={styles.ticketComments}>
                <Text style={styles.detailsSectionTitle}>Comments</Text>
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
                  placeholderTextColor={palette.textSubtle}
                  multiline
                  maxLength={300}
                />
                <TouchableOpacity
                  onPress={handleAddComment}
                  activeOpacity={0.8}
                  style={[
                    styles.addCommentButton,
                    !newComment.trim() && styles.addCommentButtonDisabled,
                  ]}
                  disabled={!newComment.trim()}
                  accessibilityLabel="Send comment"
                >
                  <Ionicons name="send" size={18} color={palette.textInverse} />
                </TouchableOpacity>
              </View>
            )}

            {/* Close Ticket Button */}
            {selectedTicket.status === 'open' && (
              <PillButton
                label="Close Ticket"
                icon="check-circle"
                variant="grey"
                onPress={handleCloseTicket}
              />
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
            <PillButton
              label="Done"
              variant="ink"
              size="md"
              onPress={() => setShowCopiedModal(false)}
            />
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
    backgroundColor: palette.bg,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    gap: spacing.md,
    zIndex: 1000,
    ...shadow.lifted,
  },
  toastIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 14,
    color: palette.text,
  },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.warningSoft,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    gap: spacing.sm,
  },
  errorBannerText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 13,
    color: palette.text,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },

  // Hero
  hero: {
    minHeight: 230,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
  },
  heroText: {
    maxWidth: '62%',
  },
  heroSub: {
    marginTop: spacing.sm,
    color: palette.inkSoft,
  },
  heroArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },
  heroSearch: {
    marginTop: 'auto',
    backgroundColor: palette.surface,
  },

  // Sections
  sectionTitle: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionHeading: {
    ...fonts.medium,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },

  // Chips
  chipsScroll: {
    marginHorizontal: -spacing.xl,
  },
  chipsRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    gap: spacing.sm,
  },
  chipSelected: {
    backgroundColor: palette.ink,
  },
  chipText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  chipTextSelected: {
    color: palette.textInverse,
  },

  // FAQ
  faqContainer: {
    gap: spacing.lg,
  },
  faqCategoryTitle: {
    ...fonts.semibold,
    fontSize: 12,
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },

  // Accordion
  accordionItem: {
    paddingVertical: spacing.lg,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accordionQuestion: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: palette.text,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionContent: {
    marginTop: spacing.md,
  },
  accordionAnswer: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 21,
    color: palette.textMuted,
  },
  helpfulSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  helpfulText: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  helpfulButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  helpfulButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    gap: 6,
  },
  helpfulButtonActive: {
    backgroundColor: palette.ink,
  },
  helpfulButtonText: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  helpfulButtonTextActive: {
    color: palette.textInverse,
  },
  feedbackInputContainer: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
  },
  feedbackPrompt: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  feedbackInput: {
    ...fonts.medium,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 14,
    color: palette.text,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  feedbackSubmitButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
  },

  // Empty State
  emptyCard: {
    overflow: 'hidden',
  },

  // Tickets
  ticketsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  segmented: {
    marginBottom: spacing.lg,
  },
  ticketsList: {
    gap: spacing.md,
  },
  ticketCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  ticketCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  ticketCardId: {
    ...fonts.semibold,
    fontSize: 12,
    color: palette.textMuted,
    letterSpacing: 0.4,
  },
  ticketCardTitle: {
    ...fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: palette.text,
  },
  ticketCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    gap: 6,
  },
  metaPillText: {
    ...fonts.semibold,
    fontSize: 12.5,
    color: palette.text,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  ticketCardDate: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
  },
  ticketCardComments: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ticketCardCommentsText: {
    ...fonts.semibold,
    fontSize: 12,
    color: palette.textMuted,
  },

  // Contact
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  contactActionButton: {
    height: 36,
    paddingHorizontal: 14,
  },
  contactActionText: {
    fontSize: 13,
  },

  // Bottom sheet
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
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 44,
    height: 5,
    backgroundColor: palette.line,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  modalTitle: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  modalBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },

  // Create Ticket Form
  createTicketForm: {
    paddingBottom: spacing.xxl,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  formLabel: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  textAreaWrap: {
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputError: {
    borderColor: palette.danger,
  },
  textArea: {
    ...fonts.medium,
    minHeight: 100,
    fontSize: 16,
    color: palette.text,
    padding: 0,
    textAlignVertical: 'top',
  },
  formError: {
    ...fonts.medium,
    fontSize: 12.5,
    color: palette.danger,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  formCharCount: {
    ...fonts.medium,
    fontSize: 11,
    color: palette.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginRight: spacing.xs,
  },
  categoryPicker: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  priorityPicker: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    gap: spacing.sm,
  },
  priorityDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  priorityOptionText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  attachmentPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    gap: spacing.md,
  },
  attachmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPlaceholderText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
  },
  submitButton: {
    marginTop: spacing.sm,
  },

  // Ticket Details
  ticketDetailsContent: {
    paddingBottom: spacing.xxl,
  },
  detailsTag: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  ticketDetailsTitle: {
    ...fonts.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: palette.text,
  },
  detailsGrid: {
    marginTop: spacing.lg,
  },
  ticketDetailsDescription: {
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  ticketDetailsDescriptionText: {
    ...fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: palette.text,
  },
  detailsSectionTitle: {
    ...fonts.semibold,
    fontSize: 17,
    color: palette.text,
    marginBottom: spacing.md,
  },

  // Timeline
  ticketTimeline: {
    marginBottom: spacing.md,
  },

  // Comments
  ticketComments: {
    marginBottom: spacing.lg,
  },
  ticketCommentItem: {
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    borderTopLeftRadius: radii.xs,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    marginRight: spacing.xxl,
  },
  ticketCommentText: {
    ...fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    color: palette.text,
  },
  ticketCommentDate: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
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
    ...fonts.medium,
    flex: 1,
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 15,
    color: palette.text,
    minHeight: 48,
    maxHeight: 100,
  },
  addCommentButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCommentButtonDisabled: {
    opacity: 0.35,
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  copyModalContent: {
    backgroundColor: palette.surface,
    borderRadius: radii.xxl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
  },
  copyModalTitle: {
    ...fonts.semibold,
    fontSize: 20,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  copyModalTextContainer: {
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  copyModalText: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    textAlign: 'center',
  },
  copyModalHint: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
