// The service pages: one URL per thing people search for, each with its own
// copy, price line and FAQ. The area pages answer "recovery near me in
// Bolton"; these answer "jump start near me" and "tow truck near me", which
// are searched at least as often and were previously only a grid tile.
//
// Prices are derived from src/pricing.ts so the page can never quote a figure
// the booking form would then contradict.

import type { FaqItem } from './data';
import { HOME_REGION, PHONE_DISPLAY } from './config';
import {
  CALLOUT_FEE,
  MOTORWAY_SURCHARGE,
  NIGHT_MULTIPLIER,
  PER_MILE,
  ROADSIDE_FEES,
  FROM_PRICE,
} from './pricing';

export interface ServiceStep {
  title: string;
  body: string;
}

export interface ServicePage {
  /** URL path without the leading slash. */
  slug: string;
  /** The booking form option to preselect (a `SERVICE_OPTIONS` value). */
  service: string;
  /** Short name for navigation and the footer. */
  name: string;
  /** <title>; kept under 60 characters. */
  title: string;
  /** Meta description; kept under 160 characters. */
  description: string;
  /** Small line above the headline. */
  eyebrow: string;
  /** The h1 in two lines; the second is set on the yellow block. */
  headline: [string, string];
  /** One paragraph under the headline. */
  intro: string;
  /** "From £55", derived from the tariff. */
  fromPrice: number;
  /** How the price is made up, in one sentence. */
  priceNote: string;
  /** What the callout includes. */
  included: string[];
  /** What happens, in order. */
  steps: ServiceStep[];
  /** Body copy for the page. Two or three paragraphs. */
  body: string[];
  faq: FaqItem[];
}

const night = Math.round((NIGHT_MULTIPLIER - 1) * 100);

const trackStep: ServiceStep = {
  title: 'Track your driver',
  body: 'Once a driver takes your job you get a live page with their name, a real ETA and, when they set off, their position on a map. No ringing to ask where they are.',
};

const defaultSteps = (what: string): ServiceStep[] => [
  {
    title: 'Tell us where you are',
    body: 'Type a postcode or street, or tap Find Me and your phone tells us. Add your number so the driver can reach you.',
  },
  {
    title: 'See your price before you confirm',
    body: `${what} You see the full price on screen, and a live wait measured from where the nearest driver actually is.`,
  },
  trackStep,
];

export const SERVICE_PAGES: ServicePage[] = [
  {
    slug: 'breakdown-recovery-manchester',
    service: 'towing',
    name: 'Breakdown recovery',
    title: 'Breakdown Recovery Manchester | 24/7, Price Up Front',
    description: `24/7 breakdown recovery across Greater Manchester. Flatbed recovery from £${CALLOUT_FEE}, price shown before you book, live ETA and driver tracking. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Broken down?',
    headline: ['BREAKDOWN RECOVERY', 'MANCHESTER.'],
    intro:
      'A flatbed recovery truck to you and your car to a garage, home, or wherever it needs to be. Any hour, any day, across all of Greater Manchester.',
    fromPrice: CALLOUT_FEE,
    priceNote: `A £${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile for the tow, lower per mile on long runs. Nights add ${night}%, motorways £${MOTORWAY_SURCHARGE}.`,
    included: [
      'Flatbed recovery, so your car travels with all four wheels off the road',
      'Drop-off at any garage, dealer, home address or storage yard',
      'Winching from a driveway, car park or grass verge',
      'Driver rings you on the way and again when nearly there',
    ],
    steps: defaultSteps(
      'Tell us where the car is going and we work out the real driving distance.',
    ),
    body: [
      `Breakdown recovery in ${HOME_REGION} used to mean ringing round, giving your details three times, and being told "about an hour" by someone who could not see the truck. Here you tell us where you are, you see a price and a live wait before you hand over anything, and once a driver takes your job you can watch them come to you.`,
      'We recover cars, vans up to 3.5 tonnes, electric vehicles, hybrids and motorbikes on flatbed trucks, which is the right way to move anything modern. Automatics, four-wheel drives and EVs cannot be towed on their wheels without damaging the drivetrain, and a flatbed avoids the question entirely.',
      'If you are not sure whether you need a tow or a roadside fix, book the tow and say so in the vehicle box. A flat battery or a wrong-fuel job is often sorted at the roadside for less, and the driver will tell you straight.',
    ],
    faq: [
      {
        q: 'How much is breakdown recovery in Manchester?',
        a: `Local tows start at £${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile. A five-mile tow across town is usually about £90 and you see the exact figure before you confirm. Nights (22:00 to 06:00) add ${night}% and motorway jobs carry a £${MOTORWAY_SURCHARGE} surcharge.`,
      },
      {
        q: 'Do I need breakdown cover to use you?',
        a: 'No. This is pay-as-you-go recovery for anyone, whether you have no cover, your cover has a long wait, or the policy will not take you where you want to go.',
      },
      {
        q: 'Can you take my car to a garage of my choice?',
        a: 'Yes. Put the garage in the drop-off box and the price is worked out for that exact journey. If the garage is shut we can hold the car overnight in secure storage and deliver it in the morning.',
      },
      {
        q: 'How do I know when the driver will arrive?',
        a: 'Your booking comes with a tracking link. It shows the driver who has your job, a live ETA measured from their actual position, and their location on a map once they are on the way.',
      },
    ],
  },
  {
    slug: 'tow-truck-near-me',
    service: 'tow',
    name: 'Tow truck',
    title: 'Tow Truck Near Me | Manchester Flatbed Towing From £80',
    description: `Need a tow truck near you in Greater Manchester? Flatbed towing from £${CALLOUT_FEE} plus mileage, priced before you book, driver tracked live. 24/7. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Just need a tow?',
    headline: ['TOW TRUCK', 'NEAR ME.'],
    intro:
      'Flatbed towing anywhere in Greater Manchester and beyond. Garage runs, non-runners, a car that failed its MOT, a project car that needs moving. Priced by the mile, shown before you book.',
    fromPrice: CALLOUT_FEE,
    priceNote: `£${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile, tapering on long tows. The price you see includes the run out to your car.`,
    included: [
      'Flatbed truck, with wheel straps and a winch for non-runners',
      'Any distance, from across the road to across the country',
      'Cars, small vans, EVs, motorbikes and classics',
      'A named driver and a live ETA the moment your job is taken',
    ],
    steps: defaultSteps('Give us the drop-off and the route is measured for real, not guessed.'),
    body: [
      'Searching for a tow truck near you usually turns up a list of numbers and no prices. Here the price is on the screen before your phone number is. Put in where the car is and where it is going, and the fare is worked out from the real driving route, including the miles the truck drives out to you.',
      'Every tow is on a flatbed. Suspended tows, where the front wheels are lifted and the back ones roll, are fine for an old manual and a disaster for an automatic, a four-wheel drive or anything electric. A flatbed carries the whole car, so it does not matter what you drive.',
      'Long-distance tows are priced sensibly. The per-mile rate drops after the first thirty miles, so a car coming back from an auction in Leeds or a breakdown on the M6 near Preston does not cost a fortune.',
    ],
    faq: [
      {
        q: 'How much does a tow truck cost per mile in the UK?',
        a: `Around £2 to £2.50 a mile locally, dropping to £1.10 to £1.60 a mile on long runs, on top of a callout fee of £80 to £95. We charge £${CALLOUT_FEE} plus £${PER_MILE.toFixed(2)} a mile, with the lower rate after thirty miles, and show the total before you book.`,
      },
      {
        q: 'Can you tow a car that does not start or has seized brakes?',
        a: 'Yes. Every truck carries a winch and skates for a car that will not roll. Say so in the vehicle box so the driver comes prepared.',
      },
      {
        q: 'Do you tow outside Greater Manchester?',
        a: 'Yes. Pickups are across Greater Manchester and drop-offs can be anywhere in the UK. The price is worked out for the exact route.',
      },
    ],
  },
  {
    slug: 'jump-start-near-me',
    service: 'jumpstart',
    name: 'Jump start',
    title: 'Jump Start Near Me | Flat Battery Manchester, £55 Callout',
    description: `Flat battery in Greater Manchester? Mobile jump start for a flat £${ROADSIDE_FEES.jumpstart}, 24/7, with a live ETA and driver tracking. Call ${PHONE_DISPLAY} or book online in a minute.`,
    eyebrow: 'Flat battery?',
    headline: ['JUMP START', 'NEAR ME.'],
    intro:
      'A dead battery is the most common reason a car will not start, and the quickest to fix. We come to you with a proper booster pack, get you going, and check whether the battery will do it again tomorrow.',
    fromPrice: ROADSIDE_FEES.jumpstart,
    priceNote: `A flat £${ROADSIDE_FEES.jumpstart} in and around ${HOME_REGION}. Nights add ${night}%. If the car needs recovering instead, you pay the tow price, not both.`,
    included: [
      'Professional lithium booster pack, safe for modern electronics',
      'A quick battery and charging check before the driver leaves',
      'Honest advice if the battery or alternator is on its way out',
      'Recovery to a garage if it will not start, at the tow price only',
    ],
    steps: defaultSteps(
      'Pick "My battery is dead" and the price is a flat fee, no mileage to work out.',
    ),
    body: [
      'A car that clicks or does nothing when you turn the key nearly always has a flat battery. Lights left on, a short journey in the cold, a battery that is simply five years old. A jump start gets you moving in minutes, and we do it with a booster pack rather than another car, which is safer for the electronics in anything built this century.',
      'The driver will not just start it and go. They will check the battery is taking a charge and the alternator is putting one in, because a jump start on a dead battery is a fix that lasts until the next time you switch off. If it needs replacing you will be told, not sold.',
      'Stop-start cars, hybrids and some EVs have a 12-volt battery that goes flat just like any other. All can be jump started, and the driver knows where the terminals are hidden.',
    ],
    faq: [
      {
        q: 'How much does a jump start cost in Manchester?',
        a: `£${ROADSIDE_FEES.jumpstart}, flat, day or night (nights add ${night}%). That is at the lower end of what local operators charge, and there is nothing added afterwards.`,
      },
      {
        q: 'How quickly can you get to me?',
        a: 'The booking page shows a live wait measured from where the nearest driver actually is. Across Greater Manchester it is typically 20 to 40 minutes.',
      },
      {
        q: 'Can you jump start a hybrid or electric car?',
        a: 'Yes. Hybrids and EVs have a normal 12-volt battery that runs the electronics and it goes flat like any other. The driver knows where the jump points are on most models.',
      },
      {
        q: 'What if it still will not start after a jump?',
        a: 'Then it is not the battery, or not only the battery. The driver can recover the car to a garage on the spot and you pay the tow price instead of the jump start fee, not both.',
      },
    ],
  },
  {
    slug: 'flat-tyre-near-me',
    service: 'tyre',
    name: 'Flat tyre',
    title: 'Flat Tyre Near Me | Mobile Tyre Change Manchester 24/7',
    description: `Puncture or flat tyre in Greater Manchester? Mobile tyre change or recovery to a tyre shop, £${ROADSIDE_FEES.tyre} callout, 24/7. Price up front. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Puncture?',
    headline: ['FLAT TYRE', 'NEAR ME.'],
    intro:
      'No spare, a locking wheel nut you cannot find, a tyre shredded on the M60. We fit your spare or space-saver at the roadside, or recover you to a tyre place that is open.',
    fromPrice: ROADSIDE_FEES.tyre,
    priceNote: `A flat £${ROADSIDE_FEES.tyre} callout. If you need recovering to a tyre shop instead, you pay the tow price, not both.`,
    included: [
      'Fitting your spare or space-saver with a proper jack and torque wrench',
      'Plugging a simple tread puncture where it is safe to do so',
      'Recovery to a 24-hour tyre fitter if the tyre is beyond a plug',
      'Motorway and hard-shoulder callouts, with the right procedure',
    ],
    steps: defaultSteps('Pick "I have a flat tyre" and the callout is a flat fee.'),
    body: [
      'Most cars sold in the last ten years have no spare wheel, just a can of sealant that does nothing for a sidewall cut. So a flat tyre that used to be a twenty-minute job at the kerb is now a call for help. We bring the jack, the torque wrench and the patience, fit whatever spare you have, and if you have none we take you to a tyre shop that is open.',
      'On a motorway do not attempt to change a wheel yourself, whatever the hard shoulder looks like. Get behind the barrier and book us. Motorway callouts are handled with the proper live-carriageway procedure and carry the standard surcharge.',
      'If the tyre has a simple nail in the tread we can often plug it at the roadside so you can drive to a fitter in your own time. A sidewall cut or a ripped bead cannot be repaired, and the driver will not pretend otherwise.',
    ],
    faq: [
      {
        q: 'How much is a mobile tyre change?',
        a: `£${ROADSIDE_FEES.tyre} for the callout and the change, using your spare. Local mobile tyre fitters quote £90 to £120 for the same thing. A new tyre itself is bought from the tyre shop and is not included.`,
      },
      {
        q: 'I have no spare wheel. Can you still help?',
        a: 'Yes. We recover you to a tyre shop that is open, or home if you would rather sort it in the morning. You pay the recovery price rather than the tyre callout.',
      },
      {
        q: 'Can you remove a locking wheel nut without the key?',
        a: 'Usually, with a removal socket. It destroys the locking nut, which you will need to replace. Tell the driver in the vehicle box that the key is missing.',
      },
    ],
  },
  {
    slug: 'out-of-fuel-near-me',
    service: 'fuel',
    name: 'Out of fuel',
    title: 'Run Out of Fuel? Fuel Delivery Near Me, Manchester 24/7',
    description: `Run out of petrol or diesel in Greater Manchester? Emergency fuel delivery to the roadside from £${ROADSIDE_FEES.fuel} plus fuel, 24/7. Live ETA and tracking. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Run dry?',
    headline: ['OUT OF FUEL', 'NEAR ME.'],
    intro:
      'It happens to everyone once. We bring enough petrol or diesel to get you to the nearest station, put it in for you, and make sure the car starts before we leave.',
    fromPrice: ROADSIDE_FEES.fuel,
    priceNote: `£${ROADSIDE_FEES.fuel} callout plus the fuel at pump price. Nights add ${night}%. Wrong fuel needs a drain, which is a recovery job.`,
    included: [
      'Up to ten litres of petrol or diesel delivered in a proper can',
      'Fuel put in and the car started for you',
      'Advice on priming a diesel that will not fire after running dry',
      'Recovery to a garage if the car will not restart',
    ],
    steps: defaultSteps(
      'Pick "I ran out of fuel" and the callout is a flat fee plus the fuel itself.',
    ),
    body: [
      'Running out of fuel is not a mechanical fault, but it strands you just as well, usually somewhere without a pavement. Do not walk along a dual carriageway with a can. Book us and stay with the car, or behind the barrier if you are on a motorway.',
      'The driver brings enough to get you to a filling station and puts it in for you. Modern diesels sometimes need the fuel system primed after running completely dry, and the driver will do that rather than leaving you cranking a starter.',
      'If you have put the wrong fuel in, do not start the engine. That is a fuel drain job rather than a delivery, and it is far cheaper before the engine has run. Book a recovery and put "wrong fuel" in the vehicle box.',
    ],
    faq: [
      {
        q: 'How much does emergency fuel delivery cost?',
        a: `£${ROADSIDE_FEES.fuel} for the callout plus the fuel at what it cost at the pump. Local operators quote £69 to £90 for the same. There is no mark-up on the fuel.`,
      },
      {
        q: 'How much fuel do you bring?',
        a: 'Up to ten litres, which is enough to get any car to the nearest station comfortably. Tell us in the vehicle box whether it is petrol or diesel.',
      },
      {
        q: 'I put petrol in a diesel. Can you help?',
        a: 'Yes, but as a recovery to a garage that can drain the tank, not a fuel delivery. Whatever you do, do not start the engine. Book a tow and say wrong fuel.',
      },
    ],
  },
  {
    slug: 'motorway-recovery-manchester',
    service: 'towing',
    name: 'Motorway recovery',
    title: 'Motorway Recovery Manchester | M60, M62, M61, M56 24/7',
    description: `Broken down on the M60, M62, M61, M56 or M66? 24/7 motorway recovery across Greater Manchester, priced before you book, driver tracked live. Call ${PHONE_DISPLAY} now.`,
    eyebrow: 'On the hard shoulder?',
    headline: ['MOTORWAY RECOVERY', 'MANCHESTER.'],
    intro:
      'First, get out of the left-hand doors and stand behind the barrier, well away from the car. Then book. We attend every motorway around Greater Manchester with the correct live-carriageway procedure.',
    fromPrice: CALLOUT_FEE + MOTORWAY_SURCHARGE,
    priceNote: `The normal tow price plus a £${MOTORWAY_SURCHARGE} motorway surcharge, which pays for the safety procedure and the extra time a live carriageway takes. Shown in full before you confirm.`,
    included: [
      'M60, M62, M61, M56, M66, M67, M602 and the M6 through the region',
      'Hard shoulder, emergency refuge areas and smart-motorway lanes with National Highways',
      'Flatbed loading with the truck positioned to shield the car',
      'A driver who rings you before setting off and again on approach',
    ],
    steps: [
      {
        title: 'Get safe first',
        body: 'Out of the left-hand doors, behind the barrier, phone in hand. In immediate danger ring 999. On a smart motorway with no hard shoulder, ring National Highways on 0300 123 5000 as well.',
      },
      {
        title: 'Tell us the motorway and junction',
        body: 'Type it as you see it, "M60 J17 clockwise", or tap Find Me. We spot the motorway and add the surcharge to the price on screen, so there is nothing to explain later.',
      },
      trackStep,
    ],
    body: [
      'A breakdown on a motorway is the most dangerous kind, and it is treated as one. The driver approaches with the truck angled to protect the scene, loads the car onto the flatbed rather than towing on the wheels, and gets you both off the carriageway before anything else is discussed. On smart motorways without a hard shoulder we work with National Highways traffic officers, who may close a lane.',
      'Every motorway operator charges more for a live carriageway, typically £80 to £150 for the callout against £45 to £80 for an ordinary one. Our surcharge is a fixed £40 on top of the normal tow price, and it is shown on the booking form the moment a motorway is detected in your location.',
      'Waiting for cover on a motorway can mean an hour or more. The tracking page shows you a real ETA measured from where the truck is, so you know whether to sit tight or ring the police for a recovery to the nearest exit.',
    ],
    faq: [
      {
        q: 'What should I do if I break down on the M60?',
        a: 'Pull onto the hard shoulder or into an emergency refuge area, put the hazards on, get everyone out of the left-hand doors and behind the barrier. Then book recovery. Do not attempt a repair and do not stand between the car and the traffic.',
      },
      {
        q: 'Why is motorway recovery more expensive?',
        a: `Working a live carriageway takes a safety procedure, sometimes a lane closure, and real risk to the crew. Every operator charges for it. Our surcharge is £${MOTORWAY_SURCHARGE} on top of the normal tow price and you see it before you book.`,
      },
      {
        q: 'Can you recover me from a smart motorway with no hard shoulder?',
        a: 'Yes. Ring National Highways on 0300 123 5000 first so they can set the signs and close the lane, then book us. The driver coordinates with the traffic officers on arrival.',
      },
    ],
  },
  {
    slug: 'electric-car-recovery-manchester',
    service: 'ev',
    name: 'EV recovery',
    title: 'Electric Car Recovery Manchester | EV Flatbed 24/7',
    description: `EV out of charge or stopped in Greater Manchester? Flatbed electric car recovery (never towed on the wheels) from £${CALLOUT_FEE}, to a charger or garage, 24/7. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Electric or hybrid?',
    headline: ['ELECTRIC CAR RECOVERY', 'MANCHESTER.'],
    intro:
      'An EV cannot be towed on its wheels. The motors generate current when turned and can be damaged in minutes. Every EV job is on a flatbed, and the driver knows how to put a dead car into transport mode.',
    fromPrice: CALLOUT_FEE,
    priceNote: `Priced as a normal tow: £${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile to the charger, garage or home you choose.`,
    included: [
      'Flatbed only, with skates for a car that will not go into neutral',
      'Recovery to the nearest working rapid charger, or your home charger',
      'Tesla, MG, Kia, Hyundai, VW, BMW, Polestar and the rest',
      'Hybrids and plug-in hybrids handled the same way',
    ],
    steps: defaultSteps('Pick "My electric car stopped working" and tell us where it should go.'),
    body: [
      'Running out of charge is the EV equivalent of running out of fuel, except nobody can bring a can. The fix is a flatbed to a working rapid charger, and the skill is loading a car that may have no power to release its parking brake or shift into neutral. Our drivers carry wheel skates and know the transport-mode procedure for the common models.',
      'If the car has power but a fault warning, do not accept a suspended tow from anyone. Dragging an EV with the driven wheels on the ground turns the motor into a generator with nowhere to send the current, and the repair bill makes the recovery look free.',
      'Hybrids need the same care. Most cannot be flat-towed either, and a plug-in hybrid with a flat 12-volt battery is just as stuck as a pure EV. A jump start often sorts the 12-volt side; if not, the flatbed is the answer.',
    ],
    faq: [
      {
        q: 'Can an electric car be towed?',
        a: 'Not on its wheels. The motors are connected to the wheels with no clutch to disconnect them, so towing spins the motors and can wreck the drive unit. EVs must be carried on a flatbed, which is all we use.',
      },
      {
        q: 'My EV has run out of charge. Where will you take it?',
        a: 'To the nearest working rapid charger, or to your home charger if that is closer. Put the destination in the drop-off box, or leave it to the driver and say "nearest charger" in the vehicle box.',
      },
      {
        q: 'How much does EV recovery cost?',
        a: `The same as any other tow: £${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile. There is no EV surcharge.`,
      },
    ],
  },
  {
    slug: 'motorbike-recovery-manchester',
    service: 'motorbike',
    name: 'Motorbike recovery',
    title: 'Motorbike Recovery Manchester | 24/7 Bike Transport',
    description: `Motorbike broken down or won't start in Greater Manchester? Strapped-down flatbed motorbike recovery from £${CALLOUT_FEE}, 24/7, with live driver tracking. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Bike down?',
    headline: ['MOTORBIKE RECOVERY', 'MANCHESTER.'],
    intro:
      'A bike that will not start, a puncture, a drop that has bent something. We collect motorbikes, scooters and trikes on a flatbed with a wheel chock and soft straps, and take them home or to a dealer.',
    fromPrice: CALLOUT_FEE,
    priceNote: `£${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile, the same tariff as a car. You can ride along in the cab.`,
    included: [
      'Front wheel chock and soft ratchet straps that do not mark paint',
      'Sports bikes, tourers, cruisers, scooters, trikes and classics',
      'Delivery to home, a dealer, a track day or the buyer of a bike you sold',
      'Room in the cab for you and your kit',
    ],
    steps: defaultSteps('Pick "My motorbike broke down" and tell us where the bike is going.'),
    body: [
      'Most recovery trucks are set up for cars and strap a motorbike down as an afterthought, which is how tanks get dented and fairings get cracked. We carry a front wheel chock and soft-loop straps that go round the bars and the frame, not the paint. The bike travels upright and does not move.',
      'Bike breakdowns are usually electrical: a flat battery, a failed regulator, a kill switch someone knocked. If the bike has a flat battery we can often jump it at the roadside for the jump start price instead of a recovery. Say what happened in the vehicle box and the driver will come prepared for both.',
      'We also move bikes that are not broken. Buying one from a private seller, getting a non-runner to a specialist, or taking a track bike to Oulton Park all price the same way.',
    ],
    faq: [
      {
        q: 'How much does motorbike recovery cost?',
        a: `The same as a car: £${CALLOUT_FEE} callout plus £${PER_MILE.toFixed(2)} a mile, shown in full before you book. A flat battery jump is £${ROADSIDE_FEES.jumpstart} if that is all it needs.`,
      },
      {
        q: 'Can I travel with my bike?',
        a: 'Yes. There is a seat in the cab for you and space for your helmet and kit.',
      },
      {
        q: 'Will my bike be strapped down properly?',
        a: 'A front wheel chock holds it upright and soft straps go round the bars and frame, never the paint or the levers. The driver checks the straps again after the first few miles.',
      },
    ],
  },
  {
    slug: 'vehicle-transport-manchester',
    service: 'auction',
    name: 'Vehicle transport',
    title: 'Vehicle Transport Manchester | Auction & Dealer Collection',
    description: `Car collection and delivery across the UK from Greater Manchester. Copart, BCA, Manheim and dealer pickups on a flatbed, priced by the mile before you book. Call ${PHONE_DISPLAY}.`,
    eyebrow: 'Bought a car?',
    headline: ['VEHICLE TRANSPORT', 'MANCHESTER.'],
    intro:
      'Collection from Copart, BCA, Manheim, SYNETIQ, a dealer or a private seller, and delivery to your door. Book it for a day and time that suits and track the driver on the day.',
    fromPrice: CALLOUT_FEE,
    priceNote: `£${CALLOUT_FEE} plus £${PER_MILE.toFixed(2)} a mile, dropping after thirty miles, so a long collection is priced fairly. Choose "Schedule later" and pick the slot.`,
    included: [
      'Auction collections with the lot number and release paperwork handled',
      'Non-runners and salvage winched on, no keys needed',
      'Fully insured in transit, up to 3.5 tonnes',
      'A tracking link on the day so you know when to expect it',
    ],
    steps: [
      {
        title: 'Tell us where to collect and deliver',
        body: 'The auction site or seller address, and where the car is going. Pick a date and time under "Schedule later".',
      },
      {
        title: 'See the price for the exact route',
        body: 'The fare is worked out from the real driving distance and shown before you confirm. Long runs use the lower per-mile rate.',
      },
      {
        title: 'Track it on the day',
        body: 'You get a link showing when the driver has collected and where the truck is on the way back to you.',
      },
    ],
    body: [
      'Buying at auction is easy; getting the car home is the part nobody plans for. We collect from Copart, BCA, Manheim, SYNETIQ and any dealer or private seller across the North West and deliver anywhere in the UK. Give us the lot number and the driver deals with the release desk.',
      'Salvage and non-runners are winched onto the flatbed, so a car with no keys, no wheels or accident damage is not a problem. Tell us the condition in the vehicle box and the driver brings the right kit.',
      'Because it is booked in advance rather than an emergency, you pick the slot. The price is the standard tow tariff for the route, with the lower rate applying after the first thirty miles, so a collection from the other side of the Pennines is priced sensibly.',
    ],
    faq: [
      {
        q: 'How much does it cost to have a car delivered from auction?',
        a: `£${CALLOUT_FEE} plus £${PER_MILE.toFixed(2)} a mile for the first thirty miles and less after that. A collection fifty miles away is typically around £200, and you see the exact figure before you book.`,
      },
      {
        q: 'Can you collect a car that does not run or has no keys?',
        a: 'Yes. The truck carries a winch and skates. Say non-runner or no keys in the vehicle box so the driver comes prepared.',
      },
      {
        q: 'Do I need to be at the auction?',
        a: 'No. Give us the lot number and your buyer details and the driver collects on your behalf. You will need to have paid the auction and had the release confirmed.',
      },
    ],
  },
];

export const servicePath = (page: ServicePage): string => `/${page.slug}`;

export const serviceFromSlug = (slug: string | undefined): ServicePage | null =>
  slug ? (SERVICE_PAGES.find((p) => p.slug === slug) ?? null) : null;

/** The cheapest "from" figure across every service, for the site-wide anchor. */
export const SITE_FROM_PRICE = FROM_PRICE;
