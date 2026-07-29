export function parseCmcHtml(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find __NEXT_DATA__ payload on CoinMarketCap page');

  const json = JSON.parse(match[1]);
  const stats = json?.props?.pageProps?.detailRes?.detail?.statistics;
  const price = Number(stats?.price);

  if (!Number.isFinite(price)) {
    throw new Error('Price field missing/invalid in CMC payload');
  }

  return {
    source: 'CoinMarketCap',
    symbol: 'BDAG',
    price,
    marketCap: stats?.marketCap ?? null,
    fullyDilutedMarketCap: stats?.fullyDilutedMarketCap ?? null,
    volume24h: stats?.volume24h ?? null,
    percentChange24h: stats?.priceChangePercentage24h ?? null,
    timestamp: new Date().toISOString(),
  };
}

export async function fetchBdagPriceFromCMC(fetchImpl = fetch) {
  const res = await fetchImpl('https://coinmarketcap.com/currencies/blockdag/');
  if (!res.ok) throw new Error(`CMC HTTP ${res.status}`);
  return parseCmcHtml(await res.text());
}
