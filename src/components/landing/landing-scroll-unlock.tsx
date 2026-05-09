"use client";

import * as React from "react";

export function LandingScrollUnlock() {
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflowX = html.style.overflowX;
    const previousHtmlOverflowY = html.style.overflowY;
    const previousBodyOverflowX = body.style.overflowX;
    const previousBodyOverflowY = body.style.overflowY;

    html.style.overflowX = "hidden";
    html.style.overflowY = "auto";
    body.style.overflowX = "hidden";
    body.style.overflowY = "auto";

    return () => {
      html.style.overflowX = previousHtmlOverflowX;
      html.style.overflowY = previousHtmlOverflowY;
      body.style.overflowX = previousBodyOverflowX;
      body.style.overflowY = previousBodyOverflowY;
    };
  }, []);

  return null;
}
