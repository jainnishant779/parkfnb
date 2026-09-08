import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { palette, fontStacks } from '../../theme';

// Benefits data for drivers
const driverBenefits = [
  {
    id: '1',
    icon: 'search',
    title: 'Find Parking Fast',
    description: 'Discover available spots near you in real-time with our smart map.',
  },
  {
    id: '2',
    icon: 'sliders',
    title: 'Filter by Preferences',
    description: 'Sort by price, distance, amenities, and vehicle type.',
  },
  {
    id: '3',
    icon: 'star',
    title: 'Trusted Reviews',
    description: 'Read genuine reviews and see photos before booking.',
  },
  {
    id: '4',
    icon: 'shield',
    title: 'Secure Payments',
    description: 'Pay safely with multiple payment options and instant receipts.',
  },
  {
    id: '5',
    icon: 'clock',
    title: 'Flexible Duration',
    description: 'Book hourly, daily, or long-term parking as per your needs.',
  },
];

// Benefits data for owners
const ownerBenefits = [
  {
    id: '1',
    icon: 'dollar-sign',
    title: 'Monetize Your Space',
    description: 'Turn your unused parking into a steady income stream.',
  },
  {
    id: '2',
    icon: 'calendar',
    title: 'Flexible Availability',
    description: 'Set your own schedule and pricing for maximum control.',
  },
  {
    id: '3',
    icon: 'bar-chart-2',
    title: 'Analytics Dashboard',
    description: 'Track earnings, bookings, and performance insights.',
  },
  {
    id: '4',
    icon: 'users',
    title: 'Verified Drivers',
    description: 'Only verified users can book your space for added security.',
  },
  {
    id: '5',
    icon: 'settings',
    title: 'Easy Management',
    description: 'Manage bookings, communicate with drivers, all in one place.',
  },
];

// How it works steps for drivers
const driverSteps = [
  {
    id: '1',
    title: 'Search & Discover',
    description: 'Find parking spots near your destination on the map.',
  },
  {
    id: '2',
    title: 'Compare & Choose',
    description: 'Review prices, ratings, and amenities to pick the best spot.',
  },
  {
    id: '3',
    title: 'Book & Pay',
    description: 'Reserve your spot instantly with secure payment.',
  },
  {
    id: '4',
    title: 'Navigate & Park',
    description: 'Get directions and park with ease using clear instructions.',
  },
];

// How it works steps for owners
const ownerSteps = [
  {
    id: '1',
    title: 'List Your Space',
    description: 'Add photos, set pricing, and describe your parking spot.',
  },
  {
    id: '2',
    title: 'Set Availability',
    description: 'Define when your space is available for bookings.',
  },
  {
    id: '3',
    title: 'Receive Bookings',
    description: 'Get notified when drivers book and manage reservations.',
  },
  {
    id: '4',
    title: 'Earn Money',
    description: 'Receive payments directly to your account after each booking.',
  },
];

// FAQ data
const faqData = [
  {
    id: '1',
    question: 'Is my personal data safe?',
    answer: 'Yes, we use industry-standard encryption to protect your personal information. Your data is stored securely and never shared with third parties without your consent.',
  },
  {
    id: '2',
    question: 'Can I book long-term parking?',
    answer: 'Absolutely! You can book parking for hours, days, weeks, or even months. Many spots offer discounted rates for longer durations.',
  },
  {
    id: '3',
    question: 'What types of vehicles are supported?',
    answer: 'We support all vehicle types including cars, motorcycles, SUVs, trucks, and even buses. Filter spots by vehicle type to find compatible parking.',
  },
  {
    id: '4',
    question: 'How do refunds work?',
    answer: 'Cancellations made before the booking start time are eligible for refunds based on the spot\'s cancellation policy. Refunds are processed within 5-7 business days.',
  },
  {
    id: '5',
    question: 'Can I list multiple parking spaces?',
    answer: 'Yes, space owners can list multiple parking spots from a single account. Each spot can have its own pricing, availability, and amenities.',
  },
];

// Trust features
const trustFeatures = [
  {
    id: '1',
    icon: 'user-check',
    title: 'Verified Profiles',
    description: 'KYC verification for trusted transactions',
  },
  {
    id: '2',
    icon: 'star',
    title: 'Ratings & Reviews',
    description: 'Transparent feedback from real users',
  },
  {
    id: '3',
    icon: 'lock',
    title: 'Secure Payments',
    description: 'Encrypted transactions & data protection',
  },
  {
    id: '4',
    icon: 'file-text',
    title: 'Clear Guidelines',
    description: 'Detailed parking rules & instructions',
  },
];

// App description
const appDescription = `ParkEase is a revolutionary parking platform that bridges the gap between drivers seeking convenient parking and space owners looking to monetize their unused spots.

Whether you're a daily commuter struggling to find parking near your office, a weekend traveler looking for safe overnight parking, or a property owner with an empty driveway, ParkEase has you covered.

Our mission is to make parking stress-free while helping communities utilize space more efficiently. With real-time availability, transparent pricing, and a trusted community of users, we're transforming how people think about parking.`;

// Segmented Control Component
const SegmentedControl = ({ segments, activeIndex, onPress }) => {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: activeIndex * 100,
      useNativeDriver: true,
      friction: 8,
    }).start();
  }, [activeIndex]);

  return (
    <View style={styles.segmentedContainer}>
      <Animated.View
        style={[
          styles.segmentedIndicator,
          {
            transform: [{ translateX: Animated.multiply(translateX, 1.55) }],
          },
        ]}
      />
      {segments.map((segment, index) => (
        <TouchableOpacity
          key={segment}
          style={styles.segmentButton}
          onPress={() => onPress(index)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.segmentText,
              activeIndex === index && styles.segmentTextActive,
            ]}
          >
            {segment}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Benefit Card Component
const BenefitCard = ({ icon, title, description, index }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.benefitCard,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.benefitIconContainer}>
        <Icon name={icon} size={20} color="#1A73E8" />
      </View>
      <View style={styles.benefitContent}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDescription}>{description}</Text>
      </View>
    </Animated.View>
  );
};

// Timeline Step Component
const TimelineStep = ({ step, title, description, isLast }) => {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={styles.timelineNumber}>
          <Text style={styles.timelineNumberText}>{step}</Text>
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineDescription}>{description}</Text>
      </View>
    </View>
  );
};

// FAQ Item Component
const FaqItem = ({ question, answer, isExpanded, onToggle }) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rotateAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(heightAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
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
      accessibilityLabel={question}
      accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to expand'}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-down" size={20} color="#A1A1AA" />
        </Animated.View>
      </View>
      {isExpanded && (
        <Animated.View style={[styles.faqAnswerContainer, { opacity: heightAnim }]}>
          <Text style={styles.faqAnswer}>{answer}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

// Trust Card Component
const TrustCard = ({ icon, title, description }) => {
  return (
    <View style={styles.trustCard}>
      <View style={styles.trustIconContainer}>
        <Icon name={icon} size={18} color="#1A73E8" />
      </View>
      <Text style={styles.trustTitle}>{title}</Text>
      <Text style={styles.trustDescription}>{description}</Text>
    </View>
  );
};

// Info Banner Component
const InfoBanner = ({ onDismiss }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.infoBanner, { opacity: fadeAnim }]}>
      <View style={styles.infoBannerContent}>
        <Icon name="info" size={18} color="#1A73E8" />
        <Text style={styles.infoBannerText}>
          New here? Learn what makes ParkEase different.
        </Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={styles.infoBannerClose}>
        <Icon name="x" size={16} color="#A1A1AA" />
      </TouchableOpacity>
    </Animated.View>
  );
};

// Main About Page Component
const AboutPage = ({ navigation }) => {
  const [activeSegment, setActiveSegment] = useState(0);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Animate on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSegmentChange = useCallback((index) => {
    setActiveSegment(index);
  }, []);

  const handleDismissBanner = useCallback(() => {
    setShowBanner(false);
  }, []);

  const handleFaqToggle = useCallback((id) => {
    setExpandedFaq((prev) => (prev === id ? null : id));
  }, []);

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@parkease.com?subject=Support%20Request');
  };

  const handleViewPrivacy = () => {
    console.log('Navigate to Privacy Policy');
  };

  const currentBenefits = activeSegment === 0 ? driverBenefits : ownerBenefits;
  const currentSteps = activeSegment === 0 ? driverSteps : ownerSteps;

  const truncatedDescription = appDescription.split('\n\n')[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info Banner */}
        {showBanner && <InfoBanner onDismiss={handleDismissBanner} />}

        {/* Brand Section */}
        <Animated.View
          style={[
            styles.brandSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.logoContainer}>
            <MaterialIcon name="parking" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>ParkEase</Text>
          <Text style={styles.tagline}>
            Your parking, simplified. Anywhere, anytime.
          </Text>
        </Animated.View>

        {/* App Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What is ParkEase?</Text>
          <Text style={styles.descriptionText}>
            {showFullDescription ? appDescription : truncatedDescription}
          </Text>
          <TouchableOpacity
            onPress={() => setShowFullDescription(!showFullDescription)}
            style={styles.readMoreButton}
          >
            <Text style={styles.readMoreText}>
              {showFullDescription ? 'Read less' : 'Read more'}
            </Text>
            <Icon
              name={showFullDescription ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#1A73E8"
            />
          </TouchableOpacity>
        </View>

        {/* Segmented Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Explore Benefits</Text>
          <SegmentedControl
            segments={['For Drivers', 'For Owners']}
            activeIndex={activeSegment}
            onPress={handleSegmentChange}
          />

          {/* Benefits */}
          <View style={styles.benefitsContainer} key={activeSegment}>
            {currentBenefits.map((benefit, index) => (
              <BenefitCard
                key={benefit.id}
                icon={benefit.icon}
                title={benefit.title}
                description={benefit.description}
                index={index}
              />
            ))}
          </View>
        </View>

        {/* How it Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.timelineContainer}>
            {currentSteps.map((step, index) => (
              <TimelineStep
                key={step.id}
                step={step.id}
                title={step.title}
                description={step.description}
                isLast={index === currentSteps.length - 1}
              />
            ))}
          </View>
        </View>

        {/* Trust & Safety */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trust & Safety</Text>
          <View style={styles.trustGrid}>
            {trustFeatures.map((feature) => (
              <TrustCard
                key={feature.id}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </View>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqData.map((faq) => (
            <FaqItem
              key={faq.id}
              question={faq.question}
              answer={faq.answer}
              isExpanded={expandedFaq === faq.id}
              onToggle={() => handleFaqToggle(faq.id)}
            />
          ))}
        </View>

        {/* Contact & Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Need Help?</Text>
          <View style={styles.contactContainer}>
            <TouchableOpacity
              style={styles.contactOption}
              onPress={handleContactSupport}
              activeOpacity={0.7}
            >
              <View style={[styles.contactIconContainer, { backgroundColor: '#3B82F615' }]}>
                <Icon name="mail" size={20} color="#3B82F6" />
              </View>
              <View style={styles.contactTextContainer}>
                <Text style={styles.contactTitle}>Contact Support</Text>
                <Text style={styles.contactSubtitle}>support@parkease.com</Text>
              </View>
              <Icon name="chevron-right" size={20} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactOption}
              onPress={() => navigation.navigate('HelpSupport')}
              activeOpacity={0.7}
            >
              <View style={[styles.contactIconContainer, { backgroundColor: '#8B5CF615' }]}>
                <Icon name="help-circle" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.contactTextContainer}>
                <Text style={styles.contactTitle}>Help Center</Text>
                <Text style={styles.contactSubtitle}>FAQs & guides</Text>
              </View>
              <Icon name="chevron-right" size={20} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactOption}
              onPress={handleViewPrivacy}
              activeOpacity={0.7}
            >
              <View style={[styles.contactIconContainer, { backgroundColor: '#10B98115' }]}>
                <Icon name="shield" size={20} color="#10B981" />
              </View>
              <View style={styles.contactTextContainer}>
                <Text style={styles.contactTitle}>Privacy Policy</Text>
                <Text style={styles.contactSubtitle}>How we protect your data</Text>
              </View>
              <Icon name="chevron-right" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Version & Meta */}
        <View style={styles.metaSection}>
          <View style={styles.metaLogoSmall}>
            <MaterialIcon name="parking" size={20} color="#1A73E8" />
          </View>
          <Text style={styles.metaAppName}>ParkEase</Text>
          <Text style={styles.metaVersion}>Version 1.0.0 (Stable)</Text>
          <Text style={styles.metaCopyright}>
            © 2024 ParkEase. All rights reserved.
          </Text>
          <Text style={styles.metaTagline}>
            Made with care for drivers & space owners
          </Text>
        </View>
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fontStacks.regular,
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: -0.4,
    color: palette.text,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,46,64,0.12)',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
  },
  infoBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  infoBannerText: {
    fontSize: 13,
    color: '#FF2E40',
    fontWeight: '500',
    flex: 1,
  },
  infoBannerClose: {
    padding: 4,
  },

  // Brand Section
  brandSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#FF2E40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#FF2E40',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#A1A1AA',
    textAlign: 'center',
  },

  // Section
  section: {
    backgroundColor: palette.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 16,
  },

  // Description
  descriptionText: {
    fontSize: 14,
    color: '#A1A1AA',
    lineHeight: 22,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF2E40',
  },

  // Segmented Control
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    position: 'relative',
  },
  segmentedIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: '48%',
    height: '100%',
    backgroundColor: palette.surface,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    zIndex: 1,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  segmentTextActive: {
    color: '#FF2E40',
  },

  // Benefits
  benefitsContainer: {
    gap: 12,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.surface,
    padding: 14,
    borderRadius: 12,
  },
  benefitIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,46,64,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
    marginLeft: 12,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 13,
    color: '#A1A1AA',
    lineHeight: 18,
  },

  // Timeline
  timelineContainer: {
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineLeft: {
    alignItems: 'center',
    width: 40,
  },
  timelineNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF2E40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: palette.surface,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 24,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 4,
  },
  timelineDescription: {
    fontSize: 13,
    color: '#A1A1AA',
    lineHeight: 18,
  },

  // Trust
  trustGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  trustCard: {
    width: '47%',
    backgroundColor: palette.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  trustIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,46,64,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  trustTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  trustDescription: {
    fontSize: 11,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 16,
  },

  // FAQ
  faqItem: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    marginBottom: 10,
    padding: 16,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
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
    fontSize: 13,
    color: '#A1A1AA',
    lineHeight: 20,
  },

  // Contact
  contactContainer: {
    gap: 12,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: 14,
    borderRadius: 12,
  },
  contactIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
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

  // Meta Section
  metaSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  metaLogoSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,46,64,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaAppName: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 4,
  },
  metaVersion: {
    fontSize: 13,
    color: '#A1A1AA',
    marginBottom: 4,
  },
  metaCopyright: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  metaTagline: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
});

export default AboutPage;
