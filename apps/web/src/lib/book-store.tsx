"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { BookOut, PageOut } from "./api";

interface BookStore {
  book: BookOut | null;
  /** True once the initial localStorage read has completed, so consumers can tell
   *  "no book yet, still hydrating" apart from "hydrated and genuinely empty". */
  hydrated: boolean;
  setBook: (book: BookOut | null) => void;
  updateBook: (partial: Partial<BookOut>) => void;
  /**
   * Merge one or more updated pages into the current book by id, leaving all
   * other pages untouched. Use this (instead of updateBook with a full `pages`
   * array) when applying the result of a single per-page operation, so a stale
   * whole-book snapshot from a concurrent request can't clobber sibling pages.
   */
  mergePages: (pages: PageOut[]) => void;
}

const BookStoreContext = createContext<BookStore>({
  book: null,
  hydrated: false,
  setBook: () => {},
  updateBook: () => {},
  mergePages: () => {},
});

const STORAGE_KEY = "sb_current_book";

export function BookProvider({ children }: { children: ReactNode }) {
  const [book, setBookState] = useState<BookOut | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setBookState(JSON.parse(raw));
    } catch {}
    setHydrated(true);
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

  const mergePages = useCallback((updatedPages: PageOut[]) => {
    if (updatedPages.length === 0) return;
    setBookState((prev) => {
      if (!prev) return prev;
      const byId = new Map(updatedPages.map((p) => [p.id, p]));
      const pages = prev.pages.map((p) => byId.get(p.id) ?? p);
      const next = { ...prev, pages };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <BookStoreContext.Provider value={{ book, hydrated, setBook, updateBook, mergePages }}>
      {children}
    </BookStoreContext.Provider>
  );
}

export function useBook() {
  return useContext(BookStoreContext);
}
