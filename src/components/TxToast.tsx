import React, { useEffect, useState, useRef } from "react";
import { useTx, TxRecord } from "../context/tx";

const TOAST_TIMEOUT = 10_000; // 10 seconds

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function TxToast() {
  const { txs, removeTx } = useTx();

  if (!txs.length) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-3 max-w-sm">
      {txs.map((tx) => (
        <TxItem key={tx.id} tx={tx} onClose={() => removeTx(tx.id)} />
      ))}
    </div>
  );
}

function TxItem({ tx, onClose }: { tx: TxRecord; onClose: () => void }) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const explorerLink = tx.explorer ? `${tx.explorer.replace(/\/$/, "")}/${tx.hash}` : `https://explorer-evm.blockxnet.com/tx/${tx.hash}`;

  useEffect(() => {
    // Slide in animation
    setIsVisible(true);

    // Start progress countdown
    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, TOAST_TIMEOUT - elapsed);
      const progressPercent = (remaining / TOAST_TIMEOUT) * 100;
      setProgress(progressPercent);

      if (remaining > 0) {
        progressRef.current = setTimeout(updateProgress, 50); // Update every 50ms for smooth animation
      } else {
        onClose();
      }
    };

    progressRef.current = setTimeout(updateProgress, 50);

    // Auto close after timeout
    timeoutRef.current = setTimeout(() => {
      onClose();
    }, TOAST_TIMEOUT);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (progressRef.current) clearTimeout(progressRef.current);
    };
  }, [onClose]);

  const copyHash = async () => {
    try { await navigator.clipboard.writeText(tx.hash); } catch {}
  };

  return (
    <div
      className={`glass-card border border-white/10 rounded-xl shadow-2xl p-4 relative toast-slide-in ${
        isVisible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0'
      }`}
    >
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-black/20 rounded-t-xl overflow-hidden">
        <div
          className="h-full bg-white transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-start gap-3 pt-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-white truncate">{tx.title ?? "Transaction submitted"}</div>
            <div className="text-xs text-white/60">{formatTime(tx.timestamp)}</div>
          </div>

          <div className="mt-2 text-xs text-white/70 break-all font-mono">
            <a className="text-blue-400 hover:text-blue-300 hover:underline transition-colors" href={explorerLink} target="_blank" rel="noopener noreferrer">
              {tx.hash}
            </a>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={copyHash}
              className="glass-button text-xs px-3 py-1.5 rounded-lg text-white hover:bg-white/30 transition-all"
            >
              Copy
            </button>
            <a
              className="glass-button-primary text-xs px-3 py-1.5 rounded-lg hover:opacity-90 transition-all"
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              View
            </a>
            <button
              onClick={onClose}
              className="ml-auto text-xs px-3 py-1.5 text-white/70 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}