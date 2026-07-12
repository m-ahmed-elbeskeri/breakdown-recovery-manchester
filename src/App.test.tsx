// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// The backend isn't running in tests, so stub fetch to fail — the app then
// shows simulated metrics and queues bookings locally, exactly as it would if
// the API were offline. A single render per test keeps assertions scoped to one
// container and avoids DOM accumulating across renders in the shared jsdom.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});

const renderApp = () => {
  const { container } = render(<App />);
  return within(container);
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App (smoke)', () => {
  it('mounts and renders the hero and booking form with truthful copy', () => {
    const view = renderApp();

    // Hero headline + booking form heading both render → the app mounted cleanly.
    expect(view.getByRole('heading', { level: 1, name: /breakdown/i })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: /Get Back On The Road/i })).toBeInTheDocument();

    // Truthful security statement, and the old false claim is gone.
    expect(view.getByText(/secure, encrypted connection/i)).toBeInTheDocument();
    expect(view.queryByText(/256-bit encryption/i)).toBeNull();

    // Privacy policy is linked (GDPR notice).
    expect(view.getAllByRole('link', { name: /privacy policy/i }).length).toBeGreaterThan(0);
  });

  it('blocks progress and shows an accessible error when the phone number is invalid', async () => {
    const user = userEvent.setup();
    const view = renderApp();

    await user.type(view.getByLabelText(/pickup location/i), 'M1 1AA');
    await user.type(view.getByLabelText(/your phone number/i), '123');
    await user.click(view.getByRole('button', { name: /continue/i }));

    expect(within(view.getByRole('alert')).getByText(/valid phone/i)).toBeInTheDocument();
  });
});
