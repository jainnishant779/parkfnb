// AvailabilityCalendarScreen - Set availability for parking spaces
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TimePickerModal from '../../components/inputs/TimePickerModal';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeInDown,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';

// Storage key
const AVAILABILITY_KEY = 'owners:availability_data';

// Screen dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_SIZE = Math.floor((SCREEN_WIDTH - spacing[4] * 2 - spacing[1] * 6) / 7);

// Types
interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
}

interface DayAvailability {
  available: boolean;
  timeSlots: TimeSlot[];
  isRecurring?: boolean;
  recurringDays?: number[]; // 0=Sunday, 1=Monday, etc.
}

interface AvailabilityData {
  [date: string]: DayAvailability;
}

// Helper functions
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
};

const parseTime = (timeStr: string): Date => {
  const [time, period] = timeStr.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  let hour24 = hours;
  if (period === 'PM' && hours !== 12) hour24 += 12;
  if (period === 'AM' && hours === 12) hour24 = 0;
  const date = new Date();
  date.setHours(hour24, minutes, 0, 0);
  return date;
};

const generateId = (): string => Math.random().toString(36).substr(2, 9);

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Calendar Day component
interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  availability?: DayAvailability;
  onPress: () => void;
  theme: ReturnType<typeof getTheme>;
}

function CalendarDay({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  availability,
  onPress,
  theme,
}: CalendarDayProps) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.9, { damping: 15 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const hasSlots = availability?.timeSlots && availability.timeSlots.length > 0;
  const isAvailable = availability?.available !== false;
  const isRecurring = availability?.isRecurring;

  let bgColor = 'transparent';
  let textColor = isCurrentMonth ? theme.text : theme.textMuted;

  if (isSelected) {
    bgColor = theme.primary;
    textColor = '#FFFFFF';
  } else if (isToday) {
    bgColor = theme.primaryLight;
    textColor = theme.primary;
  } else if (hasSlots && isAvailable) {
    bgColor = theme.successLight;
    textColor = theme.success;
  } else if (!isAvailable && availability) {
    bgColor = theme.dangerLight;
    textColor = theme.danger;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!isCurrentMonth}
      accessibilityLabel={`${date.getDate()} ${MONTHS[date.getMonth()]}`}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.calendarDay,
          { backgroundColor: bgColor },
          isSelected && styles.calendarDaySelected,
          animatedStyle,
        ]}
      >
        <Text
          style={[
            styles.calendarDayText,
            { color: textColor },
            isSelected && styles.calendarDayTextSelected,
            !isCurrentMonth && styles.calendarDayTextMuted,
          ]}
        >
          {date.getDate()}
        </Text>
        {/* Indicators */}
        <View style={styles.dayIndicators}>
          {hasSlots && !isSelected && (
            <View style={[styles.slotIndicator, { backgroundColor: theme.success }]} />
          )}
          {isRecurring && !isSelected && (
            <Ionicons name="repeat" size={8} color={theme.primary} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

// Time Slot Item component
interface TimeSlotItemProps {
  slot: TimeSlot;
  onEdit: () => void;
  onDelete: () => void;
  theme: ReturnType<typeof getTheme>;
}

function TimeSlotItem({ slot, onEdit, onDelete, theme }: TimeSlotItemProps) {
  return (
    <View style={[styles.timeSlotItem, { backgroundColor: theme.primaryLight }]}>
      <View style={styles.timeSlotContent}>
        <Ionicons name="time-outline" size={18} color={theme.primary} />
        <Text style={[styles.timeSlotText, { color: theme.text }]}>
          {slot.startTime} - {slot.endTime}
        </Text>
      </View>
      <View style={styles.timeSlotActions}>
        <Pressable
          onPress={onEdit}
          style={[styles.timeSlotAction, { backgroundColor: theme.surface }]}
          accessibilityLabel="Edit time slot"
        >
          <Ionicons name="pencil-outline" size={16} color={theme.primary} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={[styles.timeSlotAction, { backgroundColor: theme.dangerLight }]}
          accessibilityLabel="Delete time slot"
        >
          <Ionicons name="trash-outline" size={16} color={theme.danger} />
        </Pressable>
      </View>
    </View>
  );
}

// Recurring Day Chip component
interface RecurringDayChipProps {
  day: number;
  isSelected: boolean;
  onToggle: () => void;
  theme: ReturnType<typeof getTheme>;
}

function RecurringDayChip({ day, isSelected, onToggle, theme }: RecurringDayChipProps) {
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.recurringDayChip,
        {
          backgroundColor: isSelected ? theme.primary : theme.surface,
          borderColor: isSelected ? theme.primary : theme.border,
        },
      ]}
      accessibilityLabel={`${DAYS_FULL[day]}, ${isSelected ? 'selected' : 'not selected'}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
    >
      <Text
        style={[
          styles.recurringDayChipText,
          { color: isSelected ? '#FFFFFF' : theme.text },
        ]}
      >
        {DAYS_OF_WEEK[day]}
      </Text>
    </Pressable>
  );
}

// Snackbar component
interface SnackbarProps {
  visible: boolean;
  message: string;
  variant: 'success' | 'error' | 'info';
  onDismiss: () => void;
  theme: ReturnType<typeof getTheme>;
}

function Snackbar({ visible, message, variant, onDismiss, theme }: SnackbarProps) {
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

  const bgColor = variant === 'success' ? theme.success : variant === 'error' ? theme.danger : theme.primary;

  if (!visible) return null;

  return (
    <Animated.View style={[styles.snackbar, { backgroundColor: bgColor }, animatedStyle]}>
      <Ionicons
        name={variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color="#FFFFFF"
      />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
}

// Quick Time Presets
const TIME_PRESETS = [
  { label: 'Morning', start: '6:00 AM', end: '12:00 PM' },
  { label: 'Afternoon', start: '12:00 PM', end: '6:00 PM' },
  { label: 'Evening', start: '6:00 PM', end: '10:00 PM' },
  { label: 'All Day', start: '6:00 AM', end: '10:00 PM' },
  { label: 'Business', start: '9:00 AM', end: '5:00 PM' },
];

// Main Screen
export default function AvailabilityCalendarScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);

  // State
  const [isSaving, setIsSaving] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityData>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Modal state
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [tempStartTime, setTempStartTime] = useState(new Date());
  const [tempEndTime, setTempEndTime] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [isRecurringMode, setIsRecurringMode] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', variant: 'info' });

  // Load availability data
  const loadAvailability = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(AVAILABILITY_KEY);
      if (stored) {
        setAvailability(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load availability:', error);
      showSnackbar('Failed to load availability', 'error');
    }
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Show snackbar
  const showSnackbar = useCallback((message: string, variant: 'success' | 'error' | 'info') => {
    setSnackbar({ visible: true, message, variant });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, visible: false }));
  }, []);

  // Save availability
  const saveAvailability = useCallback(async () => {
    setIsSaving(true);
    try {
      await AsyncStorage.setItem(AVAILABILITY_KEY, JSON.stringify(availability));
      setHasChanges(false);
      showSnackbar('Availability saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save availability:', error);
      showSnackbar('Failed to save availability', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [availability, showSnackbar]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: Date[] = [];

    // Previous month days
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }

    // Next month days to complete the grid
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  }, [currentMonth]);

  // Navigation
  const goToPreviousMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentMonth(new Date());
    setSelectedDate(formatDate(new Date()));
  }, []);

  // Select date
  const handleSelectDate = useCallback((date: Date) => {
    const dateStr = formatDate(date);
    setSelectedDate(dateStr);

    // Set recurring days based on the selected date's day of week
    const dayOfWeek = date.getDay();
    setRecurringDays([dayOfWeek]);
    setIsRecurringMode(false);
  }, []);

  // Open time modal for adding/editing slot
  const openTimeModal = useCallback((slot?: TimeSlot) => {
    if (slot) {
      setEditingSlot(slot);
      setTempStartTime(parseTime(slot.startTime));
      setTempEndTime(parseTime(slot.endTime));
    } else {
      setEditingSlot(null);
      const start = new Date();
      start.setHours(9, 0, 0, 0);
      const end = new Date();
      end.setHours(17, 0, 0, 0);
      setTempStartTime(start);
      setTempEndTime(end);
    }
    setShowTimeModal(true);
  }, []);

  // Apply time preset
  const applyTimePreset = useCallback((preset: typeof TIME_PRESETS[0]) => {
    setTempStartTime(parseTime(preset.start));
    setTempEndTime(parseTime(preset.end));
  }, []);

  // Toggle recurring day
  const toggleRecurringDay = useCallback((day: number) => {
    setRecurringDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  }, []);

  // Apply time slot to availability
  const applyTimeSlot = useCallback((newSlot: TimeSlot) => {
    if (!selectedDate) return;

    if (isRecurringMode && recurringDays.length > 0) {
      // Apply to all recurring days for the current month
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const updates: AvailabilityData = { ...availability };

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        if (recurringDays.includes(date.getDay())) {
          const dateStr = formatDate(date);
          const existing = updates[dateStr] || { available: true, timeSlots: [] };

          if (editingSlot) {
            existing.timeSlots = existing.timeSlots.map(s =>
              s.id === editingSlot.id ? { ...newSlot, id: generateId() } : s
            );
          } else {
            existing.timeSlots = [...existing.timeSlots, { ...newSlot, id: generateId() }];
          }

          existing.isRecurring = true;
          existing.recurringDays = recurringDays;
          updates[dateStr] = existing;
        }
      }

      setAvailability(updates);
      showSnackbar(`Applied to ${recurringDays.length} days/week`, 'success');
    } else {
      // Apply to single date
      setAvailability(prev => {
        const existing = prev[selectedDate] || { available: true, timeSlots: [] };
        let updatedSlots: TimeSlot[];

        if (editingSlot) {
          updatedSlots = existing.timeSlots.map(s =>
            s.id === editingSlot.id ? newSlot : s
          );
        } else {
          updatedSlots = [...existing.timeSlots, newSlot];
        }

        return {
          ...prev,
          [selectedDate]: {
            ...existing,
            available: true,
            timeSlots: updatedSlots,
          },
        };
      });
      showSnackbar(editingSlot ? 'Time slot updated' : 'Time slot added', 'success');
    }

    setHasChanges(true);
    setShowTimeModal(false);
    setEditingSlot(null);
  }, [selectedDate, isRecurringMode, recurringDays, currentMonth, availability, editingSlot, showSnackbar]);

  // Save time slot
  const saveTimeSlot = useCallback(() => {
    if (!selectedDate) return;

    const startTimeStr = formatTime(tempStartTime);
    const endTimeStr = formatTime(tempEndTime);

    // Validate times
    if (tempStartTime >= tempEndTime) {
      showSnackbar('End time must be after start time', 'error');
      return;
    }

    const newSlot: TimeSlot = {
      id: editingSlot?.id || generateId(),
      startTime: startTimeStr,
      endTime: endTimeStr,
    };

    // Check for overlapping slots
    const currentSlots = availability[selectedDate]?.timeSlots || [];
    const hasOverlap = currentSlots.some(slot => {
      if (slot.id === newSlot.id) return false;
      const existingStart = parseTime(slot.startTime);
      const existingEnd = parseTime(slot.endTime);
      return (
        (tempStartTime >= existingStart && tempStartTime < existingEnd) ||
        (tempEndTime > existingStart && tempEndTime <= existingEnd) ||
        (tempStartTime <= existingStart && tempEndTime >= existingEnd)
      );
    });

    if (hasOverlap) {
      AppAlert.alert(
        'Overlapping Time Slots',
        'This time slot overlaps with an existing slot. Do you want to continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => applyTimeSlot(newSlot) },
        ]
      );
      return;
    }

    applyTimeSlot(newSlot);
  }, [selectedDate, tempStartTime, tempEndTime, editingSlot, availability, applyTimeSlot, showSnackbar]);

  // Delete time slot
  const deleteTimeSlot = useCallback((slotId: string) => {
    if (!selectedDate) return;

    AppAlert.alert(
      'Delete Time Slot',
      'Are you sure you want to delete this time slot?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setAvailability(prev => {
              const existing = prev[selectedDate];
              if (!existing) return prev;

              const updatedSlots = existing.timeSlots.filter(s => s.id !== slotId);

              if (updatedSlots.length === 0) {
                const { [selectedDate]: removed, ...rest } = prev;
                return rest;
              }

              return {
                ...prev,
                [selectedDate]: {
                  ...existing,
                  timeSlots: updatedSlots,
                },
              };
            });
            setHasChanges(true);
            showSnackbar('Time slot deleted', 'success');
          },
        },
      ]
    );
  }, [selectedDate, showSnackbar]);

  // Toggle day availability
  const toggleDayAvailability = useCallback(() => {
    if (!selectedDate) return;

    setAvailability(prev => {
      const existing = prev[selectedDate];
      const isCurrentlyAvailable = existing?.available !== false;

      if (isCurrentlyAvailable) {
        // Mark as unavailable
        return {
          ...prev,
          [selectedDate]: {
            available: false,
            timeSlots: [],
          },
        };
      } else {
        // Mark as available (remove entry or reset)
        const { [selectedDate]: removed, ...rest } = prev;
        return rest;
      }
    });
    setHasChanges(true);
  }, [selectedDate]);

  // Clear all slots for selected date
  const clearDaySlots = useCallback(() => {
    if (!selectedDate) return;

    AppAlert.alert(
      'Clear All Slots',
      'Are you sure you want to clear all time slots for this day?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setAvailability(prev => {
              const { [selectedDate]: removed, ...rest } = prev;
              return rest;
            });
            setHasChanges(true);
            showSnackbar('All slots cleared', 'success');
          },
        },
      ]
    );
  }, [selectedDate, showSnackbar]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      AppAlert.alert(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  }, [hasChanges, navigation]);

  // Selected date info
  const selectedDateInfo = useMemo(() => {
    if (!selectedDate) return null;
    const date = parseDate(selectedDate);
    return {
      date,
      dayName: DAYS_FULL[date.getDay()],
      dayNumber: date.getDate(),
      month: MONTHS[date.getMonth()],
      availability: availability[selectedDate],
    };
  }, [selectedDate, availability]);

  // Count stats for current month
  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let availableDays = 0;
    let unavailableDays = 0;
    let totalSlots = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDate(new Date(year, month, day));
      const dayData = availability[dateStr];

      if (dayData) {
        if (dayData.available === false) {
          unavailableDays++;
        } else if (dayData.timeSlots.length > 0) {
          availableDays++;
          totalSlots += dayData.timeSlots.length;
        }
      }
    }

    return { availableDays, unavailableDays, totalSlots };
  }, [currentMonth, availability]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="standard"
        title="Set Availability"
        subtitle="Select your available time slots"
        leftAction={{
          icon: 'back',
          label: 'Cancel',
          onPress: handleCancel,
          showBackground: true,
        }}
        rightActions={[
          {
            icon: 'refresh',
            label: 'Today',
            onPress: goToToday,
          },
        ]}
        showDivider={false}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (hasChanges ? 100 : spacing[6]) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Navigation */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(400)}
          style={[styles.monthNav, { backgroundColor: theme.surface }]}
        >
          <Pressable
            onPress={goToPreviousMonth}
            style={[styles.monthNavButton, { backgroundColor: theme.borderLight }]}
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <View style={styles.monthNavCenter}>
            <Text style={[styles.monthTitle, { color: theme.text }]}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
          </View>
          <Pressable
            onPress={goToNextMonth}
            style={[styles.monthNavButton, { backgroundColor: theme.borderLight }]}
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </Pressable>
        </Animated.View>

        {/* Stats Row */}
        <Animated.View
          entering={FadeInDown.delay(150).duration(400)}
          style={styles.statsRow}
        >
          <View style={[styles.statItem, { backgroundColor: theme.successLight }]}>
            <Text style={[styles.statNumber, { color: theme.success }]}>
              {monthStats.availableDays}
            </Text>
            <Text style={[styles.statLabel, { color: theme.success }]}>Available</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: theme.dangerLight }]}>
            <Text style={[styles.statNumber, { color: theme.danger }]}>
              {monthStats.unavailableDays}
            </Text>
            <Text style={[styles.statLabel, { color: theme.danger }]}>Blocked</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: theme.infoLight }]}>
            <Text style={[styles.statNumber, { color: theme.info }]}>
              {monthStats.totalSlots}
            </Text>
            <Text style={[styles.statLabel, { color: theme.info }]}>Slots</Text>
          </View>
        </Animated.View>

        {/* Calendar */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(400)}
          style={[styles.calendarCard, { backgroundColor: theme.surface }]}
        >
          {/* Week day headers */}
          <View style={styles.weekDaysHeader}>
            {DAYS_OF_WEEK.map((day, index) => (
              <View key={day} style={styles.weekDayItem}>
                <Text
                  style={[
                    styles.weekDayText,
                    { color: index === 0 || index === 6 ? theme.danger : theme.textMuted },
                  ]}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((date, index) => {
              const dateStr = formatDate(date);
              const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
              const today = new Date();
              const isToday =
                date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();

              return (
                <CalendarDay
                  key={index}
                  date={date}
                  isCurrentMonth={isCurrentMonth}
                  isToday={isToday}
                  isSelected={selectedDate === dateStr}
                  availability={availability[dateStr]}
                  onPress={() => handleSelectDate(date)}
                  theme={theme}
                />
              );
            })}
          </View>

          {/* Legend */}
          <View style={[styles.legend, { borderTopColor: theme.borderLight }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.legendText, { color: theme.textMuted }]}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.danger }]} />
              <Text style={[styles.legendText, { color: theme.textMuted }]}>Blocked</Text>
            </View>
            <View style={styles.legendItem}>
              <Ionicons name="repeat" size={12} color={theme.primary} />
              <Text style={[styles.legendText, { color: theme.textMuted }]}>Recurring</Text>
            </View>
          </View>
        </Animated.View>

        {/* Selected Date Details */}
        {selectedDateInfo && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[styles.selectedDateCard, { backgroundColor: theme.surface }]}
          >
            <View style={styles.selectedDateHeader}>
              <View>
                <Text style={[styles.selectedDateTitle, { color: theme.text }]}>
                  {selectedDateInfo.dayName}, {selectedDateInfo.month} {selectedDateInfo.dayNumber}
                </Text>
                <Text style={[styles.selectedDateSubtitle, { color: theme.textMuted }]}>
                  {selectedDateInfo.availability?.timeSlots?.length || 0} time slot(s)
                </Text>
              </View>
              <View style={styles.selectedDateActions}>
                <Pressable
                  onPress={toggleDayAvailability}
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor:
                        selectedDateInfo.availability?.available === false
                          ? theme.successLight
                          : theme.dangerLight,
                    },
                  ]}
                  accessibilityLabel={
                    selectedDateInfo.availability?.available === false
                      ? 'Mark as available'
                      : 'Block this day'
                  }
                >
                  <Ionicons
                    name={
                      selectedDateInfo.availability?.available === false
                        ? 'checkmark-circle'
                        : 'close-circle'
                    }
                    size={18}
                    color={
                      selectedDateInfo.availability?.available === false
                        ? theme.success
                        : theme.danger
                    }
                  />
                </Pressable>
              </View>
            </View>

            {selectedDateInfo.availability?.available === false ? (
              <View style={[styles.blockedMessage, { backgroundColor: theme.dangerLight }]}>
                <Ionicons name="ban" size={24} color={theme.danger} />
                <Text style={[styles.blockedMessageText, { color: theme.danger }]}>
                  This day is blocked
                </Text>
              </View>
            ) : (
              <>
                {/* Time Slots */}
                {selectedDateInfo.availability?.timeSlots && selectedDateInfo.availability.timeSlots.length > 0 ? (
                  <View style={styles.timeSlotsList}>
                    {selectedDateInfo.availability.timeSlots.map(slot => (
                      <TimeSlotItem
                        key={slot.id}
                        slot={slot}
                        onEdit={() => openTimeModal(slot)}
                        onDelete={() => deleteTimeSlot(slot.id)}
                        theme={theme}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.noSlotsMessage}>
                    <Ionicons name="time-outline" size={32} color={theme.textMuted} />
                    <Text style={[styles.noSlotsText, { color: theme.textMuted }]}>
                      No time slots set for this day
                    </Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.dateActionButtons}>
                  <Pressable
                    onPress={() => openTimeModal()}
                    style={[styles.addSlotButton, { backgroundColor: theme.primary }]}
                    accessibilityLabel="Add time slot"
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                    <Text style={styles.addSlotButtonText}>Add Time Slot</Text>
                  </Pressable>
                  {selectedDateInfo.availability?.timeSlots && selectedDateInfo.availability.timeSlots.length > 0 && (
                    <Pressable
                      onPress={clearDaySlots}
                      style={[styles.clearButton, { borderColor: theme.danger }]}
                      accessibilityLabel="Clear all slots"
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* Empty State - No date selected */}
        {!selectedDate && (
          <Animated.View
            entering={FadeIn.duration(400)}
            style={[styles.emptyState, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="calendar-outline" size={40} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Select a Date
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Tap on any date in the calendar above to set your availability
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* Save Button */}
      {hasChanges && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[
            styles.saveButtonContainer,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + spacing[4],
              borderTopColor: theme.borderLight,
            },
          ]}
        >
          <Pressable
            onPress={saveAvailability}
            disabled={isSaving}
            style={[
              styles.saveButton,
              { backgroundColor: theme.primary },
              isSaving && { opacity: 0.7 },
            ]}
            accessibilityLabel="Save availability"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Time Slot Modal */}
      {showTimeModal ? (

        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTimeModal(false)}
        >
          <Animated.View
            entering={SlideInDown.springify().damping(15)}
            exiting={SlideOutDown}
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <Pressable onPress={e => e.stopPropagation()}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {editingSlot ? 'Edit Time Slot' : 'Add Time Slot'}
                </Text>
                <Pressable
                  onPress={() => setShowTimeModal(false)}
                  style={[styles.modalCloseButton, { backgroundColor: theme.borderLight }]}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </Pressable>
              </View>

              {/* Quick Presets */}
              <Text style={[styles.presetsLabel, { color: theme.textSecondary }]}>
                Quick Presets
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.presetsContainer}
                contentContainerStyle={styles.presetsContent}
              >
                {TIME_PRESETS.map(preset => (
                  <Pressable
                    key={preset.label}
                    onPress={() => applyTimePreset(preset)}
                    style={[styles.presetChip, { backgroundColor: theme.primaryLight }]}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>
                      {preset.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Time Pickers */}
              <View style={styles.timePickersRow}>
                <View style={styles.timePickerColumn}>
                  <Text style={[styles.timePickerLabel, { color: theme.textSecondary }]}>
                    Start Time
                  </Text>
                  <Pressable
                    onPress={() => setShowStartPicker(true)}
                    style={[styles.timePickerButton, { backgroundColor: theme.borderLight }]}
                  >
                    <Ionicons name="time-outline" size={20} color={theme.primary} />
                    <Text style={[styles.timePickerValue, { color: theme.text }]}>
                      {formatTime(tempStartTime)}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.timePickerDivider}>
                  <Ionicons name="arrow-forward" size={20} color={theme.textMuted} />
                </View>
                <View style={styles.timePickerColumn}>
                  <Text style={[styles.timePickerLabel, { color: theme.textSecondary }]}>
                    End Time
                  </Text>
                  <Pressable
                    onPress={() => setShowEndPicker(true)}
                    style={[styles.timePickerButton, { backgroundColor: theme.borderLight }]}
                  >
                    <Ionicons name="time-outline" size={20} color={theme.primary} />
                    <Text style={[styles.timePickerValue, { color: theme.text }]}>
                      {formatTime(tempEndTime)}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Recurring Toggle */}
              <Pressable
                onPress={() => setIsRecurringMode(!isRecurringMode)}
                style={[styles.recurringToggle, { backgroundColor: theme.borderLight }]}
              >
                <View style={styles.recurringToggleLeft}>
                  <Ionicons
                    name="repeat"
                    size={20}
                    color={isRecurringMode ? theme.primary : theme.textMuted}
                  />
                  <Text style={[styles.recurringToggleText, { color: theme.text }]}>
                    Apply to recurring days
                  </Text>
                </View>
                <Ionicons
                  name={isRecurringMode ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={isRecurringMode ? theme.primary : theme.textMuted}
                />
              </Pressable>

              {/* Recurring Days Selection */}
              {isRecurringMode && (
                <Animated.View entering={FadeIn.duration(200)} style={styles.recurringDaysContainer}>
                  <Text style={[styles.recurringDaysLabel, { color: theme.textSecondary }]}>
                    Select days to apply this time slot:
                  </Text>
                  <View style={styles.recurringDaysRow}>
                    {DAYS_OF_WEEK.map((_, index) => (
                      <RecurringDayChip
                        key={index}
                        day={index}
                        isSelected={recurringDays.includes(index)}
                        onToggle={() => toggleRecurringDay(index)}
                        theme={theme}
                      />
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Modal Actions */}
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setShowTimeModal(false)}
                  style={[styles.modalCancelButton, { borderColor: theme.border }]}
                >
                  <Text style={[styles.modalCancelText, { color: theme.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveTimeSlot}
                  style={[styles.modalSaveButton, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.modalSaveText}>
                    {isRecurringMode ? 'Apply to Days' : 'Save Slot'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      
      ) : null}

      {/* Start Time Picker */}
      <TimePickerModal
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        title="Start time"
        initialTime={`${String(tempStartTime.getHours()).padStart(2, '0')}:${String(tempStartTime.getMinutes()).padStart(2, '0')}`}
        onSelect={(hhmm) => {
          const [h, m] = hhmm.split(':').map(Number);
          const next = new Date(tempStartTime);
          next.setHours(h, m, 0, 0);
          setTempStartTime(next);
        }}
        minuteStep={5}
      />

      {/* End Time Picker */}
      <TimePickerModal
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        title="End time"
        initialTime={`${String(tempEndTime.getHours()).padStart(2, '0')}:${String(tempEndTime.getMinutes()).padStart(2, '0')}`}
        onSelect={(hhmm) => {
          const [h, m] = hhmm.split(':').map(Number);
          const next = new Date(tempEndTime);
          next.setHours(h, m, 0, 0);
          setTempEndTime(next);
        }}
        minuteStep={5}
      />

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        variant={snackbar.variant}
        onDismiss={hideSnackbar}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  // Month Navigation
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.xl,
    marginBottom: spacing[3],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  monthNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavCenter: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  statNumber: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  // Calendar
  calendarCard: {
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  weekDaysHeader: {
    flexDirection: 'row',
    marginBottom: spacing[2],
  },
  weekDayItem: {
    width: DAY_SIZE,
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  weekDayText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DAY_SIZE / 2,
    marginVertical: spacing[1] / 2,
  },
  calendarDaySelected: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  calendarDayText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  calendarDayTextSelected: {
    fontWeight: fontWeight.bold as any,
  },
  calendarDayTextMuted: {
    opacity: 0.3,
  },
  dayIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    position: 'absolute',
    bottom: 4,
  },
  slotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[4],
    paddingTop: spacing[3],
    marginTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: fontSize.xs,
  },
  // Selected Date Card
  selectedDateCard: {
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  selectedDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[4],
  },
  selectedDateTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  selectedDateSubtitle: {
    fontSize: fontSize.sm,
  },
  selectedDateActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
  },
  blockedMessageText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  timeSlotsList: {
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  timeSlotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
  },
  timeSlotContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  timeSlotText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  timeSlotActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  timeSlotAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noSlotsMessage: {
    alignItems: 'center',
    paddingVertical: spacing[5],
    gap: spacing[2],
  },
  noSlotsText: {
    fontSize: fontSize.sm,
  },
  dateActionButtons: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  addSlotButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  addSlotButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  clearButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    padding: spacing[6],
    borderRadius: borderRadius.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  // Save Button
  saveButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    minHeight: 52,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetsLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
  },
  presetsContainer: {
    marginBottom: spacing[4],
  },
  presetsContent: {
    gap: spacing[2],
  },
  presetChip: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    marginRight: spacing[2],
  },
  presetChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  timePickersRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing[4],
  },
  timePickerColumn: {
    flex: 1,
  },
  timePickerLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    marginBottom: spacing[2],
  },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
  },
  timePickerValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  timePickerDivider: {
    width: 40,
    alignItems: 'center',
    paddingBottom: spacing[3],
  },
  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  recurringToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  recurringToggleText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  recurringDaysContainer: {
    marginBottom: spacing[4],
  },
  recurringDaysLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing[2],
  },
  recurringDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recurringDayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  recurringDayChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  modalCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  modalCancelText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  modalSaveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 100,
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  snackbarText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
});
