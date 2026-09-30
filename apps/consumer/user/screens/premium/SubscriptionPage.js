import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { palette, radii, spacing, fonts } from '../../theme';
import {
  T,
  Card,
  PillButton,
  IconCircle,
  Field,
  ScreenHeader,
  SectionTitle,
  StatusTag,
  InfoGrid,
  ListRow,
  Segmented,
  IsoBlock,
} from '../../components/ui';
import SheetModal from '../../components/ui/SheetModal';

// Sample subscription plans data
const subscriptionPlans = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'Essential parking features',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      { name: 'Standard Booking', included: true, icon: 'calendar' },
      { name: 'Basic Search', included: true, icon: 'search' },
      { name: 'Payment History', included: true, icon: 'file-text' },
      { name: 'Priority Booking', included: false, icon: 'zap' },
      { name: 'Reserved Slots', included: false, icon: 'bookmark' },
      { name: 'EV Charging', included: false, icon: 'battery-charging' },
      { name: 'Premium Support', included: false, icon: 'headphones' },
      { name: 'No Ads', included: false, icon: 'eye-off' },
    ],
    popular: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Most popular choice',
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    features: [
      { name: 'Standard Booking', included: true, icon: 'calendar' },
      { name: 'Advanced Search', included: true, icon: 'search' },
      { name: 'Payment History', included: true, icon: 'file-text' },
      { name: 'Priority Booking', included: true, icon: 'zap' },
      { name: 'Reserved Slots', included: true, icon: 'bookmark' },
      { name: 'EV Charging', included: false, icon: 'battery-charging' },
      { name: 'Premium Support', included: true, icon: 'headphones' },
      { name: 'No Ads', included: true, icon: 'eye-off' },
    ],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Ultimate parking experience',
    monthlyPrice: 19.99,
    yearlyPrice: 199.99,
    features: [
      { name: 'Standard Booking', included: true, icon: 'calendar' },
      { name: 'Advanced Search', included: true, icon: 'search' },
      { name: 'Payment History', included: true, icon: 'file-text' },
      { name: 'Priority Booking', included: true, icon: 'zap' },
      { name: 'Reserved Slots', included: true, icon: 'bookmark' },
      { name: 'EV Charging', included: true, icon: 'battery-charging' },
      { name: 'Premium Support', included: true, icon: 'headphones' },
      { name: 'No Ads', included: true, icon: 'eye-off' },
    ],
    popular: false,
  },
];

// Visual treatment per plan: card fill, illustration tone, badge icon.
const PLAN_LOOK = {
  basic: { bg: palette.surface, iso: 'grey', icon: 'box' },
  premium: { bg: palette.peachSoft, iso: 'peach', icon: 'award' },
  pro: { bg: palette.blueSoft, iso: 'blue', icon: 'star' },
};

// Sample FAQ data
const faqData = [
  {
    id: '1',
    question: 'How do I upgrade my subscription?',
    answer: 'You can upgrade your subscription at any time by selecting a higher-tier plan from this page. Your new benefits will be available immediately, and you\'ll be charged the prorated difference.',
  },
  {
    id: '2',
    question: 'Can I cancel my subscription?',
    answer: 'Yes, you can cancel your subscription at any time. Your premium features will remain active until the end of your current billing period.',
  },
  {
    id: '3',
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, and Google Pay.',
  },
  {
    id: '4',
    question: 'Is there a free trial available?',
    answer: 'Yes! New users can try our Premium plan free for 7 days. No credit card required to start your trial.',
  },
  {
    id: '5',
    question: 'What happens when my subscription expires?',
    answer: 'When your subscription expires, you\'ll automatically be downgraded to the Basic plan. Your booking history and account data will be preserved.',
  },
  {
    id: '6',
    question: 'Can I get a refund?',
    answer: 'We offer a 30-day money-back guarantee for annual subscriptions. Monthly subscriptions are non-refundable but can be cancelled anytime.',
  },
];

// Payment methods data
const paymentMethods = [
  { id: '1', type: 'visa', last4: '4242', expiry: '12/25', isDefault: true },
  { id: '2', type: 'mastercard', last4: '8888', expiry: '06/26', isDefault: false },
];

const BILLING_OPTIONS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly  (save 17%)' },
];

const cardLabel = (method) =>
  `${method.type.charAt(0).toUpperCase() + method.type.slice(1)} ****${method.last4}`;

// Bottom sheet shell: fading backdrop, sliding white sheet with grabber.
const Sheet = ({ visible, onClose, children, style }) => (
  <SheetModal visible={visible} onClose={onClose} style={style}>
    {children}
  </SheetModal>
);

const SheetHeader = ({ title, onClose }) => (
  <View style={styles.sheetHeader}>
    <Text style={styles.sheetTitle}>{title}</Text>
    <IconCircle icon="x" size={40} variant="grey" onPress={onClose} />
  </View>
);

const SubscriptionPage = ({ navigation }) => {
  // State management
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' or 'yearly'
  const [currentPlan, setCurrentPlan] = useState('basic'); // User's current active plan
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Animate cards when billing cycle changes
  useEffect(() => {
    // Reset animation values
    fadeAnim.setValue(0.7);
    slideAnim.setValue(10);

    // Animate back
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [billingCycle, fadeAnim, slideAnim]);

  // Calculate savings for yearly billing
  const calculateSavings = (plan) => {
    const monthlyCost = plan.monthlyPrice * 12;
    const yearlyCost = plan.yearlyPrice;
    return monthlyCost - yearlyCost;
  };

  // Get current plan details
  const currentPlanDetails = useMemo(() => {
    return subscriptionPlans.find(p => p.id === currentPlan);
  }, [currentPlan]);

  // Apply promo code
  const handleApplyPromo = () => {
    if (promoCode.toUpperCase() === 'PARK10') {
      setPromoApplied(true);
      setPromoDiscount(10);
    } else if (promoCode.toUpperCase() === 'FIRST50') {
      setPromoApplied(true);
      setPromoDiscount(50);
    } else {
      setPromoApplied(false);
      setPromoDiscount(0);
    }
  };

  // Handle subscription action
  const handleSubscribe = (plan) => {
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  // Confirm subscription
  const confirmSubscription = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setCurrentPlan(selectedPlan.id);
      setShowPaymentModal(false);
      setSelectedPlan(null);
    }, 2000);
  };

  // Handle plan management actions
  const handleManageAction = (action) => {
    setConfirmAction(action);
    setShowManageModal(false);
    setShowConfirmModal(true);
  };

  // Confirm management action
  const confirmManageAction = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      if (confirmAction === 'cancel') {
        setCurrentPlan('basic');
      }
      setShowConfirmModal(false);
      setConfirmAction(null);
    }, 1500);
  };

  // Render trial banner
  const renderTrialBanner = () => {
    if (currentPlan !== 'basic') return null;

    return (
      <Card tone={palette.ink} style={styles.trialCard}>
        <View style={styles.trialIcon}>
          <Icon name="gift" size={22} color={palette.textInverse} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.trialTitle}>Try Premium free for 7 days</Text>
          <Text style={styles.trialSubtitle}>No credit card required</Text>
        </View>
        <PillButton label="Start trial" variant="white" size="sm" />
      </Card>
    );
  };

  // Render subscription card
  const renderPlanCard = (plan) => {
    const look = PLAN_LOOK[plan.id] || PLAN_LOOK.basic;
    const isCurrentPlan = currentPlan === plan.id;
    const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
    const savings = calculateSavings(plan);
    const isFree = price === 0;
    const ctaLabel = isCurrentPlan
      ? 'Manage'
      : currentPlan === 'basic'
        ? (isFree ? 'Current' : 'Subscribe')
        : subscriptionPlans.findIndex(p => p.id === plan.id) >
            subscriptionPlans.findIndex(p => p.id === currentPlan)
          ? 'Upgrade'
          : 'Downgrade';

    return (
      <Animated.View
        key={plan.id}
        style={[
          styles.planCard,
          { backgroundColor: look.bg },
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View pointerEvents="none" style={styles.planArt}>
          <IsoBlock size={140} tone={look.iso} />
        </View>

        <View style={styles.planTopRow}>
          <View style={styles.planIcon}>
            <Icon name={look.icon} size={20} color={palette.text} />
          </View>
          {isCurrentPlan ? (
            <StatusTag label="Current" tone="ink" />
          ) : plan.popular ? (
            <StatusTag label="Popular" tone="white" />
          ) : null}
        </View>

        <Text style={styles.planName}>{plan.name}</Text>
        <Text style={styles.planDescription} numberOfLines={1}>
          {plan.description}
        </Text>

        <View style={styles.priceRow}>
          {isFree ? (
            <Text style={styles.priceAmount}>Free</Text>
          ) : (
            <>
              <Text style={styles.priceAmount}>₹{Math.round(price)}</Text>
              <Text style={styles.pricePeriod}>
                /{billingCycle === 'monthly' ? 'mo' : 'yr'}
              </Text>
            </>
          )}
        </View>
        {billingCycle === 'yearly' && savings > 0 && (
          <Text style={styles.savingsText}>Save ₹{Math.round(savings)} / yr</Text>
        )}

        <View style={styles.featureList}>
          {plan.features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <Icon
                name={feature.included ? 'check' : 'x'}
                size={16}
                color={feature.included ? palette.ink : palette.textSubtle}
              />
              <Text
                style={[styles.featureText, !feature.included && styles.featureTextOff]}
                numberOfLines={1}
              >
                {feature.name}
              </Text>
            </View>
          ))}
        </View>

        {isCurrentPlan ? (
          <PillButton
            label="Manage plan"
            icon="check-circle"
            variant="white"
            size="md"
            onPress={() => setShowManageModal(true)}
            style={[styles.planCta, plan.id === 'basic' && styles.planCtaOutline]}
          />
        ) : (
          <PillButton
            label={ctaLabel}
            iconRight="arrow-right"
            variant="ink"
            size="md"
            onPress={() => handleSubscribe(plan)}
            style={styles.planCta}
          />
        )}
      </Animated.View>
    );
  };

  // Render current subscription status
  const renderCurrentStatus = () => {
    if (currentPlan === 'basic') return null;

    return (
      <Card style={styles.block}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Your subscription</Text>
          <StatusTag label="Active" tone="success" />
        </View>

        <InfoGrid
          style={styles.statusGrid}
          items={[
            { label: 'Plan', value: currentPlanDetails?.name },
            { label: 'Billing cycle', value: billingCycle === 'monthly' ? 'Monthly' : 'Yearly' },
            { label: 'Next billing', value: 'Jan 15, 2026' },
            {
              label: 'Amount',
              value: `₹${billingCycle === 'monthly'
                ? currentPlanDetails?.monthlyPrice.toFixed(2)
                : currentPlanDetails?.yearlyPrice.toFixed(2)}`,
            },
          ]}
        />

        <View style={styles.pillRow}>
          <PillButton
            label="Change plan"
            icon="edit-2"
            variant="grey"
            size="md"
            style={styles.flex1}
            onPress={() => setShowManageModal(true)}
          />
          <PillButton
            label="Cancel"
            icon="x-circle"
            variant="danger"
            size="md"
            style={styles.flex1}
            onPress={() => handleManageAction('cancel')}
          />
        </View>
      </Card>
    );
  };

  // Render promo section
  const renderPromoSection = () => (
    <Card style={styles.block}>
      <View style={styles.promoHeader}>
        <Icon name="tag" size={18} color={palette.text} />
        <Text style={styles.cardTitleSmall}>Have a promo code?</Text>
      </View>
      <Field
        icon="percent"
        placeholder="Enter promo code"
        value={promoCode}
        onChangeText={setPromoCode}
        autoCapitalize="characters"
        right={
          <PillButton
            label="Apply"
            variant="ink"
            size="sm"
            onPress={handleApplyPromo}
            disabled={!promoCode}
          />
        }
      />
      {promoApplied && (
        <View style={styles.promoSuccess}>
          <Icon name="check-circle" size={16} color={palette.success} />
          <Text style={styles.promoSuccessText}>
            {promoDiscount}% discount applied!
          </Text>
        </View>
      )}
      <Text style={styles.promoHint}>Try: PARK10 or FIRST50</Text>
    </Card>
  );

  // Render payment methods section
  const renderPaymentMethods = () => (
    <View style={styles.block}>
      <SectionTitle title="Payment methods" action="Add new" onAction={() => {}} />
      <Card style={styles.listCard}>
        {paymentMethods.map((method, i) => (
          <ListRow
            key={method.id}
            icon="credit-card"
            title={cardLabel(method)}
            subtitle={`Expires ${method.expiry}`}
            isLast={i === paymentMethods.length - 1}
            right={
              <View style={styles.rowRight}>
                {method.isDefault && <StatusTag label="Default" tone="ink" />}
                <TouchableOpacity hitSlop={8} activeOpacity={0.6} style={styles.rowMenu}>
                  <Icon name="more-vertical" size={18} color={palette.textSubtle} />
                </TouchableOpacity>
              </View>
            }
          />
        ))}
      </Card>
    </View>
  );

  // Render FAQ section
  const renderFaqSection = () => (
    <View style={styles.block}>
      <SectionTitle title="Frequently asked questions" />
      <Card style={styles.listCard}>
        {faqData.map((faq, i) => {
          const open = expandedFaq === faq.id;
          return (
            <TouchableOpacity
              key={faq.id}
              style={[styles.faqItem, i < faqData.length - 1 && styles.faqDivider]}
              onPress={() => setExpandedFaq(open ? null : faq.id)}
              activeOpacity={0.7}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <Icon
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={palette.textSubtle}
                />
              </View>
              {open && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
            </TouchableOpacity>
          );
        })}
      </Card>
    </View>
  );

  // Render payment modal
  const renderPaymentModal = () => {
    const base = selectedPlan
      ? (billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.yearlyPrice)
      : 0;
    const look = selectedPlan ? PLAN_LOOK[selectedPlan.id] || PLAN_LOOK.basic : PLAN_LOOK.basic;
    return (
      <Sheet
        visible={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        style={styles.sheetTall}
      >
        <SheetHeader title="Confirm subscription" onClose={() => setShowPaymentModal(false)} />

        {selectedPlan && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: look.bg === palette.surface ? palette.surfaceDim : look.bg }]}>
              <View style={styles.summaryIcon}>
                <Icon name={look.icon} size={22} color={palette.text} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.summaryName}>{selectedPlan.name} plan</Text>
                <Text style={styles.summaryCycle}>
                  {billingCycle === 'monthly' ? 'Monthly' : 'Yearly'} billing
                </Text>
              </View>
            </View>

            <View style={styles.pricingCard}>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>Subtotal</Text>
                <Text style={styles.pricingValue}>₹{base.toFixed(2)}</Text>
              </View>
              {promoApplied && (
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>Promo discount ({promoDiscount}%)</Text>
                  <Text style={[styles.pricingValue, { color: palette.success }]}>
                    -₹{(base * promoDiscount / 100).toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.pricingDivider} />
              <View style={[styles.pricingRow, styles.pricingRowLast]}>
                <Text style={styles.pricingTotalLabel}>Total</Text>
                <Text style={styles.pricingTotalValue}>
                  ₹{(base * (1 - promoDiscount / 100)).toFixed(2)}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Payment method</Text>
            {paymentMethods.filter(m => m.isDefault).map((method) => (
              <View key={method.id} style={styles.selectedPayment}>
                <Icon name="credit-card" size={18} color={palette.text} />
                <Text style={styles.selectedPaymentText}>{cardLabel(method)}</Text>
                <TouchableOpacity hitSlop={8} activeOpacity={0.6}>
                  <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
            ))}

            <PillButton
              label={isProcessing
                ? 'Processing...'
                : `Subscribe for ₹${(base * (1 - promoDiscount / 100)).toFixed(2)}`}
              variant="ink"
              onPress={confirmSubscription}
              disabled={isProcessing}
              style={styles.sheetCta}
            />

            <Text style={styles.disclaimer}>
              By subscribing, you agree to our Terms of Service and Privacy Policy.
              You can cancel anytime from your account settings.
            </Text>
          </>
        )}
      </Sheet>
    );
  };

  // Render manage subscription modal
  const renderManageModal = () => (
    <Sheet visible={showManageModal} onClose={() => setShowManageModal(false)}>
      <SheetHeader title="Manage subscription" onClose={() => setShowManageModal(false)} />
      <ListRow
        icon="refresh-cw"
        title="Change billing cycle"
        subtitle={`Switch to ${billingCycle === 'monthly' ? 'yearly' : 'monthly'} billing`}
        onPress={() => {
          setShowManageModal(false);
          setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly');
        }}
      />
      <ListRow
        icon="credit-card"
        title="Update payment method"
        subtitle="Change your default card"
        onPress={() => {
          setShowManageModal(false);
          // Navigate to payment methods
        }}
      />
      <ListRow
        icon="rotate-cw"
        title="Renew now"
        subtitle="Extend your subscription early"
        onPress={() => handleManageAction('renew')}
      />
      <ListRow
        icon="x-circle"
        title="Cancel subscription"
        subtitle="Access continues until billing period ends"
        danger
        isLast
        onPress={() => handleManageAction('cancel')}
      />
    </Sheet>
  );

  // Render confirm action modal
  const renderConfirmModal = () => {
    const isCancel = confirmAction === 'cancel';
    return (
      <Sheet visible={showConfirmModal} onClose={() => setShowConfirmModal(false)}>
        <View style={styles.confirmBody}>
          <View style={[styles.confirmIcon, { backgroundColor: isCancel ? palette.dangerSoft : palette.successSoft }]}>
            <Icon
              name={isCancel ? 'alert-triangle' : 'check-circle'}
              size={30}
              color={isCancel ? palette.danger : palette.success}
            />
          </View>
          <Text style={styles.confirmTitle}>
            {isCancel ? 'Cancel Subscription?' : 'Renew Subscription?'}
          </Text>
          <Text style={styles.confirmMessage}>
            {isCancel
              ? 'Your premium features will remain active until the end of your current billing period. You can resubscribe anytime.'
              : 'Your subscription will be renewed immediately and you\'ll be charged for the next billing period.'}
          </Text>
        </View>

        <View style={styles.pillRow}>
          <PillButton
            label="Go Back"
            variant="grey"
            style={styles.flex1}
            onPress={() => setShowConfirmModal(false)}
          />
          <PillButton
            label={isProcessing ? 'Processing...' : isCancel ? 'Yes, Cancel' : 'Renew Now'}
            variant="ink"
            style={styles.flex1}
            onPress={confirmManageAction}
            disabled={isProcessing}
          />
        </View>
      </Sheet>
    );
  };

  // Render feature comparison modal
  const renderCompareModal = () => (
    <Sheet
      visible={showCompareModal}
      onClose={() => setShowCompareModal(false)}
      style={styles.sheetTall}
    >
      <SheetHeader title="Compare plans" onClose={() => setShowCompareModal(false)} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.compareHeaderRow}>
          <View style={styles.compareFeatureCell}>
            <Text style={styles.compareHeadMuted}>Features</Text>
          </View>
          {subscriptionPlans.map((plan) => (
            <View key={plan.id} style={styles.comparePlanCell}>
              <Text style={styles.compareHead}>{plan.name}</Text>
            </View>
          ))}
        </View>

        {subscriptionPlans[0].features.map((feature, index) => (
          <View key={index} style={styles.compareRow}>
            <View style={styles.compareFeatureCell}>
              <Icon name={feature.icon} size={15} color={palette.textMuted} />
              <Text style={styles.compareFeatureName}>{feature.name}</Text>
            </View>
            {subscriptionPlans.map((plan) => (
              <View key={plan.id} style={styles.comparePlanCell}>
                <Icon
                  name={plan.features[index].included ? 'check' : 'x'}
                  size={18}
                  color={plan.features[index].included ? palette.ink : palette.textSubtle}
                />
              </View>
            ))}
          </View>
        ))}

        <View style={[styles.compareRow, styles.comparePriceRow]}>
          <View style={styles.compareFeatureCell}>
            <Text style={styles.comparePriceLabel}>
              {billingCycle === 'monthly' ? 'Monthly' : 'Yearly'} price
            </Text>
          </View>
          {subscriptionPlans.map((plan) => (
            <View key={plan.id} style={styles.comparePlanCell}>
              <Text style={styles.comparePriceValue}>
                {plan.monthlyPrice === 0
                  ? 'Free'
                  : `₹${(billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice).toFixed(2)}`}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      <ScreenHeader
        title="Plans"
        onBack={() => navigation.goBack()}
        right={<IconCircle icon="help-circle" size={40} onPress={() => {}} />}
      />

      <ScrollView
        style={styles.flex1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <T variant="h1" style={styles.heroTitle}>Choose your plan</T>
        <T variant="bodySmall" style={styles.heroSub}>
          Upgrade anytime. Cancel whenever you like.
        </T>

        {renderTrialBanner()}
        {renderCurrentStatus()}

        <Segmented
          options={BILLING_OPTIONS}
          value={billingCycle}
          onChange={setBillingCycle}
          style={styles.block}
        />

        <View style={styles.block}>
          {subscriptionPlans.map((plan) => renderPlanCard(plan))}
          <PillButton
            label="Compare all plans"
            icon="columns"
            variant="white"
            size="md"
            onPress={() => setShowCompareModal(true)}
          />
        </View>

        {renderPromoSection()}
        {renderPaymentMethods()}
        {renderFaqSection()}
      </ScrollView>

      {renderPaymentModal()}
      {renderManageModal()}
      {renderConfirmModal()}
      {renderCompareModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  flex1: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  heroTitle: {
    marginTop: spacing.sm,
  },
  heroSub: {
    marginTop: 4,
  },
  block: {
    marginTop: spacing.lg,
  },

  // Trial banner (ink card)
  trialCard: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  trialIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialTitle: {
    ...fonts.bold,
    fontSize: 15,
    color: palette.textInverse,
  },
  trialSubtitle: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textSubtle,
    marginTop: 2,
  },

  // Plan card
  planCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  planArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: {
    ...fonts.bold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: palette.text,
    marginTop: spacing.lg,
  },
  planDescription: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.md,
  },
  priceAmount: {
    ...fonts.bold,
    fontSize: 44,
    letterSpacing: -1.2,
    color: palette.text,
  },
  pricePeriod: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.textMuted,
    marginLeft: 4,
  },
  savingsText: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
    marginTop: 2,
  },
  featureList: {
    marginTop: spacing.lg,
    gap: 10,
    paddingRight: 80,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
    flexShrink: 1,
  },
  featureTextOff: {
    ...fonts.medium,
    color: palette.textSubtle,
  },
  planCta: {
    marginTop: spacing.xl,
    alignSelf: 'flex-start',
    minWidth: 170,
  },
  planCtaOutline: {
    borderWidth: 1,
    borderColor: palette.line,
  },

  // Generic card bits
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...fonts.bold,
    fontSize: 18,
    color: palette.text,
  },
  cardTitleSmall: {
    ...fonts.bold,
    fontSize: 16,
    color: palette.text,
    marginLeft: spacing.sm,
  },
  statusGrid: {
    marginTop: spacing.lg,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  listCard: {
    paddingVertical: 4,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowMenu: {
    padding: 4,
  },

  // Promo
  promoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  promoSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  promoSuccessText: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.success,
    marginLeft: 6,
  },
  promoHint: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: spacing.sm,
  },

  // FAQ
  faqItem: {
    paddingVertical: 16,
  },
  faqDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 15,
    color: palette.text,
    paddingRight: spacing.md,
  },
  faqAnswer: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 21,
    marginTop: 10,
  },

  // Bottom sheet
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetTall: {
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: palette.text,
  },
  sheetCta: {
    marginTop: spacing.xl,
  },

  // Payment sheet
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryName: {
    ...fonts.bold,
    fontSize: 17,
    color: palette.text,
  },
  summaryCycle: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  pricingCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceDim,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pricingRowLast: {
    marginBottom: 0,
  },
  pricingLabel: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
  },
  pricingValue: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  pricingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
    marginBottom: 10,
  },
  pricingTotalLabel: {
    ...fonts.bold,
    fontSize: 16,
    color: palette.text,
  },
  pricingTotalValue: {
    ...fonts.bold,
    fontSize: 20,
    color: palette.text,
  },
  fieldLabel: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  selectedPayment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    height: 54,
  },
  selectedPaymentText: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 14,
    color: palette.text,
    marginLeft: spacing.md,
  },
  changeText: {
    ...fonts.bold,
    fontSize: 14,
    color: palette.text,
    textDecorationLine: 'underline',
  },
  disclaimer: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },

  // Confirm sheet
  confirmBody: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  confirmIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  confirmTitle: {
    ...fonts.bold,
    fontSize: 22,
    color: palette.text,
    textAlign: 'center',
  },
  confirmMessage: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },

  // Compare sheet
  compareHeaderRow: {
    flexDirection: 'row',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  compareRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
    alignItems: 'center',
  },
  comparePriceRow: {
    backgroundColor: palette.surfaceDim,
    marginTop: spacing.sm,
    borderRadius: radii.sm,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  compareFeatureCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  comparePlanCell: {
    flex: 1,
    alignItems: 'center',
  },
  compareHeadMuted: {
    ...fonts.bold,
    fontSize: 14,
    color: palette.textMuted,
  },
  compareHead: {
    ...fonts.bold,
    fontSize: 14,
    color: palette.text,
  },
  compareFeatureName: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.text,
    marginLeft: spacing.sm,
    flexShrink: 1,
  },
  comparePriceLabel: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.textMuted,
  },
  comparePriceValue: {
    ...fonts.bold,
    fontSize: 13,
    color: palette.text,
  },
});

export default SubscriptionPage;
