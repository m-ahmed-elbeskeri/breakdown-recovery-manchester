// Icons are sourced from Iconoir (https://iconoir.com) — a distinctive,
// non-mainstream open-source set — and re-exported under the app's own names so
// the rest of the codebase never depends on the underlying library.
//
// Every icon is given a heavier stroke by default to suit the brutalist look;
// callers can still override `strokeWidth`, `className`, etc.

import {
  Phone as I_Phone,
  MapPin as I_MapPin,
  Clock as I_Clock,
  ShieldCheck as I_ShieldCheck,
  Car as I_Car,
  Wrench as I_Wrench,
  BatteryCharging as I_Battery,
  GasTank as I_GasTank,
  Star as I_Star,
  CheckCircle as I_CheckCircle,
  Navigator as I_Navigator,
  Flash as I_Flash,
  Garage as I_Garage,
  Truck as I_Truck,
  Motorcycle as I_Motorcycle,
  EvPlug as I_EvPlug,
  WarningTriangle as I_WarningTriangle,
  ArrowRight as I_ArrowRight,
  ShieldAlert as I_ShieldAlert,
  Position as I_Position,
  RefreshDouble as I_RefreshDouble,
  NavArrowRight as I_NavArrowRight,
  NavArrowDown as I_NavArrowDown,
  NavArrowLeft as I_NavArrowLeft,
  NavArrowUp as I_NavArrowUp,
  Timer as I_Timer,
  Shield as I_Shield,
  HelpCircle as I_HelpCircle,
  HomeSimple as I_HomeSimple,
  DoubleCheck as I_DoubleCheck,
  Quote as I_Quote,
  Calendar as I_Calendar,
} from 'iconoir-react';
import type { ComponentType, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & {
  strokeWidth?: number | string;
  className?: string;
};

type IconComponent = ComponentType<IconProps>;

const DEFAULT_STROKE = 2;

const bold = (Component: IconComponent): IconComponent => {
  const Wrapped = ({ strokeWidth = DEFAULT_STROKE, ...props }: IconProps) => (
    <Component strokeWidth={strokeWidth} {...props} />
  );
  Wrapped.displayName = 'Icon';
  return Wrapped;
};

// Re-exports under the names already used across the app.
export const Phone = bold(I_Phone);
export const MapPin = bold(I_MapPin);
export const Clock = bold(I_Clock);
export const ShieldCheck = bold(I_ShieldCheck);
export const Car = bold(I_Car);
export const Wrench = bold(I_Wrench);
export const Battery = bold(I_Battery);
export const Fuel = bold(I_GasTank);
export const ChevronRight = bold(I_NavArrowRight);
export const Star = bold(I_Star);
export const CheckCircle2 = bold(I_CheckCircle);
export const Navigation = bold(I_Navigator);
export const Zap = bold(I_Flash);
export const Warehouse = bold(I_Garage);
export const Truck = bold(I_Truck);
export const Bike = bold(I_Motorcycle);
export const PlugZap = bold(I_EvPlug);
export const AlertTriangle = bold(I_WarningTriangle);
// Iconoir has no dedicated "phone call" glyph; the handset reads the same at CTA size.
export const PhoneCall = bold(I_Phone);
export const ArrowRight = bold(I_ArrowRight);
export const ShieldAlert = bold(I_ShieldAlert);
export const Crosshair = bold(I_Position);
export const Loader2 = bold(I_RefreshDouble);
export const ChevronDown = bold(I_NavArrowDown);
export const ChevronLeft = bold(I_NavArrowLeft);
export const Timer = bold(I_Timer);
export const Shield = bold(I_Shield);
export const HelpCircle = bold(I_HelpCircle);
export const Home = bold(I_HomeSimple);
export const CheckCheck = bold(I_DoubleCheck);
export const Quote = bold(I_Quote);
export const Calendar = bold(I_Calendar);
export const ChevronUp = bold(I_NavArrowUp);
