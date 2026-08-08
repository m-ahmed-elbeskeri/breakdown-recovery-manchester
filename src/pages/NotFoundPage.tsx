import { Link } from 'react-router-dom';
import { Home, PhoneCall } from '../icons';
import { Logo } from '../components/Logo';
import { PHONE_TEL, PHONE_DISPLAY } from '../config';
import { useNoIndex } from '../seo';

export function NotFoundPage() {
  useNoIndex();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col items-center justify-center text-center px-6">
      <Logo className="w-14 h-14 mb-6" />
      <p className="font-display text-6xl md:text-8xl text-slate-950 tracking-tight">404</p>
      <h1 className="font-sans font-extrabold text-2xl md:text-3xl tracking-tight mt-4">
        Page not found
      </h1>
      <p className="text-slate-600 font-medium mt-3 max-w-md">
        We couldn't find that area. Head back home, or call us directly and we'll dispatch a
        recovery vehicle to you now.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        <Link
          to="/"
          className="bg-neutral-950 hover:bg-black text-white font-display py-3 px-6 rounded-none uppercase tracking-wider inline-flex items-center justify-center gap-2"
        >
          <Home className="w-5 h-5" /> Back home
        </Link>
        <a
          href={`tel:${PHONE_TEL}`}
          className="bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-3 px-6 rounded-none uppercase tracking-wider inline-flex items-center justify-center gap-2"
        >
          <PhoneCall className="w-5 h-5" /> Call {PHONE_DISPLAY}
        </a>
      </div>
    </div>
  );
}
