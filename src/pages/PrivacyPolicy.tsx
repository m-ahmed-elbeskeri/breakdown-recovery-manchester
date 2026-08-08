import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home } from '../icons';
import { Logo } from '../components/Logo';
import { PHONE_DISPLAY, BRAND_NAME, BRAND_WORDMARK } from '../config';
import { useNoIndex } from '../seo';

export function PrivacyPolicy() {
  useNoIndex();
  useEffect(() => {
    document.title = `Privacy Policy | ${BRAND_NAME}`;
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="border-b-2 border-slate-950">
        <div className="max-w-3xl mx-auto px-4 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <Logo className="w-9 h-9 shrink-0" />
            <span className="font-display text-xl tracking-tight">
              {BRAND_WORDMARK[0]} <span className="text-red-600">{BRAND_WORDMARK[1]}</span>
            </span>
          </Link>
          <Link
            to="/"
            className="text-sm font-bold uppercase tracking-wider text-slate-600 hover:text-red-600 inline-flex items-center gap-1.5"
          >
            <Home className="w-4 h-4" /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 prose prose-slate">
        <h1 className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500">Last updated: July 2026</p>

        <h2 className="font-sans font-extrabold text-xl tracking-tight mt-8">What we collect</h2>
        <p className="text-slate-700">
          When you request recovery we collect only what we need to reach you: your phone number,
          the pickup location you provide (or approximate GPS coordinates if you tap "Find Me"), the
          service you need, and any drop-off location. We do not require your name, email, or
          payment details to book.
        </p>

        <h2 className="font-sans font-extrabold text-xl tracking-tight mt-8">How we use it</h2>
        <p className="text-slate-700">
          Your details are used solely to dispatch a recovery vehicle and to contact you about that
          recovery. We do not sell your data or use it for marketing.
        </p>

        <h2 className="font-sans font-extrabold text-xl tracking-tight mt-8">
          Storage &amp; retention
        </h2>
        <p className="text-slate-700">
          Booking requests are transmitted over an encrypted (HTTPS) connection. If your request
          cannot reach our dispatch system immediately it is held on your own device only until it
          can be delivered, then removed. We retain completed booking records for up to 12 months
          for operational and legal purposes, after which they are deleted.
        </p>

        <h2 className="font-sans font-extrabold text-xl tracking-tight mt-8">Your rights</h2>
        <p className="text-slate-700">
          Under UK GDPR you can ask us to access, correct, or erase the personal data we hold about
          you. To make a request, call {PHONE_DISPLAY} and quote the phone number you booked with.
        </p>

        <p className="text-slate-500 text-sm mt-10">
          This is a template privacy notice and should be reviewed by the operating business before
          going live.
        </p>
      </main>
    </div>
  );
}
