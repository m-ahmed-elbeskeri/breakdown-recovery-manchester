// "Get the app" for the driver console, without going near an app store.
//
// The two platforms behave completely differently and there is no papering
// over it:
//
//   Android/Chrome fires `beforeinstallprompt`, which we hold on to and fire
//   from our own button — a real one-tap install.
//
//   iOS offers no programmatic install at all. Safari only installs from
//   Share → Add to Home Screen, so the honest thing is to show that, with the
//   share glyph, rather than a button that cannot work.
//
// Once installed the whole thing disappears: an app that keeps asking to be
// installed is an app that isn't listening.

import { useEffect, useState } from 'react';

/** The Chromium-only event that lets a page offer its own install button. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  // iOS predates display-mode and reports it here instead.
  (window.navigator as { standalone?: boolean }).standalone === true;

const isIos = (): boolean =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  // iPadOS reports itself as a Mac; the touch points give it away.
  (/macintosh/i.test(window.navigator.userAgent) && window.navigator.maxTouchPoints > 1);

export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Chrome would otherwise show its own mini-infobar; we want the button.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const ios = isIos();
  // Nothing to offer: not iOS, and Chrome has not said it is installable
  // (already installed in another profile, unsupported browser, or desktop).
  if (!ios && !deferred) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    // Chrome allows a deferred prompt to be used once only.
    setDeferred(null);
  };

  return (
    <section className="border-2 border-neutral-800 bg-neutral-900">
      <div className="flex items-center gap-3 p-4">
        <img
          src="/icons/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="shrink-0 border-2 border-neutral-800"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm leading-tight">Put this on your home screen</p>
          <p className="text-[11px] text-neutral-400 font-medium mt-0.5">
            Opens full screen, no browser bar. Works in poor signal.
          </p>
        </div>
        <button
          type="button"
          onClick={ios ? () => setShowIosSteps((v) => !v) : install}
          aria-expanded={ios ? showIosSteps : undefined}
          className="shrink-0 bg-yellow-400 text-neutral-950 font-display px-4 py-2.5 uppercase tracking-wider text-xs"
        >
          {ios ? 'How' : 'Install'}
        </button>
      </div>

      {ios && showIosSteps && (
        <ol className="border-t-2 border-neutral-800 px-4 py-3 text-[12px] text-neutral-300 font-medium flex flex-col gap-2 list-decimal list-inside">
          <li>
            Tap the Share button
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center mx-1.5 w-5 h-5 align-text-bottom border border-neutral-600 text-yellow-400"
            >
              ↑
            </span>
            at the bottom of Safari.
          </li>
          <li>
            Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong className="text-white">Add</strong>. It appears with your other apps.
          </li>
        </ol>
      )}
    </section>
  );
}
