"use client";

import * as React from "react";

export function LandingScrollUnlock() {
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflowX = html.style.overflowX;
    const previousHtmlOverflowY = html.style.overflowY;
    const previousHtmlOverscrollY = html.style.overscrollBehaviorY;
    const previousBodyOverflowX = body.style.overflowX;
    const previousBodyOverflowY = body.style.overflowY;
    const previousBodyOverscrollY = body.style.overscrollBehaviorY;

    // Keep one scroll root. `overflow-x: hidden` can implicitly turn the
    // vertical axis into a nested `auto` scroller in Chromium.
    html.style.overflowX = "clip";
    html.style.overflowY = "auto";
    html.style.overscrollBehaviorY = "auto";
    body.style.overflowX = "clip";
    body.style.overflowY = "visible";
    body.style.overscrollBehaviorY = "auto";

    return () => {
      html.style.overflowX = previousHtmlOverflowX;
      html.style.overflowY = previousHtmlOverflowY;
      html.style.overscrollBehaviorY = previousHtmlOverscrollY;
      body.style.overflowX = previousBodyOverflowX;
      body.style.overflowY = previousBodyOverflowY;
      body.style.overscrollBehaviorY = previousBodyOverscrollY;
    };
  }, []);

  return null;
}
