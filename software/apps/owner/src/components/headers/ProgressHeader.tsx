import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, fonts } from '../../theme/kit';

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressStep {
  id: string;
  label: string;
}

export interface ProgressHeaderProps {
  title: string;
  subtitle?: string;
  steps: ProgressStep[];
  currentStepIndex: number;
  /**
   * Optional per-step completion flags. When provided, each step is shown
   * as completed/pending **independently** based on its own flag — useful
   * for screens where users can fill sections in any order. When omitted,
   * the legacy sequential rule applies (steps before `currentStepIndex`
   * are completed; the rest are pending).
   */
  /** @deprecated use `stepStatuses` for richer 3-state rendering. */
  completedFlags?: boolean[];
  /**
   * Per-step status:
   *   'complete' — all required fields filled (shows green checkmark)
   *   'partial'  — some fields filled but not all (primary-colored outlined circle)
   *   'pending'  — nothing filled yet (gray)
   * Active style (primary ring + bold label) is layered on top via `currentStepIndex`.
   */
  stepStatuses?: ('complete' | 'partial' | 'pending')[];
  /** When provided, each step pill becomes tappable and calls this on press. */
  onStepPress?: (index: number) => void;
  savedStatus?: 'saved' | 'saving' | 'lastSaved' | 'error';
  lastSavedText?: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
  showBack?: boolean;
}

// ============================================================================
// THEME
// ============================================================================

const headerTheme = {
  background: palette.bg,
  title: palette.text,
  subtitle: palette.textMuted,
  stepActive: palette.ink,
  stepCompleted: palette.ink,
  stepPending: palette.line,
  stepText: palette.textMuted,
  stepTextActive: palette.text,
  savedText: palette.success,
  savingText: palette.textMuted,
  errorText: palette.danger,
  lineCompleted: palette.ink,
  linePending: palette.line,
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProgressHeader({
  title,
  subtitle,
  steps,
  currentStepIndex,
  completedFlags,
  stepStatuses,
  onStepPress,
  savedStatus = 'saved',
  lastSavedText,
  onMenuPress,
  onBackPress,
  showBack = true,
}: ProgressHeaderProps) {
  const getSavedStatusText = () => {
    switch (savedStatus) {
      case 'saved':
        return 'All changes saved';
      case 'saving':
        return 'Saving...';
      case 'lastSaved':
        return lastSavedText || 'Last saved recently';
      case 'error':
        return 'Changes not saved';
      default:
        return '';
    }
  };

  const getSavedStatusColor = () => {
    switch (savedStatus) {
      case 'saved':
        return headerTheme.savedText;
      case 'saving':
        return headerTheme.savingText;
      case 'error':
        return headerTheme.errorText;
      default:
        return headerTheme.savingText;
    }
  };

  const getSavedStatusIcon = () => {
    switch (savedStatus) {
      case 'saved':
        return 'checkmark-circle';
      case 'saving':
        return 'sync';
      case 'error':
        return 'alert-circle';
      default:
        return 'time';
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Row: Back, Title Area, Menu */}
      <View style={styles.topRow}>
        {showBack && onBackPress ? (
          <TouchableOpacity
            onPress={onBackPress}
            style={styles.backButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={headerTheme.title} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {onMenuPress ? (
          <TouchableOpacity
            onPress={onMenuPress}
            style={[styles.menuButton, styles.menuButtonCircle]}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="More options"
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-vertical" size={18} color={headerTheme.title} />
          </TouchableOpacity>
        ) : (
          <View style={styles.menuButton} />
        )}
      </View>

      {/* Progress Steps. Each step's status is determined independently
          when `stepStatuses` (or legacy `completedFlags`) is provided —
          sections can be filled in any order. When neither is supplied
          we fall back to the sequential rule. */}
      <View style={styles.stepsContainer}>
        {steps.map((step, index) => {
          // Resolve a 3-state status: complete | partial | pending.
          let status: 'complete' | 'partial' | 'pending';
          if (stepStatuses && stepStatuses[index]) {
            status = stepStatuses[index];
          } else if (completedFlags) {
            status = completedFlags[index] ? 'complete' : 'pending';
          } else {
            status = index < currentStepIndex ? 'complete' : 'pending';
          }

          const isCompleted = status === 'complete';
          const isPartial = status === 'partial';
          const isActive = index === currentStepIndex;

          // Connector turns green only when *both* sides are complete —
          // otherwise it stays gray (consistent with independent steps).
          const nextStatus =
            stepStatuses?.[index + 1] ??
            (completedFlags?.[index + 1] ? 'complete' : 'pending');
          const connectorComplete = isCompleted && nextStatus === 'complete';

          return (
            <React.Fragment key={step.id}>
              {/* Step Indicator — Pressable when a tap handler is provided,
                  otherwise rendered with onPress disabled so the visual
                  doesn't change. */}
              <Pressable
                style={styles.stepItem}
                onPress={onStepPress ? () => onStepPress(index) : undefined}
                disabled={!onStepPress}
                accessibilityRole={onStepPress ? 'button' : undefined}
                accessibilityLabel={onStepPress ? `Go to ${step.label}` : undefined}
                hitSlop={6}
              >
                <View
                  style={[
                    styles.stepCircle,
                    isCompleted && styles.stepCircleCompleted,
                    isPartial && styles.stepCirclePartial,
                    !isCompleted && !isPartial && styles.stepCirclePending,
                    isActive && styles.stepCircleActive,
                  ]}
                >
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={14} color={palette.textInverse} />
                  ) : (
                    <Text
                      style={[
                        styles.stepNumber,
                        isActive && !isPartial && styles.stepNumberActive,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isCompleted && styles.stepLabelCompleted,
                    isPartial && styles.stepLabelPartial,
                    isActive && styles.stepLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </Pressable>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    connectorComplete ? styles.connectorCompleted : styles.connectorPending,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Saved Status */}
      <View style={styles.savedStatusContainer}>
        <Ionicons
          name={getSavedStatusIcon()}
          size={14}
          color={getSavedStatusColor()}
        />
        <Text style={[styles.savedStatusText, { color: getSavedStatusColor() }]}>
          {getSavedStatusText()}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: headerTheme.background,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    marginBottom: 14,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    color: headerTheme.title,
    textAlign: 'center',
  },
  subtitle: {
    ...fonts.medium,
    fontSize: 13,
    color: headerTheme.subtitle,
    textAlign: 'center',
    marginTop: 2,
  },
  menuButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonCircle: {
    borderRadius: 22,
    backgroundColor: palette.surface,
  },

  // Progress Steps (dotted track: ink = done, grey = to do)
  stepsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 10,
  },
  stepItem: {
    alignItems: 'center',
    minWidth: 58,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepCircleCompleted: {
    backgroundColor: headerTheme.stepCompleted,
  },
  stepCirclePending: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.line,
  },
  // Partial = section started but not finished: peach fill.
  stepCirclePartial: {
    backgroundColor: palette.peach,
  },
  stepCircleActive: {
    borderWidth: 3,
    borderColor: palette.ink,
  },
  stepNumber: {
    ...fonts.bold,
    fontSize: 12,
    color: palette.textMuted,
  },
  stepNumberActive: {
    color: palette.text,
  },
  stepLabel: {
    ...fonts.medium,
    fontSize: 11.5,
    color: headerTheme.stepText,
    textAlign: 'center',
  },
  stepLabelCompleted: {
    color: palette.text,
  },
  stepLabelPartial: {
    color: palette.text,
  },
  stepLabelActive: {
    ...fonts.bold,
    color: headerTheme.stepTextActive,
  },
  connector: {
    height: 4,
    borderRadius: 2,
    flex: 1,
    maxWidth: 40,
    marginHorizontal: 2,
    marginTop: 12,
  },
  connectorCompleted: {
    backgroundColor: headerTheme.lineCompleted,
  },
  connectorPending: {
    backgroundColor: headerTheme.linePending,
  },

  // Saved Status
  savedStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  savedStatusText: {
    ...fonts.medium,
    fontSize: 12,
  },
});
