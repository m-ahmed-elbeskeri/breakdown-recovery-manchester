// The "Drive with us" page, as data. The document list comes from the same
// catalogue the application form and the server check against, so the page
// can never promise a shorter list than the one a driver meets.

import type { FaqItem } from './data';
import { PHONE_DISPLAY } from './config';
import { DOC_TYPES, HGV_WEIGHT_KG, MINIMUM_AGE, type DocRule } from './driverDocs';

export const RECRUIT_PATH = '/drive-with-us';
export const APPLY_PATH = '/drivers/apply';

const tonnes = (kg: number) => `${(kg / 1000).toLocaleString('en-GB')} tonnes`;

export const REQUIREMENTS: string[] = [
  `Aged ${MINIMUM_AGE} or over, with the right to work in the UK.`,
  `A full UK driving licence covering your recovery vehicle: category B up to ${tonnes(HGV_WEIGHT_KG)}, C1 up to 7.5 tonnes, C above that.`,
  'Your own recovery vehicle, with its V5C, a current MOT and recovery insurance.',
  'A basic DBS check from the last twelve months.',
  'A smartphone with location turned on while you work.',
];

const RULE_HEADING: Record<Exclude<DocRule, 'optional'>, string> = {
  always: 'Everyone',
  hgv: `Vehicles over ${tonnes(HGV_WEIGHT_KG)}`,
  motorway: 'Motorway work',
};

/** The documents each kind of driver uploads, grouped for the page. */
export const DOCUMENT_GROUPS: { heading: string; labels: string[] }[] = (
  ['always', 'hgv', 'motorway'] as const
)
  .map((rule) => ({
    heading: RULE_HEADING[rule],
    labels: DOC_TYPES.filter((d) => d.rule === rule).map((d) => d.label),
  }))
  .filter((group) => group.labels.length > 0);

export const RECRUIT_STEPS: { title: string; body: string }[] = [
  {
    title: 'Create your account',
    body: 'Your name, email, mobile and a password. It takes a minute, and everything after that saves as you go.',
  },
  {
    title: 'Add your details and documents',
    body: 'Your licence, your vehicle, and photos of your paperwork taken on your phone. The form tells you exactly what is still missing.',
  },
  {
    title: 'We check everything',
    body: 'Someone in the office reads every document and checks your licence with DVLA. If something needs replacing you are told what and why.',
  },
  {
    title: 'Go on duty',
    body: 'Once approved, jobs near you appear on your phone with the pickup, the drop-off and the price. Take the ones you want.',
  },
];

export const RECRUIT_FAQ: FaqItem[] = [
  {
    q: 'Do I need my own recovery truck?',
    a: 'Yes. You apply with the recovery vehicle you drive, and upload its V5C, MOT and insurance. If it is over 3.5 tonnes you will also need an operator’s licence, a tachograph card and a Driver CPC.',
  },
  {
    q: 'What insurance do I need?',
    a: 'Motor insurance that covers recovery work, goods in transit cover for the vehicles you carry, and public liability insurance. Upload the schedule or certificate for each, with the expiry date.',
  },
  {
    q: 'Do I need an NHSS 17 card?',
    a: 'Only for motorway and hard-shoulder jobs. Without one you can still take every other job, and motorway jobs stay switched off for you until the card is approved.',
  },
  {
    q: 'Can I choose when I work?',
    a: 'Yes. Tap On duty when you are free and Off duty when you are not. Jobs are only offered to you while you are on duty.',
  },
  {
    q: 'Is my location tracked?',
    a: 'Only while you are on duty. A customer sees your position on a map only while you are on the way to their job, and never after it is done.',
  },
  {
    q: 'What happens when a document runs out?',
    a: 'You are warned 30 days before. Upload the renewed copy and the old one stays valid until the office approves the new one, so you are not taken off the road in between.',
  },
  {
    q: 'How long does approval take?',
    a: `As long as it takes someone in the office to read every document and check your licence with DVLA. You can see where your application is at any time, and you can ring ${PHONE_DISPLAY} with questions.`,
  },
];
