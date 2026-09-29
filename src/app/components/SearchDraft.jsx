"use client";

import { createContext, useContext, useState } from "react";

// Holds the home search box's text in the (home) layout, which stays mounted
// while switching between Search / My articles / Settings — so a half-typed
// search is still there when you come back. Cleared by a full page load.
const SearchDraftContext = createContext(null);

export function SearchDraftProvider({ children }) {
  const draft = useState("");
  return <SearchDraftContext.Provider value={draft}>{children}</SearchDraftContext.Provider>;
}

export function useSearchDraft() {
  const draft = useContext(SearchDraftContext);
  if (!draft) throw new Error("useSearchDraft must be used inside SearchDraftProvider");
  return draft;
}
