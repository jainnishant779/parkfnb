/**
 * Site-wide settings. Store links stay empty until the apps are published —
 * StoreButtons then shows "Coming soon" instead of a dead link.
 */
export const site = {
  name: 'Parkfnb',
  tagline: 'Your parking, simplified. Anywhere, anytime.',
  supportEmail: 'support@parkfnb.com',
  partnersEmail: 'partners@parkfnb.com',
  stores: {
    driver: { ios: '', android: '' },
    owner: { ios: '', android: '' },
  },
  legalUpdated: '1 October 2026',
};

export type NavItem = { to: string; label: string };

export const primaryNav: NavItem[] = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/features', label: 'Features' },
  { to: '/smart-gates', label: 'Smart gates' },
  { to: '/owners', label: 'For owners' },
  { to: '/pricing', label: 'Pricing' },
];

export const secondaryNav: NavItem[] = [
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
  { to: '/download', label: 'Download' },
];

export const footerColumns: { title: string; links: NavItem[] }[] = [
  {
    title: 'Drivers',
    links: [
      { to: '/how-it-works', label: 'How it works' },
      { to: '/features', label: 'Features' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/download', label: 'Download the app' },
    ],
  },
  {
    title: 'Owners',
    links: [
      { to: '/owners', label: 'List your space' },
      { to: '/owners#calculator', label: 'Earnings calculator' },
      { to: '/smart-gates', label: 'Smart gates' },
      { to: '/how-it-works?for=owners', label: 'Owner journey' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
      { to: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy policy' },
      { to: '/terms', label: 'Terms of service' },
    ],
  },
];

export const inr = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN');
