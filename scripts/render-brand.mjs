// Render the PNG brand assets (share card + app icons) from the HTML templates
// in scripts/brand/, using whatever Chrome or Edge is installed.
//
//   npm run brand:assets
//
// Why PNGs at all: the SVG mark is the source of truth, but Facebook, WhatsApp,
// LinkedIn and X ignore SVG share images, iOS ignores SVG touch icons, and
// Android's maskable icons need a solid tile. These files are committed so a
// deploy never depends on a browser being present; re-run this only when the
// mark, phone number or "from" price changes.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'scripts', 'brand');
const publicDir = path.join(root, 'public');

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome/Edge found. Set CHROME=/path/to/chrome and re-run.');
  process.exit(1);
}

// The share card hard-codes the phone number; refuse to render a card that
// disagrees with the site, since that is exactly how a stale number ships.
const config = readFileSync(path.join(root, 'src', 'config.ts'), 'utf8');
const phone = config.match(/PHONE_DISPLAY = '([^']+)'/)?.[1];
const card = readFileSync(path.join(brandDir, 'og-image.html'), 'utf8');
if (!phone || !card.includes(phone)) {
  console.error(`scripts/brand/og-image.html does not contain the site phone number (${phone}).`);
  process.exit(1);
}

// A throwaway profile so this works while the user's own Chrome is open.
const profile = path.join(tmpdir(), `brand-render-${process.pid}`);
mkdirSync(profile, { recursive: true });

function shot({ file, query = '', out, width, height, transparent = false }) {
  const url = pathToFileURL(path.join(brandDir, file)).href + query;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    // Lets web fonts finish loading before the frame is captured.
    '--virtual-time-budget=8000',
    `--screenshot=${out}`,
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push(url);
  execFileSync(chrome, args, { stdio: 'pipe' });
  console.log(`wrote ${path.relative(root, out)}`);
}

try {
  mkdirSync(path.join(publicDir, 'icons'), { recursive: true });

  shot({
    file: 'og-image.html',
    out: path.join(publicDir, 'og-image.png'),
    width: 1200,
    height: 630,
  });

  const icons = [
    ['any', 'icon-192.png', 192, true],
    ['any', 'icon-512.png', 512, true],
    ['maskable', 'maskable-192.png', 192, false],
    ['maskable', 'maskable-512.png', 512, false],
    ['apple', 'apple-touch-icon.png', 180, false],
  ];
  for (const [variant, name, size, transparent] of icons) {
    shot({
      file: 'icon.html',
      query: `?variant=${variant}&size=${size}`,
      out: path.join(publicDir, 'icons', name),
      width: size,
      height: size,
      transparent,
    });
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
}
