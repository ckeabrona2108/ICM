"use client";

import * as React from "react";

export function AuthScrollUnlock() {
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverflowY = html.style.overflowY;
    const previousHtmlHeight = html.style.height;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverflowY = body.style.overflowY;
    const previousBodyHeight = body.style.height;
    const previousBodyPosition = body.style.position;

    html.style.overflow = "hidden";
    html.style.overflowY = "hidden";
    html.style.height = "100dvh";
    body.style.overflow = "hidden";
    body.style.overflowY = "hidden";
    body.style.height = "100dvh";
    body.style.position = "relative";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.overflowY = previousHtmlOverflowY;
      html.style.height = previousHtmlHeight;
      body.style.overflow = previousBodyOverflow;
      body.style.overflowY = previousBodyOverflowY;
      body.style.height = previousBodyHeight;
      body.style.position = previousBodyPosition;
    };
  }, []);

  return null;
}
