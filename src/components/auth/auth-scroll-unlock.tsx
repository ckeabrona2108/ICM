"use client";

import * as React from "react";

export function AuthScrollUnlock() {
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflowY = html.style.overflowY;
    const previousBodyOverflowY = body.style.overflowY;
    const previousBodyPosition = body.style.position;

    html.style.overflowY = "auto";
    body.style.overflowY = "auto";
    body.style.position = "static";

    return () => {
      html.style.overflowY = previousHtmlOverflowY;
      body.style.overflowY = previousBodyOverflowY;
      body.style.position = previousBodyPosition;
    };
  }, []);

  return null;
}
