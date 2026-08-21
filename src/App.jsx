import React, { useState, useEffect, useCallback } from "react";

// ---------------- indicator math ----------------
function ema(values, period) {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}
function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0,
    losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
function vwapApprox(prices, volumes) {
  let pv = 0,
    v = 0;
  for (let i = 0; i < prices.length; i++) {
    pv += prices[i] * volumes[i];
    v += volumes[i];
  }
  return v === 0 ? prices[prices.length - 1] : pv / v;
}
// Binance kline intervals map directly â€” no resampling needed
const TIMEFRAME_CONFIG = {
  "15m": { interval: "15m", label: "15 MIN", note: "Binance 15m candles" },
  "1h": { interval: "1h", label: "1 HOUR", note: "Binance 1h candles" },
  "4h": { interval: "4h", label: "4 HOUR", note: "Binance 4h candles" },
};

function computeSignal(closes, volumesForWindow) {
  if (closes.length < 5) return null;
  const emaFastArr = ema(closes, Math.min(20, Math.floor(closes.length / 2)));
  const emaSlowArr = ema(closes, Math.min(50, closes.length - 1));
  const emaFast = emaFastArr[emaFastArr.length - 1];
  const emaSlow = emaSlowArr[emaSlowArr.length - 1];
  const price = closes[closes.length - 1];
  const vwap = vwapApprox(closes, volumesForWindow);
  const rsiVal = rsi(closes, Math.min(14, closes.length - 1));
  const trendStrength = Math.min(
    100,
    (Math.abs(emaFast - emaSlow) / emaSlow) * 1000
  );

  const bullTrend = emaFast > emaSlow && price > vwap;
  const bearTrend = emaFast < emaSlow && price < vwap;
  const strongTrend = trendStrength > 15;

  let signal = "NEUTRAL";
  if (bullTrend && strongTrend && rsiVal !== null && rsiVal > 50 && rsiVal < 72)
    signal = "BUY";
  else if (
    bearTrend &&
    strongTrend &&
    rsiVal !== null &&
    rsiVal < 50 &&
    rsiVal > 28
  )
    signal = "SELL";

  const confidence = Math.min(
    95,
    Math.round(35 + trendStrength * 0.8 + (signal !== "NEUTRAL" ? 15 : 0))
  );

  return { price, emaFast, emaSlow, vwap, rsi: rsiVal, trendStrength, signal, confidence };
}

function fmtPrice(v) {
  if (v == null) return "â€”";
  if (v > 1000) return v.toFixed(2);
  if (v > 1) return v.toFixed(3);
  return v.toFixed(6);
}

function SignalBadge({ signal }) {
  const styles = {
    BUY: "bg-[#1a3d2e] text-[#5fd98a] border-[#2e6b4c]",
    SELL: "bg-[#3d1a1a] text-[#e8685f] border-[#6b2e2e]",
    NEUTRAL: "bg-[#2a2a20] text-[#c9b458] border-[#4a4530]",
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-sm border text-xs font-bold tracking-widest ${styles[signal]}`}>
      {signal}
    </span>
  );
}

function TimeframeCard({ tfKey, cfg, state }) {
  return (
    <div className="border border-[#2a2b28] bg-[#111210] rounded-md p-4 flex flex-col gap-3 min-h-[220px]">
      <div className="flex items-center justify-between">
        <span className="text-[#8a8b85] text-[11px] tracking-[0.2em] font-mono">
          {cfg.label}
        </span>
        {state.loading && (
          <span className="text-[10px] font-mono text-[#6a6b64]">loadingâ€¦</span>
        )}
        {!state.loading && state.error && (
          <span className="text-[10px] font-mono text-[#e8685f]">error</span>
        )}
        {!state.loading && state.signal && <SignalBadge signal={state.signal.signal} />}
      </div>

      {state.error && (
        <div className="text-[11px] font-mono text-[#e8685f] leading-relaxed">
          {state.error}
        </div>
      )}

      {state.signal && (
        <>
          <div className="text-2xl font-mono text-[#e8e6df] tabular-nums">
            {fmtPrice(state.signal.price)}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono text-[#9a9b94]">
            <div className="flex justify-between">
              <span className="text-[#6a6b64]">EMA fast</span>
              <span>{fmtPrice(state.signal.emaFast)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6a6b64]">EMA slow</span>
              <span>{fmtPrice(state.signal.emaSlow)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6a6b64]">VWAP</span>
              <span>{fmtPrice(state.signal.vwap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6a6b64]">RSI</span>
              <span
                className={
                  state.signal.rsi > 70
                    ? "text-[#e8685f]"
                    : state.signal.rsi < 30
                    ? "text-[#5fd98a]"
                    : ""
                }
              >
                {state.signal.rsi != null ? state.signal.rsi.toFixed(1) : "â€”"}
              </span>
            </div>
          </div>
          <div className="mt-1">
            <div className="h-1 w-full bg-[#222320] rounded-full overflow-hidden">
              <div className="h-full bg-[#c9a84a]" style={{ width: `${state.signal.confidence}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-[10px] font-mono text-[#6a6b64]">
              <span>confidence</span>
              <span>{state.signal.confidence}%</span>
            </div>
          </div>
          <div className="text-[9px] font-mono text-[#4a4b44]">{cfg.note}</div>
        </>
      )}
    </div>
  );
}

function timeAgo(unixSeconds) {
  const diff = Date.now() / 1000 - unixSeconds;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const IMPORTANT_KEYWORDS = [
  "sec", "etf", "fed", "regulation", "hack", "ban", "lawsuit",
  "approval", "rate cut", "rate hike", "interest rate", "halving",
];

// Try a Binance symbol directly; if TICKERUSDT 404s, try a couple of common variants
async function resolveBinanceSymbol(q) {
  const base = q.trim().toUpperCase().replace(/USDT$|USD$/, "");
  const candidates = [`${base}USDT`, `${base}BUSD`, `${base}USD`];
  for (const sym of candidates) {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=1`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return { symbol: sym, base };
      }
    } catch (e) {
      // try next candidate
    }
  }
  return null;
}

export default function SignalTerminal() {
  const [query, setQuery] = useState("BTC");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [coinLabel, setCoinLabel] = useState("BTC");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  const [tfState, setTfState] = useState({
    "15m": { loading: true, signal: null, error: null },
    "1h": { loading: true, signal: null, error: null },
    "4h": { loading: true, signal: null, error: null },
  });

  const [news, setNews] = useState({ loading: true, items: [], error: null });

  const resolveCoin = useCallback(async (q) => {
    setResolving(true);
    setResolveError(null);
    const match = await resolveBinanceSymbol(q);
    if (!match) {
      setResolveError(`"${q}" Binance pe nahi mila â€” try: BTC, ETH, SOL, PAXG, XRP, DOGE`);
      setResolving(false);
      return;
    }
    setSymbol(match.symbol);
    setCoinLabel(match.base);
    setResolving(false);
  }, []);

  const loadTimeframes = useCallback(async (sym) => {
    setTfState({
      "15m": { loading: true, signal: null, error: null },
      "1h": { loading: true, signal: null, error: null },
      "4h": { loading: true, signal: null, error: null },
    });
    for (const tfKey of Object.keys(TIMEFRAME_CONFIG)) {
      const cfg = TIMEFRAME_CONFIG[tfKey];
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${cfg.interval}&limit=100`
        );
        if (!res.ok) throw new Error("fetch failed");
        const klines = await res.json();
        if (!Array.isArray(klines) || klines.length < 5) {
          throw new Error("not enough data");
        }
        const closes = klines.map((k) => parseFloat(k[4]));
        const vols = klines.map((k) => parseFloat(k[5]));
        const signal = computeSignal(closes, vols);
        setTfState((prev) => ({
          ...prev,
          [tfKey]: { loading: false, signal, error: signal ? null : "Not enough data" },
        }));
      } catch (e) {
        setTfState((prev) => ({
          ...prev,
          [tfKey]: { loading: false, signal: null, error: "Fetch fail â€” API/network issue" },
        }));
      }
    }
  }, []);

  const loadNews = useCallback(async () => {
    setNews({ loading: true, items: [], error: null });
    const sources = [
      "https://min-api.cryptocompare.com/data/v2/news/?lang=EN",
      "https://api.coinstats.app/public/v1/news?skip=0&limit=20",
    ];
    for (const url of sources) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("news fetch failed");
        const data = await res.json();
        const raw = data.Data || data.news || [];
        if (!raw.length) throw new Error("empty");
        const items = raw.slice(0, 20).map((n) => {
          const title = n.title || n.name || "";
          const titleLower = title.toLowerCase();
          const important = IMPORTANT_KEYWORDS.some((k) => titleLower.includes(k));
          const publishedRaw = n.published_on || n.feedDate || n.publishedAt;
          const published =
            typeof publishedRaw === "number" && publishedRaw > 2e10
              ? Math.floor(publishedRaw / 1000)
              : publishedRaw
              ? Math.floor(new Date(publishedRaw).getTime() / 1000) || publishedRaw
              : Math.floor(Date.now() / 1000);
          return {
            title,
            source: n.source_info?.name || n.source || n.sourceName || "unknown",
            url: n.url || n.link || "#",
            published,
            important,
          };
        });
        items.sort((a, b) => {
          if (a.important !== b.important) return a.important ? -1 : 1;
          return b.published - a.published;
        });
        setNews({ loading: false, items: items.slice(0, 10), error: null });
        return;
      } catch (e) {
        // try next source
      }
    }
    setNews({ loading: false, items: [], error: "News fetch fail â€” dono sources down." });
  }, []);

  useEffect(() => {
    loadTimeframes(symbol);
  }, [symbol, loadTimeframes]);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (query.trim()) await resolveCoin(query.trim());
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0b09] text-[#e8e6df] font-sans">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="font-mono text-lg tracking-[0.15em] text-[#e8e6df]">
            SIGNAL<span className="text-[#c9a84a]">/</span>TERMINAL
          </h1>
          <span className="text-[10px] font-mono text-[#6a6b64] tracking-widest">
            LIVE Â· BINANCE + NEWS FEED
          </span>
        </div>
        <p className="text-[#8a8b85] text-sm mb-8">
          EMA + VWAP + RSI confluence, real price data, teen timeframes me.
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol dhoondh â€” BTC, ETH, SOL, PAXG, XRP..."
            className="flex-1 bg-[#111210] border border-[#2a2b28] rounded-md px-4 py-2.5 text-sm font-mono text-[#e8e6df] placeholder-[#5a5b54] outline-none focus:border-[#c9a84a] transition-colors"
          />
          <button
            type="submit"
            disabled={resolving}
            className="px-5 py-2.5 rounded-md bg-[#c9a84a] text-[#0a0b09] text-sm font-bold font-mono hover:bg-[#ddbb5c] transition-colors disabled:opacity-50"
          >
            {resolving ? "..." : "SCAN"}
          </button>
        </form>
        {resolveError && (
          <div className="text-[11px] font-mono text-[#e8685f] mb-6">{resolveError}</div>
        )}

        <div className="flex items-center gap-2 mb-4 mt-6">
          <span className="text-3xl font-mono font-bold">{coinLabel}</span>
          <span className="text-[#6a6b64] text-sm font-mono">/USD</span>
          <button
            onClick={() => loadTimeframes(symbol)}
            className="ml-auto text-[10px] font-mono px-2.5 py-1 rounded-sm border border-[#2a2b28] text-[#6a6b64] hover:border-[#4a4b44]"
          >
            REFRESH
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {Object.entries(TIMEFRAME_CONFIG).map(([tfKey, cfg]) => (
            <TimeframeCard key={tfKey} tfKey={tfKey} cfg={cfg} state={tfState[tfKey]} />
          ))}
        </div>

        {/* NEWS */}
        <div className="border-t border-[#1e1f1c] pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-[11px] tracking-[0.2em] text-[#8a8b85]">
              MARKET NEWS
            </h2>
            <button
              onClick={loadNews}
              className="text-[10px] font-mono px-2.5 py-1 rounded-sm border border-[#2a2b28] text-[#6a6b64] hover:border-[#4a4b44]"
            >
              REFRESH
            </button>
          </div>

          {news.loading && (
            <div className="text-[11px] font-mono text-[#6a6b64]">loading newsâ€¦</div>
          )}
          {news.error && (
            <div className="text-[11px] font-mono text-[#e8685f]">{news.error}</div>
          )}

          <div className="flex flex-col gap-2">
            {news.items.map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="block border border-[#1e1f1c] hover:border-[#2a2b28] rounded-md px-4 py-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-[#e8e6df] leading-snug">
                    {n.important && (
                      <span className="text-[#c9a84a] font-bold mr-1">â—</span>
                    )}
                    {n.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-[#6a6b64]">
                  <span>{n.source}</span>
                  <span>Â·</span>
                  <span>{timeAgo(n.published)}</span>
                  <span>Â·</span>
                  <span>{new Date(n.published * 1000).toLocaleString()}</span>
                </div>
              </a>
            ))}
          </div>
        </div>

        <p className="mt-8 text-[11px] font-mono text-[#5a5b54] leading-relaxed border-t border-[#1e1f1c] pt-4">
          Price data: Binance public API â€” real 15m/1h/4h candles, koi
          approximation nahi. News: gold dot = keyword-based "important" flag
          (SEC, ETF, Fed, hack, etc). Yeh trading advice nahi hai â€” apna risk
          management khud kar.
        </p>
      </div>
    </div>
  );
}
