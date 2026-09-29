"use client";

import { useEffect } from "react";
import { endAnonymousSession } from "../../lib/auth-client";

// Rendered by the root layout in place of the page when the visitor's
// anonymous session is from a previous browser session: deletes it, then
// reloads as a fresh visitor. The server already treats the session as gone.
export default function EndStaleAnonymousSession() {
  useEffect(() => {
    endAnonymousSession().finally(() => {
      // Their article pages no longer exist for this visitor
      const onArticle = window.location.pathname.startsWith("/article/");
      window.location.replace(onArticle ? "/" : window.location.href);
    });
  }, []);

  return null;
}
