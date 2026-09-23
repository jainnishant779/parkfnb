/**
 * UI kit — the shared building blocks every screen is composed from.
 * Keep screens free of one-off copies of these; extend here instead.
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { palette, radii, spacing, fonts, typography, shadow } from '../../theme/kit';
import IsoBlock from './IsoBlock';

export { IsoBlock };

/* ─── Text ─────────────────────────────────────────────────────────── */

// Themed text. `variant` picks a typography token; `weight` overrides it.
export const T = ({ variant = 'body', weight, color, style, children, ...rest }) => (
  <Text
    {...rest}
    style={[
      typography[variant] || typography.body,
      weight && fonts[weight],
      color && { color },
      style,
    ]}
  >
    {children}
  </Text>
);

/* ─── Surfaces ─────────────────────────────────────────────────────── */

const CARD_TONES = {
  white: palette.surface,
  peach: palette.peachSoft,
  blue: palette.blueSoft,
  grey: palette.fill,
  cream: palette.peachWash,
};

export const Card = ({ tone = 'white', style, children, onPress, padded = true }) => {
  const body = (
    <View
      style={[
        styles.card,
        { backgroundColor: CARD_TONES[tone] || tone },
        padded && styles.cardPad,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {body}
    </TouchableOpacity>
  );
};

/* ─── Buttons ──────────────────────────────────────────────────────── */

const BTN = {
  white: { bg: palette.surface, fg: palette.text },
  ink: { bg: palette.ink, fg: palette.textInverse },
  peach: { bg: palette.peach, fg: palette.text },
  grey: { bg: palette.fill, fg: palette.text },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
};

// Big rounded pill. Matches the "Top up" / "New track" / "Continue" buttons.
export const PillButton = ({
  label,
  icon,
  iconRight,
  onPress,
  variant = 'white',
  size = 'lg',
  loading,
  disabled,
  style,
  textStyle,
}) => {
  const v = BTN[variant] || BTN.white;
  const h = size === 'sm' ? 40 : size === 'md' ? 48 : 58;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.pill,
        { height: h, backgroundColor: v.bg, paddingHorizontal: size === 'sm' ? 16 : 22 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 19} color={v.fg} /> : null}
          {label ? (
            <Text
              style={[
                styles.pillText,
                { color: v.fg, fontSize: size === 'sm' ? 14 : 16 },
                icon && { marginLeft: 10 },
                iconRight && { marginRight: 10 },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : null}
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 15 : 19} color={v.fg} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
};

// White circular icon button (bell, back, more). Optional red badge dot.
export const IconCircle = ({
  icon,
  onPress,
  size = 46,
  badge,
  variant = 'white',
  iconSize,
  color,
  style,
}) => {
  const bg = {
    ink: palette.ink,
    grey: palette.fill,
    clear: 'transparent',
    glass: 'rgba(255,255,255,0.18)', // on photos
  }[variant] || palette.surface;
  const fg = color || (variant === 'ink' || variant === 'glass' ? palette.textInverse : palette.text);
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={6}
      activeOpacity={0.75}
      style={[
        styles.iconCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        variant === 'white' && styles.iconCircleBorder,
        variant === 'glass' && styles.iconCircleGlass,
        style,
      ]}
    >
      <Icon name={icon} size={iconSize || Math.round(size * 0.42)} color={fg} />
      {badge ? <View style={styles.badgeDot} /> : null}
    </TouchableOpacity>
  );
};

/* ─── Inputs ───────────────────────────────────────────────────────── */

// Grey pill search field. Pass `onPress` (no onChangeText) to make it a
// tappable fake field that routes to a search screen.
export const SearchPill = ({ value, onChangeText, placeholder = 'Search', onPress, right, style, ...rest }) => {
  const inner = (
    <View style={[styles.search, style]}>
      <Icon name="search" size={19} color={palette.textMuted} />
      {onPress ? (
        <Text style={[styles.searchInput, { color: palette.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          style={styles.searchInput}
          {...rest}
        />
      )}
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
};

// Labelled text field on a grey pill.
export const Field = ({ label, icon, style, inputStyle, right, ...rest }) => (
  <View style={style}>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    <View style={styles.field}>
      {icon ? <Icon name={icon} size={18} color={palette.textMuted} style={{ marginRight: 10 }} /> : null}
      <TextInput
        placeholderTextColor={palette.textSubtle}
        style={[styles.fieldInput, inputStyle]}
        {...rest}
      />
      {right}
    </View>
  </View>
);

/* ─── Headers ──────────────────────────────────────────────────────── */

// Back arrow + centred title (the "Details" header).
export const ScreenHeader = ({ title, onBack, right, style, light }) => (
  <View style={[styles.header, style]}>
    <View style={styles.headerSide}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={12} activeOpacity={0.7}>
          <Icon name="arrow-left" size={24} color={light ? palette.textInverse : palette.text} />
        </TouchableOpacity>
      ) : null}
    </View>
    <Text style={[styles.headerTitle, light && { color: palette.textInverse }]} numberOfLines={1}>
      {title}
    </Text>
    <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
  </View>
);

export const SectionTitle = ({ title, action, onAction, style }) => (
  <View style={[styles.sectionRow, style]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action ? (
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    ) : null}
  </View>
);

/* ─── Identity ─────────────────────────────────────────────────────── */

export const Avatar = ({ uri, name = '', size = 56, ring = true }) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        ring && styles.avatarRing,
        styles.avatarBase,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || 'P'}</Text>
      )}
    </View>
  );
};

/* ─── Status + progress ────────────────────────────────────────────── */

const TAG_TONES = {
  ink: { bg: palette.ink, fg: palette.textInverse },
  white: { bg: palette.surface, fg: palette.text },
  success: { bg: palette.successSoft, fg: palette.success },
  warning: { bg: palette.warningSoft, fg: palette.warning },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
  grey: { bg: palette.fill, fg: palette.textMuted },
};

// Small black pill ("Transit").
export const StatusTag = ({ label, tone = 'ink', style }) => {
  const t = TAG_TONES[tone] || TAG_TONES.ink;
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.tagText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

// Dots on a line; completed = solid ink, current = ringed dot, rest = soft.
export const ProgressTrack = ({ steps = 4, current = 2, trackColor = '#F9D8AE', style }) => {
  const nodes = Array.from({ length: steps });
  return (
    <View style={[styles.track, style]}>
      {nodes.map((_, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const isLast = i === steps - 1;
        return (
          <React.Fragment key={i}>
            <View
              style={[
                isCurrent ? styles.trackRing : styles.trackDot,
                !done && !isCurrent && { backgroundColor: trackColor },
              ]}
            />
            {!isLast ? (
              <View
                style={[
                  styles.trackLine,
                  { backgroundColor: i < current ? palette.ink : trackColor },
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
};

/* ─── Data display ─────────────────────────────────────────────────── */

// Label / value pairs in a grid (From / To / Created / Estimated …).
export const InfoGrid = ({ items, columns = 2, style, valueStyle }) => (
  <View style={[styles.grid, style]}>
    {items.map((it, i) => (
      <View key={`${it.label}-${i}`} style={[styles.gridCell, { width: `${100 / columns}%` }]}>
        <Text style={styles.gridLabel}>{it.label}</Text>
        <Text style={[styles.gridValue, valueStyle]} numberOfLines={2}>
          {it.value ?? '—'}
        </Text>
        {it.sub ? <Text style={styles.gridValue}>{it.sub}</Text> : null}
      </View>
    ))}
  </View>
);

// A settings/list row: icon tile, title, optional subtitle, chevron.
export const ListRow = ({ icon, title, subtitle, onPress, right, danger, isLast }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    disabled={!onPress}
    style={[styles.row, !isLast && styles.rowDivider]}
  >
    {icon ? (
      <View style={[styles.rowIcon, danger && { backgroundColor: palette.dangerSoft }]}>
        <Icon name={icon} size={18} color={danger ? palette.danger : palette.text} />
      </View>
    ) : null}
    <View style={{ flex: 1 }}>
      <Text style={[styles.rowTitle, danger && { color: palette.danger }]}>{title}</Text>
      {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
    </View>
    {right !== undefined ? right : <Icon name="chevron-right" size={20} color={palette.textSubtle} />}
  </TouchableOpacity>
);

// Vertical timeline entry (the "Your package is being delivered" list).
export const TimelineItem = ({ title, subtitle, time, date, active, isLast, children }) => (
  <View style={styles.tlRow}>
    <View style={styles.tlRail}>
      <View style={[styles.tlDotOuter, active && styles.tlDotOuterActive]}>
        <View style={[styles.tlDot, active && styles.tlDotActive]} />
      </View>
      {!isLast ? <View style={styles.tlLine} /> : null}
    </View>
    <View style={styles.tlBody}>
      <View style={styles.tlHead}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.tlTitle, !active && { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={styles.tlSub}>{subtitle}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {date ? <Text style={styles.tlTime}>{date}</Text> : null}
          {time ? <Text style={styles.tlTime}>{time}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  </View>
);

// Rounded contact pill with avatar and chat / call buttons.
export const ContactCard = ({ name, subtitle, avatarUri, onChat, onCall, style }) => (
  <View style={[styles.contact, style]}>
    <Avatar uri={avatarUri} name={name} size={48} ring={false} />
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={styles.contactName} numberOfLines={1}>{name}</Text>
      {subtitle ? <Text style={styles.contactSub} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
    {onChat ? (
      <Pressable onPress={onChat} hitSlop={8} style={styles.contactBtn}>
        <Icon name="message-square" size={18} color={palette.textMuted} />
      </Pressable>
    ) : null}
    {onCall ? (
      <Pressable onPress={onCall} hitSlop={8} style={styles.contactBtn}>
        <Icon name="phone" size={18} color={palette.textMuted} />
      </Pressable>
    ) : null}
  </View>
);

// Horizontal chip (filters, categories). Selected = ink.
export const Chip = ({ label, icon, selected, onPress, style }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.75}
    style={[styles.chip, style, selected && { backgroundColor: palette.ink }]}
  >
    {icon ? (
      <Icon name={icon} size={15} color={selected ? palette.textInverse : palette.text} style={{ marginRight: 6 }} />
    ) : null}
    <Text style={[styles.chipText, selected && { color: palette.textInverse }]}>{label}</Text>
  </TouchableOpacity>
);

// Segmented control on a grey pill (Upcoming / Active / Past).
export const Segmented = ({ options, value, onChange, style }) => (
  <View style={[styles.seg, style]}>
    {options.map((o) => {
      const active = o.id === value;
      return (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={[styles.segItem, active && styles.segItemActive]}
        >
          <Text style={[styles.segText, active && { color: palette.text }]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

export const EmptyState = ({ title, subtitle, action, onAction, tone = 'peach' }) => (
  <View style={styles.empty}>
    <IsoBlock size={110} tone={tone} />
    <Text style={styles.emptyTitle}>{title}</Text>
    {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    {action ? (
      <PillButton label={action} variant="ink" size="md" onPress={onAction} style={{ marginTop: 18 }} />
    ) : null}
  </View>
);

/* ─── Slide to continue ────────────────────────────────────────────── */

// Dark glass pill with a peach knob. Drag the knob to the end (or tap it).
export const SlideToContinue = ({ label = 'Continue', hint = 'Slide', onComplete, width }) => {
  const [trackW, setTrackW] = useState(width || 0);
  const x = useRef(new Animated.Value(0)).current;
  const KNOB = 128;
  const max = Math.max(trackW - KNOB - 8, 0);

  const finish = () => {
    Animated.timing(x, { toValue: max, duration: 160, useNativeDriver: false }).start(() => {
      onComplete && onComplete();
      setTimeout(() => x.setValue(0), 400);
    });
  };

  const maxRef = useRef(max);
  maxRef.current = max;
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(g.dx, 0), maxRef.current)),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 6 || g.dx > maxRef.current * 0.6) finishRef.current();
        else Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
      },
    }),
  ).current;

  const hintOpacity = x.interpolate({ inputRange: [0, Math.max(max, 1)], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.slide} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.slideHint, { opacity: hintOpacity }]}>
        <Text style={styles.slideHintText}>{hint}</Text>
        <Icon name="arrow-right" size={20} color={palette.peach} />
      </Animated.View>
      <Animated.View
        {...responder.panHandlers}
        style={[styles.slideKnob, { width: KNOB, transform: [{ translateX: x }] }]}
      >
        <Text style={styles.slideKnobText}>{label}</Text>
      </Animated.View>
    </View>
  );
};

/* ─── Styles ───────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },

  card: { borderRadius: radii.xl, overflow: 'hidden' },
  cardPad: { padding: spacing.xl },

  pill: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { ...fonts.semibold },

  iconCircle: { alignItems: 'center', justifyContent: 'center' },
  iconCircleBorder: { borderWidth: 1, borderColor: palette.line },
  iconCircleGlass: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  badgeDot: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.danger,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },

  search: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  searchInput: {
    ...fonts.medium,
    flex: 1,
    fontSize: 15,
    color: palette.text,
    marginLeft: 10,
    paddingVertical: 0,
  },

  fieldLabel: { ...typography.caption, marginBottom: 8, marginLeft: 4 },
  field: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  fieldInput: { ...fonts.medium, flex: 1, fontSize: 16, color: palette.text, paddingVertical: 0 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.xl,
  },
  headerSide: { width: 56, justifyContent: 'center' },
  headerTitle: { ...fonts.semibold, flex: 1, textAlign: 'center', fontSize: 19, color: palette.text },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...fonts.medium, fontSize: 19, color: palette.text, letterSpacing: -0.2 },
  sectionAction: { ...fonts.semibold, fontSize: 14, color: palette.textMuted },

  avatarBase: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.peachSoft, overflow: 'hidden' },
  avatarRing: { borderWidth: 2.5, borderColor: palette.ink },
  avatarText: { ...fonts.bold, color: palette.text },

  tag: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  tagText: { ...fonts.semibold, fontSize: 11 },

  track: { flexDirection: 'row', alignItems: 'center' },
  trackDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.ink },
  trackRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
    borderColor: palette.ink,
    backgroundColor: palette.surface,
  },
  trackLine: { flex: 1, height: 4, borderRadius: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { marginBottom: 14, paddingRight: 8 },
  gridLabel: { ...fonts.semibold, fontSize: 12.5, color: palette.text, marginBottom: 3 },
  gridValue: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, lineHeight: 17 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowTitle: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  rowSub: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },

  tlRow: { flexDirection: 'row' },
  tlRail: { width: 34, alignItems: 'center' },
  tlDotOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlDotOuterActive: { backgroundColor: '#E3F0FE' },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9A9A9A' },
  tlDotActive: { backgroundColor: palette.info },
  tlLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D0D0D0',
    marginVertical: 4,
  },
  tlBody: { flex: 1, paddingLeft: 12, paddingBottom: 22 },
  tlHead: { flexDirection: 'row' },
  tlTitle: { ...fonts.semibold, fontSize: 15.5, color: palette.text, lineHeight: 21 },
  tlSub: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 3 },
  tlTime: { ...fonts.medium, fontSize: 12, color: palette.textMuted, lineHeight: 18 },

  contact: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingRight: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  contactName: { ...fonts.bold, fontSize: 14, color: palette.text },
  contactSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  contactBtn: { padding: 8, marginLeft: 4 },

  chip: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  chipText: { ...fonts.semibold, fontSize: 14, color: palette.text },

  seg: {
    flexDirection: 'row',
    backgroundColor: palette.fill,
    borderRadius: radii.pill,
    padding: 5,
  },
  segItem: {
    flex: 1,
    height: 42,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segItemActive: { backgroundColor: palette.surface, ...shadow.press },
  segText: { ...fonts.semibold, fontSize: 14, color: palette.textMuted },

  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyTitle: { ...fonts.semibold, fontSize: 18, color: palette.text, marginTop: 14, textAlign: 'center' },
  emptySub: { ...fonts.medium, fontSize: 14, color: palette.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },

  slide: {
    height: 76,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,20,20,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    padding: 4,
  },
  slideHint: {
    position: 'absolute',
    right: 28,
    flexDirection: 'row',
    alignItems: 'center',
  },
  slideHintText: { ...fonts.medium, fontSize: 17, color: palette.peach, marginRight: 8 },
  slideKnob: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideKnobText: { ...fonts.medium, fontSize: 17, color: palette.text },
});
