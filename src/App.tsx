import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase bootstrap (reads from window.__ENV__ or localStorage) ---
function getEnv(key: string) {
  // @ts-ignore
  if (typeof window !== "undefined" && (window as any).__ENV__ && (window as any).__ENV__[key]) return (window as any).__ENV__[key];
  if (typeof window !== "undefined") return localStorage.getItem(key) || "";
  return "";
}
const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

type Result = null | "win" | "lose";
type Mode = "fun" | "serious";

const PRICE_PER = 0.99;   // USDT per coin
const MIN_COINS = 13;     // minimum coins to buy per order

export default function App() {
  // English UI (LTR)
  useEffect(() => {
    document.documentElement.setAttribute("dir", "ltr");
    return () => document.documentElement.setAttribute("dir", "ltr");
  }, []);

  // (Auth wiring is kept for future; UI hidden)
  useEffect(() => {
    if (!supabase) return;
    // warm up session silently (no UI now)
    supabase.auth.getUser().catch(() => {});
  }, []);

  // Game state
  const [coins, setCoins] = useState<number>(() => {
    const saved = localStorage.getItem("coins");
    return saved ? Number(saved) : 50; // start 50 for testing
  });
  useEffect(() => localStorage.setItem("coins", String(coins)), [coins]);

  const [mode, setMode] = useState<Mode>("fun");
  const [inGame, setInGame] = useState(false);
  const [secret, setSecret] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [guesses, setGuesses] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result>(null);

  const maxTries = useMemo(() => (mode === "fun" ? 7 : 6), [mode]);

  const startGame = () => {
    if (inGame) return;
    if (coins < 1) return setMessage("You need at least 1 coin to start.");
    setCoins((c) => c - 1);
    setInGame(true);
    setSecret(Math.floor(Math.random() * 100) + 1);
    setGuesses([]);
    setGuess("");
    setMessage("");
    setResult(null);
  };

  const endGame = (didWin: boolean) => {
    if (didWin) {
      setResult("win");
      setMessage(`Congrats! Correct number was ${secret}. You win!`);
      setCoins((c) => (mode === "fun" ? c + 1 : c + 2));
    } else {
      setResult("lose");
      setMessage(`You lost! Correct number was ${secret}.`);
    }
    setInGame(false);
  };

  const submitGuess = () => {
    if (!inGame || secret == null) return;
    const n = parseInt(String(guess));
    if (isNaN(n) || n < 1 || n > 100) return;
    if (guesses.includes(n)) {
      setMessage("You already guessed that.");
      return;
    }
    const next = [...guesses, n];
    setGuesses(next);

    if (n === secret) return endGame(true);

    const remaining = maxTries - next.length;
    setMessage(n < secret ? "Go higher!" : "Go lower!");
    if (remaining <= 0) endGame(false);
    setGuess("");
  };

  const newRound = () => {
    setInGame(false);
    setSecret(null);
    setGuesses([]);
    setGuess("");
    setMessage("");
    setResult(null);
  };

  // History groups (green=lower than target on top/right, red=higher on bottom/left)
  const lowers = useMemo(
    () => (secret == null ? [] : guesses.filter((g) => g < secret).sort((a, b) => a - b)),
    [guesses, secret]
  );
  const highers = useMemo(
    () => (secret == null ? [] : guesses.filter((g) => g > secret).sort((a, b) => a - b)),
    [guesses, secret]
  );

  // Purchase (TRON only)
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCoins, setBuyCoins] = useState<number>(MIN_COINS); // default 13
  const total = useMemo(() => Number((buyCoins * PRICE_PER).toFixed(2)), [buyCoins]);
  const meetsMin = buyCoins >= MIN_COINS;

  const [invoice, setInvoice] = useState<{ id: string; address: string | null } | null>(null);
  const [polling, setPolling] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; kind: "info" | "success" | "error" } | null>(null);

  const sanitizeCoins = (v: string) => {
    // only natural numbers
    const n = Math.max(1, Math.floor(Number(v)));
    return Number.isFinite(n) ? n : 1;
  };

  const createPayment = async () => {
    const res = await fetch("/api/nowpayments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: "TRON", amount: Number(total), coins: buyCoins }),
    });
    const data = await res.json();
    if (data.error) {
      setStatusMsg({
        text: typeof data.details === "object" ? JSON.stringify(data.details) : String(data.error),
        kind: "error",
      });
    } else {
      setInvoice({ id: String(data.id), address: data.address || null });
      setLastStatus("pending");
      setLastCheckedAt(null);
      setStatusMsg({ text: "Invoice created. Awaiting payment…", kind: "info" });
    }
  };

  const checkPayment = async () => {
    if (!invoice) return;
    try {
      setChecking(true);
      const res = await fetch(`/api/nowpayments/status?id=${encodeURIComponent(invoice.id)}`);
      const data = await res.json();
      const status = data.status || "pending";
      setLastStatus(status);
      setLastCheckedAt(new Date().toLocaleTimeString());

      if (status === "confirmed") {
        setCoins((c) => c + buyCoins);
        setStatusMsg({ text: "Payment confirmed. Coins added 🎉", kind: "success" });
        setMessage("Payment confirmed. Coins added.");
        setTimeout(() => {
          setBuyOpen(false);
          setInvoice(null);
          setPolling(false);
          setStatusMsg(null);
        }, 1200);
      } else if (status === "failed") {
        setStatusMsg({ text: "Payment failed or expired. Please try again.", kind: "error" });
      } else {
        setStatusMsg({ text: `Status: ${status}. We’ll keep checking automatically.`, kind: "info" });
      }
    } catch (e: any) {
      setStatusMsg({ text: e?.message || "Network error while checking status.", kind: "error" });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (invoice) {
      setPolling(true);
      const immediate = setTimeout(checkPayment, 1500);
      const iv = setInterval(checkPayment, 30000); // every 30s
      return () => {
        clearTimeout(immediate);
        clearInterval(iv);
      };
    } else {
      setPolling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

  const invalidGuess = guess.trim() === "" || Number(guess) < 1 || Number(guess) > 100;

  const isHttpLike = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
  const isWalletAddress = (s?: string | null) => !!s && !isHttpLike(s); // TRON T...

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white shadow-xl rounded-2xl p-5 sm:p-6 space-y-4">
          <header className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold">🎯 Guess It</h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Coins</span>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">🪙 {coins}</span>
            </div>
          </header>

          {/* Mode select + Start */}
          {!inGame && !result && (
            <>
              <div className="bg-neutral-100 p-2 rounded-xl grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("fun")}
                  className={`px-3 py-3 rounded-lg font-semibold transition active:scale-[0.98] border ${
                    mode === "fun" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-800 border-neutral-300"
                  }`}
                >
                  😇 Fun
                </button>
                <button
                  onClick={() => setMode("serious")}
                  className={`px-3 py-3 rounded-lg font-semibold transition active:scale-[0.98] border ${
                    mode === "serious" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-800 border-neutral-300"
                  }`}
                >
                  😈 Serious
                </button>
              </div>

              <p className="text-sm text-neutral-500 leading-6">
                Rules: start costs 1 coin. Fun: 7 guesses (win = coin back). Serious: 6 guesses (win = +2 coins).
              </p>

              <button
                onClick={startGame}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900 text-white font-semibold shadow-lg transition active:scale-[0.98] disabled:opacity-60"
                disabled={coins < 1}
              >
                Start / 🪙1
              </button>

              {/* Buy / Withdraw under Start (hidden during game) */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => setBuyOpen(true)}
                  className="w-full px-4 py-2 rounded-xl bg-white border border-neutral-300 text-neutral-800 font-semibold shadow-sm"
                >
                  Buy Coins
                </button>
                <button
                  className="w-full px-4 py-2 rounded-xl bg-white border border-neutral-300 text-neutral-800 font-semibold shadow-sm"
                  disabled
                >
                  Withdraw (soon)
                </button>
              </div>
              <p className="text-[12px] text-neutral-500">Price per coin: {PRICE_PER.toFixed(2)} USDT (TRON).</p>
            </>
          )}

          {/* Game form */}
          {inGame && (
            <div className="space-y-3">
              <div className="text-sm text-neutral-600">
                {mode === "fun" ? "Fun" : "Serious"} / Max guesses: <strong>{maxTries}</strong>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !(guess.trim()==="" || Number(guess)<1 || Number(guess)>100) && submitGuess()}
                  className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="Enter a number 1–100"
                />
                <button
                  onClick={submitGuess}
                  disabled={invalidGuess}
                  className="px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold shadow disabled:opacity-50 active:scale-[0.98]"
                >
                  Guess
                </button>
              </div>
              <p className="text-sm min-h-6 text-neutral-700">{message}</p>

              {(lowers.length > 0 || highers.length > 0) && (
                <div className="space-y-3">
                  {/* Top/right: lower-than-target (go higher) */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[12px] font-semibold text-emerald-700 mb-2">Lower than target (go higher)</div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      {lowers.map((g, i) => (
                        <span key={`l-${i}`} className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-sm">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Bottom/left: higher-than-target (go lower) */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <div className="text-[12px] font-semibold text-rose-700 mb-2">Higher than target (go lower)</div>
                    <div className="flex flex-wrap gap-2 justify-start">
                      {highers.map((g, i) => (
                        <span key={`h-${i}`} className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-800 text-sm">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* remaining after first guess */}
              {guesses.length > 1 && (
                <div className="text-xs text-neutral-500 mt-2">Remaining: {Math.max(0, maxTries - guesses.length)}</div>
              )}
            </div>
          )}

          {/* Result */}
          {result && !inGame && (
            <div className="space-y-3">
              <div className={`rounded-xl p-4 ${result === "win" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {message}
              </div>
              <button
                onClick={newRound}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900 text-white font-semibold shadow-lg active:scale-[0.98]"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BUY MODAL */}
      {buyOpen && !inGame && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Buy Coins</h3>
              <button onClick={() => setBuyOpen(false)} className="text-neutral-500 hover:text-neutral-800">✕</button>
            </div>

            <div className="space-y-3">
              <div className="text-sm text-neutral-600">
                Network: <span className="font-medium">TRON (USDT TRC20)</span>
              </div>

              <label className="block text-sm">Coins</label>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                pattern="[0-9]*"
                value={buyCoins}
                onChange={(e) => setBuyCoins(sanitizeCoins(e.target.value))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              />
              <div className="text-sm text-neutral-600">
                Total: <strong>{total.toFixed(2)}</strong> USDT
              </div>

              {!meetsMin && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3">
                  Minimum purchase is <strong>{MIN_COINS}</strong> coins.
                </div>
              )}

              {!invoice ? (
                <button
                  onClick={createPayment}
                  disabled={!meetsMin}
                  className={`w-full px-4 py-2 rounded-xl text-white font-semibold ${
                    meetsMin ? "bg-neutral-900" : "bg-neutral-400 cursor-not-allowed"
                  }`}
                >
                  Create Payment Request
                </button>
              ) : (
                <PurchaseDetails
                  invoice={invoice}
                  statusMsg={statusMsg}
                  setStatusMsg={setStatusMsg}
                  checkPayment={checkPayment}
                  checking={checking}
                  polling={polling}
                  lastStatus={lastStatus}
                  lastCheckedAt={lastCheckedAt}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Small presentational block for invoice details (keeps App clean) ---
function PurchaseDetails({
  invoice,
  statusMsg,
  setStatusMsg,
  checkPayment,
  checking,
  polling,
  lastStatus,
  lastCheckedAt,
}: {
  invoice: { id: string; address: string | null };
  statusMsg: { text: string; kind: "info" | "success" | "error" } | null;
  setStatusMsg: (v: { text: string; kind: "info" | "success" | "error" } | null) => void;
  checkPayment: () => Promise<void>;
  checking: boolean;
  polling: boolean;
  lastStatus: string | null;
  lastCheckedAt: string | null;
}) {
  const isHttpLike = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
  const isWalletAddress = (s?: string | null) => !!s && !isHttpLike(s);

  return (
    <div className="space-y-3">
      {statusMsg && (
        <div
          className={[
            "rounded-lg p-3 text-sm",
            statusMsg.kind === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : statusMsg.kind === "error"
              ? "bg-rose-50 text-rose-700 border border-rose-200"
              : "bg-neutral-50 text-neutral-700 border border-neutral-200",
          ].join(" ")}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="text-sm">
        Invoice ID: <span className="font-mono">{invoice.id}</span>
      </div>

      {invoice.address && (
        <>
          <div className="text-sm break-words flex items-start gap-2">
            <div className="flex-1">
              {isWalletAddress(invoice.address) ? "Payment address" : "Invoice URL"}:{" "}
              <span className="font-mono">{invoice.address}</span>
            </div>
            {/* Copy icon */}
            {isWalletAddress(invoice.address) && (
              <button
                onClick={() =>
                  navigator.clipboard.writeText(invoice.address!).then(
                    () => setStatusMsg({ text: "Address copied. Send USDT (TRC20) to this address.", kind: "info" }),
                    () => setStatusMsg({ text: "Could not copy. Please copy the address manually.", kind: "error" })
                  )
                }
                className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50"
                title="Copy address"
              >
                📋
              </button>
            )}
          </div>

          {/* QR */}
          {isWalletAddress(invoice.address) && (
            <div className="flex items-center justify-center">
              <img
                className="rounded-xl border border-neutral-200 p-2"
                alt="QR"
                width={180}
                height={180}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(invoice.address)}`}
              />
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Smart Open/Copy */}
        <button
          className="px-4 py-2 rounded-xl bg-white border border-neutral-300 text-center"
          onClick={() => {
            if (!invoice?.address) return;
            if (isHttpLike(invoice.address)) {
              window.open(invoice.address, "_blank");
            } else {
              navigator.clipboard.writeText(invoice.address).then(
                () => setStatusMsg({ text: "Address copied. Send USDT (TRC20) to this address.", kind: "info" }),
                () => setStatusMsg({ text: "Could not copy. Please copy the address manually.", kind: "error" })
              );
            }
          }}
        >
          {isHttpLike(invoice?.address) ? "Open Invoice" : "Copy Address"}
        </button>

        {/* Check status now */}
        <button
          onClick={checkPayment}
          disabled={checking}
          className={`px-4 py-2 rounded-xl text-white font-semibold ${
            checking ? "bg-neutral-700 opacity-80" : "bg-neutral-900"
          }`}
        >
          {checking ? "Checking…" : "Check status now"}
        </button>
      </div>

      <div className="text-[12px] text-neutral-500">
        {polling ? "Auto-checking every 30s." : "Auto-check stopped."}
        {lastStatus && (
          <>
            {" "}Status: <span className="font-medium">{lastStatus}</span>
            {lastCheckedAt && <> — last check: {lastCheckedAt}</>}
          </>
        )}
      </div>
    </div>
  );
}
