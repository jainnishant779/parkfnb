import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { palette, radii, spacing, fonts, typography } from '../../theme';
import {
  T,
  Card,
  PillButton,
  SearchPill,
  Field,
  ScreenHeader,
  SectionTitle,
  StatusTag,
  ListRow,
  Chip,
  EmptyState,
  IsoBlock,
} from '../../components/ui';

// FAQ Data
const faqData = [
  {
    id: '1',
    question: 'How do I book a parking spot?',
    answer: 'To book a parking spot, go to the Home screen, browse available spots on the map, tap on a marker to view details, and click "Book Now". Follow the prompts to select your duration and complete payment.',
  },
  {
    id: '2',
    question: 'How can I cancel my booking?',
    answer: 'Go to the Bookings tab, find your active booking, tap on it to view details, and select "Cancel Booking". Cancellations made 2 hours before the start time are eligible for a full refund.',
  },
  {
    id: '3',
    question: 'What payment methods are accepted?',
    answer: 'We accept all major credit/debit cards (Visa, MasterCard, American Express), digital wallets (Apple Pay, Google Pay), and in-app wallet balance.',
  },
  {
    id: '4',
    question: 'How do I extend my parking duration?',
    answer: 'Open your active booking from the Bookings tab, tap "Extend Parking", select the additional time needed, and confirm payment. Extensions are subject to availability.',
  },
  {
    id: '5',
    question: 'What if I can\'t find my booked parking spot?',
    answer: 'Use the navigation feature in your booking details to get directions. If you still have trouble, contact our 24/7 support team via live chat or call us directly.',
  },
  {
    id: '6',
    question: 'How do refunds work?',
    answer: 'Refunds are processed within 5-7 business days to your original payment method. For wallet payments, refunds are instant. Check your booking cancellation policy for eligibility.',
  },
  {
    id: '7',
    question: 'Can I save my favorite parking spots?',
    answer: 'Yes! Tap the heart icon on any parking spot details page to save it to your favorites. Access your saved spots from the Profile > Favorites section.',
  },
  {
    id: '8',
    question: 'How do I update my vehicle information?',
    answer: 'Go to Profile > My Vehicles. You can add, edit, or remove vehicles. Make sure to select the correct vehicle when making a booking.',
  },
];

// Sample tickets data
const sampleTickets = [
  {
    id: 'TKT-001',
    subject: 'Refund not received',
    description: 'I cancelled my booking 3 days ago but haven\'t received my refund yet.',
    status: 'in_progress',
    date: '2024-01-15',
  },
  {
    id: 'TKT-002',
    subject: 'App crashing on payment',
    description: 'The app crashes whenever I try to make a payment.',
    status: 'closed',
    date: '2024-01-10',
  },
  {
    id: 'TKT-003',
    subject: 'Wrong parking location',
    description: 'The map showed wrong location for the parking spot.',
    status: 'open',
    date: '2024-01-18',
  },
];

// FAQ Item Component
const FAQItem = ({ item, isExpanded, onToggle, isLast }) => {
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: isExpanded ? 1 : 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(rotateAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isExpanded, animatedHeight, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <TouchableOpacity
      style={[styles.faqItem, !isLast && styles.faqDivider]}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={item.question}
      accessibilityHint={isExpanded ? 'Tap to collapse answer' : 'Tap to expand answer'}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{item.question}</Text>
        <Animated.View style={[styles.faqChevron, { transform: [{ rotate }] }]}>
          <Icon name="chevron-down" size={18} color={palette.text} />
        </Animated.View>
      </View>
      {isExpanded && (
        <Animated.View style={[styles.faqAnswerContainer, { opacity: animatedHeight }]}>
          <Text style={styles.faqAnswer}>{item.answer}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

// Ticket status -> StatusTag tone
const STATUS_CONFIG = {
  open: { tone: 'ink', label: 'Open' },
  in_progress: { tone: 'warning', label: 'In Progress' },
  closed: { tone: 'success', label: 'Closed' },
};

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || { tone: 'grey', label: 'Unknown' };
  return <StatusTag label={config.label} tone={config.tone} />;
};

// Ticket Item Component
const TicketItem = ({ ticket, onPress }) => {
  return (
    <TouchableOpacity style={styles.ticketItem} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketId}>{ticket.id}</Text>
        <StatusBadge status={ticket.status} />
      </View>
      <Text style={styles.ticketSubject}>{ticket.subject}</Text>
      <Text style={styles.ticketDescription} numberOfLines={2}>
        {ticket.description}
      </Text>
      <View style={styles.ticketFooter}>
        <Icon name="calendar" size={14} color={palette.textMuted} />
        <Text style={styles.ticketDate}>{ticket.date}</Text>
      </View>
    </TouchableOpacity>
  );
};

const HelpSupportPage = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFAQ, setExpandedFAQ] = useState(null);
  const [activeSection, setActiveSection] = useState('main'); // 'main', 'tickets', 'submit'
  const [tickets, setTickets] = useState(sampleTickets);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Ticket form state
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState('');

  // Filter FAQs based on search
  const filteredFAQs = faqData.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openTicketCount = tickets.filter((t) => t.status !== 'closed').length;

  const handleFAQToggle = useCallback((id) => {
    setExpandedFAQ((prev) => (prev === id ? null : id));
  }, []);

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@parkingapp.com?subject=Help%20Request');
  };

  const handleCallSupport = () => {
    Linking.openURL('tel:+1234567890');
  };

  const handleLiveChat = () => {
    // Placeholder for live chat integration
    console.log('Live chat initiated');
  };

  const handleSubmitTicket = async () => {
    if (!ticketSubject.trim() || !ticketDescription.trim()) {
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const newTicket = {
      id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
      subject: ticketSubject,
      description: ticketDescription,
      status: 'open',
      date: new Date().toISOString().split('T')[0],
    };

    setTickets([newTicket, ...tickets]);
    setTicketSubject('');
    setTicketDescription('');
    setTicketCategory('');
    setIsSubmitting(false);
    setShowSuccessModal(true);

    setTimeout(() => {
      setShowSuccessModal(false);
      setActiveSection('main');
    }, 2000);
  };

  const categories = [
    { id: 'booking', label: 'Booking Issue', icon: 'calendar' },
    { id: 'payment', label: 'Payment', icon: 'credit-card' },
    { id: 'technical', label: 'Technical', icon: 'settings' },
    { id: 'other', label: 'Other', icon: 'help-circle' },
  ];

  const canSubmit = !!ticketSubject.trim() && !!ticketDescription.trim();

  // Render Submit Ticket Form
  const renderSubmitTicketForm = () => (
    <View style={styles.pad}>
      <Card tone="blue" style={styles.formHero}>
        <View style={styles.heroText}>
          <T variant="h3">Tell us what went wrong</T>
          <T variant="bodySmall" style={styles.heroSub}>
            Our support team usually replies within 24 hours.
          </T>
        </View>
        <View style={styles.heroArt} pointerEvents="none">
          <IsoBlock size={120} tone="blue" />
        </View>
      </Card>

      <Card style={styles.formCard}>
        <Text style={styles.formLabel}>Category</Text>
        <View style={styles.categoryGrid}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.label}
              icon={cat.icon}
              selected={ticketCategory === cat.id}
              onPress={() => setTicketCategory(cat.id)}
              style={styles.chipGap}
            />
          ))}
        </View>

        <Field
          label="Subject"
          icon="edit-3"
          placeholder="Brief description of your issue"
          value={ticketSubject}
          onChangeText={setTicketSubject}
          maxLength={100}
          style={styles.fieldGap}
        />

        <Text style={[styles.formLabel, styles.fieldGap]}>Description</Text>
        <View style={styles.textAreaWrap}>
          <TextInput
            style={styles.textArea}
            placeholder="Please provide details about your issue..."
            placeholderTextColor={palette.textSubtle}
            value={ticketDescription}
            onChangeText={setTicketDescription}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={500}
          />
        </View>
        <Text style={styles.charCount}>{ticketDescription.length}/500</Text>
      </Card>

      <PillButton
        variant="ink"
        icon="send"
        label="Submit Ticket"
        onPress={handleSubmitTicket}
        loading={isSubmitting}
        disabled={!canSubmit || isSubmitting}
        style={styles.submitButton}
      />
    </View>
  );

  // Render Tickets List
  const renderTicketsList = () => (
    <View style={styles.pad}>
      {tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          subtitle="You haven't submitted any support tickets."
        />
      ) : (
        tickets.map((ticket) => (
          <TicketItem
            key={ticket.id}
            ticket={ticket}
            onPress={() => console.log('View ticket:', ticket.id)}
          />
        ))
      )}
    </View>
  );

  // Render Main Content
  const renderMainContent = () => (
    <View style={styles.pad}>
      {/* Hero + search */}
      <Card tone="peach" style={styles.hero}>
        <View style={styles.heroText}>
          <T variant="h2">How can we{'\n'}help?</T>
          <T variant="bodySmall" style={styles.heroSub}>
            Search answers or reach our team.
          </T>
        </View>
        <View style={styles.heroArt} pointerEvents="none">
          <IsoBlock size={140} tone="peach" />
        </View>
        <SearchPill
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search FAQs..."
          style={styles.heroSearch}
          right={
            searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Icon name="x" size={18} color={palette.textMuted} />
              </TouchableOpacity>
            ) : null
          }
        />
      </Card>

      {/* Contact Support */}
      <SectionTitle title="Contact support" style={styles.sectionTitle} />
      <Card style={styles.listCard}>
        <ListRow
          icon="phone"
          title="Call Support"
          subtitle="+1 (234) 567-890"
          onPress={handleCallSupport}
        />
        <ListRow
          icon="mail"
          title="Email Support"
          subtitle="support@parkingapp.com"
          onPress={handleEmailSupport}
        />
        <ListRow
          icon="message-circle"
          title="Live Chat"
          subtitle="Available 24/7"
          onPress={handleLiveChat}
          isLast
        />
      </Card>

      {/* FAQ Section */}
      <SectionTitle title="Frequently asked" style={styles.sectionTitle} />
      {filteredFAQs.length === 0 ? (
        <Card>
          <EmptyState title="No results found" subtitle="Try searching with different keywords" />
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {filteredFAQs.map((faq, index) => (
            <FAQItem
              key={faq.id}
              item={faq}
              isExpanded={expandedFAQ === faq.id}
              onToggle={() => handleFAQToggle(faq.id)}
              isLast={index === filteredFAQs.length - 1}
            />
          ))}
        </Card>
      )}

      {/* Tickets */}
      <SectionTitle title="Support tickets" style={styles.sectionTitle} />
      <Card>
        <T variant="bodySmall">
          Describe your issue and our support team will get back to you as soon as possible.
        </T>
        <PillButton
          variant="ink"
          size="md"
          icon="edit-3"
          label="Submit a Support Ticket"
          onPress={() => setActiveSection('submit')}
          style={styles.ticketCta}
        />
        <View style={styles.ticketStatusRow}>
          <ListRow
            icon="clock"
            title="Check Ticket Status"
            subtitle={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}
            onPress={() => setActiveSection('tickets')}
            isLast
            right={
              <View style={styles.rowRight}>
                {openTicketCount > 0 && (
                  <StatusTag label={`${openTicketCount} open`} tone="ink" />
                )}
                <Icon name="chevron-right" size={20} color={palette.textSubtle} />
              </View>
            }
          />
        </View>
      </Card>

      {/* Footer Links */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerLink}>
          <Text style={styles.footerLinkText}>Terms of Service</Text>
        </TouchableOpacity>
        <View style={styles.footerDivider} />
        <TouchableOpacity style={styles.footerLink}>
          <Text style={styles.footerLinkText}>Privacy Policy</Text>
        </TouchableOpacity>
        <View style={styles.footerDivider} />
        <TouchableOpacity style={styles.footerLink}>
          <Text style={styles.footerLinkText}>App Settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const getHeaderTitle = () => {
    switch (activeSection) {
      case 'submit':
        return 'Submit a Ticket';
      case 'tickets':
        return 'My Tickets';
      default:
        return 'Help & Support';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={getHeaderTitle()}
        onBack={() => {
          if (activeSection !== 'main') {
            setActiveSection('main');
          } else {
            navigation.goBack();
          }
        }}
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {activeSection === 'main' && renderMainContent()}
        {activeSection === 'submit' && renderSubmitTicketForm()}
        {activeSection === 'tickets' && renderTicketsList()}
      </ScrollView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <Icon name="check" size={30} color={palette.textInverse} />
            </View>
            <Text style={styles.successTitle}>Ticket Submitted</Text>
            <Text style={styles.successText}>We'll get back to you within 24 hours.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  pad: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },

  // Hero
  hero: {
    minHeight: 230,
    paddingBottom: spacing.xl,
  },
  formHero: {
    minHeight: 130,
    marginBottom: spacing.lg,
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

  sectionTitle: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },

  // FAQ
  faqItem: {
    paddingVertical: spacing.lg,
  },
  faqDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: palette.text,
    marginRight: spacing.md,
  },
  faqChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqAnswerContainer: {
    marginTop: spacing.md,
  },
  faqAnswer: {
    ...typography.bodySmall,
    fontSize: 14,
    lineHeight: 21,
  },

  // Tickets CTA
  ticketCta: {
    marginTop: spacing.lg,
  },
  ticketStatusRow: {
    marginTop: spacing.sm,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    marginTop: spacing.sm,
  },
  footerLink: {
    paddingHorizontal: spacing.md,
  },
  footerLinkText: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  footerDivider: {
    width: 1,
    height: 12,
    backgroundColor: palette.textSubtle,
  },

  // Form
  formCard: {
    paddingTop: spacing.lg,
  },
  formLabel: {
    ...typography.caption,
    marginBottom: 8,
    marginLeft: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chipGap: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldGap: {
    marginTop: spacing.lg,
  },
  textAreaWrap: {
    backgroundColor: palette.fill,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  textArea: {
    ...fonts.medium,
    height: 130,
    fontSize: 16,
    color: palette.text,
    padding: 0,
    textAlignVertical: 'top',
  },
  charCount: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    textAlign: 'right',
    marginTop: spacing.sm,
    marginRight: 4,
  },
  submitButton: {
    marginTop: spacing.xl,
  },

  // Ticket items
  ticketItem: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ticketId: {
    ...fonts.semibold,
    fontSize: 12,
    color: palette.textMuted,
  },
  ticketSubject: {
    ...fonts.bold,
    fontSize: 17,
    color: palette.text,
    marginBottom: 4,
  },
  ticketDescription: {
    ...typography.bodySmall,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    gap: 6,
  },
  ticketDate: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
  },

  // Modal
  modalOverlay: {
    // Fills the root of a real <Modal>. Absolute positioning (and the
    // leftover zIndex/elevation) is harmless there.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    // The tint lives on modalBackdrop: a translucent background on this
    // elevated view let Android's shadow paint through as a lighter strip.
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  successModal: {
    backgroundColor: palette.surface,
    borderRadius: radii.xxl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    marginHorizontal: spacing.xxxl,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...fonts.bold,
    fontSize: 20,
    color: palette.text,
    marginBottom: spacing.sm,
  },
  successText: {
    ...typography.bodySmall,
    fontSize: 14,
    textAlign: 'center',
  },
});

export default HelpSupportPage;
