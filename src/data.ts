// Presentational content for the landing page. Kept out of the component tree
// so copy can be edited in one place and reused by both the rendered UI and the
// structured-data (JSON-LD) layer without the two drifting apart.

import { ClockRound, ShieldCheck, DeliveryTruck, Coins, Zap, Truck, Warehouse } from './icons';
import type { ComponentType } from 'react';

type IconType = ComponentType<{ className?: string }>;

export interface TrustItem {
  text: string;
  icon: IconType;
}

// Each icon has to mean its label literally. A map pin says "a location", not
// "the whole UK"; a star says "highly rated", not "cheap".
export const TRUST_ITEMS: TrustItem[] = [
  { text: '24/7 Availability', icon: ClockRound },
  { text: 'Fully Insured', icon: ShieldCheck },
  { text: 'UK Wide Transport', icon: DeliveryTruck },
  { text: 'Low Cost Guarantee', icon: Coins },
];

export interface FeaturedService {
  title: string;
  body: string;
  cta: string;
  icon: IconType;
  image: string;
  imageAlt: string;
  featured?: boolean;
}

export const FEATURED_SERVICES: FeaturedService[] = [
  {
    title: 'Vehicle Towing & Transport',
    body: 'Vehicle tow, pick up and drop off from car dealerships and all major auction sites including Copart, BCA, and SYNETIQ Salvage Auction. UK wide coverage.',
    cta: 'Book Transport',
    icon: Truck,
    image:
      'https://images.unsplash.com/photo-1673187139211-1e7ec3dd60ec?auto=format&fit=crop&w=800&q=70',
    imageAlt: 'Car secured on a flatbed recovery truck',
  },
  {
    title: '12 Volt Jump Start',
    body: 'If your vehicle battery is drained, we can jump start your car immediately. Fast response times to get you back on the road safely and quickly.',
    cta: 'Request Jump Start',
    icon: Zap,
    image:
      'https://images.unsplash.com/photo-1597766380552-36f5c673637a?auto=format&fit=crop&w=800&q=70',
    imageAlt: 'Red and black jump-start cables clamped to a car battery',
    featured: true,
  },
  {
    title: 'Secure 24hr Storage',
    body: 'Our 24hr secure vehicle storage facility means that you and your vehicle are in safe hands. We will tow your vehicle directly to our secure storage.',
    cta: 'View Storage Options',
    icon: Warehouse,
    image:
      'https://images.unsplash.com/photo-1758448721043-2cc4eba0e483?auto=format&fit=crop&w=800&q=70',
    imageAlt: 'Cars parked in a clean, secure indoor storage facility',
  },
];

export interface GridService {
  name: string;
  image: string;
  imageAlt: string;
}

const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=65`;

export const GRID_SERVICES: GridService[] = [
  {
    name: 'Roadside Assistance',
    image: unsplash('1692630242208-b1eaa353d80d'),
    imageAlt: 'Cars parked along a British terraced street',
  },
  {
    name: '12 Volts Jumpstart',
    image: unsplash('1597766380552-36f5c673637a'),
    imageAlt: 'Jump-start cables clamped to a car battery',
  },
  {
    name: 'Out of Fuel',
    image: unsplash('1644246905181-c3753e9a82bd'),
    imageAlt: 'Refuelling a car at a fuel pump',
  },
  {
    name: 'Towing Service',
    image: unsplash('1673187139211-1e7ec3dd60ec'),
    imageAlt: 'Car secured on a flatbed recovery truck',
  },
  {
    name: 'Tyre Fitting',
    image: unsplash('1578583444814-badeb909a1b6'),
    imageAlt: 'Technician fitting a wheel with a wrench',
  },
  {
    name: 'Flat Tyre Repair',
    image: unsplash('1507241698564-b4f07193ad5b'),
    imageAlt: 'Close-up of a flat, deflated car tyre',
  },
  {
    name: 'Low Cost Recovery',
    image: unsplash('1730514784243-f0e7f09c9f50'),
    imageAlt: 'Tow truck recovering a car on the road',
  },
  {
    name: 'Electric Vehicle Recovery',
    image: unsplash('1673337188103-c196140adebd'),
    imageAlt: 'Electric car plugged into a charging point',
  },
  {
    name: 'Motorbike Recovery',
    image: unsplash('1695013147209-1516a20f0cdd'),
    imageAlt: 'Motorbike parked at the side of the road',
  },
  {
    name: 'Sand or Mud Pull Out',
    image: unsplash('1684856936624-22a87a1b5873'),
    imageAlt: 'Car stuck in mud on a dirt track',
  },
  {
    name: 'Battery Replacement',
    image: unsplash('1676337167752-2062c6ca7366'),
    imageAlt: 'A 12-volt car battery with red and black terminals',
  },
  {
    name: '24/7 Breakdown Recovery',
    image: unsplash('1636822236663-6e91a61ec4ac'),
    imageAlt: 'Car tail lights glowing at night',
  },
];

export interface Testimonial {
  quote: string;
  name: string;
  area: string;
  service: string;
  photo: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Car wouldn't start at 2am outside a wedding do in Bolton and I was stood there in heels in the rain nearly in tears. Lad turned up in about 20 minutes, jumped it, then made me sit and run the engine a bit before he'd leave. Told me the battery was on its way out, which it was. Can't fault him.",
    name: 'Sarah K.',
    area: 'Bolton',
    service: '12V Jump Start',
    photo:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&h=160&q=70',
  },
  {
    quote:
      'Van packed in on the M60 near junction 25. Waited about 40 minutes which felt like a lifetime sat on the hard shoulder, but he rang me twice on the way to say where he was and that made a big difference. Got it to my garage in Stockport the same evening and the price was what he said on the phone.',
    name: 'Imran A.',
    area: 'Stockport',
    service: 'Vehicle Towing',
    photo:
      'https://images.unsplash.com/photo-1545167622-3a6ac756afa4?auto=format&fit=crop&w=160&h=160&q=70',
  },
  {
    quote:
      "My EV wouldn't take a charge in the work car park in Salford and you can't just tow one of them off, so I was dreading the whole thing. Flatbed came, driver clearly knew what he was doing and didn't drag it an inch. Dropped it at the service centre I asked for. Only writing this because I expected a nightmare and it wasn't one.",
    name: 'Tom B.',
    area: 'Salford',
    service: 'EV Recovery',
    photo:
      'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?auto=format&fit=crop&w=160&h=160&q=70',
  },
];

export interface ServiceOption {
  value: string;
  label: string;
  /** Whether this service needs a drop-off destination. */
  needsDestination: boolean;
}

export const SERVICE_OPTIONS: ServiceOption[] = [
  { value: 'towing', label: 'My car broke down (Need a Tow)', needsDestination: true },
  { value: 'tow', label: 'I just need a tow', needsDestination: true },
  { value: 'jumpstart', label: 'My battery is dead (Jump Start)', needsDestination: false },
  { value: 'tyre', label: 'I have a flat tyre', needsDestination: false },
  { value: 'fuel', label: 'I ran out of fuel', needsDestination: false },
  { value: 'ev', label: 'My electric car stopped working', needsDestination: true },
  { value: 'motorbike', label: 'My motorbike broke down', needsDestination: true },
  // Trade work rather than a breakdown: a car bought at auction that needs
  // collecting and delivering. Priced as a tow (callout + loaded miles), and it
  // always needs a drop-off because the whole job is taking it somewhere.
  { value: 'auction', label: 'Auction pickup (collect a car for me)', needsDestination: true },
  { value: 'other', label: "I'm not sure / Other", needsDestination: true },
];

/**
 * Whether a service requires a drop-off address. Unknown services default to
 * `true`: a tow with nowhere to go is the costly mistake, so the safe guess is
 * to ask. Shared by the form and the validator so the field that gets shown and
 * the field that gets required can never disagree.
 */
export const serviceNeedsDestination = (service: string): boolean =>
  SERVICE_OPTIONS.find((o) => o.value === service)?.needsDestination ?? true;

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * FAQ content, parameterised by region. Consumed by BOTH the visible FAQ
 * accordion and the FAQPage JSON-LD so the two can never drift (drift between
 * them is a documented cause of structured-data penalties).
 */
export const buildFaqItems = (regionName: string): FaqItem[] => [
  {
    q: `How quickly can you reach me in ${regionName}?`,
    a: `Average response time across ${regionName} is 24 minutes. Most calls are reached within 30 minutes during peak hours, dispatched from the nearest available recovery vehicle.`,
  },
  {
    q: 'How much does breakdown recovery cost?',
    a: 'We offer transparent flat-rate pricing with a low cost guarantee. Quotes are agreed upfront before dispatch, with no hidden fees, surge pricing, or callout charges added afterwards.',
  },
  {
    q: `Do you operate 24 hours a day in ${regionName}?`,
    a: `Yes — we dispatch 24 hours a day, 365 days a year across ${regionName} and all of Greater Manchester, including bank holidays, weekends, and overnight.`,
  },
  {
    q: 'Can you recover electric vehicles and motorbikes?',
    a: 'Yes. Our flatbed recovery fleet is suitable for electric vehicles, hybrids, motorbikes, and high-end cars where towing on the wheels is not safe.',
  },
  {
    q: 'Are you fully insured to tow my vehicle?',
    a: 'Yes. We hold full goods-in-transit and public liability insurance for vehicle recovery and transport up to 3.5 tonnes, with all operators trained and DBS-checked.',
  },
  {
    q: 'Do you attend motorway breakdowns?',
    a: 'Yes, we attend breakdowns on all motorways across Greater Manchester including the M60, M61, M62, M66, and M67, working alongside Highways England traffic officers when required.',
  },
];
