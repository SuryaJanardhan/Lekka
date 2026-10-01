import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const appIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="128" fill="#4F46E5" />
  <circle cx="256" cy="256" r="180" fill="none" stroke="#FFFFFF" stroke-opacity="0.2" stroke-width="8" />
  <rect x="112" y="140" width="288" height="232" rx="32" fill="#FFFFFF" />
  <rect x="112" y="140" width="288" height="20" rx="8" fill="#6366F1" />
  <path d="M 210 205 L 302 205 M 210 235 L 302 235 M 210 205 L 210 285 C 265 285 265 235 210 235 M 235 275 L 295 345" fill="none" stroke="#4F46E5" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="340" cy="185" r="14" fill="#10B981" />
</svg>`;

const splashSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1242" height="2436" viewBox="0 0 1242 2436">
  <rect width="1242" height="2436" fill="#F8FAFC" />
  <g transform="translate(471, 968)">
    <rect width="300" height="300" rx="72" fill="#4F46E5" />
    <path d="M 115 110 L 185 110 M 115 135 L 185 135 M 115 110 L 115 180 C 165 180 165 135 115 135 M 135 170 L 185 225" fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
  </g>
  <text x="621" y="1380" font-family="sans-serif" font-size="64" font-weight="bold" fill="#0F172A" text-anchor="middle">LEKKA</text>
  <text x="621" y="1440" font-family="sans-serif" font-size="28" font-weight="normal" fill="#64748B" text-anchor="middle">Smart Expense &amp; Ledger Assistant</text>
</svg>`;

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), appIconSvg);
fs.writeFileSync(path.join(assetsDir, 'splash.svg'), splashSvg);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.svg'), appIconSvg);

console.log('App SVG assets created.');
