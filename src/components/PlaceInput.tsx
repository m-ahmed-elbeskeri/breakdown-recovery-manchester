// A text input that suggests real places as you type, and hands back the exact
// coordinates of whichever one you pick.
//
// Built as an ARIA combobox rather than a plain <datalist> because the customer
// must be able to drive it entirely from the keyboard and from a screen reader:
// this form is the one thing standing between a stranded person and a truck.
//
// Selecting a suggestion is optional throughout. Free text still submits — the
// booking must never depend on a third-party geocoder agreeing with the
// customer about what their street is called.

import { useEffect, useId, useRef, useState } from 'react';
import { suggestPlaces, type PlaceSuggestion } from '../route';

/** Pause after the last keystroke before asking the geocoder. */
const DEBOUNCE_MS = 250;

interface PlaceInputProps {
  value: string;
  /** Fires on every keystroke. `pin` is set only when a suggestion was chosen. */
  onChange: (value: string, pin: { lat: number; lng: number } | null) => void;
  placeholder: string;
  ariaLabel: string;
  className: string;
  /** Rendered inside the field's relative wrapper (icons, the Find Me button). */
  children?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function PlaceInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  children,
  inputRef,
}: PlaceInputProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Set when the customer picks a suggestion, so the resulting programmatic
  // value change doesn't immediately trigger a fresh lookup for that same text.
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void suggestPlaces(query, controller.signal).then((results) => {
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setActive(-1);
        setOpen(results.length > 0);
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Close when focus or a click leaves the field entirely.
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  const choose = (s: PlaceSuggestion) => {
    justPicked.current = true;
    onChange(s.label, { lat: s.lat, lng: s.lng });
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      // Only intercept Enter when a suggestion is actually highlighted, so it
      // still submits the form for someone typing an address freehand.
      if (active >= 0) {
        e.preventDefault();
        choose(suggestions[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value, null)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {children}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="absolute z-30 left-0 right-0 top-full mt-1 bg-neutral-950 border-2 border-yellow-400 max-h-64 overflow-y-auto shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.label}-${s.lat}-${s.lng}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // pointerdown, not click: the input's blur would otherwise close
              // the list before a click ever lands.
              onPointerDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-4 py-2.5 text-sm cursor-pointer border-b border-neutral-800 last:border-b-0 ${
                i === active ? 'bg-yellow-400 text-neutral-950 font-bold' : 'text-white'
              }`}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
