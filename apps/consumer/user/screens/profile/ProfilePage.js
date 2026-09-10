import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  Switch,
  Animated,
  StatusBar,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/AppAlert';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import * as vehicleService from '../../services/vehicleService';
import * as userService from '../../services/userService';
import * as bookingService from '../../services/bookingService';
import { palette, fontStacks } from '../../theme';
import { resolveImageUri } from '../../utils/imageUri';

// Payment methods — stays mock (no backend support)
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

const ProfilePage = ({ navigation }) => {
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

  // First-letter initials for avatar fallback
  const initials = (() => {
    const name = (fullName || user?.email || '').trim();
    if (!name) return '?';
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

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

  // Render header
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Icon name="arrow-left" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Profile</Text>
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Subscription')}
      >
        <MaterialIcon name="ticket-percent" size={22} color="#F59E0B" />
      </TouchableOpacity>
    </View>
  );

  // Render hero (avatar + greeting + member badge)
  const renderHero = () => {
    const avatarUri = user?.profileImage || user?.profilePictureUrl;
    const memberSince = user?.createdAt
      ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : null;
    return (
      <View style={styles.hero}>
        <View style={styles.heroAvatarWrap}>
          <View style={styles.heroAvatar}>
            {avatarUri ? (
              <Image source={{ uri: resolveImageUri(avatarUri) }} style={styles.heroAvatarImage} />
            ) : (
              <Text style={styles.heroAvatarInitials}>{initials}</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.heroAvatarEdit}
            onPress={handleChangePhoto}
            activeOpacity={0.85}
          >
            <Icon name="camera" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.heroName} numberOfLines={1}>
          {fullName || 'Welcome'}
        </Text>
        {user?.email ? (
          <Text style={styles.heroEmail} numberOfLines={1}>{user.email}</Text>
        ) : null}

        <View style={styles.heroBadges}>
          {memberSince ? (
            <View style={styles.heroBadge}>
              <Icon name="calendar" size={12} color="#1A73E8" />
              <Text style={styles.heroBadgeText}>Member since {memberSince}</Text>
            </View>
          ) : null}
          <View style={[styles.heroBadge, styles.heroBadgeGold]}>
            <MaterialIcon name="crown" size={12} color="#B45309" />
            <Text style={[styles.heroBadgeText, { color: '#B45309' }]}>
              {user?.subscriptionTier || 'Free'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Render stats row (bookings, hours, spend)
  const renderStats = () => (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{stats.totalBookings}</Text>
        <Text style={styles.statLabel}>Bookings</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{stats.hoursParked}h</Text>
        <Text style={styles.statLabel}>Parked</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>₹{stats.totalSpent.toLocaleString('en-IN')}</Text>
        <Text style={styles.statLabel}>Total Spent</Text>
      </View>
    </View>
  );

  // Render profile completion
  const renderProfileCompletion = () => {
    const completion = calculateCompletion();
    return (
      <View style={styles.completionContainer}>
        <View style={styles.completionHeader}>
          <Text style={styles.completionTitle}>Profile Completion</Text>
          <Text style={styles.completionPercentage}>{completion}%</Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${completion}%` }]} />
        </View>
        {completion < 100 && (
          <Text style={styles.completionHint}>
            Complete your profile to unlock all features
          </Text>
        )}
      </View>
    );
  };

  // Render profile section
  const renderProfileSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Personal Information</Text>
        {!isEditing ? (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              setEditedName(fullName);
              setIsEditing(true);
            }}
          >
            <Icon name="edit-2" size={16} color="#1A73E8" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setIsEditing(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Personal Info Fields */}
      <View style={styles.fieldsContainer}>
        {isEditing ? (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Full Name"
                placeholderTextColor="#6B7280"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={user?.email || ''}
                editable={false}
                placeholder="—"
                placeholderTextColor="#6B7280"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={user?.phone ? `+91 ${user.phone}` : ''}
                editable={false}
                placeholder="—"
                placeholderTextColor="#6B7280"
              />
            </View>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSaveProfile}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Icon name="user" size={18} color="#1A73E8" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Full Name</Text>
                <Text style={styles.infoValue}>{fullName || '—'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Icon name="mail" size={18} color="#1A73E8" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email || '—'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Icon name="phone" size={18} color="#1A73E8" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone Number</Text>
                <Text style={styles.infoValue}>
                  {user?.phone ? `+91 ${user.phone}` : '—'}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );

  // Render vehicles section
  const renderVehiclesSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Vehicles</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddVehicle}
        >
          <Icon name="plus" size={16} color="#1A73E8" />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {isLoadingVehicles ? (
        <ActivityIndicator size="small" color="#1A73E8" style={{ paddingVertical: 24 }} />
      ) : vehicles.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Icon name="truck" size={32} color="#6B7280" />
          </View>
          <Text style={styles.emptyTitle}>No Vehicles Added</Text>
          <Text style={styles.emptySubtitle}>
            Add your vehicle details for faster parking bookings
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={openAddVehicle}
          >
            <Icon name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Add Vehicle</Text>
          </TouchableOpacity>
        </View>
      ) : (
        vehicles.map((vehicle) => (
          <View key={vehicle.id} style={styles.vehicleCard}>
            <View style={styles.vehicleIconContainer}>
              <Icon name="truck" size={24} color="#7C3AED" />
            </View>
            <View style={styles.vehicleInfo}>
              <View style={styles.vehicleHeader}>
                <Text style={styles.vehicleName}>
                  {vehicle.registrationNumber || '—'}
                </Text>
                {vehicle.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
              </View>
              <Text style={styles.vehicleDetails}>
                {typeDisplayMap[vehicle.vehicleType] || vehicle.vehicleType}
                {vehicle.vehicleYear ? ` • ${vehicle.vehicleYear}` : ''}
              </Text>
            </View>
            <View style={styles.vehicleActions}>
              <TouchableOpacity
                style={styles.vehicleActionButton}
                onPress={() => openEditVehicle(vehicle)}
              >
                <Icon name="edit-2" size={16} color="#A1A1AA" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.vehicleActionButton}
                onPress={() => handleRemoveVehicle(vehicle.id)}
              >
                <Icon name="trash-2" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );

  // Render payment methods section
  const renderPaymentSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Payment Methods</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowPaymentModal(true)}
        >
          <Icon name="plus" size={16} color="#1A73E8" />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {paymentMethods.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Icon name="credit-card" size={32} color="#6B7280" />
          </View>
          <Text style={styles.emptyTitle}>No Payment Methods</Text>
          <Text style={styles.emptySubtitle}>
            Add a payment method for seamless transactions
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowPaymentModal(true)}
          >
            <Icon name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Add Payment Method</Text>
          </TouchableOpacity>
        </View>
      ) : (
        paymentMethods.map((method) => (
          <View key={method.id} style={styles.paymentCard}>
            <View style={[
              styles.paymentIconContainer,
              { backgroundColor: method.type === 'visa' ? '#1A1F7115' : '#EB001B15' }
            ]}>
              <Icon
                name="credit-card"
                size={20}
                color={method.type === 'visa' ? '#1A1F71' : '#EB001B'}
              />
            </View>
            <View style={styles.paymentInfo}>
              <View style={styles.paymentHeader}>
                <Text style={styles.paymentType}>
                  {method.type.charAt(0).toUpperCase() + method.type.slice(1)} ****{method.last4}
                </Text>
                {method.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
              </View>
              <Text style={styles.paymentExpiry}>Expires {method.expiry}</Text>
            </View>
            <TouchableOpacity
              style={styles.paymentRemoveButton}
              onPress={() => handleRemovePayment(method.id)}
            >
              <Icon name="trash-2" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.manageButton}>
        <Icon name="settings" size={18} color="#1A73E8" />
        <Text style={styles.manageButtonText}>Manage Payment Methods</Text>
      </TouchableOpacity>
    </View>
  );

  // Render notifications section
  const renderNotificationsSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Notification Preferences</Text>
      </View>

      <View style={styles.notificationsList}>
        <View style={styles.notificationItem}>
          <View style={styles.notificationInfo}>
            <Icon name="calendar" size={20} color="#1A73E8" />
            <Text style={styles.notificationText}>Booking Reminders</Text>
          </View>
          <Switch
            value={notifBooking}
            onValueChange={handleToggleBooking}
            trackColor={{ false: palette.surface, true: '#1A73E850' }}
            thumbColor={notifBooking ? '#FF2E40' : '#6B7280'}
          />
        </View>

        <View style={styles.notificationItem}>
          <View style={styles.notificationInfo}>
            <Icon name="check-circle" size={20} color="#1A73E8" />
            <Text style={styles.notificationText}>Payment Confirmations</Text>
          </View>
          <Switch
            value={notifPaymentConfirm}
            onValueChange={setNotifPaymentConfirm}
            trackColor={{ false: palette.surface, true: '#1A73E850' }}
            thumbColor={notifPaymentConfirm ? '#FF2E40' : '#6B7280'}
          />
        </View>

        <View style={styles.notificationItem}>
          <View style={styles.notificationInfo}>
            <Icon name="bell" size={20} color="#1A73E8" />
            <Text style={styles.notificationText}>Parking Alerts</Text>
          </View>
          <Switch
            value={notifParkingAlerts}
            onValueChange={setNotifParkingAlerts}
            trackColor={{ false: palette.surface, true: '#1A73E850' }}
            thumbColor={notifParkingAlerts ? '#FF2E40' : '#6B7280'}
          />
        </View>

        <View style={styles.notificationItem}>
          <View style={styles.notificationInfo}>
            <Icon name="clock" size={20} color="#1A73E8" />
            <Text style={styles.notificationText}>Expiry Reminders</Text>
          </View>
          <Switch
            value={notifExpiryReminders}
            onValueChange={setNotifExpiryReminders}
            trackColor={{ false: palette.surface, true: '#1A73E850' }}
            thumbColor={notifExpiryReminders ? '#FF2E40' : '#6B7280'}
          />
        </View>

        <View style={styles.notificationItem}>
          <View style={styles.notificationInfo}>
            <Icon name="gift" size={20} color="#1A73E8" />
            <Text style={styles.notificationText}>Promotions & Offers</Text>
          </View>
          <Switch
            value={notifPromotion}
            onValueChange={handleTogglePromotion}
            trackColor={{ false: palette.surface, true: '#1A73E850' }}
            thumbColor={notifPromotion ? '#FF2E40' : '#6B7280'}
          />
        </View>

        <View style={styles.notificationItem}>
          <View style={styles.notificationInfo}>
            <Icon name="mail" size={20} color="#1A73E8" />
            <Text style={styles.notificationText}>Newsletter</Text>
          </View>
          <Switch
            value={notifNewsletter}
            onValueChange={setNotifNewsletter}
            trackColor={{ false: palette.surface, true: '#1A73E850' }}
            thumbColor={notifNewsletter ? '#FF2E40' : '#6B7280'}
          />
        </View>
      </View>
    </View>
  );

  // Render quick links section
  const renderQuickLinks = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>More Options</Text>
      </View>

      <TouchableOpacity
        style={styles.quickLinkItem}
        onPress={() => navigation.navigate('Subscription')}
      >
        <View style={[styles.quickLinkIcon, { backgroundColor: '#8B5CF6' }]}>
          <Icon name="award" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.quickLinkContent}>
          <Text style={styles.quickLinkTitle}>Subscription</Text>
          <Text style={styles.quickLinkSubtitle}>Manage your premium plan</Text>
        </View>
        <Icon name="chevron-right" size={20} color="#6B7280" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.quickLinkItem}
        onPress={() =>
          AppAlert.alert(
            'Security',
            'You sign in with a one-time code on +91 ' + (user?.phone || '—') + '. Password-based sign-in is not used.'
          )
        }
      >
        <View style={[styles.quickLinkIcon, { backgroundColor: '#059669' }]}>
          <Icon name="shield" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.quickLinkContent}>
          <Text style={styles.quickLinkTitle}>Security</Text>
          <Text style={styles.quickLinkSubtitle}>OTP-based sign-in</Text>
        </View>
        <Icon name="chevron-right" size={20} color="#6B7280" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.quickLinkItem}
        onPress={() => navigation.navigate('HelpSupport')}
      >
        <View style={[styles.quickLinkIcon, { backgroundColor: '#2563EB' }]}>
          <Icon name="help-circle" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.quickLinkContent}>
          <Text style={styles.quickLinkTitle}>Help & Support</Text>
          <Text style={styles.quickLinkSubtitle}>FAQs and contact us</Text>
        </View>
        <Icon name="chevron-right" size={20} color="#6B7280" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.quickLinkItem}
        onPress={() => navigation.navigate('About')}
      >
        <View style={[styles.quickLinkIcon, { backgroundColor: '#A1A1AA' }]}>
          <Icon name="info" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.quickLinkContent}>
          <Text style={styles.quickLinkTitle}>About</Text>
          <Text style={styles.quickLinkSubtitle}>App info & terms</Text>
        </View>
        <Icon name="chevron-right" size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );

  // Render logout button
  const renderLogout = () => (
    <View style={styles.logoutSection}>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Icon name="log-out" size={20} color="#FFFFFF" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
      <Text style={styles.versionText}>Version 1.0.0</Text>
    </View>
  );

  // Render vehicle modal
  const renderVehicleModal = () =>
    showVehicleModal ? (

      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setShowVehicleModal(false)}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowVehicleModal(false)}
            >
              <Icon name="x" size={24} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Vehicle Make</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Toyota"
                placeholderTextColor="#6B7280"
                value={vehicleForm.make}
                onChangeText={(text) => setVehicleForm(f => ({ ...f, make: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Vehicle Model</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Camry"
                placeholderTextColor="#6B7280"
                value={vehicleForm.model}
                onChangeText={(text) => setVehicleForm(f => ({ ...f, model: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Year</Text>
              <TextInput
                style={styles.input}
                placeholder="2022"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                value={vehicleForm.year}
                onChangeText={(text) => setVehicleForm(f => ({ ...f, year: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Vehicle Type</Text>
              <View style={styles.vehicleTypeContainer}>
                {['Car', 'SUV', 'Truck', 'Van', 'Motorcycle'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.vehicleTypeButton,
                      vehicleForm.type === type && styles.vehicleTypeButtonActive,
                    ]}
                    onPress={() => setVehicleForm(f => ({ ...f, type }))}
                  >
                    <Text style={[
                      styles.vehicleTypeText,
                      vehicleForm.type === type && styles.vehicleTypeTextActive,
                    ]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Registration Number</Text>
              <TextInput
                style={styles.input}
                placeholder="ABC 1234"
                placeholderTextColor="#6B7280"
                autoCapitalize="characters"
                value={vehicleForm.registrationNumber}
                onChangeText={(text) => setVehicleForm(f => ({ ...f, registrationNumber: text }))}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            {editingVehicle && !editingVehicle.isDefault && (
              <TouchableOpacity
                style={styles.modalDefaultButton}
                onPress={handleSetDefault}
              >
                <Text style={styles.modalDefaultText}>Set Default</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowVehicleModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveButton, vehicleSaving && { opacity: 0.7 }]}
              onPress={handleSaveVehicle}
              disabled={vehicleSaving}
            >
              {vehicleSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSaveText}>
                  {editingVehicle ? 'Save Changes' : 'Add Vehicle'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    
    ) : null;

  // Render payment modal
  const renderPaymentModal = () =>
    showPaymentModal ? (

      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Payment Method</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowPaymentModal(false)}
            >
              <Icon name="x" size={24} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Card Number</Text>
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                maxLength={19}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Cardholder Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="#6B7280"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>Expiry Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MM/YY"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>CVV</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.secureNote}>
              <Icon name="lock" size={16} color="#059669" />
              <Text style={styles.secureNoteText}>
                Your payment information is encrypted and secure
              </Text>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowPaymentModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => setShowPaymentModal(false)}
            >
              <Text style={styles.modalSaveText}>Add Card</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    
    ) : null;

  // Render success toast
  const renderSuccessToast = () => {
    if (!showSuccess) return null;

    return (
      <Animated.View style={[styles.successToast, { opacity: fadeAnim }]}>
        <Icon name="check-circle" size={20} color="#FFFFFF" />
        <Text style={styles.successToastText}>Profile Updated Successfully</Text>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={palette.bg} />

      {renderHeader()}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {renderHero()}
        {renderStats()}
        {renderProfileCompletion()}
        {renderProfileSection()}
        {renderVehiclesSection()}
        {/* renderPaymentSection() */}
        {renderNotificationsSection()}
        {renderQuickLinks()}
        {renderLogout()}
      </ScrollView>

      {renderVehicleModal()}
      {renderPaymentModal()}
      {renderSuccessToast()}
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: {
    fontFamily: fontStacks.regular,
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: -0.3,
    color: palette.text,
  },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 110,
  },

  // Hero header
  hero: {
    backgroundColor: 'transparent',
    marginHorizontal: 20,
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 0,
    alignItems: 'center',
  },
  heroAvatarWrap: {
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  heroAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,46,64,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroAvatarInitials: {
    fontFamily: fontStacks.regular,
    fontSize: 38,
    fontWeight: '300',
    letterSpacing: -1,
    color: palette.primary,
  },
  heroAvatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF2E40',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroName: {
    fontFamily: fontStacks.regular,
    fontSize: 26,
    fontWeight: '400',
    letterSpacing: -0.5,
    color: palette.text,
    maxWidth: '100%',
  },
  heroEmail: {
    fontFamily: fontStacks.regular,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    maxWidth: '100%',
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,46,64,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  heroBadgeGold: {
    backgroundColor: 'rgba(242,181,60,0.12)',
  },
  heroBadgeText: {
    fontFamily: fontStacks.medium,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: palette.primary,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fontStacks.regular,
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: -0.3,
    color: palette.text,
  },
  statLabel: {
    fontFamily: fontStacks.regular,
    fontSize: 11,
    color: palette.textMuted,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Profile Completion — flat block on the page bg, no card fill.
  completionContainer: {
    backgroundColor: 'transparent',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 0,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  completionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  completionPercentage: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF2E40',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: palette.surface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF2E40',
    borderRadius: 4,
  },
  completionHint: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 8,
  },

  // Section — flat block on the page bg. No white fill, no shadow,
  // no rounded card. Just spaced sections of content, separated by
  // spacing only. (Removed the "card inside card" feel the user kept
  // calling a "white square".)
  section: {
    backgroundColor: 'transparent',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: fontStacks.medium,
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: palette.text,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,46,64,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF2E40',
    marginLeft: 4,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,46,64,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF2E40',
    marginLeft: 4,
  },

  // Profile Picture
  profilePictureContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profilePicture: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,46,64,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profilePictureImage: {
    width: '100%',
    height: '100%',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  changePictureButton: {
    position: 'absolute',
    bottom: 20,
    right: '35%',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF2E40',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  changePictureText: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 8,
  },

  // Fields Container
  fieldsContainer: {
    marginTop: 8,
  },

  // Info Row (View mode)
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 115, 119, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: 14,
  },
  infoLabel: {
    fontSize: 12,
    color: '#A1A1AA',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.text,
  },

  // Input styles (Edit mode)
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputHalf: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1AA',
    marginBottom: 8,
  },
  input: {
    height: 48,
    backgroundColor: palette.bg,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: palette.text,
    borderWidth: 0,
  },
  inputReadOnly: {
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#FF2E40',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0B0F0C',
  },

  // Vehicle row — no inner background. The icon-circle + text + actions
  // sit directly on the parent section card with a subtle bottom rule.
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 14,
    marginBottom: 0,
  },
  vehicleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(13, 115, 119, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: {
    flex: 1,
    marginLeft: 12,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  vehicleDetails: {
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 2,
  },
  vehicleRegistration: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF2E40',
    marginTop: 4,
  },
  vehicleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  vehicleActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Default Badge
  defaultBadge: {
    backgroundColor: 'rgba(124,224,107,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(13, 115, 119, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A1A1AA',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF2E40',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B0F0C',
    marginLeft: 8,
  },

  // Payment row — same treatment as vehicleCard: transparent, no
  // nested fill, just a row of content on the parent section card.
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 14,
    marginBottom: 0,
  },
  paymentIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentType: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  paymentExpiry: {
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 2,
  },
  paymentRemoveButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,107,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF2E40',
    marginTop: 4,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF2E40',
    marginLeft: 8,
  },

  // Notifications
  notificationsList: {
    marginTop: -8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  notificationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationText: {
    fontSize: 15,
    color: '#A1A1AA',
    marginLeft: 12,
  },

  // Quick Links
  quickLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  quickLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkContent: {
    flex: 1,
    marginLeft: 12,
  },
  quickLinkTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.text,
  },
  quickLinkSubtitle: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },

  // Logout — prominent solid pill with the same warm-on-dark feel as
  // the book CTAs across the app. Lifted shadow so it reads as the
  // primary destructive action on the page.
  logoutSection: {
    marginHorizontal: 24,
    marginTop: 32,
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 24,
    backgroundColor: palette.text,
    borderRadius: 999,
    shadowColor: '#E5232E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 6,
  },
  logoutText: {
    fontFamily: fontStacks.medium,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: palette.text,
    marginLeft: 10,
  },
  versionText: {
    fontFamily: fontStacks.regular,
    fontSize: 12,
    color: palette.textSubtle,
    marginTop: 18,
    letterSpacing: 0.4,
  },

  // Modal styles
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.surface,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: palette.surface,
    gap: 12,
  },
  modalDefaultButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(124,224,107,0.12)',
    alignItems: 'center',
  },
  modalDefaultText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF2E40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
  },

  // Vehicle Type Selection
  vehicleTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vehicleTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: palette.surface,
  },
  vehicleTypeButtonActive: {
    backgroundColor: '#FF2E40',
  },
  vehicleTypeText: {
    fontSize: 14,
    color: '#A1A1AA',
  },
  vehicleTypeTextActive: {
    color: palette.text,
    fontWeight: '600',
  },

  // Secure Note
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124,224,107,0.12)',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  secureNoteText: {
    fontSize: 12,
    color: '#059669',
    marginLeft: 8,
  },

  // Success Toast
  successToast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  successToastText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
    marginLeft: 8,
  },
});

export default ProfilePage;
