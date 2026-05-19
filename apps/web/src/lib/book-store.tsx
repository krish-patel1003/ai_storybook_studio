"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { BookOut } from "./api";

interface BookStore {
  book: BookOut | null;
  setBook: (book: BookOut | null) => void;
  updateBook: (partial: Partial<BookOut>) => void;
}

const BookStoreContext = createContext<BookStore>({
  book: null,
  setBook: () => {},
  updateBook: () => {},
});

const STORAGE_KEY = "sb_current_book";

export function BookProvider({ children }: { children: ReactNode }) {
  const [book, setBookState] = useState<BookOut | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setBookState(JSON.parse(raw));
    } catch {}
  }, []);

  const setBook = useCallback((b: BookOut | null) => {
    setBookState(b);
    if (b) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch {}
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const updateBook = useCallback((partial: Partial<BookOut>) => {
    setBookState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <BookStoreContext.Provider value={{ book, setBook, updateBook }}>
      {children}
    </BookStoreContext.Provider>
  );
}

export function useBook() {
  return useContext(BookStoreContext);
}
