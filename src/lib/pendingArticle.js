"use client";

// Hands a ready-to-write article request from the search page to
// /article/new across a client-side navigation. Module state survives that
// navigation but not a reload, so a reloaded /article/new can't silently start
// (and pay for) a second generation.
const pending = new Map();

export function setPendingArticle(request) {
  const id = crypto.randomUUID();
  pending.set(id, request);
  return id;
}

export function peekPendingArticle(id) {
  return pending.get(id) ?? null;
}

export function clearPendingArticle(id) {
  pending.delete(id);
}
