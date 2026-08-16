import fs from 'node:fs';
import path from 'node:path';

const DATA_URL = process.env.MUNICIPALITY_DATA_URL || 'https://raw.githubusercontent.com/code4fukui/localgovjp/master/localgovjp.json';
const OUTPUT_DIR = 'dist';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const config = readJson('site.config.json');
const BASE_URL = normalizeBaseUrl(process.env.SITE_URL || config.siteUrl);
const UPDATED_AT = process.env.SITE_UPDATED_AT || new Date().toISOString().slice(0, 10);
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || config.gaMeasurementId || '';
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || config.googleSiteVerification || '';
const cars = readJson('data/toyota-models.json');
const prefectures = readJson('data/prefectures.json');
const legacyCityPaths = readJson('data/legacy-city-paths.json');
const prefectureByName = new Map(prefectures.map((item) => [item.name, item]));
const legacyPathByCity = new Map(legacyCityPaths.filter((item) => item.city).map((item) => [`${item.prefecture}/${item.city}`, item.slug]));

const municipalities = await fetchMunicipalities();
validateData(municipalities);
fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
for (const directory of ['assets', 'cars', 'city', 'pref', 'data']) fs.mkdirSync(path.join(OUTPUT_DIR, directory), { recursive: true });
for (const file of ['assets/style.css', 'assets/app.js']) fs.copyFileSync(file, path.join(OUTPUT_DIR, file));

const byPrefecture = new Map();
for (const item of municipalities) {
  if (!byPrefecture.has(item.pref)) byPrefecture.set(item.pref, []);
  byPrefecture.get(item.pref).push(item);
}
const records = municipalities.map((item) => {
  const legacySlug = legacyPathByCity.get(`${item.pref}/${item.city}`);
  return { ...item, path: `/${prefectureByName.get(item.pref).slug}/${legacySlug || item.lgcode}/`, indexable: Boolean(legacySlug) };
});
const indexableUrls = new Set();

validateSiteSettings();

function normalizeBaseUrl(value) {
  if (!value) throw new Error('siteUrl or SITE_URL is required');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Site URL must be an HTTPS origin without a path: ${value}`);
  }
  return url.origin;
}

function validateSiteSettings() {
  if (GA_MEASUREMENT_ID && !/^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID)) {
    throw new Error(`Invalid GA4 measurement ID: ${GA_MEASUREMENT_ID}`);
  }
  if (GOOGLE_SITE_VERIFICATION && !/^[A-Za-z0-9_-]+$/.test(GOOGLE_SITE_VERIFICATION)) {
    throw new Error('Invalid Google site verification token');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(UPDATED_AT)) throw new Error(`Invalid update date: ${UPDATED_AT}`);
}

async function fetchMunicipalities() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(DATA_URL, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Municipality data fetch failed after 3 attempts: ${lastError?.message}`);
}

function validateData(items) {
  if (!Array.isArray(items) || items.length < 1700) throw new Error(`Municipality data is incomplete: ${items?.length ?? 0} records`);
  const codes = new Set();
  for (const item of items) {
    if (!item.pref || !item.city || !/^\d{6}$/.test(item.lgcode) || !item.url) throw new Error(`Invalid municipality record: ${JSON.stringify(item)}`);
    if (codes.has(item.lgcode)) throw new Error(`Duplicate municipality code: ${item.lgcode}`);
    if (!prefectureByName.has(item.pref)) throw new Error(`Unknown prefecture: ${item.pref}`);
    codes.add(item.lgcode);
  }
}

function write(relativePath, contents) {
  const outputPath = path.join(OUTPUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, contents);
}
function writePage(urlPath, contents) {
  write(urlPath === '/' ? 'index.html' : `${urlPath.replace(/^\//, '').replace(/\/$/, '')}/index.html`, contents);
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
const absolute = (urlPath) => `${BASE_URL}${urlPath}`;
const addToSitemap = (urlPath) => indexableUrls.add(absolute(urlPath));
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function page({ title, description, urlPath, body, schema = [], indexable = true }) {
  const schemas = (Array.isArray(schema) ? schema : [schema]).filter(Boolean).map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`).join('');
  const verification = GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}">` : '';
  const analytics = GA_MEASUREMENT_ID ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');</script>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${indexable ? 'index,follow,max-snippet:-1,max-image-preview:large' : 'noindex,follow'}"><link rel="canonical" href="${absolute(urlPath)}">${verification}<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="${escapeHtml(config.siteName)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${absolute(urlPath)}"><meta name="twitter:card" content="summary"><link rel="stylesheet" href="/assets/style.css">${schemas}${analytics}</head><body><a class="skip-link" href="#content">本文へ移動</a><header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="${escapeHtml(config.siteName)} トップ">${escapeHtml(config.siteName)}</a><nav aria-label="メインナビゲーション"><a href="/#area-search">地域検索</a><a href="/cars/">車種</a><a href="/guide/">売却ガイド</a></nav></div></header><main id="content">${body}</main><footer class="site-footer"><div class="footer-inner"><div><strong>${escapeHtml(config.siteName)}</strong><p>根拠のない固定相場を掲載せず、査定条件を整理・比較するための情報を提供します。</p></div><nav aria-label="フッターナビゲーション"><a href="/guide/">売却ガイド</a><a href="/editorial-policy/">編集方針</a><a href="/about/">サイト情報</a><a href="/privacy/">プライバシー</a><a href="/sitemap/">サイトマップ</a></nav><small>更新日: ${UPDATED_AT}　© ${new Date().getUTCFullYear()} ${escapeHtml(config.siteName)}</small></div></footer><script src="/assets/app.js" defer></script></body></html>`;
}

function breadcrumbs(items) {
  const html = `<nav class="breadcrumbs" aria-label="パンくずリスト">${items.map((item, index) => index === items.length - 1 ? `<span aria-current="page">${escapeHtml(item.name)}</span>` : `<a href="${item.path}">${escapeHtml(item.name)}</a>`).join('<span aria-hidden="true">›</span>')}</nav>`;
  const schema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absolute(item.path) })) };
  return { html, schema };
}

function buildHome() {
  const prefectureCards = prefectures.map((prefecture) => `<a class="directory-card" href="/${prefecture.slug}/"><strong>${prefecture.name}</strong><span>${byPrefecture.get(prefecture.name).length.toLocaleString('ja-JP')}地域</span></a>`).join('');
  const carOptions = cars.map((car) => `<option value="${car.slug}">${escapeHtml(car.name)}</option>`).join('');
  const body = `<section class="hero"><div class="hero-copy"><span class="eyebrow">全国1,900地域以上から検索</span><h1>車の査定条件を、地域と車種から整理する</h1><p>${escapeHtml(config.tagline)}。金額を断定せず、同じ条件で複数の査定を比べるための準備を支援します。</p><div class="hero-actions"><a class="button primary" href="#area-search">地域を探す</a><a class="button secondary" href="/guide/">先に売却手順を見る</a></div></div><div class="trust-panel"><strong>掲載方針</strong><ul><li>固定価格を作らない</li><li>公式の自治体情報へリンク</li><li>広告の有無を明示する</li></ul></div></section><section class="section" id="area-search"><div class="section-heading"><span class="section-number">01</span><div><h2>地域・車種を検索</h2><p>市区町村名、読み仮名、都道府県名から絞り込めます。</p></div></div><div class="tool-card search-tool" data-area-search><label for="area-query">地域名</label><div class="search-row"><input id="area-query" type="search" autocomplete="off" placeholder="例：浜松市、はままつ、静岡県"><button type="button" data-search-button>検索</button></div><div class="search-results" data-search-results aria-live="polite"></div></div><form class="tool-card" data-car-jump><label for="car-select">トヨタ車種から見る</label><div class="search-row"><select id="car-select" required><option value="">車種を選択</option>${carOptions}</select><button type="submit">車種ページへ</button></div></form></section><section class="section"><div class="section-heading"><span class="section-number">02</span><div><h2>都道府県から探す</h2><p>全国47都道府県を掲載し、すべての地域を検索できます。</p></div></div><div class="directory-grid">${prefectureCards}</div></section><section class="section"><div class="section-heading"><span class="section-number">03</span><div><h2>査定比較の3ステップ</h2><p>業者名ではなく、比較条件を揃えることから始めます。</p></div></div><ol class="step-grid"><li><strong>車両情報を揃える</strong><span>年式・型式・走行距離・グレード・修復歴を確認。</span></li><li><strong>同じ条件で依頼する</strong><span>引渡日や装備を揃え、査定額の前提差を減らす。</span></li><li><strong>手取り額で比べる</strong><span>手数料・入金日・キャンセル条件まで記録する。</span></li></ol></section>`;
  writePage('/', page({ title: `${config.siteName}｜全国の車買取・査定情報`, description: config.tagline, urlPath: '/', body, schema: { '@context': 'https://schema.org', '@type': 'WebSite', name: config.siteName, url: `${BASE_URL}/`, description: config.tagline, inLanguage: 'ja' } }));
  addToSitemap('/');
}

function buildCars() {
  const crumb = breadcrumbs([{ name: '全国', path: '/' }, { name: 'トヨタ車種', path: '/cars/' }]);
  const cards = cars.map((car) => `<a class="directory-card" href="/cars/${car.slug}/"><strong>${escapeHtml(car.name)}</strong><span>${escapeHtml(car.type)}</span></a>`).join('');
  writePage('/cars/', page({ title: 'トヨタ車種別の買取・査定チェックポイント', description: 'トヨタ車の車種別に、査定前に確認したい装備・状態・比較条件を整理します。', urlPath: '/cars/', body: `${crumb.html}<section class="page-intro"><span class="eyebrow">車種別ガイド</span><h1>トヨタ車種から査定条件を確認</h1><p>同じ車名でも年式・型式・グレード・駆動方式で条件が変わります。車検証と現車を見ながら確認してください。</p></section><section class="section"><div class="directory-grid">${cards}</div></section>`, schema: [crumb.schema, { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'トヨタ車種別の買取・査定チェックポイント', url: `${BASE_URL}/cars/` }] }));
  addToSitemap('/cars/');
  for (const car of cars) {
    const carCrumb = breadcrumbs([{ name: '全国', path: '/' }, { name: 'トヨタ車種', path: '/cars/' }, { name: car.name, path: `/cars/${car.slug}/` }]);
    const faq = [{ q: `${car.name}の査定前に最低限必要な情報は？`, a: '車検証にある初度登録年月・型式、現在の走行距離、グレード、修復歴、装備の有無を揃えます。' }, { q: '査定額だけを比べればよいですか？', a: 'いいえ。手数料、税金の扱い、入金日、車両引渡日、契約後の減額条件、キャンセル条件も同じ表に記録して比べます。' }];
    const body = `${carCrumb.html}<section class="page-intro"><span class="eyebrow">${escapeHtml(car.type)}</span><h1>${escapeHtml(car.name)}の査定チェックポイント</h1><p>価格を予想する前に、査定会社へ同じ情報を渡せる状態にします。固定相場は車両状態を反映できないため掲載していません。</p></section><div class="content-grid"><section class="content-card"><h2>共通して確認する項目</h2><ul class="check-list"><li>初度登録年月・型式・グレード</li><li>走行距離と整備記録</li><li>修復歴、傷、へこみ、交換歴</li><li>純正部品、スペアキー、取扱説明書</li></ul></section><section class="content-card accent"><h2>${escapeHtml(car.type)}で追加確認</h2><ul class="check-list">${adviceForType(car.type).map((item) => `<li>${item}</li>`).join('')}</ul></section></div>${comparisonTool(`${car.name}の査定比較メモ`)}<section class="section"><h2>よくある質問</h2>${faqHtml(faq)}</section>`;
    writePage(`/cars/${car.slug}/`, page({ title: `${car.name}の買取・査定チェックポイント｜${config.siteName}`, description: `${car.name}の査定前に揃えたい年式、走行距離、グレード、装備と比較条件を確認できます。`, urlPath: `/cars/${car.slug}/`, body, schema: [carCrumb.schema, faqSchema(faq)] }));
    addToSitemap(`/cars/${car.slug}/`);
  }
}

function adviceForType(type) {
  const data = {
    'ハイブリッド': ['駆動用バッテリーの警告表示や交換記録', '補機バッテリーと電装品の動作', '点検記録と警告灯の有無'],
    'コンパクト': ['内装の汚れや臭い、シートの状態', '安全支援装備とスマートキーの動作', 'タイヤ4本の残り溝と偏摩耗'],
    'SUV': ['2WD・4WDなど駆動方式', '下回り、ホイール、樹脂部品の傷', 'ルーフレールや純正オプションの有無'],
    'セダン': ['内外装の傷と補修歴', '安全支援・快適装備の動作', 'タイヤと純正ホイールの状態'],
    'ワゴン': ['荷室床面・内張りの傷', '後席と荷室アレンジの動作', 'ルーフ関連オプションの有無'],
    '乗用車': ['内外装と後席装備の動作', 'メーカーオプションと整備記録', '純正部品とスペアキーの有無'],
    'ミニバン': ['電動スライドドアとバックドアの動作', '2列目・3列目シートと内装の状態', '乗車人数、駆動方式、純正ナビ等の装備'],
    'ピックアップ': ['荷台、下回り、牽引装備の使用状態', '4WD機構とタイヤの状態', '社外部品がある場合の純正部品の保管'],
    'バン': ['荷室の傷、へこみ、臭い', '最大積載量、ボディ長、ルーフ形状', '事業使用歴と定期点検記録'],
    'スポーツ': ['改造内容と純正部品の有無', 'タイヤ、ブレーキ、下回りの状態', '走行歴や修復歴を正確に申告'],
    'BEV': ['駆動用バッテリーの状態と保証記録', '充電ケーブル等の付属品', '警告表示、充電・電装品の動作'],
  };
  return data[type] || ['車種固有の装備と動作', '整備記録と付属品', '純正部品の保管状況'];
}

function buildGuide() {
  const crumb = breadcrumbs([{ name: '全国', path: '/' }, { name: '売却ガイド', path: '/guide/' }]);
  const faq = [{ q: '何社に査定を依頼すればよいですか？', a: '社数に正解はありません。対応できる範囲で複数社へ同じ条件を伝え、手取り額と契約条件を比較してください。' }, { q: '洗車や清掃は必要ですか？', a: '査定担当者が状態を確認しやすいよう、荷物を下ろし、車内外を無理のない範囲で整えます。高額な修理は先に査定会社へ確認します。' }, { q: '契約前に何を確認しますか？', a: '最終的な手取り額、税金・手数料、入金日、引渡日、契約後の減額条件、キャンセル条件を文面で確認します。' }];
  const body = `${crumb.html}<section class="page-intro"><span class="eyebrow">保存版</span><h1>車を売る前の確認手順</h1><p>査定額の数字だけで即決せず、情報と条件を揃えて比較します。</p></section><section class="section timeline"><ol><li><h2>車両情報を確認</h2><p>車検証、走行距離、整備記録簿、修復歴、純正部品、スペアキーを確認します。</p></li><li><h2>査定条件を揃える</h2><p>同じ引渡日、同じ付属品、同じ車両状態を伝えます。</p></li><li><h2>契約条件を記録</h2><p>手数料、入金日、税金の扱い、減額・キャンセル条件をメモします。</p></li><li><h2>手取り額で決める</h2><p>契約書面と最終的な受取額を確認してから決定します。</p></li></ol></section>${comparisonTool('査定結果を同じ表で比較')}<section class="section"><h2>よくある質問</h2>${faqHtml(faq)}</section>`;
  writePage('/guide/', page({ title: `車を売る前の査定比較ガイド｜${config.siteName}`, description: '車検証の確認から複数査定、契約条件、入金まで、中古車を売る前に揃えたい情報を順番に解説します。', urlPath: '/guide/', body, schema: [crumb.schema, faqSchema(faq)] }));
  addToSitemap('/guide/');
}

function comparisonTool(title) {
  return `<section class="section comparison" data-comparison-tool><div class="section-heading"><span class="section-number">比較</span><div><h2>${escapeHtml(title)}</h2><p>入力内容はこの端末内だけに保存され、当サイトへ送信されません。</p></div></div><form class="tool-card comparison-form" data-comparison-form><label>査定会社名<input name="company" required maxlength="60" placeholder="例：A社"></label><label>提示額（円）<input name="amount" type="number" min="0" step="1000" inputmode="numeric" placeholder="例：1250000"></label><label>入金予定日<input name="paymentDate" type="date"></label><label>条件メモ<textarea name="notes" maxlength="240" placeholder="手数料、引渡日、減額・キャンセル条件など"></textarea></label><button type="submit">比較表に追加</button></form><div class="comparison-output" data-comparison-output aria-live="polite"></div></section>`;
}

function buildEditorialPages() {
  const items = [
    ['/editorial-policy/', '編集方針・情報の扱い', '掲載情報の作成方針、価格情報、自治体データ、広告の扱いを説明します。', `<h2>価格を断定しません</h2><p>中古車の査定額は年式、走行距離、グレード、状態、修復歴、需給、査定時点などで変動します。当サイトは実査定に基づかない固定価格や、出典を確認できないランキングを作りません。</p><h2>自治体情報</h2><p>地域名、自治体コード、読み仮名、公式サイトURL等は、オープンデータを整備する <a href="https://github.com/code4fukui/localgovjp" rel="noopener noreferrer">localgovjp</a> を参照しています。</p><h2>広告</h2><p>広告や成果報酬型リンクを掲載する場合は、広告であることを表示します。現在の比較メモは特定事業者への送信機能を持ちません。</p><h2>更新・訂正</h2><p>生成時にデータ件数、URL、タイトル、構造化データ、内部リンクを自動検査します。</p>`],
    ['/about/', 'このサイトについて', `${config.siteName}の目的と使い方。`, `<p>${escapeHtml(config.siteName)}は、全国の市区町村と車種から査定前の確認項目を探し、複数の提示条件を同じ表で比べるための情報サイトです。</p><h2>できること</h2><ul><li>全国の市区町村名・読み仮名から地域ページを検索</li><li>トヨタ車種別の査定チェック項目を確認</li><li>複数社の提示額・入金日・条件を端末内の比較表に保存</li></ul><h2>できないこと</h2><p>当サイトは査定事業者ではなく、表示上の金額を保証しません。</p>`],
    ['/privacy/', 'プライバシーポリシー', `${config.siteName}のプライバシーポリシー。`, `<h2>比較メモ</h2><p>比較メモへ入力した内容はブラウザのlocalStorageに保存され、当サイトのサーバーへ送信されません。ブラウザのサイトデータを削除すると消去されます。</p><h2>アクセス解析</h2><p>当サイトは利用状況の把握と改善のためGoogle Analytics 4を利用します。Google AnalyticsはCookie等を用いて、閲覧ページ、端末・ブラウザ情報、概算地域などを収集する場合があります。収集される情報に氏名やメールアドレスは含まれません。データの取り扱いはGoogleの規約・プライバシーポリシーに基づきます。</p><p><a href="https://tools.google.com/dlpage/gaoptout?hl=ja" rel="noopener noreferrer">Google Analytics オプトアウト アドオン</a>を利用すると計測を無効にできます。</p><h2>広告</h2><p>広告サービスを導入する場合は、このページに利用サービスとデータの取り扱いを追記します。</p><h2>外部リンク</h2><p>外部サイトでの個人情報の取り扱いは、各サイトの方針をご確認ください。</p>`],
  ];
  for (const [urlPath, heading, description, content] of items) {
    const crumb = breadcrumbs([{ name: '全国', path: '/' }, { name: heading, path: urlPath }]);
    writePage(urlPath, page({ title: `${heading}｜${config.siteName}`, description, urlPath, body: `${crumb.html}<article class="page-intro prose"><h1>${heading}</h1>${content}</article>`, schema: crumb.schema }));
    addToSitemap(urlPath);
  }
}

function buildRegions() {
  for (const prefecture of prefectures) {
    const prefRecords = records.filter((item) => item.pref === prefecture.name);
    const prefPath = `/${prefecture.slug}/`;
    const crumb = breadcrumbs([{ name: '全国', path: '/' }, { name: prefecture.name, path: prefPath }]);
    const links = prefRecords.map((item) => `<a class="directory-card" href="${item.path}" data-directory-name="${escapeHtml(`${item.city} ${item.citykana}`)}"><strong>${escapeHtml(item.city)}</strong><span>${escapeHtml(item.citykana)}</span></a>`).join('');
    const body = `${crumb.html}<section class="page-intro"><span class="eyebrow">${prefecture.region}</span><h1>${prefecture.name}の車買取・査定情報</h1><p>${prefRecords.length.toLocaleString('ja-JP')}地域から、車両情報と査定条件を整理できます。地域名は自治体オープンデータに基づきます。</p></section><section class="section"><div class="filter-row"><label for="filter-${prefecture.slug}">地域名を絞り込む</label><input id="filter-${prefecture.slug}" type="search" placeholder="市区町村名・読み仮名" data-directory-filter></div><p class="result-count" data-directory-count>${prefRecords.length}件</p><div class="directory-grid" data-directory-list>${links}</div></section><aside class="notice"><strong>掲載・検索登録について</strong><p>全地域を検索できます。検索エンジンへの登録は、独自情報を確認できたページから段階的に行っています（現在${prefRecords.filter((item) => item.indexable).length}地域）。</p></aside>`;
    writePage(prefPath, page({ title: `${prefecture.name}の車買取・中古車査定情報｜${config.siteName}`, description: `${prefecture.name}の${prefRecords.length}地域から、車を売る前の確認項目と査定比較メモを利用できます。`, urlPath: prefPath, body, schema: [crumb.schema, { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${prefecture.name}の車買取・査定情報`, url: absolute(prefPath), numberOfItems: prefRecords.length }] }));
    addToSitemap(prefPath);
    for (const municipality of prefRecords) buildMunicipalityPage(municipality, prefecture, prefRecords);
  }
}

function buildMunicipalityPage(municipality, prefecture, prefRecords) {
  const prefPath = `/${prefecture.slug}/`;
  const crumb = breadcrumbs([{ name: '全国', path: '/' }, { name: prefecture.name, path: prefPath }, { name: municipality.city, path: municipality.path }]);
  const faq = [{ q: `${municipality.city}で査定額は決まっていますか？`, a: '地域名だけで査定額は決まりません。年式、型式、走行距離、グレード、状態、修復歴、装備、査定時点などを揃えて実査定を比較してください。' }, { q: '複数の提示をどう比べますか？', a: '提示額だけでなく、手数料、税金の扱い、入金日、引渡日、契約後の減額条件、キャンセル条件を同じ表へ記録します。' }];
  const nearest = prefRecords.filter((item) => item.lgcode !== municipality.lgcode).map((item) => ({ ...item, distance: haversine(municipality, item) })).sort((a, b) => a.distance - b.distance).slice(0, 5);
  const motto = municipality.phrase ? `<blockquote><p>${escapeHtml(municipality.phrase)}</p><cite>自治体データに掲載された地域フレーズ</cite></blockquote>` : '';
  const body = `${crumb.html}<section class="page-intro"><span class="eyebrow">自治体コード ${municipality.lgcode}</span><h1>${escapeHtml(municipality.city)}で車を売る前の査定ガイド</h1><p>${escapeHtml(municipality.city)}から利用する査定を、同じ車両情報・同じ引渡条件で比較するための確認ページです。</p>${motto}</section><div class="content-grid"><section class="content-card"><h2>先に揃える車両情報</h2><ul class="check-list"><li>車検証の初度登録年月・型式・グレード</li><li>現在の走行距離と整備記録簿</li><li>修復歴、傷、へこみ、交換歴</li><li>純正部品、スペアキー、取扱説明書</li></ul></section><section class="content-card accent"><h2>提示ごとに記録する条件</h2><ul class="check-list"><li>最終的な手取り額と手数料</li><li>車両の引渡日と入金予定日</li><li>契約後の減額条件</li><li>キャンセル可否と費用</li></ul></section></div>${comparisonTool(`${municipality.city}の査定比較メモ`)}<section class="section"><h2>${escapeHtml(municipality.city)}の自治体情報</h2><dl class="data-list"><div><dt>都道府県</dt><dd><a href="${prefPath}">${prefecture.name}</a></dd></div><div><dt>読み仮名</dt><dd>${escapeHtml(municipality.citykana)}</dd></div><div><dt>自治体コード</dt><dd>${municipality.lgcode}</dd></div><div><dt>位置情報</dt><dd>北緯 ${Number(municipality.lat).toFixed(5)} / 東経 ${Number(municipality.lng).toFixed(5)}</dd></div><div><dt>公式サイト</dt><dd><a href="${escapeHtml(municipality.url)}" rel="noopener noreferrer">${escapeHtml(municipality.city)}公式サイト</a></dd></div></dl><p class="source">地域データ出典: localgovjp。距離は緯度・経度から算出した直線距離の目安で、道路距離ではありません。</p></section><section class="section"><h2>近隣地域の確認ページ</h2><ul class="neighbor-list">${nearest.map((item) => `<li><a href="${item.path}">${escapeHtml(item.city)}</a><span>直線距離の目安 ${item.distance.toFixed(1)} km</span></li>`).join('')}</ul></section><section class="section"><h2>よくある質問</h2>${faqHtml(faq)}</section>`;
  writePage(municipality.path, page({ title: `${municipality.city}の車買取・中古車査定ガイド｜${prefecture.name}`, description: `${municipality.city}で車を売る前に、車両情報、手取り額、入金日、減額・キャンセル条件を整理して比較できます。`, urlPath: municipality.path, body, indexable: municipality.indexable, schema: [crumb.schema, faqSchema(faq), { '@context': 'https://schema.org', '@type': 'WebPage', name: `${municipality.city}の車買取・中古車査定ガイド`, about: { '@type': 'AdministrativeArea', name: municipality.city }, isPartOf: { '@type': 'WebSite', name: config.siteName, url: `${BASE_URL}/` } }] }));
  if (municipality.indexable) addToSitemap(municipality.path);
}

function haversine(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(Number(b.lat) - Number(a.lat));
  const dLng = radians(Number(b.lng) - Number(a.lng));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(a.lat))) * Math.cos(radians(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const faqHtml = (items) => items.map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`).join('');
const faqSchema = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) });

function buildAliases() {
  for (const item of legacyCityPaths.filter((entry) => !entry.city && entry.target)) writePage(`/${item.prefectureSlug}/${item.slug}/`, redirectPage(item.target, '地域ページへ移動'));
}
function redirectPage(target, title) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${absolute(target)}"><meta http-equiv="refresh" content="0;url=${target}"><title>${escapeHtml(title)}</title></head><body><p><a href="${target}">${escapeHtml(title)}</a></p></body></html>`;
}

function buildUtilityFiles() {
  const searchIndex = [...prefectures.map((item) => ({ name: item.name, kana: '', type: '都道府県', path: `/${item.slug}/` })), ...records.map((item) => ({ name: item.city, kana: item.citykana, prefecture: item.pref, type: '市区町村', path: item.path }))];
  write('data/search-index.json', JSON.stringify(searchIndex));
  write('data/toyota-models.json', JSON.stringify(cars));
  write('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#a9241b"/><path d="M13 38h38l-4-13a6 6 0 0 0-6-4H23a6 6 0 0 0-6 4l-4 13Z" fill="#fff"/><circle cx="20" cy="43" r="6" fill="#172033"/><circle cx="44" cy="43" r="6" fill="#172033"/><path d="M22 26h20l2 7H20l2-7Z" fill="#d9f2ef"/></svg>`);
  const indexedCities = records.filter((item) => item.indexable);
  const sitemapBody = `<section class="page-intro"><h1>サイトマップ</h1><p>検索エンジンへの登録対象としているページの一覧です。</p></section><section class="section"><h2>都道府県</h2><ul class="link-columns">${prefectures.map((item) => `<li><a href="/${item.slug}/">${item.name}</a></li>`).join('')}</ul><h2>主要地域</h2><ul class="link-columns">${indexedCities.map((item) => `<li><a href="${item.path}">${item.pref} ${item.city}</a></li>`).join('')}</ul><h2>車種</h2><ul class="link-columns">${cars.map((item) => `<li><a href="/cars/${item.slug}/">${item.name}</a></li>`).join('')}</ul></section>`;
  writePage('/sitemap/', page({ title: `サイトマップ｜${config.siteName}`, description: `${config.siteName}のページ一覧。`, urlPath: '/sitemap/', body: sitemapBody }));
  addToSitemap('/sitemap/');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...indexableUrls].sort().map((url) => `  <url><loc>${escapeHtml(url)}</loc><lastmod>${UPDATED_AT}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
  write('llms.txt', `# ${config.siteName}\n\n> ${config.tagline}\n\n## Primary pages\n- ${BASE_URL}/ 全国・地域検索\n- ${BASE_URL}/cars/ トヨタ車種別ガイド\n- ${BASE_URL}/guide/ 査定比較ガイド\n- ${BASE_URL}/editorial-policy/ 編集方針と情報源\n\n## Data policy\n- 査定額は車両状態と査定時点で変動するため、根拠のない固定価格を生成しません。\n- 入力した比較メモはブラウザ内にのみ保存されます。\n`);
  write('404.html', page({ title: `ページが見つかりません｜${config.siteName}`, description: '指定されたページは見つかりませんでした。', urlPath: '/404/', indexable: false, body: '<section class="page-intro"><span class="eyebrow">404</span><h1>ページが見つかりません</h1><p>URLが変更された可能性があります。地域検索から目的のページを探してください。</p><a class="button primary" href="/#area-search">地域を検索</a></section>' }));
}

buildHome();
buildCars();
buildGuide();
buildEditorialPages();
buildRegions();
buildAliases();
buildUtilityFiles();
console.log(`Built ${records.length} municipality pages; ${indexableUrls.size} URLs are indexable.`);
