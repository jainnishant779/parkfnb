import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import FormTextInput from '../../../components/inputs/FormTextInput';
import PincodeAddressBlock, {
  EMPTY_PINCODE_ADDRESS,
  type PincodeAddressValue,
} from '../../../components/inputs/PincodeAddressBlock';
import LocationPickerMap from '../../../components/map/LocationPickerMap';
import { usePropertyWizard } from '../../../context/ListingWizardContext';
import { useAuth } from '../../../context/AuthContext';
import { listingService } from '../../../services/listingService';
import { useScrollToInput } from '../../../hooks/useScrollToInput';

// The Property backend model stores `address` as a single string. The
// PincodeAddressBlock widget exposes line1 + line2 separately, so we
// flatten on save and split-on-first-comma on load.
function flattenAddress(line1: string, line2: string): string {
  const a = line1.trim();
  const b = line2.trim();
  return [a, b].filter(Boolean).join(', ');
}

function splitAddress(address: string): { line1: string; line2: string } {
  if (!address) return { line1: '', line2: '' };
  const idx = address.indexOf(', ');
  if (idx === -1) return { line1: address, line2: '' };
  return { line1: address.slice(0, idx), line2: address.slice(idx + 2) };
}

export default function StepLocationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data, updateField, replaceData, setEditPropertyId, editPropertyId, setChainToSpace } = usePropertyWizard();
  const { user } = useAuth();

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingEdit, setLoadingEdit] = useState(false);
  const { scrollRef, registerField, focusField } = useScrollToInput();

  // Local mirror of the address fields. Line1 + line2 are merged into a
  // single backend `address` string when the wizard saves the property.
  const initialSplit = useMemo(() => splitAddress(data.address || ''), []);
  const [addr, setAddr] = useState<PincodeAddressValue>({
    ...EMPTY_PINCODE_ADDRESS,
    pincode: data.postalCode || '',
    state: data.state || '',
    city: data.city || '',
    addressLine1: initialSplit.line1,
    addressLine2: initialSplit.line2,
  });

  // Push address changes back into wizard context.
  useEffect(() => {
    replaceData({
      address: flattenAddress(addr.addressLine1, addr.addressLine2),
      city: addr.city,
      state: addr.state,
      postalCode: addr.pincode,
    });
  }, [addr]);

  const incomingEditId = route.params?.editPropertyId;
  const incomingChain: boolean = !!route.params?.chainToSpace;

  // Persist chainToSpace flag into context (session-scoped, not drafted)
  useEffect(() => {
    setChainToSpace(incomingChain);
  }, [incomingChain]);

  useEffect(() => {
    if (incomingEditId && incomingEditId !== editPropertyId) {
      setEditPropertyId(incomingEditId);
      setLoadingEdit(true);
      listingService
        .getProperty(incomingEditId)
        .then((p) => {
          replaceData({
            propertyName: p.propertyName || '',
            address: p.address || '',
            city: p.city || '',
            state: p.state || '',
            postalCode: p.postalCode || '',
            locationLat: p.locationLat ?? null,
            locationLng: p.locationLng ?? null,
            accessInstructions: p.accessInstructions || '',
            propertyImages: p.propertyImages || [],
          });
          const split = splitAddress(p.address || '');
          setAddr({
            pincode: p.postalCode || '',
            state: p.state || '',
            city: p.city || '',
            addressLine1: split.line1,
            addressLine2: split.line2,
            country: 'IN',
          });
        })
        .finally(() => setLoadingEdit(false));
    }
  }, [incomingEditId]);

  const useProfileAddress = () => {
    if (!user) return;
    setAddr({
      pincode: user.pincode || '',
      state: user.state || '',
      city: user.city || '',
      addressLine1: user.addressLine1 || '',
      addressLine2: user.addressLine2 || '',
      country: (user as any).country || 'IN',
    });
    if (user.locationLat != null && user.locationLng != null) {
      updateField('locationLat', user.locationLat);
      updateField('locationLng', user.locationLng);
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!data.propertyName.trim()) errs.propertyName = 'Property name is required';
    if (!addr.addressLine1.trim()) errs.addressLine1 = 'Address is required';
    if (!addr.city.trim()) errs.city = 'City is required';
    if (!addr.state) errs.state = 'State is required';
    if (!/^\d{6}$/.test(addr.pincode)) errs.pincode = 'Enter a valid 6-digit pincode';
    if (data.locationLat == null || data.locationLng == null) {
      errs.locationLat = 'Pin your location on the map';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    navigation.navigate('StepPropertyPhotos');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={editPropertyId ? 'Edit Property' : 'Add Property'}
        step={1}
        totalSteps={2}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>Where is your parking property?</Text>
          <Text style={styles.sub}>This is the physical address. You'll add individual parking spaces next.</Text>

          {user?.addressLine1 ? (
            <Pressable onPress={useProfileAddress} style={styles.profileBtn}>
              <Ionicons name="person-circle-outline" size={18} color="#0D7377" />
              <Text style={styles.profileBtnText}>Use my profile address</Text>
            </Pressable>
          ) : null}

          <FormTextInput
            label="Property name"
            required
            value={data.propertyName}
            onChangeText={(v) => updateField('propertyName', v)}
            placeholder="e.g., Indiranagar Home Parking"
            error={errors.propertyName}
            containerStyle={styles.input}
          />

          <PincodeAddressBlock
            value={addr}
            onChange={setAddr}
            errors={{
              pincode: errors.pincode,
              state: errors.state,
              city: errors.city,
              addressLine1: errors.addressLine1,
            }}
            required
          />

          <Text style={styles.sectionTitle}>Map location</Text>
          <Text style={styles.hint}>Tap or drag the pin to place it on your property.</Text>
          <LocationPickerMap
            value={{ lat: data.locationLat, lng: data.locationLng }}
            onChange={({ lat, lng }) => {
              updateField('locationLat', lat);
              updateField('locationLng', lng);
            }}
            seedRegion={
              data.locationLat != null && data.locationLng != null
                ? { lat: data.locationLat, lng: data.locationLng }
                : undefined
            }
          />
          {errors.locationLat ? <Text style={styles.errorText}>{errors.locationLat}</Text> : null}

          <View onLayout={registerField('access')} style={styles.input}>
            <FormTextInput
              label="Access instructions (optional)"
              value={data.accessInstructions}
              onChangeText={(v) => updateField('accessInstructions', v)}
              placeholder="Gate code, parking rules, etc."
              multiline
              onFocus={focusField('access')}
            />
          </View>
        </ScrollView>
        <WizardFooter primaryLabel="Next" onPrimary={handleNext} loading={loadingEdit} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 200 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginTop: 16, marginBottom: 4 },
  hint: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  input: { marginTop: 16 },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 6 },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8F5F4',
    borderRadius: 8,
    marginBottom: 16,
  },
  profileBtnText: { color: '#0D7377', fontSize: 13, fontWeight: '500', marginLeft: 6 },
});
