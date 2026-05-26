#!/usr/bin/env node
// Regenerates README blog section and SVG banners from the Faber Company tech
// blog's author-specific Atom feed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BLOG_BASE_URL = 'https://fabercompany-dev.hatenablog.com';
const AUTHOR = 'kobayashik-faber';
const FEED_URL = `${BLOG_BASE_URL}/feed/author/${AUTHOR}`;
const MAX_ITEMS = 5;
const BLOG_START = '<!-- BLOG:START -->';
const BLOG_END = '<!-- BLOG:END -->';

const COLORS = {
  red: '#f00012',
  white: '#ffffff',
  black: '#000000',
};

const HIRE_DATE_SVG = 'Since 01<tspan baseline-shift="super" font-size="0.6em">st</tspan> Feb. 2022';

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'kobayashik-Faber-readme-bot' } });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  if (!m) return '';
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1];
  return v;
}

function extractLinkHref(block) {
  const m = block.match(/<link\b[^>]*\bhref="([^"]+)"/);
  return m ? m[1] : '';
}

function parseEntries(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    entries.push({
      title: decodeHtml(extractTag(block, 'title')),
      link: extractLinkHref(block),
      published: extractTag(block, 'published'),
    });
  }
  return entries;
}

function decodeHtml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function formatDateJST(date) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatTimestampJST(date) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute} JST`;
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildBlogMarkdown(items) {
  if (items.length === 0) return '_まだ記事がありません．_';
  return items
    .map((item) => `- ${formatDateJST(new Date(item.published))}　[${item.title}](${item.link})`)
    .join('\n');
}

function buildBanner({ updatedAt }) {
  const bg = COLORS.white;
  const fg = COLORS.black;
  const muted = '#555555';
  // Personal neon-yellowgreen accent — replaces Faber Red in the banner.
  const accent = '#c5ff21';
  const gradLight = '#e3ff75';
  const gradDark = '#8aaf00';

  const stamp = `Updated: ${escapeXml(updatedAt)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 320" role="img" aria-label="Kota Kobayashi — Faber Company">
  <defs>
    <linearGradient id="nameGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${gradLight}"/>
      <stop offset="100%" stop-color="${gradDark}"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="320" fill="${bg}"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif">
    <g font-size="72" font-weight="900" stroke-linejoin="round" stroke-linecap="round">
      <text x="72" y="132" fill="${accent}" stroke="${accent}" stroke-width="24">Kota Kobayashi</text>
      <text x="72" y="132" fill="#000000" stroke="#000000" stroke-width="14">Kota Kobayashi</text>
      <text x="72" y="132" fill="#ffffff" stroke="#ffffff" stroke-width="6">Kota Kobayashi</text>
      <text x="72" y="132" fill="url(#nameGrad)">Kota Kobayashi</text>
    </g>
    <text x="72" y="200" font-size="22" font-weight="500" fill="${fg}">Technology Strategy Team · Faber Company</text>
    <rect x="72" y="218" width="72" height="6" fill="${accent}"/>
    <text x="72" y="280" font-size="14" font-weight="400" fill="${muted}">${stamp}</text>
    <text x="1208" y="56" font-size="22" font-weight="700" fill="${fg}" text-anchor="end">${HIRE_DATE_SVG}</text>
  </g>
</svg>
`;
}

function updateBlogSection(readme, blogMarkdown) {
  const startIdx = readme.indexOf(BLOG_START);
  const endIdx = readme.indexOf(BLOG_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`README is missing ${BLOG_START} / ${BLOG_END} markers`);
  }
  const before = readme.slice(0, startIdx + BLOG_START.length);
  const after = readme.slice(endIdx);
  return `${before}\n${blogMarkdown}\n${after}`;
}

async function main() {
  const xml = await fetchFeed(FEED_URL);
  const entries = parseEntries(xml).sort(
    (a, b) => new Date(b.published) - new Date(a.published),
  );
  const latest = entries.slice(0, MAX_ITEMS);

  console.log(`Fetched ${entries.length} entries from ${FEED_URL}; rendering top ${latest.length}.`);

  const now = new Date();
  const updatedAt = formatTimestampJST(now);

  mkdirSync(resolve(ROOT, 'assets'), { recursive: true });
  writeFileSync(
    resolve(ROOT, 'assets/banner.svg'),
    buildBanner({ updatedAt }),
  );

  const readmePath = resolve(ROOT, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const next = updateBlogSection(readme, buildBlogMarkdown(latest));
  writeFileSync(readmePath, next);

  console.log('README and banners updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
