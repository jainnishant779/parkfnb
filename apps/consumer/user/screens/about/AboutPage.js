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
import { palette, radii, spacing, fonts, typography } from '../../theme';
import {
  T,
  Card,
  ScreenHeader,
  SectionTitle,
  ListRow,
  TimelineItem,
  Segmented,
  IsoBlock,
} from '../../components/ui';

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
    icon: 'trending-up',
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
const appDescription = `Parkfnb is a revolutionary parking platform that bridges the gap between drivers seeking convenient parking and space owners looking to monetize their unused spots.

Whether you're a daily commuter struggling to find parking near your office, a weekend traveler looking for safe overnight parking, or a property owner with an empty driveway, Parkfnb has you covered.

Our mission is to make parking stress-free while helping communities utilize space more efficiently. With real-time availability, transparent pricing, and a trusted community of users, we're transforming how people think about parking.`;

const SEGMENTS = [
  { id: 0, label: 'For Drivers' },
  { id: 1, label: 'For Owners' },
];

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
  }, [fadeAnim, index, translateY]);

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
      <View style={styles.iconCircle}>
        <Icon name={icon} size={19} color={palette.text} />
      </View>
      <View style={styles.benefitContent}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDescription}>{description}</Text>
      </View>
    </Animated.View>
  );
};

// FAQ Item Component
const FaqItem = ({ question, answer, isExpanded, onToggle, isLast }) => {
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
  }, [isExpanded, heightAnim, rotateAnim]);

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
      accessibilityLabel={question}
      accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to expand'}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={[styles.faqChevron, { transform: [{ rotate }] }]}>
          <Icon name="chevron-down" size={18} color={palette.text} />
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
      <View style={[styles.iconCircle, styles.trustIcon]}>
        <Icon name={icon} size={18} color={palette.text} />
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
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.infoBanner, { opacity: fadeAnim }]}>
      <View style={styles.infoBannerIcon}>
        <Icon name="info" size={16} color={palette.textInverse} />
      </View>
      <Text style={styles.infoBannerText}>
        New here? Learn what makes Parkfnb different.
      </Text>
      <TouchableOpacity onPress={onDismiss} style={styles.infoBannerClose} hitSlop={8}>
        <Icon name="x" size={16} color={palette.textMuted} />
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
  }, [fadeAnim, slideAnim]);

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
      <ScreenHeader title="About" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info Banner */}
        {showBanner && <InfoBanner onDismiss={handleDismissBanner} />}

        {/* Brand hero */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <Card tone="blue" style={styles.hero}>
            <View style={styles.heroText}>
              <Text style={styles.wordmark}>parkfnb.</Text>
              <T variant="body" style={styles.tagline}>
                Your parking, simplified. Anywhere, anytime.
              </T>
            </View>
            <View style={styles.heroArt} pointerEvents="none">
              <IsoBlock size={150} tone="blue" />
            </View>
          </Card>
        </Animated.View>

        {/* App Summary */}
        <Card style={styles.cardGap}>
          <T variant="h3" style={styles.cardTitle}>What is Parkfnb?</T>
          <Text style={styles.descriptionText}>
            {showFullDescription ? appDescription : truncatedDescription}
          </Text>
          <TouchableOpacity
            onPress={() => setShowFullDescription(!showFullDescription)}
            style={styles.readMoreButton}
            activeOpacity={0.7}
          >
            <Text style={styles.readMoreText}>
              {showFullDescription ? 'Read less' : 'Read more'}
            </Text>
            <Icon
              name={showFullDescription ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={palette.text}
            />
          </TouchableOpacity>
        </Card>

        {/* Benefits */}
        <SectionTitle title="Explore benefits" style={styles.sectionTitle} />
        <Segmented
          options={SEGMENTS}
          value={activeSegment}
          onChange={handleSegmentChange}
          style={styles.segmented}
        />
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

        {/* How it Works */}
        <SectionTitle title="How it works" style={styles.sectionTitle} />
        <Card>
          {currentSteps.map((step, index) => (
            <TimelineItem
              key={step.id}
              title={step.title}
              subtitle={step.description}
              date={`Step ${step.id}`}
              active={index === 0}
              isLast={index === currentSteps.length - 1}
            />
          ))}
        </Card>

        {/* Trust & Safety */}
        <SectionTitle title="Trust & safety" style={styles.sectionTitle} />
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

        {/* FAQ Section */}
        <SectionTitle title="Frequently asked" style={styles.sectionTitle} />
        <Card style={styles.listCard}>
          {faqData.map((faq, index) => (
            <FaqItem
              key={faq.id}
              question={faq.question}
              answer={faq.answer}
              isExpanded={expandedFaq === faq.id}
              onToggle={() => handleFaqToggle(faq.id)}
              isLast={index === faqData.length - 1}
            />
          ))}
        </Card>

        {/* Contact & Support */}
        <SectionTitle title="Need help?" style={styles.sectionTitle} />
        <Card style={styles.listCard}>
          <ListRow
            icon="mail"
            title="Contact Support"
            subtitle="support@parkease.com"
            onPress={handleContactSupport}
          />
          <ListRow
            icon="help-circle"
            title="Help Center"
            subtitle="FAQs & guides"
            onPress={() => navigation.navigate('HelpSupport')}
          />
          <ListRow
            icon="shield"
            title="Privacy Policy"
            subtitle="How we protect your data"
            onPress={handleViewPrivacy}
            isLast
          />
        </Card>

        {/* App Version & Meta */}
        <View style={styles.metaSection}>
          <Text style={styles.metaAppName}>parkfnb.</Text>
          <Text style={styles.metaVersion}>Version 1.0.0 (Stable)</Text>
          <Text style={styles.metaCopyright}>© 2024 Parkfnb. All rights reserved.</Text>
          <Text style={styles.metaTagline}>Made with care for drivers & space owners</Text>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    marginBottom: spacing.md,
  },
  infoBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoBannerText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 13,
    color: palette.text,
  },
  infoBannerClose: {
    padding: 4,
    marginLeft: spacing.sm,
  },

  // Hero
  hero: {
    minHeight: 190,
    justifyContent: 'center',
  },
  heroText: {
    maxWidth: '62%',
  },
  wordmark: {
    ...fonts.bold,
    fontSize: 40,
    letterSpacing: -1.2,
    lineHeight: 46,
    color: palette.text,
  },
  tagline: {
    marginTop: spacing.sm,
    color: palette.inkSoft,
  },
  heroArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },

  cardGap: {
    marginTop: spacing.lg,
  },
  cardTitle: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },

  // Description
  descriptionText: {
    ...typography.bodySmall,
    fontSize: 14,
    lineHeight: 21,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    gap: 4,
  },
  readMoreText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },

  // Segmented
  segmented: {
    backgroundColor: palette.bgSoft,
    marginBottom: spacing.md,
  },

  // Shared grey icon circle
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Benefits
  benefitsContainer: {
    gap: spacing.sm,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: spacing.lg,
    borderRadius: radii.xl,
  },
  benefitContent: {
    flex: 1,
    marginLeft: 14,
  },
  benefitTitle: {
    ...fonts.semibold,
    fontSize: 15.5,
    color: palette.text,
    marginBottom: 2,
  },
  benefitDescription: {
    ...typography.bodySmall,
  },

  // Trust
  trustGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  trustCard: {
    width: '48.5%',
    backgroundColor: palette.surface,
    padding: spacing.lg,
    borderRadius: radii.xl,
  },
  trustIcon: {
    marginBottom: spacing.md,
  },
  trustTitle: {
    ...fonts.semibold,
    fontSize: 14.5,
    color: palette.text,
    marginBottom: 4,
  },
  trustDescription: {
    ...fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textMuted,
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

  // Meta
  metaSection: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  metaAppName: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginBottom: 6,
  },
  metaVersion: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginBottom: 4,
  },
  metaCopyright: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginBottom: spacing.sm,
  },
  metaTagline: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textSubtle,
  },
});

export default AboutPage;
