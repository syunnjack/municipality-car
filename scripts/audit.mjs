import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const config = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const BASE_URL = new URL(process.env.SITE_URL || config.siteUrl).origin;
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || config.gaMeasurementId || '';
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || config.googleSiteVerification || '';
const errors = [];
const htmlFiles = walk(DIST).filter((file) => file.endsWith('.html'));
const titles = new Map();
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]));
const searchIndex = JSON.parse(fs.readFileSync(path.join(DIST, 'data/search-index.json'), 'utf8'));

assert(htmlFiles.length > 1900, `Expected more than 1900 HTML files, found ${htmlFiles.length}`);
assert(searchIndex.length > 1900, `Search index is incomplete: ${searchIndex.length}`);
assert(!sitemap.includes('.html</loc>'), 'Sitemap contains .html URLs');
assert(!sitemap.includes('準備中'), 'Sitemap contains placeholder text');
assert(fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8').includes(`Sitemap: ${BASE_URL}/sitemap.xml`), 'robots.txt has a mismatched sitemap URL');

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(DIST, file).replaceAll(path.sep, '/');
  const isRedirect = html.includes('http-equiv="refresh"');
  const is404 = relative === '404.html';
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  const canonical = html.match(/<link rel="canonical" href="(.*?)">/)?.[1];
  const noindex = html.includes('content="noindex,follow"');

  assert(title, `${relative}: missing title`);
  assert(canonical, `${relative}: missing canonical`);
  assert(!html.includes('準備中'), `${relative}: contains placeholder text`);
  assert(!html.includes('ugc-form'), `${relative}: contains obsolete local-only UGC form`);

  if (!isRedirect && !is404) {
    assert((html.match(/<h1[ >]/g) || []).length === 1, `${relative}: expected exactly one h1`);
    assert(html.includes('property="og:title"'), `${relative}: missing Open Graph metadata`);
    if (GA_MEASUREMENT_ID) assert(html.includes(`gtag/js?id=${GA_MEASUREMENT_ID}`), `${relative}: missing GA4 tag`);
    if (GOOGLE_SITE_VERIFICATION) assert(html.includes(`name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}"`), `${relative}: missing Google verification tag`);
    for (const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
      try { JSON.parse(match[1]); } catch (error) { errors.push(`${relative}: invalid JSON-LD (${error.message})`); }
    }
  }

  if (!noindex && !is404) {
    assert(canonical.startsWith(`${BASE_URL}/`), `${relative}: canonical host does not match site URL`);
    assert(sitemapUrls.has(canonical), `${relative}: indexable canonical is missing from sitemap`);
    if (titles.has(title)) errors.push(`${relative}: duplicate title also used by ${titles.get(title)}`);
    titles.set(title, relative);
  } else if (noindex) {
    assert(!sitemapUrls.has(canonical) || isRedirect, `${relative}: noindex canonical appears in sitemap`);
  }

  if (!isRedirect) {
    for (const match of html.matchAll(/href="(\/[^"]*)"/g)) {
      const href = match[1].split('#')[0].split('?')[0];
      if (!href || href === '/') continue;
      assert(routeExists(href), `${relative}: broken internal link ${href}`);
    }
  }
}

for (const url of sitemapUrls) {
  assert(url.startsWith(`${BASE_URL}/`), `Non-canonical sitemap host: ${url}`);
  assert(routeExists(new URL(url).pathname), `Sitemap URL has no output file: ${url}`);
}

if (errors.length) {
  console.error(`Audit failed with ${errors.length} error(s):\n${errors.slice(0, 80).map((error) => `- ${error}`).join('\n')}`);
  if (errors.length > 80) console.error(`- ...and ${errors.length - 80} more`);
  process.exit(1);
}
console.log(`Audit passed: ${htmlFiles.length} HTML files, ${sitemapUrls.size} indexable URLs, ${searchIndex.length} search records.`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function routeExists(route) {
  if (route.startsWith('/assets/') || route.startsWith('/data/')) return fs.existsSync(path.join(DIST, route));
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  return fs.existsSync(path.join(DIST, clean, 'index.html')) || fs.existsSync(path.join(DIST, clean));
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}
