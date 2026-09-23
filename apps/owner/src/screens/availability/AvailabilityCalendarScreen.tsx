// AvailabilityCalendarScreen - Set availability for parking spaces
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
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
import { palette, radii, fonts } from '../../theme/kit';
import { ScreenHeader, IconCircle, PillButton, IsoBlock, StatusTag } from '../../components/ui';

// Storage key
const AVAILABILITY_KEY = 'owners:availability_data';

// Screen dimensions: page gutter 16 + calendar card padding 14 on each side.
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 16 * 2 - 14 * 2) / 7);
const DAY_SIZE = Math.min(CELL_SIZE - 4, 44);

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
}

function CalendarDay({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  availability,
  onPress,
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
  const isBlocked = !isAvailable && !!availability;

  let bgColor = 'transparent';
  let textColor = isCurrentMonth ? palette.text : palette.textSubtle;

  if (isSelected) {
    bgColor = palette.ink;
    textColor = palette.textInverse;
  } else if (isBlocked) {
    bgColor = palette.peach;
    textColor = palette.text;
  } else if (hasSlots && isAvailable) {
    bgColor = palette.blueSoft;
    textColor = palette.text;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!isCurrentMonth}
      accessibilityLabel={`${date.getDate()} ${MONTHS[date.getMonth()]}`}
      accessibilityRole="button"
      style={styles.dayCell}
    >
      <Animated.View
        style={[
          styles.calendarDay,
          { backgroundColor: bgColor },
          isToday && !isSelected && styles.calendarDayToday,
          animatedStyle,
        ]}
      >
        <Text
          style={[
            styles.calendarDayText,
            { color: textColor },
            (isSelected || isToday) && styles.calendarDayTextStrong,
          ]}
        >
          {date.getDate()}
        </Text>
      </Animated.View>
      {/* Indicators */}
      <View style={styles.dayIndicators}>
        {hasSlots && !isSelected && isCurrentMonth ? <View style={styles.slotIndicator} /> : null}
        {isRecurring && !isSelected && isCurrentMonth ? (
          <Ionicons name="repeat" size={9} color={palette.textMuted} />
        ) : null}
      </View>
    </Pressable>
  );
}

// Time Slot Item component
interface TimeSlotItemProps {
  slot: TimeSlot;
  onEdit: () => void;
  onDelete: () => void;
}

function TimeSlotItem({ slot, onEdit, onDelete }: TimeSlotItemProps) {
  return (
    <View style={styles.timeSlotItem}>
      <View style={styles.timeSlotContent}>
        <View style={styles.timeSlotIcon}>
          <Ionicons name="time-outline" size={17} color={palette.text} />
        </View>
        <Text style={styles.timeSlotText}>
          {slot.startTime} - {slot.endTime}
        </Text>
      </View>
      <View style={styles.timeSlotActions}>
        <TouchableOpacity
          onPress={onEdit}
          activeOpacity={0.7}
          style={styles.timeSlotAction}
          accessibilityLabel="Edit time slot"
        >
          <Ionicons name="pencil-outline" size={16} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          activeOpacity={0.7}
          style={[styles.timeSlotAction, styles.timeSlotActionDanger]}
          accessibilityLabel="Delete time slot"
        >
          <Ionicons name="trash-outline" size={16} color={palette.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Recurring Day Chip component
interface RecurringDayChipProps {
  day: number;
  isSelected: boolean;
  onToggle: () => void;
}

function RecurringDayChip({ day, isSelected, onToggle }: RecurringDayChipProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.75}
      style={[styles.recurringDayChip, isSelected && styles.recurringDayChipOn]}
      accessibilityLabel={`${DAYS_FULL[day]}, ${isSelected ? 'selected' : 'not selected'}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
    >
      <Text style={[styles.recurringDayChipText, isSelected && styles.recurringDayChipTextOn]}>
        {DAYS_OF_WEEK[day]}
      </Text>
    </TouchableOpacity>
  );
}

// Snackbar component
interface SnackbarProps {
  visible: boolean;
  message: string;
  variant: 'success' | 'error' | 'info';
  onDismiss: () => void;
  bottom: number;
}

function Snackbar({ visible, message, variant, onDismiss, bottom }: SnackbarProps) {
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

  const iconColor =
    variant === 'success' ? palette.success : variant === 'error' ? palette.danger : palette.peach;

  if (!visible) return null;

  return (
    <Animated.View style={[styles.snackbar, { bottom }, animatedStyle]}>
      <Ionicons
        name={variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle'}
        size={20}
        color={iconColor}
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

  const selectedSlots = selectedDateInfo?.availability?.timeSlots ?? [];
  const selectedBlocked = selectedDateInfo?.availability?.available === false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <ScreenHeader
        title="Set availability"
        onBack={handleCancel}
        right={<IconCircle icon="rotate-ccw" size={40} onPress={goToToday} />}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (hasChanges ? 110 : 28) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Month summary */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.monthNav}>
          <View style={styles.flex}>
            <Text style={styles.monthLabel}>Select your available time slots</Text>
            <Text style={styles.monthTitle}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
          </View>
          <IconCircle
            icon="chevron-left"
            size={44}
            onPress={goToPreviousMonth}
            style={styles.monthNavGap}
          />
          <IconCircle icon="chevron-right" size={44} onPress={goToNextMonth} />
        </Animated.View>

        {/* Stats Row */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.statsRow}>
          <View style={[styles.statItem, { backgroundColor: palette.blueSoft }]}>
            <Text style={styles.statNumber}>{monthStats.availableDays}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: palette.peachSoft }]}>
            <Text style={styles.statNumber}>{monthStats.unavailableDays}</Text>
            <Text style={styles.statLabel}>Blocked</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: palette.surface }]}>
            <Text style={styles.statNumber}>{monthStats.totalSlots}</Text>
            <Text style={styles.statLabel}>Slots</Text>
          </View>
        </Animated.View>

        {/* Calendar */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.calendarCard}>
          {/* Week day headers */}
          <View style={styles.weekDaysHeader}>
            {DAYS_OF_WEEK.map((day) => (
              <View key={day} style={styles.weekDayItem}>
                <Text style={styles.weekDayText}>{day}</Text>
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
                />
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: palette.blueSoft }]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: palette.peach }]} />
              <Text style={styles.legendText}>Blocked</Text>
            </View>
            <View style={styles.legendItem}>
              <Ionicons name="repeat" size={12} color={palette.textMuted} />
              <Text style={styles.legendText}>Recurring</Text>
            </View>
          </View>
        </Animated.View>

        {/* Selected Date Details */}
        {selectedDateInfo && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.selectedDateCard}>
            <View style={styles.selectedDateHeader}>
              <View style={styles.flex}>
                <StatusTag
                  label={selectedBlocked ? 'Blocked' : selectedSlots.length > 0 ? 'Available' : 'Not set'}
                  tone={selectedBlocked ? 'warning' : selectedSlots.length > 0 ? 'ink' : 'grey'}
                  style={styles.selectedTag}
                />
                <Text style={styles.selectedDateTitle}>
                  {selectedDateInfo.dayName}, {selectedDateInfo.month} {selectedDateInfo.dayNumber}
                </Text>
                <Text style={styles.selectedDateSubtitle}>
                  {selectedDateInfo.availability?.timeSlots?.length || 0} time slot(s)
                </Text>
              </View>
              <TouchableOpacity
                onPress={toggleDayAvailability}
                activeOpacity={0.8}
                style={[styles.actionButton, selectedBlocked ? styles.actionUnblock : styles.actionBlock]}
                accessibilityLabel={selectedBlocked ? 'Mark as available' : 'Block this day'}
              >
                <Ionicons
                  name={selectedBlocked ? 'checkmark-circle-outline' : 'ban-outline'}
                  size={16}
                  color={selectedBlocked ? palette.textInverse : palette.text}
                />
                <Text style={[styles.actionButtonText, selectedBlocked && styles.actionButtonTextOn]}>
                  {selectedBlocked ? 'Unblock' : 'Block day'}
                </Text>
              </TouchableOpacity>
            </View>

            {selectedBlocked ? (
              <View style={styles.blockedMessage}>
                <View style={styles.blockedArt} pointerEvents="none">
                  <IsoBlock size={110} tone="peach" />
                </View>
                <Text style={styles.blockedMessageTitle}>This day is blocked</Text>
                <Text style={styles.blockedMessageText}>
                  Renters can't book any slot on this date.
                </Text>
              </View>
            ) : (
              <>
                {/* Time Slots */}
                {selectedSlots.length > 0 ? (
                  <View style={styles.timeSlotsList}>
                    {selectedSlots.map(slot => (
                      <TimeSlotItem
                        key={slot.id}
                        slot={slot}
                        onEdit={() => openTimeModal(slot)}
                        onDelete={() => deleteTimeSlot(slot.id)}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.noSlotsMessage}>
                    <Ionicons name="time-outline" size={26} color={palette.textMuted} />
                    <Text style={styles.noSlotsText}>No time slots set for this day</Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.dateActionButtons}>
                  <PillButton
                    label="Add time slot"
                    icon="plus"
                    variant="ink"
                    size="md"
                    onPress={() => openTimeModal()}
                    style={styles.flex}
                  />
                  {selectedSlots.length > 0 && (
                    <IconCircle
                      icon="trash-2"
                      size={48}
                      variant="grey"
                      color={palette.danger}
                      onPress={clearDaySlots}
                      style={styles.clearButton}
                    />
                  )}
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* Empty State - No date selected */}
        {!selectedDate && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyState}>
            <View style={styles.emptyArt} pointerEvents="none">
              <IsoBlock size={130} tone="blue" />
            </View>
            <Text style={styles.emptyTitle}>Select a date</Text>
            <Text style={styles.emptySubtitle}>
              Tap on any date in the calendar above to set your availability
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* Save Button */}
      {hasChanges && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.saveButtonContainer, { paddingBottom: insets.bottom + 16 }]}
        >
          <PillButton
            label="Save changes"
            icon="check"
            variant="ink"
            loading={isSaving}
            onPress={saveAvailability}
          />
        </Animated.View>
      )}

      {/* Time Slot Sheet */}
      {showTimeModal ? (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowTimeModal(false)}
          />
          <Animated.View
            entering={SlideInDown.springify().damping(15)}
            exiting={SlideOutDown}
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <View style={styles.grabber} />
            {/* Sheet Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingSlot ? 'Edit time slot' : 'Add time slot'}
              </Text>
              <IconCircle
                icon="x"
                size={38}
                variant="grey"
                onPress={() => setShowTimeModal(false)}
              />
            </View>

            {/* Quick Presets */}
            <Text style={styles.presetsLabel}>Quick presets</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetsContainer}
              contentContainerStyle={styles.presetsContent}
            >
              {TIME_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset.label}
                  activeOpacity={0.75}
                  onPress={() => applyTimePreset(preset)}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Time Pickers */}
            <View style={styles.timePickersRow}>
              <View style={styles.timePickerColumn}>
                <Text style={styles.timePickerLabel}>Start time</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowStartPicker(true)}
                  style={styles.timePickerButton}
                >
                  <Ionicons name="time-outline" size={18} color={palette.textMuted} />
                  <Text style={styles.timePickerValue}>{formatTime(tempStartTime)}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timePickerDivider}>
                <Ionicons name="arrow-forward" size={18} color={palette.textMuted} />
              </View>
              <View style={styles.timePickerColumn}>
                <Text style={styles.timePickerLabel}>End time</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowEndPicker(true)}
                  style={styles.timePickerButton}
                >
                  <Ionicons name="time-outline" size={18} color={palette.textMuted} />
                  <Text style={styles.timePickerValue}>{formatTime(tempEndTime)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Recurring Toggle */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsRecurringMode(!isRecurringMode)}
              style={styles.recurringToggle}
            >
              <View style={styles.recurringToggleLeft}>
                <View style={styles.recurringIcon}>
                  <Ionicons name="repeat" size={18} color={palette.text} />
                </View>
                <Text style={styles.recurringToggleText}>Apply to recurring days</Text>
              </View>
              <View style={[styles.checkbox, isRecurringMode && styles.checkboxOn]}>
                {isRecurringMode ? (
                  <Ionicons name="checkmark" size={16} color={palette.textInverse} />
                ) : null}
              </View>
            </TouchableOpacity>

            {/* Recurring Days Selection */}
            {isRecurringMode && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.recurringDaysContainer}>
                <Text style={styles.recurringDaysLabel}>Select days to apply this time slot:</Text>
                <View style={styles.recurringDaysRow}>
                  {DAYS_OF_WEEK.map((_, index) => (
                    <RecurringDayChip
                      key={index}
                      day={index}
                      isSelected={recurringDays.includes(index)}
                      onToggle={() => toggleRecurringDay(index)}
                    />
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Sheet Actions */}
            <View style={styles.modalActions}>
              <PillButton
                label="Cancel"
                variant="grey"
                onPress={() => setShowTimeModal(false)}
                style={styles.flex}
              />
              <PillButton
                label={isRecurringMode ? 'Apply to days' : 'Save slot'}
                variant="ink"
                onPress={saveTimeSlot}
                style={styles.modalSave}
              />
            </View>
          </Animated.View>
        </View>
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
        bottom={insets.bottom + (hasChanges ? 96 : 24)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6 },

  // Month navigation
  monthNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 16 },
  monthLabel: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  monthTitle: {
    ...fonts.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: palette.text,
    marginTop: 2,
  },
  monthNavGap: { marginRight: 8 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statItem: { flex: 1, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: 14 },
  statNumber: { ...fonts.semibold, fontSize: 26, letterSpacing: -0.6, color: palette.text },
  statLabel: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },

  // Calendar
  calendarCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 12,
  },
  weekDaysHeader: { flexDirection: 'row', marginBottom: 4 },
  weekDayItem: { width: CELL_SIZE, alignItems: 'center', paddingVertical: 6 },
  weekDayText: { ...fonts.semibold, fontSize: 12, color: palette.textMuted },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: CELL_SIZE, alignItems: 'center', paddingTop: 2, height: DAY_SIZE + 10 },
  calendarDay: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayToday: { borderWidth: 1.5, borderColor: palette.ink },
  calendarDayText: { ...fonts.medium, fontSize: 15 },
  calendarDayTextStrong: { ...fonts.bold },
  dayIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 8,
    gap: 2,
  },
  slotIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.ink },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted },

  // Selected date
  selectedDateCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
  },
  selectedDateHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  selectedTag: { alignSelf: 'flex-start', marginBottom: 10 },
  selectedDateTitle: { ...fonts.bold, fontSize: 22, letterSpacing: -0.5, color: palette.text },
  selectedDateSubtitle: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 2 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    marginLeft: 10,
  },
  actionBlock: { backgroundColor: palette.peachSoft },
  actionUnblock: { backgroundColor: palette.ink },
  actionButtonText: { ...fonts.semibold, fontSize: 13, color: palette.text, marginLeft: 6 },
  actionButtonTextOn: { color: palette.textInverse },
  blockedMessage: {
    backgroundColor: palette.peachSoft,
    borderRadius: radii.lg,
    padding: 18,
    minHeight: 110,
    overflow: 'hidden',
  },
  blockedArt: { position: 'absolute', right: -24, bottom: -22 },
  blockedMessageTitle: { ...fonts.bold, fontSize: 18, color: palette.text, width: '65%' },
  blockedMessageText: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    width: '62%',
  },
  timeSlotsList: { gap: 8, marginBottom: 14 },
  timeSlotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timeSlotContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  timeSlotIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  timeSlotText: { ...fonts.semibold, fontSize: 15, color: palette.text },
  timeSlotActions: { flexDirection: 'row', gap: 8 },
  timeSlotAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotActionDanger: { backgroundColor: palette.dangerSoft },
  noSlotsMessage: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.lg,
    marginBottom: 14,
  },
  noSlotsText: { ...fonts.medium, fontSize: 13.5, color: palette.textMuted, marginTop: 8 },
  dateActionButtons: { flexDirection: 'row', alignItems: 'center' },
  clearButton: { marginLeft: 10 },

  // Empty state
  emptyState: {
    backgroundColor: palette.blueSoft,
    borderRadius: radii.xl,
    padding: 18,
    minHeight: 140,
    overflow: 'hidden',
  },
  emptyArt: { position: 'absolute', right: -28, bottom: -24 },
  emptyTitle: { ...fonts.bold, fontSize: 22, letterSpacing: -0.5, color: palette.text, width: '62%' },
  emptySubtitle: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 6,
    width: '60%',
  },

  // Save bar
  saveButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: palette.bg,
  },

  // Sheet
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
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { ...fonts.semibold, fontSize: 22, letterSpacing: -0.4, color: palette.text },
  presetsLabel: { ...fonts.semibold, fontSize: 14, color: palette.text, marginBottom: 10 },
  presetsContainer: { marginBottom: 16, flexGrow: 0 },
  presetsContent: { gap: 8 },
  presetChip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    justifyContent: 'center',
  },
  presetChipText: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  timePickersRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  timePickerColumn: { flex: 1 },
  timePickerLabel: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginBottom: 8 },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    gap: 8,
  },
  timePickerValue: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  timePickerDivider: { height: 52, justifyContent: 'center', paddingHorizontal: 8 },
  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceDim,
    marginBottom: 12,
  },
  recurringToggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  recurringIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  recurringToggleText: { ...fonts.semibold, fontSize: 15, color: palette.text },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: palette.ink, borderColor: palette.ink },
  recurringDaysContainer: { marginBottom: 12 },
  recurringDaysLabel: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginBottom: 10 },
  recurringDaysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  recurringDayChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringDayChipOn: { backgroundColor: palette.ink },
  recurringDayChipText: { ...fonts.semibold, fontSize: 12.5, color: palette.text },
  recurringDayChipTextOn: { color: palette.textInverse },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalSave: { flex: 1.4 },

  // Snackbar
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    paddingVertical: 14,
    paddingHorizontal: 18,
    zIndex: 10000,
    elevation: 30,
  },
  snackbarText: { ...fonts.semibold, flex: 1, fontSize: 14, color: palette.textInverse },
});
