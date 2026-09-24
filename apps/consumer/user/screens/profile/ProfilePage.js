import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Animated,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/AppAlert';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import * as vehicleService from '../../services/vehicleService';
import * as userService from '../../services/userService';
import * as bookingService from '../../services/bookingService';
import { palette, radii, spacing, fonts, shadow } from '../../theme';
import {
  Card,
  PillButton,
  IconCircle,
  Field,
  SectionTitle,
  Avatar,
  StatusTag,
  ListRow,
  Chip,
  EmptyState,
  IsoBlock,
} from '../../components/ui';
import { resolveImageUri } from '../../utils/imageUri';
import SheetModal from '../../components/ui/SheetModal';

// Payment methods — stays mock (no backend support)
// eslint-disable-next-line no-unused-vars
const initialPaymentMethods = [
  {
    id: '1',
    type: 'visa',
    last4: '4242',
    expiry: '12/25',
    isDefault: true,
  },
  {
    id: '2',
    type: 'mastercard',
    last4: '8888',
    expiry: '06/26',
    isDefault: false,
  },
];

// Maps backend vehicleType → UI display label
const typeDisplayMap = {
  car: 'Car',
  suv: 'SUV',
  van: 'Van',
  motorcycle: 'Motorcycle',
  truck: 'Truck',
};

// Maps UI label → backend vehicleType
const vehicleTypeMap = {
  Car: 'car',
  SUV: 'suv',
  Van: 'van',
  Motorcycle: 'motorcycle',
  Truck: 'truck',
};

// Maps UI label → backend vehicleSize
const vehicleSizeMap = {
  Car: 'medium',
  SUV: 'large',
  Van: 'large',
  Motorcycle: 'small',
  Truck: 'extra_large',
};

// Backend vehicleType → MaterialCommunityIcons glyph
const vehicleIconMap = {
  car: 'car-side',
  suv: 'car-estate',
  van: 'van-utility',
  motorcycle: 'motorbike',
  truck: 'truck',
};

// Bottom-sheet shell: title row with close button, scrollable body, footer.
// SheetModal fades the backdrop and slides only the card.
const Sheet = ({ visible, onClose, title, children, footer }) => (
  <SheetModal visible={visible} onClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <IconCircle icon="x" size={40} variant="grey" onPress={onClose} />
      </View>
      <ScrollView
        style={styles.sheetBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  </SheetModal>
);

const ProfilePage = ({ navigation }) => {
  // Sheets render in a real <Modal> above the floating tab bar, so they
  // only need to clear the home indicator.
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, 16) + 8;
  const scrollRef = useRef(null);
  const notifY = useRef(0);
  const auth = useAuth();
  const user = auth.user;

  // Profile state — seeded from real auth.user
  const [fullName, setFullName] = useState(user?.legalName || '');
  const [editedName, setEditedName] = useState(user?.legalName || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Vehicles
  const [vehicles, setVehicles] = useState([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);

  // Vehicle modal (controlled inputs)
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState({
    make: '', model: '', year: '', type: 'Car', registrationNumber: '',
  });
  const [vehicleSaving, setVehicleSaving] = useState(false);

  // Notifications — 2 backend-persisted, 4 local-only
  const [notifBooking, setNotifBooking] = useState(user?.notificationBooking ?? true);
  const [notifPromotion, setNotifPromotion] = useState(user?.notificationPromotion ?? false);
  const [notifParkingAlerts, setNotifParkingAlerts] = useState(true);
  const [notifExpiryReminders, setNotifExpiryReminders] = useState(true);
  const [notifPaymentConfirm, setNotifPaymentConfirm] = useState(true);
  const [notifNewsletter, setNotifNewsletter] = useState(false);

  // Stats (bookings count, total spent)
  const [stats, setStats] = useState({ totalBookings: 0, totalSpent: 0, hoursParked: 0 });

  // TODO: fetch payment methods from API; mock removed
  const [paymentMethods, setPaymentMethods] = useState(/* initialPaymentMethods */ []);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Success toast
  const [showSuccess, setShowSuccess] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchVehicles = () => {
    if (!user?.id) return;
    setIsLoadingVehicles(true);
    vehicleService.getUserVehicles(user.id)
      .then(res => {
        const list = (res.vehicles || []).map(v => ({
          ...v,
          id: v.id || v._id,
          registrationNumber: v.registrationNumber || v.registration_number || v.license_plate || v.licensePlate,
          vehicleType: v.vehicleType || v.vehicle_type,
          vehicleYear: v.vehicleYear || v.vehicle_year,
          isDefault: v.isDefault ?? v.is_default ?? false,
        }));
        setVehicles(list);
      })
      .catch(() => setVehicles([]))
      .finally(() => setIsLoadingVehicles(false));
  };

  // Load vehicles on mount
  useEffect(() => {
    fetchVehicles();
  }, [user?.id]);

  // Load booking stats on mount
  useEffect(() => {
    if (!user?.id) return;
    bookingService.getUserBookings(user.id, { page: 1, limit: 100 })
      .then(res => {
        const list = res?.bookings || [];
        const totalBookings = list.length;
        const totalSpent = list.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
        const hoursParked = list.reduce((s, b) => {
          if (!b.startTime || !b.endTime) return s;
          const ms = new Date(b.endTime) - new Date(b.startTime);
          return s + Math.max(0, ms / 3600000);
        }, 0);
        setStats({ totalBookings, totalSpent, hoursParked: Math.round(hoursParked) });
      })
      .catch(() => { /* keep zero stats */ });
  }, [user?.id]);

  const handleChangePhoto = () => {
    AppAlert.alert(
      'Profile Photo',
      'Photo upload is coming soon. We\'ll let you know when it\'s ready.'
    );
  };

  // Calculate profile completion using real data
  const calculateCompletion = () => {
    let completed = 0;
    if (fullName) completed++;
    if (user?.email) completed++;
    if (user?.phone) completed++;
    if (user?.profileImage || user?.profilePictureUrl) completed++;
    if (vehicles.length > 0) completed++;
    if (paymentMethods.length > 0) completed++;
    return Math.round((completed / 6) * 100);
  };

  // Show success toast
  const showSuccessMessage = () => {
    setShowSuccess(true);
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setShowSuccess(false));
  };

  // Save profile name to backend
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const response = await userService.updateProfile({ legalName: editedName.trim() });
      setFullName(editedName.trim());
      auth.updateUser(response.user);
      setIsEditing(false);
      showSuccessMessage();
    } catch {
      AppAlert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Notification toggles — backend-persisted
  const handleToggleBooking = async (value) => {
    setNotifBooking(value);
    try {
      await userService.updateProfile({ notificationBooking: value });
    } catch { /* silent — local state already reflects toggle */ }
  };

  const handleTogglePromotion = async (value) => {
    setNotifPromotion(value);
    try {
      await userService.updateProfile({ notificationPromotion: value });
    } catch { /* silent */ }
  };

  // Open vehicle modal for adding
  const openAddVehicle = () => {
    setVehicleForm({ make: '', model: '', year: '', type: 'Car', registrationNumber: '' });
    setEditingVehicle(null);
    setShowVehicleModal(true);
  };

  // Open vehicle modal for editing
  const openEditVehicle = (v) => {
    setVehicleForm({
      make: v.make || '',
      model: v.model || '',
      year: v.vehicleYear ? String(v.vehicleYear) : '',
      type: typeDisplayMap[v.vehicleType] || 'Car',
      registrationNumber: v.registrationNumber || '',
    });
    setEditingVehicle(v);
    setShowVehicleModal(true);
  };

  // Save (add or update) vehicle
  const handleSaveVehicle = async () => {
    const { make, model, type, registrationNumber } = vehicleForm;
    if (!make || !model || !registrationNumber) {
      AppAlert.alert('Missing fields', 'Please fill in make, model, and registration number.');
      return;
    }
    setVehicleSaving(true);
    try {
      const reg = registrationNumber.trim().toUpperCase();
      const payload = {
        make,
        model,
        vehicle_type: vehicleTypeMap[type],
        vehicleType: vehicleTypeMap[type],
        vehicle_size: vehicleSizeMap[type] || 'medium',
        vehicleSize: vehicleSizeMap[type] || 'medium',
        license_plate: reg,
        licensePlate: reg,
        registration_number: reg,
        registrationNumber: reg,
        vehicle_year: vehicleForm.year ? parseInt(vehicleForm.year, 10) : undefined,
        vehicleYear: vehicleForm.year ? parseInt(vehicleForm.year, 10) : undefined,
      };
      if (editingVehicle) {
        await vehicleService.updateVehicle(editingVehicle.id || editingVehicle._id, payload);
      } else {
        await vehicleService.addVehicle(user.id, payload);
      }
      fetchVehicles();
      setShowVehicleModal(false);
      showSuccessMessage();
    } catch (err) {
      AppAlert.alert('Error', err?.message || 'Could not save vehicle.');
    } finally {
      setVehicleSaving(false);
    }
  };

  // Delete vehicle
  const handleRemoveVehicle = (vehicleId) => {
    AppAlert.alert(
      'Remove Vehicle',
      'Are you sure you want to remove this vehicle?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await vehicleService.deleteVehicle(vehicleId);
              setVehicles(prev => prev.filter(v => (v.id || v._id) !== vehicleId));
            } catch {
              AppAlert.alert('Error', 'Could not remove vehicle.');
            }
          },
        },
      ]
    );
  };

  // Set vehicle as default
  const handleSetDefault = async () => {
    if (!editingVehicle) return;
    try {
      await vehicleService.setDefaultVehicle(editingVehicle.id || editingVehicle._id);
      fetchVehicles();
      setShowVehicleModal(false);
    } catch {
      AppAlert.alert('Error', 'Could not set default vehicle.');
    }
  };

  // Remove payment method (local only)
  const handleRemovePayment = (paymentId) => {
    AppAlert.alert(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPaymentMethods(paymentMethods.filter(p => p.id !== paymentId));
          },
        },
      ]
    );
  };

  // Logout via auth context — RootNavigator auto-switches to auth stack
  const handleLogout = () => {
    AppAlert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => auth.signOut(),
        },
      ]
    );
  };
  const avatarUri = user?.profileImage || user?.profilePictureUrl;
  const displayName = fullName || 'Welcome';
  const contactLine = user?.phone ? `+91 ${user.phone}` : user?.email || '';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  const openEditProfile = () => {
    setEditedName(fullName);
    setIsEditing(true);
  };

  // Scroll the page to the notification preferences card (bell button)
  const scrollToNotifications = () => {
    scrollRef.current?.scrollTo({ y: Math.max(notifY.current - 12, 0), animated: true });
  };

  const renderSwitch = (value, onChange) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: palette.fill, true: palette.ink }}
      thumbColor={palette.surface}
      ios_backgroundColor={palette.fill}
    />
  );

  // Top row — avatar, name, contact, edit + bell
  const renderTopRow = () => (
    <View style={styles.topRow}>
      <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.8}>
        <Avatar
          uri={avatarUri ? resolveImageUri(avatarUri) : undefined}
          name={fullName || user?.email || ''}
          size={64}
          ring
        />
      </TouchableOpacity>
      <View style={styles.topText}>
        <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
        {contactLine ? (
          <Text style={styles.userContact} numberOfLines={1}>{contactLine}</Text>
        ) : null}
      </View>
      <IconCircle icon="edit-2" size={46} onPress={openEditProfile} />
      <IconCircle icon="bell" size={46} onPress={scrollToNotifications} style={styles.topIconGap} />
    </View>
  );

  // Peach membership card — plan tier, member since, profile completion
  const renderPlanCard = () => {
    const completion = calculateCompletion();
    return (
      <Card tone="peach" onPress={() => navigation.navigate('Subscription')} style={styles.planCard}>
        <View style={styles.planArt} pointerEvents="none">
          <IsoBlock size={140} tone="peach" />
        </View>
        <StatusTag label={user?.subscriptionTier || 'Free'} />
        <Text style={styles.planTitle}>Your plan</Text>
        {memberSince ? (
          <Text style={styles.planSub}>Member since {memberSince}</Text>
        ) : null}
        <View style={styles.planProgressWrap}>
          <View style={styles.planProgressHead}>
            <Text style={styles.planProgressLabel}>Profile completion</Text>
            <Text style={styles.planProgressValue}>{completion}%</Text>
          </View>
          <View style={styles.planBar}>
            <View style={[styles.planBarFill, { width: `${completion}%` }]} />
          </View>
          {completion < 100 && (
            <Text style={styles.planHint}>Complete your profile to unlock all features</Text>
          )}
        </View>
      </Card>
    );
  };

  // Stats tiles (bookings, hours, spend)
  const renderStats = () => (
    <View style={styles.statsRow}>
      <View style={styles.statTile}>
        <Text style={styles.statValue}>{stats.totalBookings}</Text>
        <Text style={styles.statLabel}>Bookings</Text>
      </View>
      <View style={[styles.statTile, styles.statGap]}>
        <Text style={styles.statValue}>{stats.hoursParked}h</Text>
        <Text style={styles.statLabel}>Parked</Text>
      </View>
      <View style={[styles.statTile, styles.statGap]}>
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          ₹{stats.totalSpent.toLocaleString('en-IN')}
        </Text>
        <Text style={styles.statLabel}>Total spent</Text>
      </View>
    </View>
  );

  // Personal information (read view; editing happens in a sheet)
  const renderProfileSection = () => (
    <View style={styles.section}>
      <SectionTitle title="Personal information" action="Edit" onAction={openEditProfile} />
      <Card padded={false} style={styles.groupCard}>
        <ListRow icon="user" title="Full name" subtitle={fullName || '—'} onPress={openEditProfile} />
        <ListRow icon="mail" title="Email" subtitle={user?.email || '—'} right={null} />
        <ListRow
          icon="phone"
          title="Phone number"
          subtitle={user?.phone ? `+91 ${user.phone}` : '—'}
          right={null}
          isLast
        />
      </Card>
    </View>
  );

  // Vehicles
  const renderVehiclesSection = () => (
    <View style={styles.section}>
      <SectionTitle title="My vehicles" />

      {isLoadingVehicles ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator size="small" color={palette.ink} />
        </Card>
      ) : vehicles.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="No vehicles added"
            subtitle="Add your vehicle details for faster parking bookings"
            action="Add vehicle"
            onAction={openAddVehicle}
          />
        </Card>
      ) : (
        <>
          {vehicles.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={styles.vehicleCard}
              activeOpacity={0.85}
              onPress={() => openEditVehicle(vehicle)}
            >
              <View style={styles.vehicleIcon}>
                <MaterialIcon
                  name={vehicleIconMap[vehicle.vehicleType] || 'car-side'}
                  size={24}
                  color={palette.text}
                />
              </View>
              <View style={styles.vehicleInfo}>
                <View style={styles.vehicleHead}>
                  <Text style={styles.vehiclePlate} numberOfLines={1}>
                    {vehicle.registrationNumber || '—'}
                  </Text>
                  {vehicle.isDefault && <StatusTag label="Default" style={styles.defaultTag} />}
                </View>
                <Text style={styles.vehicleMeta} numberOfLines={1}>
                  {typeDisplayMap[vehicle.vehicleType] || vehicle.vehicleType}
                  {vehicle.vehicleYear ? ` · ${vehicle.vehicleYear}` : ''}
                </Text>
              </View>
              <IconCircle
                icon="edit-2"
                size={38}
                variant="grey"
                onPress={() => openEditVehicle(vehicle)}
              />
              <IconCircle
                icon="trash-2"
                size={38}
                variant="grey"
                color={palette.danger}
                onPress={() => handleRemoveVehicle(vehicle.id)}
                style={styles.vehicleActionGap}
              />
            </TouchableOpacity>
          ))}
          <PillButton
            label="Add vehicle"
            icon="plus"
            variant="white"
            size="md"
            onPress={openAddVehicle}
            style={styles.addVehicleBtn}
          />
        </>
      )}
    </View>
  );

  // Payment methods (hidden — no backend support yet)
  // eslint-disable-next-line no-unused-vars
  const renderPaymentSection = () => (
    <View style={styles.section}>
      <SectionTitle title="Payment methods" action="Add" onAction={() => setShowPaymentModal(true)} />
      {paymentMethods.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="No payment methods"
            subtitle="Add a payment method for seamless transactions"
            action="Add payment method"
            onAction={() => setShowPaymentModal(true)}
          />
        </Card>
      ) : (
        <Card padded={false} style={styles.groupCard}>
          {paymentMethods.map((method, i) => (
            <ListRow
              key={method.id}
              icon="credit-card"
              title={`${method.type.charAt(0).toUpperCase() + method.type.slice(1)} ****${method.last4}`}
              subtitle={`Expires ${method.expiry}${method.isDefault ? ' · Default' : ''}`}
              isLast={i === paymentMethods.length - 1}
              right={
                <IconCircle
                  icon="trash-2"
                  size={36}
                  variant="grey"
                  color={palette.danger}
                  onPress={() => handleRemovePayment(method.id)}
                />
              }
            />
          ))}
        </Card>
      )}
    </View>
  );

  // Notification preferences
  const renderNotificationsSection = () => (
    <View
      style={styles.section}
      onLayout={(e) => { notifY.current = e.nativeEvent.layout.y; }}
    >
      <SectionTitle title="Notifications" />
      <Card padded={false} style={styles.groupCard}>
        <ListRow icon="calendar" title="Booking reminders" right={renderSwitch(notifBooking, handleToggleBooking)} />
        <ListRow icon="check-circle" title="Payment confirmations" right={renderSwitch(notifPaymentConfirm, setNotifPaymentConfirm)} />
        <ListRow icon="bell" title="Parking alerts" right={renderSwitch(notifParkingAlerts, setNotifParkingAlerts)} />
        <ListRow icon="clock" title="Expiry reminders" right={renderSwitch(notifExpiryReminders, setNotifExpiryReminders)} />
        <ListRow icon="gift" title="Promotions & offers" right={renderSwitch(notifPromotion, handleTogglePromotion)} />
        <ListRow icon="mail" title="Newsletter" right={renderSwitch(notifNewsletter, setNotifNewsletter)} isLast />
      </Card>
    </View>
  );

  // More options
  const renderQuickLinks = () => (
    <View style={styles.section}>
      <SectionTitle title="More" />
      <Card padded={false} style={styles.groupCard}>
        <ListRow
          icon="award"
          title="Subscription"
          subtitle="Manage your premium plan"
          onPress={() => navigation.navigate('Subscription')}
        />
        <ListRow
          icon="shield"
          title="Security"
          subtitle="OTP-based sign-in"
          onPress={() =>
            AppAlert.alert(
              'Security',
              'You sign in with a one-time code on +91 ' + (user?.phone || '—') + '. Password-based sign-in is not used.'
            )
          }
        />
        <ListRow
          icon="help-circle"
          title="Help & Support"
          subtitle="FAQs and contact us"
          onPress={() => navigation.navigate('HelpSupport')}
        />
        <ListRow
          icon="info"
          title="About"
          subtitle="App info & terms"
          onPress={() => navigation.navigate('About')}
          isLast
        />
      </Card>
    </View>
  );

  // Log out
  const renderLogout = () => (
    <View style={styles.section}>
      <Card padded={false} style={styles.groupCard}>
        <ListRow icon="log-out" title="Log out" danger onPress={handleLogout} isLast />
      </Card>
      <Text style={styles.versionText}>Version 1.0.0</Text>
    </View>
  );

  // Edit profile sheet
  const renderProfileModal = () => (
    <Sheet
      visible={isEditing}
      onClose={() => setIsEditing(false)}
      title="Edit profile"
      bottomPad={sheetBottomPad}
      footer={
        <View style={styles.sheetFooter}>
          <PillButton
            label="Cancel"
            variant="grey"
            size="md"
            onPress={() => setIsEditing(false)}
            style={styles.footerBtn}
          />
          <PillButton
            label={isSaving ? 'Saving...' : 'Save changes'}
            variant="ink"
            size="md"
            onPress={handleSaveProfile}
            disabled={isSaving}
            style={[styles.footerBtn, styles.footerGap]}
          />
        </View>
      }
    >
      <Field
        label="Full name"
        icon="user"
        value={editedName}
        onChangeText={setEditedName}
        placeholder="Full name"
        style={styles.fieldGap}
      />
      <Field
        label="Email"
        icon="mail"
        value={user?.email || ''}
        editable={false}
        placeholder="—"
        inputStyle={styles.readOnly}
        style={styles.fieldGap}
      />
      <Field
        label="Phone number"
        icon="phone"
        value={user?.phone ? `+91 ${user.phone}` : ''}
        editable={false}
        placeholder="—"
        inputStyle={styles.readOnly}
        style={styles.fieldGap}
      />
    </Sheet>
  );

  // Add / edit vehicle sheet
  const renderVehicleModal = () => (
    <Sheet
      visible={showVehicleModal}
      onClose={() => setShowVehicleModal(false)}
      title={editingVehicle ? 'Edit vehicle' : 'Add vehicle'}
      bottomPad={sheetBottomPad}
      footer={
        <View style={styles.sheetFooterCol}>
          {editingVehicle && !editingVehicle.isDefault && (
            <PillButton
              label="Set as default"
              icon="star"
              variant="grey"
              size="md"
              onPress={handleSetDefault}
              style={styles.setDefaultBtn}
            />
          )}
          <View style={styles.sheetFooterRow}>
            <PillButton
              label="Cancel"
              variant="grey"
              size="md"
              onPress={() => setShowVehicleModal(false)}
              style={styles.footerBtn}
            />
            <PillButton
              label={editingVehicle ? 'Save changes' : 'Add vehicle'}
              variant="ink"
              size="md"
              onPress={handleSaveVehicle}
              loading={vehicleSaving}
              style={[styles.footerBtn, styles.footerGap]}
            />
          </View>
        </View>
      }
    >
      <Field
        label="Vehicle make"
        placeholder="e.g., Toyota"
        value={vehicleForm.make}
        onChangeText={(text) => setVehicleForm(f => ({ ...f, make: text }))}
        style={styles.fieldGap}
      />
      <Field
        label="Vehicle model"
        placeholder="e.g., Camry"
        value={vehicleForm.model}
        onChangeText={(text) => setVehicleForm(f => ({ ...f, model: text }))}
        style={styles.fieldGap}
      />
      <Field
        label="Year"
        placeholder="2022"
        keyboardType="numeric"
        value={vehicleForm.year}
        onChangeText={(text) => setVehicleForm(f => ({ ...f, year: text }))}
        style={styles.fieldGap}
      />
      <Text style={styles.chipLabel}>Vehicle type</Text>
      <View style={styles.chipWrap}>
        {['Car', 'SUV', 'Truck', 'Van', 'Motorcycle'].map((type) => (
          <Chip
            key={type}
            label={type}
            selected={vehicleForm.type === type}
            onPress={() => setVehicleForm(f => ({ ...f, type }))}
            style={vehicleForm.type === type ? styles.typeChipOn : styles.typeChip}
          />
        ))}
      </View>
      <Field
        label="Registration number"
        icon="hash"
        placeholder="ABC 1234"
        autoCapitalize="characters"
        value={vehicleForm.registrationNumber}
        onChangeText={(text) => setVehicleForm(f => ({ ...f, registrationNumber: text }))}
        style={styles.fieldGap}
      />
    </Sheet>
  );

  // Add payment sheet (hidden with the payment section)
  const renderPaymentModal = () => (
    <Sheet
      visible={showPaymentModal}
      onClose={() => setShowPaymentModal(false)}
      title="Add payment method"
      bottomPad={sheetBottomPad}
      footer={
        <View style={styles.sheetFooter}>
          <PillButton
            label="Cancel"
            variant="grey"
            size="md"
            onPress={() => setShowPaymentModal(false)}
            style={styles.footerBtn}
          />
          <PillButton
            label="Add card"
            variant="ink"
            size="md"
            onPress={() => setShowPaymentModal(false)}
            style={[styles.footerBtn, styles.footerGap]}
          />
        </View>
      }
    >
      <Field
        label="Card number"
        icon="credit-card"
        placeholder="1234 5678 9012 3456"
        keyboardType="numeric"
        maxLength={19}
        style={styles.fieldGap}
      />
      <Field
        label="Cardholder name"
        placeholder="John Doe"
        autoCapitalize="words"
        style={styles.fieldGap}
      />
      <View style={styles.fieldRow}>
        <Field
          label="Expiry date"
          placeholder="MM/YY"
          keyboardType="numeric"
          maxLength={5}
          style={styles.fieldHalf}
        />
        <Field
          label="CVV"
          placeholder="123"
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
          style={[styles.fieldHalf, styles.footerGap]}
        />
      </View>
      <View style={styles.secureNote}>
        <Icon name="lock" size={16} color={palette.success} />
        <Text style={styles.secureNoteText}>Your payment information is encrypted and secure</Text>
      </View>
    </Sheet>
  );

  // Success toast
  const renderSuccessToast = () => {
    if (!showSuccess) return null;
    return (
      <Animated.View
        style={[styles.successToast, { opacity: fadeAnim, bottom: insets.bottom + 110 }]}
      >
        <Icon name="check-circle" size={18} color={palette.textInverse} />
        <Text style={styles.successToastText}>Profile updated successfully</Text>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 120,
        }}
      >
        {renderTopRow()}
        {renderPlanCard()}
        {renderStats()}
        {renderProfileSection()}
        {renderVehiclesSection()}
        {/* renderPaymentSection() */}
        {renderNotificationsSection()}
        {renderQuickLinks()}
        {renderLogout()}
      </ScrollView>

      {renderProfileModal()}
      {renderVehicleModal()}
      {renderPaymentModal()}
      {renderSuccessToast()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },

  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  topText: { flex: 1, marginLeft: 14, marginRight: 10 },
  userName: { ...fonts.semibold, fontSize: 20, color: palette.text, letterSpacing: -0.3 },
  userContact: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginTop: 3 },
  topIconGap: { marginLeft: 8 },

  // Plan card
  planCard: { marginHorizontal: spacing.xl, minHeight: 190, overflow: 'hidden' },
  planArt: { position: 'absolute', right: -30, bottom: -26 },
  planTitle: { ...fonts.semibold, fontSize: 24, color: palette.text, marginTop: 14, letterSpacing: -0.4 },
  planSub: { ...fonts.medium, fontSize: 13.5, color: palette.textMuted, marginTop: 4 },
  planProgressWrap: { marginTop: 18, width: '62%' },
  planProgressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  planProgressLabel: { ...fonts.semibold, fontSize: 12.5, color: palette.text },
  planProgressValue: { ...fonts.bold, fontSize: 12.5, color: palette.text },
  planBar: { height: 6, borderRadius: 3, backgroundColor: '#F7D3A6', overflow: 'hidden' },
  planBarFill: { height: '100%', borderRadius: 3, backgroundColor: palette.ink },
  planHint: { ...fonts.medium, fontSize: 11.5, color: palette.textMuted, marginTop: 8, lineHeight: 15 },

  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: spacing.xl, marginTop: spacing.md },
  statTile: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  statGap: { marginLeft: 10 },
  statValue: { ...fonts.bold, fontSize: 20, color: palette.text, letterSpacing: -0.3 },
  statLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 4 },

  // Sections
  section: { marginHorizontal: spacing.xl, marginTop: spacing.xxl },
  groupCard: { paddingHorizontal: 16, paddingVertical: 2 },
  loadingCard: { alignItems: 'center', paddingVertical: 28 },

  // Vehicles
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 10,
  },
  vehicleIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  vehicleHead: { flexDirection: 'row', alignItems: 'center' },
  vehiclePlate: { ...fonts.bold, fontSize: 16, color: palette.text, flexShrink: 1, letterSpacing: 0.3 },
  defaultTag: { marginLeft: 8 },
  vehicleMeta: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 3 },
  vehicleActionGap: { marginLeft: 6 },
  addVehicleBtn: { marginTop: 4 },

  versionText: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textSubtle,
    marginTop: 16,
    textAlign: 'center',
    letterSpacing: 0.4,
  },

  // Sheets
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    maxHeight: '88%',
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: 8,
  },
  sheetTitle: { ...fonts.semibold, fontSize: 21, color: palette.text, letterSpacing: -0.3 },
  sheetBody: { paddingHorizontal: spacing.xl, paddingTop: 8 },
  sheetFooter: { flexDirection: 'row', paddingHorizontal: spacing.xl, paddingTop: 12 },
  sheetFooterCol: { paddingHorizontal: spacing.xl, paddingTop: 12 },
  sheetFooterRow: { flexDirection: 'row' },
  footerBtn: { flex: 1 },
  footerGap: { marginLeft: 10 },
  setDefaultBtn: { marginBottom: 10 },
  fieldGap: { marginBottom: 16 },
  fieldRow: { flexDirection: 'row', marginBottom: 16 },
  fieldHalf: { flex: 1 },
  readOnly: { color: palette.textMuted },
  chipLabel: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginBottom: 8, marginLeft: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  typeChip: { backgroundColor: palette.fill, marginBottom: 8 },
  typeChipOn: { marginBottom: 8 },

  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.successSoft,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: 12,
  },
  secureNoteText: { ...fonts.medium, fontSize: 12.5, color: palette.success, marginLeft: 8, flex: 1 },

  // Toast
  successToast: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.ink,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    ...shadow.lifted,
  },
  successToastText: { ...fonts.semibold, fontSize: 14, color: palette.textInverse, marginLeft: 8 },
});

export default ProfilePage;
