/**
 * Option lists for the onboarding, KYC, profile and listing forms. They match the owner app (apps/owner/src/constants/mockData.ts) and the
 * backend's enums (Owner.owner_type, ParkingSpace.space_type / allowed_vehicle_types / booking_mode), so what is saved here reads the same in
 * the app.
 */

/** Two-letter codes, as the owner app stores them in `state`. */
export const INDIAN_STATES: { value: string; label: string }[] = [
  { value: 'AN', label: 'Andaman and Nicobar Islands' },
  { value: 'AP', label: 'Andhra Pradesh' },
  { value: 'AR', label: 'Arunachal Pradesh' },
  { value: 'AS', label: 'Assam' },
  { value: 'BR', label: 'Bihar' },
  { value: 'CH', label: 'Chandigarh' },
  { value: 'CT', label: 'Chhattisgarh' },
  { value: 'DL', label: 'Delhi' },
  { value: 'GA', label: 'Goa' },
  { value: 'GJ', label: 'Gujarat' },
  { value: 'HR', label: 'Haryana' },
  { value: 'HP', label: 'Himachal Pradesh' },
  { value: 'JK', label: 'Jammu and Kashmir' },
  { value: 'JH', label: 'Jharkhand' },
  { value: 'KA', label: 'Karnataka' },
  { value: 'KL', label: 'Kerala' },
  { value: 'MP', label: 'Madhya Pradesh' },
  { value: 'MH', label: 'Maharashtra' },
  { value: 'MN', label: 'Manipur' },
  { value: 'ML', label: 'Meghalaya' },
  { value: 'MZ', label: 'Mizoram' },
  { value: 'NL', label: 'Nagaland' },
  { value: 'OR', label: 'Odisha' },
  { value: 'PB', label: 'Punjab' },
  { value: 'RJ', label: 'Rajasthan' },
  { value: 'SK', label: 'Sikkim' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'TG', label: 'Telangana' },
  { value: 'TR', label: 'Tripura' },
  { value: 'UP', label: 'Uttar Pradesh' },
  { value: 'UT', label: 'Uttarakhand' },
  { value: 'WB', label: 'West Bengal' },
];

/** The name of a state from its code, or the value itself when it is something else (older records hold the full name). */
export const stateLabel = (value: string | null | undefined): string => {
  if (!value) return '';
  return INDIAN_STATES.find((s) => s.value === value)?.label || value;
};

/** The code for a stored state: a code stays, a full name becomes its code, anything else comes back unchanged. */
export const stateCode = (value: string | null | undefined): string => {
  if (!value) return '';
  const byCode = INDIAN_STATES.find((s) => s.value === value);
  if (byCode) return byCode.value;
  const byName = INDIAN_STATES.find((s) => s.label.toLowerCase() === value.trim().toLowerCase());
  return byName ? byName.value : value;
};

export const OWNER_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'individual', label: 'Individual owner', hint: 'A driveway, garage or a few bays you own' },
  { value: 'residential_community', label: 'Residential community', hint: 'An apartment society or housing complex' },
  { value: 'commercial_property', label: 'Commercial property', hint: 'A mall, office or other business premises' },
  { value: 'industrial_facility', label: 'Industrial facility', hint: 'A factory, warehouse or logistics yard' },
  { value: 'empty_land', label: 'Empty land owner', hint: 'An open plot you want to turn into parking' },
];

export const OWNER_TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(OWNER_TYPES.map((t) => [t.value, t.label])),
  business: 'Business',
  property_manager: 'Property manager',
};

/** Owner types that must give a business name (the backend refuses business and property_manager without one). */
export const NEEDS_BUSINESS_NAME = new Set([
  'commercial_property',
  'industrial_facility',
  'residential_community',
  'business',
  'property_manager',
]);

export const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's licence" },
];

export const SPACE_TYPES: { value: string; label: string }[] = [
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'covered', label: 'Covered' },
  { value: 'garage', label: 'Garage' },
  { value: 'driveway', label: 'Driveway' },
  { value: 'carport', label: 'Carport' },
  { value: 'street', label: 'Street' },
];

export const VEHICLE_TYPES: { value: string; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'suv', label: 'SUV' },
  { value: 'van', label: 'Van' },
  { value: 'truck', label: 'Truck' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'rv', label: 'RV' },
  { value: 'trailer', label: 'Trailer' },
];

export const BOOKING_MODES: { value: 'instant' | 'request' | 'both'; label: string; hint: string }[] = [
  { value: 'instant', label: 'Instant', hint: 'A booking is confirmed straight away' },
  { value: 'request', label: 'On request', hint: 'You approve each booking' },
  { value: 'both', label: 'Both', hint: 'The renter chooses' },
];

/** 0 = Sunday, as the backend stores `day_of_week`. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, the way people read a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
