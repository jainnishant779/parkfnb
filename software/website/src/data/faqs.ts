export type FaqCategory = 'booking' | 'payments' | 'access' | 'cancellations' | 'owners' | 'account';

export type Faq = { id: string; category: FaqCategory; q: string; a: string };

export const faqCategories: { value: FaqCategory; label: string }[] = [
  { value: 'booking', label: 'Booking' },
  { value: 'payments', label: 'Payments' },
  { value: 'access', label: 'Gate access' },
  { value: 'cancellations', label: 'Cancellations' },
  { value: 'owners', label: 'For owners' },
  { value: 'account', label: 'Account and safety' },
];

export const faqs: Faq[] = [
  // Booking
  {
    id: 'how-book',
    category: 'booking',
    q: 'How do I book a parking spot?',
    a: 'Search the area you are heading to or tap "Near me", pick a spot on the map or list, choose your date and duration, then pay in the app. You get a booking ID and your entry pass straight away.',
  },
  {
    id: 'durations',
    category: 'booking',
    q: 'Can I book by the hour or by the month?',
    a: 'Both. Spots can be booked hourly, daily, weekly or monthly, depending on what the owner offers for that space. Monthly passes suit daily office commutes.',
  },
  {
    id: 'advance',
    category: 'booking',
    q: 'How far ahead can I book?',
    a: 'You can book for right now or for a later date from the calendar in the app. Popular spots near offices and markets fill up at peak hours, so booking before you leave home is the safest bet.',
  },
  {
    id: 'request',
    category: 'booking',
    q: 'Why does my booking say "Pending approval"?',
    a: 'Some owners approve each request themselves. Your booking shows "Pending approval" until they confirm it, and you get a notification as soon as they do. Instant-book spots are confirmed immediately.',
  },
  {
    id: 'extend',
    category: 'booking',
    q: 'Can I extend my booking while I am parked?',
    a: 'Yes, if the bay is free after your booking ends. You get a reminder 15 minutes before your time runs out, with an option to extend from the app.',
  },
  {
    id: 'vehicle-size',
    category: 'booking',
    q: 'Will my SUV or van fit?',
    a: 'Each space lists the vehicle types it accepts. Use the SUV-friendly filter when you search, and add your vehicle in the app so you only see bays that fit it.',
  },
  // Payments
  {
    id: 'methods',
    category: 'payments',
    q: 'Which payment methods are supported?',
    a: 'UPI, debit and credit cards, and FASTag where the location supports it. You pay in the app before you arrive, so there is no cash at the gate.',
  },
  {
    id: 'fees',
    category: 'payments',
    q: 'What does a booking cost?',
    a: 'The owner sets the rate for each space. You pay that rate for the time you book plus a small convenience fee and applicable taxes. The full breakdown is shown on the booking screen before you pay.',
  },
  {
    id: 'receipt',
    category: 'payments',
    q: 'Do I get a receipt?',
    a: 'Yes. Every booking has a digital receipt in the app with the base price, fees and GST listed separately.',
  },
  {
    id: 'overstay',
    category: 'payments',
    q: 'What happens if I overstay?',
    a: 'You have 15 minutes after your booking ends to drive out. After that, extra time may be charged at the space rate. Extending from the app before your time ends is usually cheaper.',
  },
  // Access
  {
    id: 'gate',
    category: 'access',
    q: 'How do I get in at the gate?',
    a: 'At gates with number-plate cameras, the barrier opens automatically for the vehicle on your booking. At other gates you can unlock from the app, show your QR pass, or type the 6-digit code on the keypad.',
  },
  {
    id: 'early',
    category: 'access',
    q: 'Can I arrive a little early?',
    a: 'Yes. Your pass works from 15 minutes before your booking starts, at no extra cost.',
  },
  {
    id: 'late',
    category: 'access',
    q: 'What if I am running late?',
    a: 'Your bay is held for 60 minutes after your start time. If you have not checked in by then, the booking is marked as a no-show and the bay is released.',
  },
  {
    id: 'phone-dead',
    category: 'access',
    q: 'My phone battery died. Can I still get in?',
    a: 'Yes. Gates with a keypad accept your 6-digit code, and number-plate gates do not need your phone at all.',
  },
  // Cancellations
  {
    id: 'cancel',
    category: 'cancellations',
    q: 'Can I cancel a booking?',
    a: 'Yes, from the booking details screen. The cancellation policy for each spot is shown before you pay, so you know what you will get back.',
  },
  {
    id: 'refund-time',
    category: 'cancellations',
    q: 'How long do refunds take?',
    a: 'Refunds go back to the payment method you used. UPI refunds usually arrive within a few days; cards can take a little longer depending on your bank.',
  },
  {
    id: 'dispute',
    category: 'cancellations',
    q: 'My spot was occupied when I arrived. What now?',
    a: 'Report it from the booking screen. Our support team checks the gate and occupancy records and will help you find another bay or refund you.',
  },
  // Owners
  {
    id: 'list',
    category: 'owners',
    q: 'I have an empty space. How do I list it?',
    a: 'Download the Parkfnb Owner app, complete verification, then add your property and spaces with photos, pricing and availability. Your listing goes live after a quick review.',
  },
  {
    id: 'kyc',
    category: 'owners',
    q: 'What documents do I need?',
    a: 'A PAN card, Aadhaar, a proof of address for the property (such as an electricity bill or property tax receipt) and the bank account you want to be paid into.',
  },
  {
    id: 'control',
    category: 'owners',
    q: 'Do I decide who parks and when?',
    a: 'Yes. You set your own hours, block out dates, choose instant booking or approve each request yourself, and only verified drivers can book.',
  },
  {
    id: 'payouts',
    category: 'owners',
    q: 'When do I get paid?',
    a: 'Earnings from completed bookings are released after a 48-hour dispute window and paid out to your bank account every week.',
  },
  {
    id: 'hardware',
    category: 'owners',
    q: 'Do I need a smart barrier?',
    a: 'No. You can start with app and QR check-in only. Smart locks, boom barriers and camera-based entry are available when you want gate access to run on its own.',
  },
  // Account
  {
    id: 'signup',
    category: 'account',
    q: 'How do I create an account?',
    a: 'Sign up with your mobile number and the one-time code we send you. Then add your name and vehicle details. No password needed.',
  },
  {
    id: 'safety',
    category: 'account',
    q: 'Are the parking spots safe?',
    a: 'Every owner is verified before listing, and spaces show features such as CCTV, guards and covered parking. Reviews from drivers who parked there help you choose.',
  },
  {
    id: 'data',
    category: 'account',
    q: 'What do you do with my number plate and location?',
    a: 'We use them to match your booking at the gate and show parking near you. Read the privacy policy for the full details of what we collect and why.',
  },
];
