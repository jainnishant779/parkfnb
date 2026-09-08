/**
 * LotSetupScreen.tsx
 * Empty Land / Lot Owner Setup Screen
 * UI-only implementation with local AsyncStorage persistence
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Modal,
  Platform,
  Animated,
  KeyboardAvoidingView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Image as RNImage } from 'react-native';
import { pickAndUploadImage, handleMediaUploadError } from '../../utils/mediaUpload';
import MediaPickerSheet from '../../components/common/MediaPickerSheet';
import { DateField, TimeField } from '../../components/inputs/DateField';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type UnitType = 'sqft' | 'sqm';
type ConfirmMode = 'manual' | 'instant';
type StepKey = 'boundary' | 'sections' | 'availability' | 'access';

interface Boundary {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Section {
  id: string;
  name: string;
  type: 'equal' | 'custom';
  area: number;
  capacity: number;
  priceHourly: number;
  priceDaily: number;
  isActive: boolean;
  color: string;
}

interface Availability {
  isActive: boolean;
  isEventMode: boolean;
  eventName: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  minHours: number;
  maxDays: number;
  confirmMode: ConfirmMode;
  isPaused: boolean;
  pauseReason: string;
  pauseStart: string;
  pauseEnd: string;
}

interface Access {
  instructions: string;
  rules: string[];
  otherRules: string;
  signageEnabled: boolean;
}

interface Inspection {
  id: string;
  date: string;
  notes: string;
  photoUrl?: string;
}

interface LotSetupData {
  lotId: string;
  lotName: string;
  landmark: string;
  unit: UnitType;
  length: number;
  width: number;
  area: number;
  boundary: Boundary;
  sections: Section[];
  availability: Availability;
  access: Access;
  inspections: Inspection[];
  updatedAt: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = '@ownerapp/empty_lot_setup_v1';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - spacing[4] * 2 - spacing[4] * 2;
const CANVAS_HEIGHT = 200;

const SECTION_COLORS = [
  '#0D7377', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const RULE_OPTIONS = [
  'No overnight parking',
  'Keep lanes clear',
  'Speed limit 10 mph',
  'No vehicle washing',
  'No commercial vehicles',
  'No RVs or trailers',
  'Must display permit',
  'No idling engines',
];

const STEPS: { key: StepKey; label: string; icon: string }[] = [
  { key: 'boundary', label: 'Boundary', icon: 'resize-outline' },
  { key: 'sections', label: 'Sections', icon: 'grid-outline' },
  { key: 'availability', label: 'Availability', icon: 'time-outline' },
  { key: 'access', label: 'Access', icon: 'key-outline' },
];

// Typography
const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
};

const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatArea(value: number, unit: UnitType): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M ${unit}`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K ${unit}`;
  }
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function getDefaultData(): LotSetupData {
  return {
    lotId: generateId(),
    lotName: '',
    landmark: '',
    unit: 'sqft',
    length: 100,
    width: 80,
    area: 8000,
    boundary: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    sections: [],
    availability: {
      isActive: false,
      isEventMode: false,
      eventName: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      minHours: 1,
      maxDays: 7,
      confirmMode: 'instant',
      isPaused: false,
      pauseReason: '',
      pauseStart: '',
      pauseEnd: '',
    },
    access: {
      instructions: '',
      rules: [],
      otherRules: '',
      signageEnabled: false,
    },
    inspections: [],
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// ASYNC STORAGE HELPERS
// ============================================================================

async function loadLotSetupData(): Promise<LotSetupData | null> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      return JSON.parse(json) as LotSetupData;
    }
    return null;
  } catch (error) {
    console.error('Failed to load lot setup data:', error);
    return null;
  }
}

async function saveLotSetupData(data: LotSetupData): Promise<boolean> {
  try {
    data.updatedAt = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to save lot setup data:', error);
    return false;
  }
}

async function clearLotSetupData(): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear lot setup data:', error);
    return false;
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// --- Card Container ---
interface CardProps {
  children: React.ReactNode;
  style?: any;
}

function Card({ children, style }: CardProps) {
  const theme = getTheme(false);
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }, style]}>
      {children}
    </View>
  );
}

// --- Section Header ---
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const theme = getTheme(false);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}

// --- Toggle Row ---
interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, value, onValueChange, disabled }: ToggleRowProps) {
  const theme = getTheme(false);
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleRowText}>
        <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
        {description && (
          <Text style={[styles.toggleDescription, { color: theme.textSecondary }]}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
      />
    </View>
  );
}

// --- Input Field ---
interface InputFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  multiline?: boolean;
  numberOfLines?: number;
  suffix?: string;
  error?: string;
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  suffix,
  error,
}: InputFieldProps) {
  const theme = getTheme(false);
  return (
    <View style={styles.inputFieldContainer}>
      <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.inputField,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: error ? theme.danger : theme.border,
            },
            multiline && { height: numberOfLines * 24 + 24, textAlignVertical: 'top' },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />
        {suffix && (
          <Text style={[styles.inputSuffix, { color: theme.textMuted }]}>{suffix}</Text>
        )}
      </View>
      {error && <Text style={[styles.inputError, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
}

// --- Chip ---
interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Chip({ label, selected, onPress }: ChipProps) {
  const theme = getTheme(false);
  return (
    <Pressable
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.background,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <Text
        style={[
          styles.chipText,
          { color: selected ? '#FFF' : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// --- Chip Row ---
interface ChipRowProps {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}

function ChipRow({ options, selected, onToggle }: ChipRowProps) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={selected.includes(option)}
          onPress={() => onToggle(option)}
        />
      ))}
    </View>
  );
}

// --- Progress Checklist Card ---
interface ProgressChecklistProps {
  data: LotSetupData;
}

function ProgressChecklistCard({ data }: ProgressChecklistProps) {
  const theme = getTheme(false);

  const checks = useMemo(() => {
    return [
      { label: 'Boundary marked', done: data.lotName.trim().length > 0 && data.length > 0 && data.width > 0 },
      { label: 'Sections created', done: data.sections.length > 0 },
      { label: 'Pricing set', done: data.sections.some(s => s.priceHourly > 0 || s.priceDaily > 0) },
      { label: 'Availability set', done: data.availability.isActive },
      { label: 'Access info added', done: data.access.instructions.trim().length > 0 },
    ];
  }, [data]);

  const completedCount = checks.filter(c => c.done).length;
  const progress = (completedCount / checks.length) * 100;

  return (
    <Card>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressTitle, { color: theme.text }]}>Setup Progress</Text>
        <Text style={[styles.progressPercent, { color: theme.primary }]}>
          {Math.round(progress)}% complete
        </Text>
      </View>
      <View style={[styles.progressBar, { backgroundColor: theme.borderLight }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: theme.primary, width: `${progress}%` },
          ]}
        />
      </View>
      <View style={styles.checklistContainer}>
        {checks.map((check, index) => (
          <View key={index} style={styles.checklistItem}>
            <Ionicons
              name={check.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={check.done ? theme.success : theme.textMuted}
            />
            <Text
              style={[
                styles.checklistLabel,
                { color: check.done ? theme.text : theme.textMuted },
              ]}
            >
              {check.label}
            </Text>
          </View>
        ))}
      </View>
      {progress < 100 && (
        <Text style={[styles.progressHint, { color: theme.warning }]}>
          Finish setup to activate your lot listing.
        </Text>
      )}
    </Card>
  );
}

// --- Segmented Stepper ---
interface SegmentedStepperProps {
  steps: typeof STEPS;
  activeStep: StepKey;
  onStepPress: (step: StepKey) => void;
}

function SegmentedStepper({ steps, activeStep, onStepPress }: SegmentedStepperProps) {
  const theme = getTheme(false);
  return (
    <View style={[styles.stepperContainer, { backgroundColor: theme.surface }]}>
      {steps.map((step, index) => {
        const isActive = activeStep === step.key;
        return (
          <Pressable
            key={step.key}
            style={[
              styles.stepperItem,
              isActive && { backgroundColor: theme.primaryLight },
            ]}
            onPress={() => onStepPress(step.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons
              name={step.icon as any}
              size={20}
              color={isActive ? theme.primary : theme.textMuted}
            />
            <Text
              style={[
                styles.stepperLabel,
                { color: isActive ? theme.primary : theme.textMuted },
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Plan View Canvas ---
interface PlanViewCanvasProps {
  boundary: Boundary;
  sections: Section[];
  onBoundaryChange: (b: Boundary) => void;
  length: number;
  width: number;
  unit: UnitType;
}

function PlanViewCanvas({
  boundary,
  sections,
  onBoundaryChange,
  length,
  width,
  unit,
}: PlanViewCanvasProps) {
  const theme = getTheme(false);

  // Calculate boundary position and size
  const boundaryStyle = {
    left: boundary.x * CANVAS_WIDTH,
    top: boundary.y * CANVAS_HEIGHT,
    width: boundary.w * CANVAS_WIDTH,
    height: boundary.h * CANVAS_HEIGHT,
  };

  // Render grid lines
  const gridLines = [];
  const gridSpacing = 20;
  for (let i = gridSpacing; i < CANVAS_WIDTH; i += gridSpacing) {
    gridLines.push(
      <View
        key={`v-${i}`}
        style={[
          styles.gridLineVertical,
          { left: i, backgroundColor: theme.borderLight },
        ]}
      />
    );
  }
  for (let i = gridSpacing; i < CANVAS_HEIGHT; i += gridSpacing) {
    gridLines.push(
      <View
        key={`h-${i}`}
        style={[
          styles.gridLineHorizontal,
          { top: i, backgroundColor: theme.borderLight },
        ]}
      />
    );
  }

  // Handle corner press (simplified - no actual dragging, just visual)
  const handleCornerPress = (corner: string) => {
    // In a real implementation, this would start a pan gesture
    // For now, we'll just show the handles visually
  };

  return (
    <View style={[styles.canvasContainer, { backgroundColor: theme.background }]}>
      {/* Grid */}
      {gridLines}

      {/* Boundary Rectangle */}
      <View
        style={[
          styles.boundaryRect,
          boundaryStyle,
          { borderColor: theme.primary, backgroundColor: `${theme.primary}15` },
        ]}
      >
        {/* Corner handles */}
        {['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((corner) => {
          const cornerStyles: any = {
            topLeft: { top: -6, left: -6 },
            topRight: { top: -6, right: -6 },
            bottomLeft: { bottom: -6, left: -6 },
            bottomRight: { bottom: -6, right: -6 },
          };
          return (
            <View
              key={corner}
              style={[
                styles.cornerHandle,
                cornerStyles[corner],
                { backgroundColor: theme.primary },
              ]}
            />
          );
        })}

        {/* Dimension labels */}
        <View style={styles.dimensionLabelTop}>
          <Text style={[styles.dimensionText, { color: theme.primary }]}>
            {width} {unit === 'sqft' ? 'ft' : 'm'}
          </Text>
        </View>
        <View style={styles.dimensionLabelSide}>
          <Text style={[styles.dimensionText, { color: theme.primary }]}>
            {length} {unit === 'sqft' ? 'ft' : 'm'}
          </Text>
        </View>

        {/* Section overlays */}
        {sections.length > 0 && (
          <View style={styles.sectionsOverlay}>
            {sections.map((section, idx) => {
              const sectionWidth = 100 / sections.length;
              return (
                <View
                  key={section.id}
                  style={[
                    styles.sectionBlock,
                    {
                      width: `${sectionWidth}%`,
                      backgroundColor: `${section.color}40`,
                      borderColor: section.color,
                    },
                  ]}
                >
                  <Text style={[styles.sectionLabel, { color: section.color }]}>
                    {section.name || String.fromCharCode(65 + idx)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Area label */}
      <View style={[styles.areaLabel, { backgroundColor: theme.surface }]}>
        <Text style={[styles.areaLabelText, { color: theme.text }]}>
          Total: {formatArea(length * width, unit)}
        </Text>
      </View>
    </View>
  );
}

// --- Section Card ---
interface SectionCardProps {
  section: Section;
  index: number;
  onEdit: () => void;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function SectionCard({
  section,
  index,
  onEdit,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: SectionCardProps) {
  const theme = getTheme(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
      <View style={styles.sectionCardHeader}>
        <View style={[styles.sectionColorDot, { backgroundColor: section.color }]} />
        <View style={styles.sectionCardInfo}>
          <Text style={[styles.sectionCardName, { color: theme.text }]}>
            {section.name || `Section ${String.fromCharCode(65 + index)}`}
          </Text>
          <Text style={[styles.sectionCardMeta, { color: theme.textSecondary }]}>
            {formatArea(section.area, 'sqft')} • {section.capacity} vehicles
          </Text>
        </View>
        <Switch
          value={section.isActive}
          onValueChange={onToggle}
          trackColor={{ false: theme.border, true: theme.success }}
          thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
        />
      </View>
      <View style={styles.sectionCardPricing}>
        <View style={styles.priceItem}>
          <Text style={[styles.priceLabel, { color: theme.textMuted }]}>Hourly</Text>
          <Text style={[styles.priceValue, { color: theme.text }]}>
            {formatCurrency(section.priceHourly)}
          </Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={[styles.priceLabel, { color: theme.textMuted }]}>Daily</Text>
          <Text style={[styles.priceValue, { color: theme.text }]}>
            {formatCurrency(section.priceDaily)}
          </Text>
        </View>
      </View>
      <View style={styles.sectionCardActions}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: theme.background }]}
          onPress={onEdit}
        >
          <Ionicons name="pencil-outline" size={16} color={theme.primary} />
          <Text style={[styles.actionBtnText, { color: theme.primary }]}>Edit</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: theme.background }]}
          onPress={() => setShowMenu(!showMenu)}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.textMuted} />
        </Pressable>
      </View>
      {showMenu && (
        <View style={[styles.sectionMenu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {onMoveUp && (
            <Pressable style={styles.menuItem} onPress={() => { onMoveUp(); setShowMenu(false); }}>
              <Ionicons name="arrow-up" size={16} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>Move Up</Text>
            </Pressable>
          )}
          {onMoveDown && (
            <Pressable style={styles.menuItem} onPress={() => { onMoveDown(); setShowMenu(false); }}>
              <Ionicons name="arrow-down" size={16} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>Move Down</Text>
            </Pressable>
          )}
          <Pressable style={styles.menuItem} onPress={() => { onDuplicate(); setShowMenu(false); }}>
            <Ionicons name="copy-outline" size={16} color={theme.text} />
            <Text style={[styles.menuItemText, { color: theme.text }]}>Duplicate</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => { onDelete(); setShowMenu(false); }}>
            <Ionicons name="trash-outline" size={16} color={theme.danger} />
            <Text style={[styles.menuItemText, { color: theme.danger }]}>Delete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- Empty State ---
interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const theme = getTheme(false);
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyStateIcon, { backgroundColor: theme.primaryLight }]}>
        <Ionicons name={icon as any} size={32} color={theme.primary} />
      </View>
      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyStateDesc, { color: theme.textSecondary }]}>
        {description}
      </Text>
      {action && (
        <Pressable
          style={[styles.emptyStateBtn, { backgroundColor: theme.primary }]}
          onPress={action.onPress}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.emptyStateBtnText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

// --- Toast ---
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning';
  visible: boolean;
  onDismiss: () => void;
}

function Toast({ message, type, visible, onDismiss }: ToastProps) {
  const theme = getTheme(false);
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }).start(() => onDismiss());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  const bgColor = type === 'success' ? theme.success : type === 'error' ? theme.danger : theme.warning;
  const iconName = type === 'success' ? 'checkmark-circle' : type === 'error' ? 'alert-circle' : 'warning';

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={iconName} size={20} color="#FFF" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// --- Bottom Sheet Modal ---
interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const theme = getTheme(false);
  const insets = useSafeAreaInsets();

  return visible ? (

      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.bottomSheet,
            { backgroundColor: theme.surface, paddingBottom: insets.bottom + spacing[4] },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    
    ) : null;
}

// --- Section Editor Modal ---
interface SectionEditorModalProps {
  visible: boolean;
  onClose: () => void;
  section: Section | null;
  onSave: (section: Section) => void;
  lotArea: number;
  existingSectionsArea: number;
}

function SectionEditorModal({
  visible,
  onClose,
  section,
  onSave,
  lotArea,
  existingSectionsArea,
}: SectionEditorModalProps) {
  const theme = getTheme(false);
  const isEditing = section !== null;
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [priceHourly, setPriceHourly] = useState('');
  const [priceDaily, setPriceDaily] = useState('');
  const [areaPercent, setAreaPercent] = useState('25');

  useEffect(() => {
    if (section) {
      setName(section.name);
      setCapacity(section.capacity.toString());
      setPriceHourly(section.priceHourly.toString());
      setPriceDaily(section.priceDaily.toString());
      setAreaPercent(Math.round((section.area / lotArea) * 100).toString());
    } else {
      setName('');
      setCapacity('10');
      setPriceHourly('5');
      setPriceDaily('25');
      setAreaPercent('25');
    }
  }, [section, visible]);

  const handleSave = () => {
    const area = (parseFloat(areaPercent) / 100) * lotArea;
    const newSection: Section = {
      id: section?.id || generateId(),
      name: name.trim(),
      type: 'custom',
      area,
      capacity: parseInt(capacity) || 0,
      priceHourly: parseFloat(priceHourly) || 0,
      priceDaily: parseFloat(priceDaily) || 0,
      isActive: section?.isActive ?? true,
      color: section?.color || SECTION_COLORS[Math.floor(Math.random() * SECTION_COLORS.length)],
    };
    onSave(newSection);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit Section' : 'Add Section'}
    >
      <InputField
        label="Section Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g., Zone A, Front Row"
      />
      <InputField
        label="Area (% of lot)"
        value={areaPercent}
        onChangeText={setAreaPercent}
        keyboardType="numeric"
        suffix="%"
      />
      <InputField
        label="Vehicle Capacity"
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="numeric"
        placeholder="Number of vehicles"
      />
      <View style={styles.rowInputs}>
        <View style={styles.halfInput}>
          <InputField
            label="Hourly Rate"
            value={priceHourly}
            onChangeText={setPriceHourly}
            keyboardType="numeric"
            suffix="$"
          />
        </View>
        <View style={styles.halfInput}>
          <InputField
            label="Daily Rate"
            value={priceDaily}
            onChangeText={setPriceDaily}
            keyboardType="numeric"
            suffix="$"
          />
        </View>
      </View>
      <Pressable
        style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
        onPress={handleSave}
      >
        <Text style={styles.primaryBtnText}>
          {isEditing ? 'Save Changes' : 'Add Section'}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

// --- Inspection Log Modal ---
interface InspectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (inspection: Inspection) => void;
}

function InspectionModal({ visible, onClose, onSave }: InspectionModalProps) {
  const theme = getTheme(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePick = async (source: 'camera' | 'gallery') => {
    setSheetOpen(false);
    setUploading(true);
    try {
      // Lot/property-style image — match the consumer-app 16:9 display.
      const result = await pickAndUploadImage({ source, aspect: 'property' });
      setPhotoUrl(result.url);
    } catch (err) {
      handleMediaUploadError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    onSave({
      id: generateId(),
      date,
      notes: notes.trim(),
      photoUrl,
    });
    setNotes('');
    setPhotoUrl(undefined);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Inspection Log">
      <DateField
        label="Date"
        value={date}
        onChange={setDate}
        maxDate={new Date()}
      />
      <InputField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Inspection notes, observations..."
        multiline
        numberOfLines={4}
      />
      <Pressable
        style={[styles.photoPlaceholder, { backgroundColor: theme.background, borderColor: theme.border }]}
        onPress={() => setSheetOpen(true)}
        disabled={uploading}
      >
        {photoUrl ? (
          <RNImage source={{ uri: photoUrl }} style={{ width: '100%', height: 140, borderRadius: 8 }} />
        ) : (
          <>
            <Ionicons name="camera-outline" size={32} color={theme.textMuted} />
            <Text style={[styles.photoPlaceholderText, { color: theme.textMuted }]}>
              {uploading ? 'Uploading…' : 'Attach a photo (optional)'}
            </Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
        onPress={handleSave}
      >
        <Text style={styles.primaryBtnText}>Save Log</Text>
      </Pressable>
      <MediaPickerSheet
        visible={sheetOpen}
        title="Inspection photo"
        onClose={() => setSheetOpen(false)}
        onPick={handlePick}
        showRemove={!!photoUrl}
        onRemove={() => {
          setPhotoUrl(undefined);
          setSheetOpen(false);
        }}
      />
    </BottomSheet>
  );
}

// --- Pause Modal ---
interface PauseModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (reason: string, start: string, end: string) => void;
}

function PauseModal({ visible, onClose, onSave }: PauseModalProps) {
  const theme = getTheme(false);
  const [reason, setReason] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const handleSave = () => {
    onSave(reason.trim(), start, end);
    setReason('');
    setStart('');
    setEnd('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Pause for Maintenance">
      <InputField
        label="Reason"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g., Resurfacing, weather cleanup"
        multiline
        numberOfLines={2}
      />
      <View style={styles.rowInputs}>
        <View style={styles.halfInput}>
          <DateField
            label="Start Date"
            value={start}
            onChange={setStart}
          />
        </View>
        <View style={styles.halfInput}>
          <DateField
            label="End Date"
            value={end}
            onChange={setEnd}
            minDate={start ? new Date(start) : undefined}
          />
        </View>
      </View>
      <Pressable
        style={[styles.primaryBtn, { backgroundColor: theme.warning }]}
        onPress={handleSave}
      >
        <Ionicons name="pause-circle" size={18} color="#FFF" />
        <Text style={styles.primaryBtnText}>Pause Lot</Text>
      </Pressable>
    </BottomSheet>
  );
}

// --- Confirm Modal ---
interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  visible,
  title,
  message,
  confirmText,
  confirmColor,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const theme = getTheme(false);
  return visible ? (

      <View style={styles.confirmOverlay}>
        <View style={[styles.confirmBox, { backgroundColor: theme.surface }]}>
          <Text style={[styles.confirmTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.confirmMessage, { color: theme.textSecondary }]}>
            {message}
          </Text>
          <View style={styles.confirmActions}>
            <Pressable
              style={[styles.confirmBtn, { backgroundColor: theme.background }]}
              onPress={onCancel}
            >
              <Text style={[styles.confirmBtnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, { backgroundColor: confirmColor || theme.danger }]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmBtnText, { color: '#FFF' }]}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    
    ) : null;
}

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

export default function LotSetupScreen() {
  const theme = getTheme(false);
  const insets = useSafeAreaInsets();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<LotSetupData>(getDefaultData());
  const [activeStep, setActiveStep] = useState<StepKey>('boundary');
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Modal states
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'warning' });

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      const saved = await loadLotSetupData();
      if (saved) {
        setData(saved);
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Auto-save with debounce
  useEffect(() => {
    if (!isLoading && hasChanges) {
      const timer = setTimeout(async () => {
        const success = await saveLotSetupData(data);
        if (!success) {
          setSaveError(true);
        } else {
          setSaveError(false);
        }
        setHasChanges(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [data, hasChanges, isLoading]);

  // Update data helper
  const updateData = useCallback((updates: Partial<LotSetupData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  // Show toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ visible: true, message, type });
  }, []);

  // Handle reset
  const handleReset = async () => {
    await clearLotSetupData();
    setData(getDefaultData());
    setShowResetConfirm(false);
    showToast('Setup reset successfully', 'success');
  };

  // Section handlers
  const handleSaveSection = (section: Section) => {
    const existing = data.sections.find(s => s.id === section.id);
    if (existing) {
      updateData({
        sections: data.sections.map(s => s.id === section.id ? section : s),
      });
    } else {
      updateData({ sections: [...data.sections, section] });
    }
    showToast(existing ? 'Section updated' : 'Section added', 'success');
  };

  const handleDeleteSection = (id: string) => {
    updateData({ sections: data.sections.filter(s => s.id !== id) });
    showToast('Section deleted', 'success');
  };

  const handleDuplicateSection = (section: Section) => {
    const newSection = {
      ...section,
      id: generateId(),
      name: `${section.name} (copy)`,
    };
    updateData({ sections: [...data.sections, newSection] });
    showToast('Section duplicated', 'success');
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...data.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    updateData({ sections: newSections });
  };

  const handleSplitLot = (count: number) => {
    const areaPerSection = data.area / count;
    const newSections: Section[] = Array.from({ length: count }, (_, i) => ({
      id: generateId(),
      name: `Zone ${String.fromCharCode(65 + i)}`,
      type: 'equal',
      area: areaPerSection,
      capacity: Math.floor(areaPerSection / 180), // ~180 sqft per parking spot
      priceHourly: 5,
      priceDaily: 25,
      isActive: true,
      color: SECTION_COLORS[i % SECTION_COLORS.length],
    }));
    updateData({ sections: newSections });
    showToast(`Lot split into ${count} sections`, 'success');
  };

  // Toggle rule
  const toggleRule = (rule: string) => {
    const rules = data.access.rules.includes(rule)
      ? data.access.rules.filter(r => r !== rule)
      : [...data.access.rules, rule];
    updateData({ access: { ...data.access, rules } });
  };

  // Pause handler
  const handlePause = (reason: string, start: string, end: string) => {
    updateData({
      availability: {
        ...data.availability,
        isPaused: true,
        pauseReason: reason,
        pauseStart: start,
        pauseEnd: end,
      },
    });
    showToast('Lot paused for maintenance', 'warning');
  };

  // Inspection handler
  const handleAddInspection = (inspection: Inspection) => {
    updateData({ inspections: [inspection, ...data.inspections].slice(0, 10) });
    showToast('Inspection log added', 'success');
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // Render step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 'boundary':
        return (
          <View style={styles.stepContent}>
            <Card>
              <SectionHeader
                title="Plan View"
                subtitle="Define your lot boundaries and dimensions"
              />
              <PlanViewCanvas
                boundary={data.boundary}
                sections={data.sections}
                onBoundaryChange={(b) => updateData({ boundary: b })}
                length={data.length}
                width={data.width}
                unit={data.unit}
              />
              <View style={styles.unitToggle}>
                <Text style={[styles.unitLabel, { color: theme.textSecondary }]}>Unit:</Text>
                {(['sqft', 'sqm'] as UnitType[]).map((unit) => (
                  <Pressable
                    key={unit}
                    style={[
                      styles.unitBtn,
                      {
                        backgroundColor: data.unit === unit ? theme.primary : theme.background,
                        borderColor: data.unit === unit ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => updateData({ unit })}
                  >
                    <Text
                      style={[
                        styles.unitBtnText,
                        { color: data.unit === unit ? '#FFF' : theme.text },
                      ]}
                    >
                      {unit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            <Card>
              <SectionHeader title="Lot Details" />
              <InputField
                label="Lot Name"
                value={data.lotName}
                onChangeText={(v) => updateData({ lotName: v })}
                placeholder="e.g., Plot near Stadium"
              />
              <InputField
                label="Landmark (optional)"
                value={data.landmark}
                onChangeText={(v) => updateData({ landmark: v })}
                placeholder="Nearby landmark for reference"
              />
              <View style={styles.rowInputs}>
                <View style={styles.halfInput}>
                  <InputField
                    label="Length"
                    value={data.length.toString()}
                    onChangeText={(v) => {
                      const length = parseFloat(v) || 0;
                      updateData({ length, area: length * data.width });
                    }}
                    keyboardType="numeric"
                    suffix={data.unit === 'sqft' ? 'ft' : 'm'}
                  />
                </View>
                <View style={styles.halfInput}>
                  <InputField
                    label="Width"
                    value={data.width.toString()}
                    onChangeText={(v) => {
                      const width = parseFloat(v) || 0;
                      updateData({ width, area: data.length * width });
                    }}
                    keyboardType="numeric"
                    suffix={data.unit === 'sqft' ? 'ft' : 'm'}
                  />
                </View>
              </View>
              <View style={[styles.areaDisplay, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.areaDisplayLabel, { color: theme.primary }]}>
                  Total Area
                </Text>
                <Text style={[styles.areaDisplayValue, { color: theme.primary }]}>
                  {formatArea(data.area, data.unit)}
                </Text>
              </View>
              <Pressable
                style={[styles.outlineBtn, { borderColor: theme.border }]}
                onPress={() => updateData({ length: 100, width: 80, area: 8000, boundary: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } })}
              >
                <Ionicons name="refresh-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.outlineBtnText, { color: theme.textMuted }]}>
                  Reset Boundary
                </Text>
              </Pressable>
            </Card>
          </View>
        );

      case 'sections':
        const existingSectionsArea = data.sections.reduce((sum, s) => sum + s.area, 0);
        return (
          <View style={styles.stepContent}>
            {data.sections.length > 0 && (
              <Card>
                <SectionHeader
                  title="Sections Overview"
                  subtitle={`${data.sections.length} section${data.sections.length !== 1 ? 's' : ''} • ${Math.round((existingSectionsArea / data.area) * 100)}% allocated`}
                />
                <PlanViewCanvas
                  boundary={data.boundary}
                  sections={data.sections}
                  onBoundaryChange={() => {}}
                  length={data.length}
                  width={data.width}
                  unit={data.unit}
                />
              </Card>
            )}

            <Card>
              <SectionHeader
                title="Quick Split"
                subtitle="Divide your lot into equal sections"
              />
              <View style={styles.splitButtons}>
                {[2, 3, 4].map((count) => (
                  <Pressable
                    key={count}
                    style={[styles.splitBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => handleSplitLot(count)}
                  >
                    <Text style={[styles.splitBtnText, { color: theme.text }]}>
                      Split into {count}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            <Card>
              <SectionHeader
                title="Sections"
                action={
                  <Pressable
                    style={[styles.addBtn, { backgroundColor: theme.primary }]}
                    onPress={() => {
                      setEditingSection(null);
                      setShowSectionEditor(true);
                    }}
                  >
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={styles.addBtnText}>Add</Text>
                  </Pressable>
                }
              />
              {data.sections.length === 0 ? (
                <EmptyState
                  icon="grid-outline"
                  title="No sections yet"
                  description="Create sections to define rentable areas within your lot."
                  action={{
                    label: 'Add Section',
                    onPress: () => {
                      setEditingSection(null);
                      setShowSectionEditor(true);
                    },
                  }}
                />
              ) : (
                data.sections.map((section, index) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={index}
                    onEdit={() => {
                      setEditingSection(section);
                      setShowSectionEditor(true);
                    }}
                    onToggle={() => {
                      updateData({
                        sections: data.sections.map(s =>
                          s.id === section.id ? { ...s, isActive: !s.isActive } : s
                        ),
                      });
                    }}
                    onMoveUp={index > 0 ? () => handleMoveSection(index, 'up') : undefined}
                    onMoveDown={index < data.sections.length - 1 ? () => handleMoveSection(index, 'down') : undefined}
                    onDuplicate={() => handleDuplicateSection(section)}
                    onDelete={() => handleDeleteSection(section.id)}
                  />
                ))
              )}
            </Card>

            <SectionEditorModal
              visible={showSectionEditor}
              onClose={() => setShowSectionEditor(false)}
              section={editingSection}
              onSave={handleSaveSection}
              lotArea={data.area}
              existingSectionsArea={existingSectionsArea}
            />
          </View>
        );

      case 'availability':
        return (
          <View style={styles.stepContent}>
            {!data.availability.isActive && (
              <View style={[styles.warningBanner, { backgroundColor: theme.warningLight }]}>
                <Ionicons name="eye-off-outline" size={20} color={theme.warning} />
                <Text style={[styles.warningBannerText, { color: theme.warning }]}>
                  Your lot is currently hidden from renters.
                </Text>
              </View>
            )}

            <Card>
              <SectionHeader title="Activation" />
              <ToggleRow
                label="Accept Bookings"
                description="Enable to list your lot for renters"
                value={data.availability.isActive}
                onValueChange={(v) =>
                  updateData({ availability: { ...data.availability, isActive: v } })
                }
              />
              <View style={styles.divider} />
              <ToggleRow
                label="Event Mode"
                description="Special pricing for events"
                value={data.availability.isEventMode}
                onValueChange={(v) =>
                  updateData({ availability: { ...data.availability, isEventMode: v } })
                }
                disabled={!data.availability.isActive}
              />
              {data.availability.isEventMode && (
                <View style={styles.eventFields}>
                  <InputField
                    label="Event Name (optional)"
                    value={data.availability.eventName}
                    onChangeText={(v) =>
                      updateData({ availability: { ...data.availability, eventName: v } })
                    }
                    placeholder="e.g., Stadium Game Night"
                  />
                  <View style={styles.rowInputs}>
                    <View style={styles.halfInput}>
                      <DateField
                        label="Start Date"
                        value={data.availability.startDate}
                        onChange={(v) =>
                          updateData({ availability: { ...data.availability, startDate: v } })
                        }
                      />
                    </View>
                    <View style={styles.halfInput}>
                      <TimeField
                        label="Start Time"
                        value={data.availability.startTime}
                        onChange={(v) =>
                          updateData({ availability: { ...data.availability, startTime: v } })
                        }
                      />
                    </View>
                  </View>
                  <View style={styles.rowInputs}>
                    <View style={styles.halfInput}>
                      <DateField
                        label="End Date"
                        value={data.availability.endDate}
                        onChange={(v) =>
                          updateData({ availability: { ...data.availability, endDate: v } })
                        }
                        minDate={data.availability.startDate ? new Date(data.availability.startDate) : undefined}
                      />
                    </View>
                    <View style={styles.halfInput}>
                      <TimeField
                        label="End Time"
                        value={data.availability.endTime}
                        onChange={(v) =>
                          updateData({ availability: { ...data.availability, endTime: v } })
                        }
                      />
                    </View>
                  </View>
                  <Text style={[styles.quickPresetsLabel, { color: theme.textSecondary }]}>
                    Quick Presets
                  </Text>
                  <View style={styles.presetChips}>
                    {[
                      { label: 'Today 6pm-12am', start: new Date().toISOString().split('T')[0], startTime: '18:00', end: new Date().toISOString().split('T')[0], endTime: '23:59' },
                      { label: 'Tomorrow 8am-8pm', start: new Date(Date.now() + 86400000).toISOString().split('T')[0], startTime: '08:00', end: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '20:00' },
                      { label: 'Weekend', start: '', startTime: '08:00', end: '', endTime: '22:00' },
                    ].map((preset) => (
                      <Pressable
                        key={preset.label}
                        style={[styles.presetChip, { backgroundColor: theme.background, borderColor: theme.border }]}
                        onPress={() =>
                          updateData({
                            availability: {
                              ...data.availability,
                              startDate: preset.start,
                              startTime: preset.startTime,
                              endDate: preset.end,
                              endTime: preset.endTime,
                            },
                          })
                        }
                      >
                        <Text style={[styles.presetChipText, { color: theme.text }]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </Card>

            <Card>
              <SectionHeader title="Temporary Closure" />
              {data.availability.isPaused ? (
                <View style={[styles.pausedBanner, { backgroundColor: theme.warningLight }]}>
                  <Ionicons name="pause-circle" size={24} color={theme.warning} />
                  <View style={styles.pausedBannerText}>
                    <Text style={[styles.pausedTitle, { color: theme.text }]}>
                      Lot is paused
                    </Text>
                    <Text style={[styles.pausedReason, { color: theme.textSecondary }]}>
                      {data.availability.pauseReason || 'Maintenance'}
                    </Text>
                    <Text style={[styles.pausedDates, { color: theme.textMuted }]}>
                      {data.availability.pauseStart} - {data.availability.pauseEnd}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.resumeBtn, { backgroundColor: theme.success }]}
                    onPress={() =>
                      updateData({
                        availability: {
                          ...data.availability,
                          isPaused: false,
                          pauseReason: '',
                          pauseStart: '',
                          pauseEnd: '',
                        },
                      })
                    }
                  >
                    <Text style={styles.resumeBtnText}>Resume</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.outlineBtn, { borderColor: theme.warning }]}
                  onPress={() => setShowPauseModal(true)}
                >
                  <Ionicons name="pause-circle-outline" size={18} color={theme.warning} />
                  <Text style={[styles.outlineBtnText, { color: theme.warning }]}>
                    Pause for Maintenance
                  </Text>
                </Pressable>
              )}
            </Card>

            <Card>
              <SectionHeader title="Booking Duration" />
              <View style={styles.rowInputs}>
                <View style={styles.halfInput}>
                  <InputField
                    label="Min Duration"
                    value={data.availability.minHours.toString()}
                    onChangeText={(v) =>
                      updateData({
                        availability: { ...data.availability, minHours: parseInt(v) || 1 },
                      })
                    }
                    keyboardType="numeric"
                    suffix="hours"
                  />
                </View>
                <View style={styles.halfInput}>
                  <InputField
                    label="Max Duration"
                    value={data.availability.maxDays.toString()}
                    onChangeText={(v) =>
                      updateData({
                        availability: { ...data.availability, maxDays: parseInt(v) || 1 },
                      })
                    }
                    keyboardType="numeric"
                    suffix="days"
                  />
                </View>
              </View>
              <View style={styles.divider} />
              <Text style={[styles.confirmModeLabel, { color: theme.textSecondary }]}>
                Confirmation Mode
              </Text>
              <View style={styles.confirmModeRow}>
                {(['instant', 'manual'] as ConfirmMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[
                      styles.confirmModeBtn,
                      {
                        backgroundColor:
                          data.availability.confirmMode === mode ? theme.primaryLight : theme.background,
                        borderColor:
                          data.availability.confirmMode === mode ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() =>
                      updateData({ availability: { ...data.availability, confirmMode: mode } })
                    }
                  >
                    <Ionicons
                      name={mode === 'instant' ? 'flash' : 'hand-left-outline'}
                      size={18}
                      color={data.availability.confirmMode === mode ? theme.primary : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.confirmModeBtnText,
                        {
                          color:
                            data.availability.confirmMode === mode ? theme.primary : theme.text,
                        },
                      ]}
                    >
                      {mode === 'instant' ? 'Instant Confirm' : 'Manual Confirm'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            <PauseModal
              visible={showPauseModal}
              onClose={() => setShowPauseModal(false)}
              onSave={handlePause}
            />
          </View>
        );

      case 'access':
        return (
          <View style={styles.stepContent}>
            <Card>
              <SectionHeader
                title="Access Instructions"
                subtitle="Help renters find and enter your lot"
              />
              <InputField
                label="Directions & Entry Info"
                value={data.access.instructions}
                onChangeText={(v) =>
                  updateData({ access: { ...data.access, instructions: v } })
                }
                placeholder="Enter from Main St, look for the blue gate..."
                multiline
                numberOfLines={4}
              />
            </Card>

            <Card>
              <SectionHeader title="Lot Rules" />
              <ChipRow
                options={RULE_OPTIONS}
                selected={data.access.rules}
                onToggle={toggleRule}
              />
              <InputField
                label="Other Rules"
                value={data.access.otherRules}
                onChangeText={(v) =>
                  updateData({ access: { ...data.access, otherRules: v } })
                }
                placeholder="Any additional rules..."
                multiline
                numberOfLines={2}
              />
            </Card>

            <Card>
              <SectionHeader title="On-site Signage & QR" />
              <View style={[styles.qrPreview, { backgroundColor: theme.background }]}>
                <View style={[styles.qrPlaceholder, { borderColor: theme.border }]}>
                  <Ionicons name="qr-code-outline" size={48} color={theme.textMuted} />
                  <Text style={[styles.qrPlaceholderText, { color: theme.textMuted }]}>
                    Lot QR Code
                  </Text>
                </View>
                <View style={styles.qrActions}>
                  <Pressable
                    style={[styles.qrBtn, { backgroundColor: theme.primary }]}
                    onPress={() => showToast('Signage saved locally', 'success')}
                  >
                    <Ionicons name="download-outline" size={16} color="#FFF" />
                    <Text style={styles.qrBtnText}>Download</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.qrBtn, { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }]}
                    onPress={() => showToast('Print feature coming soon', 'warning')}
                  >
                    <Ionicons name="print-outline" size={16} color={theme.text} />
                    <Text style={[styles.qrBtnText, { color: theme.text }]}>Print Poster</Text>
                  </Pressable>
                </View>
              </View>
            </Card>

            <Card>
              <SectionHeader
                title="Inspection Logs"
                action={
                  <Pressable
                    style={[styles.addBtn, { backgroundColor: theme.primary }]}
                    onPress={() => setShowInspectionModal(true)}
                  >
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={styles.addBtnText}>Add</Text>
                  </Pressable>
                }
              />
              {data.inspections.length === 0 ? (
                <EmptyState
                  icon="clipboard-outline"
                  title="No inspection logs"
                  description="Keep track of lot maintenance and inspections."
                  action={{
                    label: 'Add Log',
                    onPress: () => setShowInspectionModal(true),
                  }}
                />
              ) : (
                data.inspections.slice(0, 3).map((inspection) => (
                  <View
                    key={inspection.id}
                    style={[styles.inspectionItem, { borderColor: theme.borderLight }]}
                  >
                    <Text style={[styles.inspectionDate, { color: theme.textSecondary }]}>
                      {inspection.date}
                    </Text>
                    <Text style={[styles.inspectionNotes, { color: theme.text }]}>
                      {inspection.notes || 'No notes'}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            <InspectionModal
              visible={showInspectionModal}
              onClose={() => setShowInspectionModal(false)}
              onSave={handleAddInspection}
            />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing[2] }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Lot Setup</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Define your land area and sections for renting
          </Text>
          {hasChanges && (
            <View style={styles.draftBadge}>
              <View style={[styles.draftDot, { backgroundColor: theme.warning }]} />
              <Text style={[styles.draftText, { color: theme.warning }]}>Draft</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={[styles.previewBtn, { backgroundColor: theme.primaryLight }]}
            onPress={() => setShowPreview(true)}
          >
            <Ionicons name="eye-outline" size={18} color={theme.primary} />
            <Text style={[styles.previewBtnText, { color: theme.primary }]}>Preview</Text>
          </Pressable>
          <Pressable
            style={styles.menuBtn}
            onPress={() => setShowResetConfirm(true)}
            hitSlop={12}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={theme.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Save Error Banner */}
      {saveError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerLight }]}>
          <Ionicons name="warning-outline" size={16} color={theme.danger} />
          <Text style={[styles.errorBannerText, { color: theme.danger }]}>
            Couldn't save locally. Changes may not persist.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[6] }}
        >
          {/* Progress Card */}
          <View style={styles.progressSection}>
            <ProgressChecklistCard data={data} />
          </View>

          {/* Stepper */}
          <SegmentedStepper
            steps={STEPS}
            activeStep={activeStep}
            onStepPress={setActiveStep}
          />

          {/* Step Content */}
          {renderStepContent()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {/* Reset Confirm Modal */}
      <ConfirmModal
        visible={showResetConfirm}
        title="Reset All Setup?"
        message="This will clear all your lot configuration. This action cannot be undone."
        confirmText="Reset"
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Preview Modal */}
      {showPreview ? (

        <View style={[styles.previewModal, { backgroundColor: theme.background, paddingTop: insets.top }]}>
          <View style={styles.previewHeader}>
            <Text style={[styles.previewTitle, { color: theme.text }]}>Lot Preview</Text>
            <Pressable onPress={() => setShowPreview(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.previewContent}>
            <Card>
              <Text style={[styles.previewLotName, { color: theme.text }]}>
                {data.lotName || 'Unnamed Lot'}
              </Text>
              {data.landmark && (
                <Text style={[styles.previewLandmark, { color: theme.textSecondary }]}>
                  Near {data.landmark}
                </Text>
              )}
              <View style={styles.previewStats}>
                <View style={styles.previewStat}>
                  <Text style={[styles.previewStatValue, { color: theme.primary }]}>
                    {formatArea(data.area, data.unit)}
                  </Text>
                  <Text style={[styles.previewStatLabel, { color: theme.textMuted }]}>
                    Total Area
                  </Text>
                </View>
                <View style={styles.previewStat}>
                  <Text style={[styles.previewStatValue, { color: theme.primary }]}>
                    {data.sections.length}
                  </Text>
                  <Text style={[styles.previewStatLabel, { color: theme.textMuted }]}>
                    Sections
                  </Text>
                </View>
                <View style={styles.previewStat}>
                  <Text style={[styles.previewStatValue, { color: theme.primary }]}>
                    {data.sections.reduce((sum, s) => sum + s.capacity, 0)}
                  </Text>
                  <Text style={[styles.previewStatLabel, { color: theme.textMuted }]}>
                    Capacity
                  </Text>
                </View>
              </View>
            </Card>
            {data.sections.length > 0 && (
              <Card>
                <SectionHeader title="Sections" />
                {data.sections.map((section, idx) => (
                  <View key={section.id} style={[styles.previewSectionRow, { borderColor: theme.borderLight }]}>
                    <View style={[styles.previewSectionDot, { backgroundColor: section.color }]} />
                    <View style={styles.previewSectionInfo}>
                      <Text style={[styles.previewSectionName, { color: theme.text }]}>
                        {section.name || `Section ${String.fromCharCode(65 + idx)}`}
                      </Text>
                      <Text style={[styles.previewSectionMeta, { color: theme.textMuted }]}>
                        {section.capacity} spots • {formatCurrency(section.priceHourly)}/hr
                      </Text>
                    </View>
                    <View style={[styles.previewSectionStatus, { backgroundColor: section.isActive ? theme.successLight : theme.borderLight }]}>
                      <Text style={{ color: section.isActive ? theme.success : theme.textMuted, fontSize: 12 }}>
                        {section.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
            {data.access.instructions && (
              <Card>
                <SectionHeader title="Access Instructions" />
                <Text style={[styles.previewInstructions, { color: theme.text }]}>
                  {data.access.instructions}
                </Text>
              </Card>
            )}
            {data.access.rules.length > 0 && (
              <Card>
                <SectionHeader title="Rules" />
                {data.access.rules.map((rule) => (
                  <View key={rule} style={styles.previewRuleRow}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                    <Text style={[styles.previewRuleText, { color: theme.text }]}>{rule}</Text>
                  </View>
                ))}
              </Card>
            )}
          </ScrollView>
        </View>
      
      ) : null}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold as any,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  draftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  draftDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  draftText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    gap: 4,
  },
  previewBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  menuBtn: {
    padding: spacing[2],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  errorBannerText: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  content: {
    flex: 1,
  },
  progressSection: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  stepContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[4],
  },

  // Card
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing[4],
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

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },

  // Progress Checklist
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  progressTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  progressPercent: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: spacing[3],
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  checklistContainer: {
    gap: spacing[2],
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  checklistLabel: {
    fontSize: fontSize.sm,
  },
  progressHint: {
    fontSize: fontSize.xs,
    marginTop: spacing[3],
    fontStyle: 'italic',
  },

  // Stepper
  stepperContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing[4],
    marginBottom: spacing[4],
    borderRadius: borderRadius.lg,
    padding: spacing[1],
  },
  stepperItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    gap: 4,
  },
  stepperLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },

  // Canvas
  canvasContainer: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  boundaryRect: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  cornerHandle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dimensionLabelTop: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dimensionLabelSide: {
    position: 'absolute',
    left: -40,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  dimensionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  sectionsOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    flexDirection: 'row',
  },
  sectionBlock: {
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold as any,
  },
  areaLabel: {
    position: 'absolute',
    bottom: spacing[2],
    right: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
  },
  areaLabelText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },

  // Unit Toggle
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[3],
    gap: spacing[2],
  },
  unitLabel: {
    fontSize: fontSize.sm,
  },
  unitBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  unitBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Input Field
  inputFieldContainer: {
    marginBottom: spacing[3],
  },
  inputLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing[1],
  },
  inputWrapper: {
    position: 'relative',
  },
  inputField: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: fontSize.base,
  },
  inputSuffix: {
    position: 'absolute',
    right: spacing[3],
    top: '50%',
    transform: [{ translateY: -8 }],
    fontSize: fontSize.sm,
  },
  inputError: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  rowInputs: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  halfInput: {
    flex: 1,
  },

  // Area Display
  areaDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    marginBottom: spacing[3],
  },
  areaDisplayLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  areaDisplayValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },

  // Buttons
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing[2],
  },
  outlineBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    marginTop: spacing[3],
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    gap: 2,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Toggle Row
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  toggleRowText: {
    flex: 1,
    marginRight: spacing[3],
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  toggleDescription: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: spacing[2],
  },

  // Chips
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing[2],
    marginBottom: spacing[2],
  },
  chipText: {
    fontSize: fontSize.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing[3],
  },

  // Section Card
  sectionCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginBottom: spacing[3],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  sectionColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing[2],
  },
  sectionCardInfo: {
    flex: 1,
  },
  sectionCardName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  sectionCardMeta: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  sectionCardPricing: {
    flexDirection: 'row',
    gap: spacing[4],
    marginBottom: spacing[3],
    paddingLeft: spacing[5],
  },
  priceItem: {},
  priceLabel: {
    fontSize: fontSize.xs,
  },
  priceValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  sectionCardActions: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingLeft: spacing[5],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    gap: 4,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  sectionMenu: {
    position: 'absolute',
    right: spacing[3],
    top: spacing[12],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing[1],
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  menuItemText: {
    fontSize: fontSize.sm,
  },

  // Split Buttons
  splitButtons: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  splitBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  splitBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  emptyStateDesc: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    gap: 4,
  },
  emptyStateBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Warning Banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[4],
    borderRadius: borderRadius.md,
    gap: spacing[2],
  },
  warningBannerText: {
    fontSize: fontSize.sm,
    flex: 1,
  },

  // Event Fields
  eventFields: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  quickPresetsLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing[2],
  },
  presetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  presetChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: fontSize.sm,
  },

  // Paused Banner
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[3],
  },
  pausedBannerText: {
    flex: 1,
  },
  pausedTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  pausedReason: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  pausedDates: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  resumeBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
  },
  resumeBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Confirm Mode
  confirmModeLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing[2],
  },
  confirmModeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  confirmModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing[2],
  },
  confirmModeBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // QR Preview
  qrPreview: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    alignItems: 'center',
  },
  qrPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  qrPlaceholderText: {
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  qrActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    gap: 4,
  },
  qrBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },

  // Photo Placeholder
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: spacing[3],
  },
  photoPlaceholderText: {
    fontSize: fontSize.sm,
    marginTop: spacing[2],
  },

  // Inspection Item
  inspectionItem: {
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  inspectionDate: {
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  inspectionNotes: {
    fontSize: fontSize.sm,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 50,
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    zIndex: 1000,
  },
  toastText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    flex: 1,
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
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  bottomSheet: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  sheetTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold as any,
  },
  sheetContent: {
    paddingHorizontal: spacing[4],
  },

  // Confirm Modal
  confirmOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: spacing[4],
  },
  confirmBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
  },
  confirmTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
  },
  confirmMessage: {
    fontSize: fontSize.sm,
    marginBottom: spacing[4],
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },

  // Preview Modal
  previewModal: {
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  previewTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold as any,
  },
  previewContent: {
    flex: 1,
    paddingHorizontal: spacing[4],
  },
  previewLotName: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[1],
  },
  previewLandmark: {
    fontSize: fontSize.sm,
    marginBottom: spacing[3],
  },
  previewStats: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  previewStat: {
    flex: 1,
    alignItems: 'center',
  },
  previewStatValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
  },
  previewStatLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  previewSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  previewSectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing[3],
  },
  previewSectionInfo: {
    flex: 1,
  },
  previewSectionName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  previewSectionMeta: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  previewSectionStatus: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  previewInstructions: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  previewRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  previewRuleText: {
    fontSize: fontSize.sm,
  },
});
