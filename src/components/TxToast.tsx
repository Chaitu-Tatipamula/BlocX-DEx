import React, { useEffect } from "react";
import { useTx, TxRecord } from "../context/tx";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function TxToast() {
  const { txs, removeTx } = useTx();

  useEffect(() => {
    const timers = txs.map((t) => setTimeout(() => removeTx(t.id), 45_000));
    return () => timers.forEach(clearTimeout);
  }, [txs, removeTx]);

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
  const explorerLink = tx.explorer ? `${tx.explorer.replace(/\/$/, "")}/${tx.hash}` : `https://explorer-evm.blockxnet.com/tx/${tx.hash}`;

  const copyHash = async () => {
    try { await navigator.clipboard.writeText(tx.hash); } catch {}
  };

  return (
    <div className="bg-slate-900/95 border border-white/5 text-slate-100 rounded-lg shadow-lg p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium truncate">{tx.title ?? "Transaction submitted"}</div>
            <div className="text-xs text-slate-400">{formatTime(tx.timestamp)}</div>
          </div>

          <div className="mt-2 text-xs text-slate-300 break-all">
            <a className="text-sky-400 hover:underline" href={explorerLink} target="_blank" rel="noopener noreferrer">
              {tx.hash}
            </a>
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={copyHash} className="text-xs px-2 py-1 bg-slate-800/60 hover:bg-slate-800 rounded-md text-slate-200">Copy</button>
            <a className="text-xs px-2 py-1 bg-sky-600/90 hover:bg-sky-600 rounded-md text-white" href={explorerLink} target="_blank" rel="noopener noreferrer">View</a>
            <button onClick={onClose} className="ml-auto text-xs px-2 py-1 bg-transparent text-slate-400 hover:text-slate-200">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}