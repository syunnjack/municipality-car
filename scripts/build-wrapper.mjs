const originalFetch = globalThis.fetch;
const SOURCE = 'https://raw.githubusercontent.com/code4fukui/localgovjp/master/localgovjp.json';

const obsoleteHamamatsuCodes = new Set([
  '221317','221325','221333','221341','221350','221368','221376'
]);

const currentHamamatsuWards = [
  {
    pid:'22', pref:'静岡県', cid:'22138', city:'浜松市 中央区', citykana:'はままつし ちゅうおうく',
    lat:'34.71084', lng:'137.72612', url:'https://www.city.hamamatsu.shizuoka.jp/ward/chuo/',
    phrase:'2024年1月1日の行政区再編により設置された中央区', lgcode:'221384'
  },
  {
    pid:'22', pref:'静岡県', cid:'22139', city:'浜松市 浜名区', citykana:'はままつし はまなく',
    lat:'34.79115', lng:'137.78333', url:'https://www.city.hamamatsu.shizuoka.jp/ward/hamana/',
    phrase:'2024年1月1日の行政区再編により設置された浜名区', lgcode:'221392'
  },
  {
    pid:'22', pref:'静岡県', cid:'22140', city:'浜松市 天竜区', citykana:'はままつし てんりゅうく',
    lat:'34.87257', lng:'137.81633', url:'https://www.city.hamamatsu.shizuoka.jp/ward/tenryu/',
    phrase:'2024年1月1日の行政区再編後も区域を維持し、地方公共団体コードが変更された天竜区', lgcode:'221406'
  }
];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (url === SOURCE) {
    const response = await originalFetch(input, init);
    if (!response.ok) return response;
    const data = await response.json();
    const filtered = data.filter((item) => !obsoleteHamamatsuCodes.has(String(item.lgcode)));
    const withoutDuplicateCurrent = filtered.filter((item) => !currentHamamatsuWards.some((ward) => ward.lgcode === String(item.lgcode)));
    const corrected = [...withoutDuplicateCurrent, ...currentHamamatsuWards];
    return new Response(JSON.stringify(corrected), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
  return originalFetch(input, init);
};

await import('./build.mjs');
