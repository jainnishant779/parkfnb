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
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { palette, fontStacks } from '../../theme';

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
const FAQItem = ({ item, isExpanded, onToggle }) => {
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
  }, [isExpanded]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={item.question}
      accessibilityHint={isExpanded ? 'Tap to collapse answer' : 'Tap to expand answer'}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{item.question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-down" size={20} color="#A1A1AA" />
        </Animated.View>
      </View>
      {isExpanded && (
        <Animated.View
          style={[
            styles.faqAnswerContainer,
            {
              opacity: animatedHeight,
            },
          ]}
        >
          <Text style={styles.faqAnswer}>{item.answer}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

// Ticket Status Badge Component
const StatusBadge = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'open':
        return { color: '#3B82F6', bg: '#EFF6FF', label: 'Open' };
      case 'in_progress':
        return { color: '#F59E0B', bg: '#FFFBEB', label: 'In Progress' };
      case 'closed':
        return { color: '#10B981', bg: '#ECFDF5', label: 'Closed' };
      default:
        return { color: '#A1A1AA', bg: palette.surface, label: 'Unknown' };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: config.color }]} />
      <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

// Ticket Item Component
const TicketItem = ({ ticket, onPress }) => {
  return (
    <TouchableOpacity style={styles.ticketItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketId}>{ticket.id}</Text>
        <StatusBadge status={ticket.status} />
      </View>
      <Text style={styles.ticketSubject}>{ticket.subject}</Text>
      <Text style={styles.ticketDescription} numberOfLines={2}>
        {ticket.description}
      </Text>
      <View style={styles.ticketFooter}>
        <Icon name="calendar" size={14} color="#6B7280" />
        <Text style={styles.ticketDate}>{ticket.date}</Text>
      </View>
    </TouchableOpacity>
  );
};

// Contact Option Component
const ContactOption = ({ icon, iconType, title, subtitle, onPress, color }) => {
  const IconComponent = iconType === 'material' ? MaterialIcon : Icon;

  return (
    <TouchableOpacity style={styles.contactOption} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.contactIconContainer, { backgroundColor: color + '15' }]}>
        <IconComponent name={icon} size={22} color={color} />
      </View>
      <View style={styles.contactTextContainer}>
        <Text style={styles.contactTitle}>{title}</Text>
        <Text style={styles.contactSubtitle}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={20} color="#6B7280" />
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

  // Render Submit Ticket Form
  const renderSubmitTicketForm = () => (
    <View style={styles.formContainer}>
      <Text style={styles.formLabel}>Category</Text>
      <View style={styles.categoryGrid}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              ticketCategory === cat.id && styles.categoryChipActive,
            ]}
            onPress={() => setTicketCategory(cat.id)}
          >
            <Icon
              name={cat.icon}
              size={16}
              color={ticketCategory === cat.id ? '#FFFFFF' : '#A1A1AA'}
            />
            <Text
              style={[
                styles.categoryChipText,
                ticketCategory === cat.id && styles.categoryChipTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.formLabel}>Subject</Text>
      <TextInput
        style={styles.textInput}
        placeholder="Brief description of your issue"
        placeholderTextColor="#6B7280"
        value={ticketSubject}
        onChangeText={setTicketSubject}
        maxLength={100}
      />

      <Text style={styles.formLabel}>Description</Text>
      <TextInput
        style={[styles.textInput, styles.textArea]}
        placeholder="Please provide details about your issue..."
        placeholderTextColor="#6B7280"
        value={ticketDescription}
        onChangeText={setTicketDescription}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        maxLength={500}
      />
      <Text style={styles.charCount}>{ticketDescription.length}/500</Text>

      <TouchableOpacity
        style={[
          styles.submitButton,
          (!ticketSubject.trim() || !ticketDescription.trim()) && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmitTicket}
        disabled={!ticketSubject.trim() || !ticketDescription.trim() || isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Icon name="send" size={18} color="#FFFFFF" />
            <Text style={styles.submitButtonText}>Submit Ticket</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render Tickets List
  const renderTicketsList = () => (
    <View style={styles.ticketsContainer}>
      {tickets.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="inbox" size={48} color="rgba(255,255,255,0.10)" />
          <Text style={styles.emptyStateTitle}>No tickets yet</Text>
          <Text style={styles.emptyStateText}>
            You haven't submitted any support tickets.
          </Text>
        </View>
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
    <>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FAQs..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="x" size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FAQ Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="help-circle" size={20} color="#1A73E8" />
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        </View>

        {filteredFAQs.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="search" size={40} color="rgba(255,255,255,0.10)" />
            <Text style={styles.emptyStateTitle}>No results found</Text>
            <Text style={styles.emptyStateText}>
              Try searching with different keywords
            </Text>
          </View>
        ) : (
          filteredFAQs.map((faq) => (
            <FAQItem
              key={faq.id}
              item={faq}
              isExpanded={expandedFAQ === faq.id}
              onToggle={() => handleFAQToggle(faq.id)}
            />
          ))
        )}
      </View>

      {/* Submit Ticket Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="file-text" size={20} color="#1A73E8" />
          <Text style={styles.sectionTitle}>Submit a Ticket</Text>
        </View>

        <View style={styles.ticketCard}>
          <Text style={styles.ticketCardText}>
            Describe your issue and our support team will get back to you as soon as possible.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setActiveSection('submit')}
          >
            <Icon name="edit-3" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Submit a Support Ticket</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* View Ticket Status Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="list" size={20} color="#1A73E8" />
          <Text style={styles.sectionTitle}>View Ticket Status</Text>
        </View>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setActiveSection('tickets')}
        >
          <Icon name="clock" size={18} color="#1A73E8" />
          <Text style={styles.secondaryButtonText}>Check Ticket Status</Text>
          {tickets.filter((t) => t.status !== 'closed').length > 0 && (
            <View style={styles.ticketBadge}>
              <Text style={styles.ticketBadgeText}>
                {tickets.filter((t) => t.status !== 'closed').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Contact Support Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="phone" size={20} color="#1A73E8" />
          <Text style={styles.sectionTitle}>Contact Support</Text>
        </View>

        <View style={styles.contactList}>
          <ContactOption
            icon="mail"
            iconType="feather"
            title="Email Support"
            subtitle="support@parkingapp.com"
            onPress={handleEmailSupport}
            color="#3B82F6"
          />
          <ContactOption
            icon="phone"
            iconType="feather"
            title="Call Support"
            subtitle="+1 (234) 567-890"
            onPress={handleCallSupport}
            color="#10B981"
          />
          <ContactOption
            icon="message-circle"
            iconType="feather"
            title="Live Chat"
            subtitle="Available 24/7"
            onPress={handleLiveChat}
            color="#8B5CF6"
          />
        </View>
      </View>

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
    </>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (activeSection !== 'main') {
              setActiveSection('main');
            } else {
              navigation.goBack();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-left" size={20} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {activeSection === 'main' && renderMainContent()}
        {activeSection === 'submit' && renderSubmitTicketForm()}
        {activeSection === 'tickets' && renderTicketsList()}
      </ScrollView>

      {/* Success Modal */}
      {showSuccessModal ? (

        <View style={styles.modalOverlay}>
          <View pointerEvents="none" style={styles.modalBackdrop} />
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <Icon name="check" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.successTitle}>Ticket Submitted!</Text>
            <Text style={styles.successText}>
              We'll get back to you within 24 hours.
            </Text>
          </View>
        </View>
      
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: palette.text,
  },
  headerRight: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 5,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.surface,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: palette.text,
    marginLeft: 10,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  faqItem: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    marginBottom: 10,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    marginRight: 12,
  },
  faqAnswerContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.surface,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#A1A1AA',
    lineHeight: 22,
  },
  ticketCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ticketCardText: {
    fontSize: 14,
    color: '#A1A1AA',
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2E40',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0B0F0C',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#FF2E40',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF2E40',
  },
  ticketBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  ticketBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactList: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.surface,
  },
  contactIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  contactSubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    marginTop: 16,
  },
  footerLink: {
    paddingHorizontal: 12,
  },
  footerLinkText: {
    fontSize: 13,
    color: '#A1A1AA',
  },
  footerDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  // Form Styles
  formContainer: {
    padding: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B0F0C',
    marginBottom: 8,
    marginTop: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: palette.surface,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#FF2E40',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A1A1AA',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.surface,
  },
  textArea: {
    height: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2E40',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0B0F0C',
  },
  // Tickets Styles
  ticketsContainer: {
    padding: 16,
  },
  ticketItem: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 4,
  },
  ticketDescription: {
    fontSize: 13,
    color: '#A1A1AA',
    lineHeight: 18,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.surface,
    gap: 6,
  },
  ticketDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  // Empty State Styles
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A1A1AA',
    marginTop: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  // Modal Styles
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
    // The tint lives on modalBackdrop: a translucent background on this
    // elevated view let Android's shadow paint through as a lighter strip.
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  successModal: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 40,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
  },
});

export default HelpSupportPage;
