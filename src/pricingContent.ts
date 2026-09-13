// The prices page, as data. Every figure is computed from src/pricing.ts so
// the page and the booking form can never disagree.

import type { FaqItem } from './data';
import { PHONE_DISPLAY } from './config';
import {
  CALLOUT_FEE,
  DEADHEAD_PER_MILE,
  FREE_DEADHEAD_MILES,
  FROM_PRICE,
  LONG_TOW_AFTER_MILES,
  LONG_TOW_PER_MILE,
  MOTORWAY_SURCHARGE,
  NIGHT_MULTIPLIER,
  PER_MILE,
  ROADSIDE_FEES,
  estimatePrice,
} from './pricing';

export const NIGHT_PERCENT = Math.round((NIGHT_MULTIPLIER - 1) * 100);

export interface TariffRow {
  item: string;
  price: string;
  note: string;
}

export const TARIFF: TariffRow[] = [
  {
    item: 'Jump start',
    price: `£${ROADSIDE_FEES.jumpstart}`,
    note: 'Flat fee. Booster pack, battery and charging check.',
  },
  {
    item: 'Out of fuel',
    price: `£${ROADSIDE_FEES.fuel}`,
    note: 'Flat fee plus the fuel at pump price, up to ten litres.',
  },
  {
    item: 'Flat tyre',
    price: `£${ROADSIDE_FEES.tyre}`,
    note: 'Flat fee. Spare fitted or a tread puncture plugged.',
  },
  {
    item: 'Tow or recovery callout',
    price: `£${CALLOUT_FEE}`,
    note: 'Covers the truck coming out, loading and the first eight miles of that run.',
  },
  {
    item: 'Loaded miles (pickup to drop-off)',
    price: `£${PER_MILE.toFixed(2)} / mile`,
    note: `Drops to £${LONG_TOW_PER_MILE.toFixed(2)} a mile after ${LONG_TOW_AFTER_MILES} miles.`,
  },
  {
    item: 'Run out to you beyond eight miles',
    price: `£${DEADHEAD_PER_MILE.toFixed(2)} / mile`,
    note: `The first ${FREE_DEADHEAD_MILES} miles from our base are included in the callout.`,
  },
  {
    item: 'Motorway or hard shoulder',
    price: `+ £${MOTORWAY_SURCHARGE}`,
    note: 'Live-carriageway procedure and coordination with National Highways.',
  },
  {
    item: 'Night rate, 22:00 to 06:00',
    price: `+ ${NIGHT_PERCENT}%`,
    note: 'Applied to the whole job. Shown on the form as "night rate".',
  },
];

export interface WorkedExample {
  title: string;
  detail: string;
  price: number;
}

const example = (
  title: string,
  detail: string,
  opts: Parameters<typeof estimatePrice>[0],
): WorkedExample => ({ title, detail, price: estimatePrice(opts) ?? 0 });

export const EXAMPLES: WorkedExample[] = [
  example('Jump start, daytime', 'Anywhere within eight miles of base.', {
    service: 'jumpstart',
    deadheadMiles: 5,
  }),
  example('Five-mile tow across town', 'Say Salford to a garage in Stretford, in the day.', {
    service: 'towing',
    distanceMiles: 5,
    deadheadMiles: 4,
  }),
  example('Fifteen-mile tow', 'Bolton to Stockport, pickup ten miles from base.', {
    service: 'towing',
    distanceMiles: 15,
    deadheadMiles: 10,
  }),
  example('Motorway recovery, ten miles', 'Off the M60 to a garage nearby, in the day.', {
    service: 'towing',
    distanceMiles: 10,
    deadheadMiles: 6,
    motorway: true,
  }),
  example('Jump start at 2am', 'The same flat fee with the night rate applied.', {
    service: 'jumpstart',
    deadheadMiles: 5,
    night: true,
  }),
  example('Sixty-mile auction collection', 'Collected from Leeds and delivered to Manchester.', {
    service: 'auction',
    distanceMiles: 60,
    deadheadMiles: 5,
  }),
];

export const PRICING_FAQ: FaqItem[] = [
  {
    q: 'Is the price on the screen the price I pay?',
    a: 'Yes. It is worked out from the real driving route for the exact pickup and drop-off you typed, and the driver is sent that figure. The only time it changes is if the job turns out to be different from what was booked, for example a tow that becomes a jump start, in which case it goes down.',
  },
  {
    q: 'Why is a tow priced by the mile?',
    a: 'Because that is what it costs. A truck moving your car ten miles uses more diesel and more of the driver’s time than one moving it two. A flat "from" price that everyone then argues about at the roadside is how the industry got its reputation.',
  },
  {
    q: 'What is the callout fee for?',
    a: `The truck coming out to you, loading the car, and the first ${FREE_DEADHEAD_MILES} miles of that run. Beyond ${FREE_DEADHEAD_MILES} miles from our base the empty miles out to you are charged at £${DEADHEAD_PER_MILE.toFixed(2)} each, which is why a job on the far edge of Greater Manchester costs a little more than one round the corner.`,
  },
  {
    q: 'Do you charge extra at night or on a bank holiday?',
    a: `Between 22:00 and 06:00 the whole job carries a ${NIGHT_PERCENT}% night rate, and the form says so. Weekends and bank holidays are charged at the normal daytime rate.`,
  },
  {
    q: 'How do I pay?',
    a: 'Card or cash to the driver when the job is done. There is nothing to pay to book and nothing to pay if you cancel before the driver is on scene.',
  },
  {
    q: 'What if I am not sure what is wrong with the car?',
    a: `Book the tow so a truck is on its way, and put what happened in the vehicle box. If the driver can fix it at the roadside you pay the roadside price instead. Or ring ${PHONE_DISPLAY} and describe it.`,
  },
];

export { FROM_PRICE };
