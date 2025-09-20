import React from "react";

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow p-6 space-y-4 text-center">
        <h1 className="text-2xl font-bold">🎯 Guess It — MVP</h1>
        <p className="text-neutral-600">
          Build is working! Next: add game UI + payments.
        </p>
        <a
          href="https://github.com/shuttlemath/Guess-it"
          className="inline-block px-4 py-2 rounded-xl bg-neutral-900 text-white"
        >
          Repo
        </a>
      </div>
    </div>
  );
}
