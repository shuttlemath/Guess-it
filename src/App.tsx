import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase bootstrap (reads from window.__ENV__ or localStorage) ---
function getEnv(key: string) {
  // @ts-ignore
  if (typeof window !== "undefined" && window.__ENV__ && window.__ENV__[key]) return window.__ENV__[key];
  if (typeof window !== "undefined") return localStorage.getItem(key) || "";
  return "";
}
const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

type Result = null | "win" | "lose";
type Mode = "fun" | "serious";

export default function App() {
  // English UI (LTR)
  useEffect(() => {
    document.documentElement.setAttribute("dir", "ltr");
    return () => document.documentElement.setAttribute("dir", "ltr");
  }, []);

  // Auth
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserEmail(s?.user?.email ?? null);
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  const sendMagicLink = async () => {
    if (!supabase) return alert("Supabase not configured.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) alert(error.message);
    else alert("Sign-in link sent. Check your email.");
  };
  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

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

  // Purchase (NOWPayments placeholder)
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCoins, setBuyCoins] = useState(10);
  const pricePer = 0.99; // USDT per coin
  const total = (buyCoins * pricePer).toFixed(2);
  const [invoice, setInvoice] = useState<{ id: string; address: string | null } | null>(null);
  const [network, setNetwork] = useState<"TRON" | "POLYGON">("TRON");

  const createPayment = async () => {
    const res = await fetch("/api/nowpayments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, amount: Number(total), coins: buyCoins }),
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    else setInvoice({ id: String(data.id), address: data.address || null });
  };

  const checkPayment = async () => {
    if (!invoice) return;
    const res = await fetch(`/api/nowpayments/status?id=${encodeURIComponent(invoice.id)}`);
    const data = await res.json();
    if (data.status === "confirmed") {
      setCoins((c) => c + buyCoins);
      setBuyOpen(false);
      setInvoice(null);
      alert("Payment confirmed. Coins added.");
    } else {
      alert(`Payment status: ${data.status}`);
    }
  };

  const invalidGuess = guess.trim() === "" || Number(guess) < 1 || Number(guess) > 100;

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

          {/* Auth (Magic Link) */}
          <div className="flex items-center justify-between gap-2">
            {userEmail ? (
              <>
                <span className="text-sm text-neutral-600 truncate">Signed in: {userEmail}</span>
                <button onClick={signOut} className="text-sm px-3 py-1 rounded-lg bg-neutral-200">
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex gap-2 w-full">
                <input
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="Email for magic link"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button onClick={sendMagicLink} className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm">
                  Send Link
                </button>
              </div>
            )}
          </div>

          {/* Buy / Withdraw */}
          <div className="grid grid-cols-2 gap-2">
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
          <p className="text-[12px] text-neutral-500">Price per coin: 0.99 USDT.</p>

          {/* Mode select */}
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
                Rules: starting a round costs 1 coin. Fun has 7 guesses (win = coin back). Serious has 6 guesses (win = +2 coins).
              </p>

              <button
                onClick={startGame}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900 text-white font-semibold shadow-lg transition active:scale-[0.98] disabled:opacity-60"
                disabled={coins < 1}
              >
                Start / 🪙1
              </button>
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

          <footer className="pt-2 border-t border-neutral-200 text-[11px] text-neutral-500">
            Built for quick MVP testing. Starts with 50 coins locally.
          </footer>
        </div>
      </div>

      {/* BUY MODAL */}
      {buyOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Buy Coins</h3>
              <button onClick={() => setBuyOpen(false)} className="text-neutral-500 hover:text-neutral-800">✕</button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm">Network</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNetwork("TRON")}
                  className={`px-3 py-2 rounded-lg border ${network === "TRON" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`}
                >
                  TRON (USDT TRC20)
                </button>
                <button
                  onClick={() => setNetwork("POLYGON")}
                  className={`px-3 py-2 rounded-lg border ${network === "POLYGON" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`}
                >
                  Polygon (USDT)
                </button>
              </div>

              <label className="block text-sm">Coins</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={buyCoins}
                onChange={(e) => setBuyCoins(Math.max(1, Number(e.target.value)))}
              />
              <div className="text-sm text-neutral-600">Total: <strong>{total}</strong> USDT</div>

              {!invoice ? (
                <button onClick={createPayment} className="w-full px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold">
                  Create Payment Request
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm">Invoice ID: <span className="font-mono">{invoice.id}</span></div>
                  {invoice.address && (
                    <div className="text-sm break-words">
                      Address / URL: <span className="font-mono">{invoice.address}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {/* ⇩⇩⇩  REPLACED BUTTON  ⇩⇩⇩ */}
                    <button
                      className="px-4 py-2 rounded-xl bg-white border border-neutral-300 text-center"
                      onClick={() => {
                        if (!invoice?.address) return;
                        if (invoice.address.startsWith("http")) {
                          window.open(invoice.address, "_blank");
                        } else {
                          // copy TRC20 address
                          navigator.clipboard.writeText(invoice.address).then(
                            () => alert("Address copied to clipboard.\nSend USDT (TRC20) to this address."),
                            () => alert("Could not copy. Please copy the address manually.")
                          );
                        }
                      }}
                    >
                      {invoice?.address?.startsWith("http") ? "Open Invoice" : "Copy Address"}
                    </button>

                    <button onClick={checkPayment} className="px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold">
                      Mark as Paid (dev)
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
