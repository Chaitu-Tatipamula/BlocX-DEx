import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type TxRecord = {
  id: string;
  hash?: string;
  title?: string;
  explorer?: string; // base url like https://etherscan.io/tx
  timestamp: number;
  type?: 'success' | 'error';
  message?: string;
};

type TxContextValue = {
  txs: TxRecord[];
  addTx: (tx: { hash: string; title?: string; explorer?: string }) => void;
  addError: (error: { title?: string; message: string }) => void;
  removeTx: (id: string) => void;
};

const TxContext = createContext<TxContextValue | undefined>(undefined);

export const TxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [txs, setTxs] = useState<TxRecord[]>(() => {
    try {
      const raw = localStorage.getItem("recentTxs");
      return raw ? (JSON.parse(raw) as TxRecord[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("recentTxs", JSON.stringify(txs));
    } catch {}
  }, [txs]);

  const addTx = useCallback((tx: { hash: string; title?: string; explorer?: string }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const record: TxRecord = {
      id,
      hash: tx.hash,
      title: tx.title,
      explorer: tx.explorer,
      timestamp: Date.now(),
      type: 'success',
    };
    setTxs((s) => [record, ...s].slice(0, 8)); // keep recent 8
  }, []);

  const addError = useCallback((error: { title?: string; message: string }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const record: TxRecord = {
      id,
      title: error.title || 'Error',
      message: error.message,
      timestamp: Date.now(),
      type: 'error',
    };
    setTxs((s) => [record, ...s].slice(0, 8)); // keep recent 8
  }, []);

  const removeTx = useCallback((id: string) => {
    setTxs((s) => s.filter((t) => t.id !== id));
  }, []);

  return <TxContext.Provider value={{ txs, addTx, addError, removeTx }}>{children}</TxContext.Provider>;
};

export function useTx() {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTx must be used within TxProvider");
  return ctx;
}