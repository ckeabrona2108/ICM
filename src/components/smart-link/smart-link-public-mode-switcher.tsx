"use client";

import * as React from "react";

type SmartLinkPublicModeSwitcherProps = {
  coverContent: React.ReactNode;
  headerContent: React.ReactNode;
  releaseContent: React.ReactNode;
  newsContent: React.ReactNode;
  theme?: "dark" | "light";
};

type TabKey = "release" | "news";

export function SmartLinkPublicModeSwitcher({
  coverContent,
  headerContent,
  releaseContent,
  newsContent,
  theme = "dark"
}: SmartLinkPublicModeSwitcherProps) {
  const isLight = theme === "light";
  const [activeTab, setActiveTab] = React.useState<TabKey>("release");
  const tabs = [
    { key: "release" as const, label: "Релиз" },
    { key: "news" as const, label: "Новости" }
  ];
  const currentContent = activeTab === "news" ? newsContent : releaseContent;

  return (
    <div className="space-y-5">
      {coverContent}
      {headerContent}

      {/* Segmented control in the page's quiet style: the active tab is a solid pill, the other is plain text. */}
      <div
        role="tablist"
        aria-label="Раздел страницы"
        className={`mx-auto flex w-fit items-center gap-1 rounded-full border p-1 ${
          isLight ? "border-black/[0.08] bg-black/[0.04]" : "border-white/10 bg-white/[0.06] backdrop-blur-md"
        }`}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`h-9 rounded-full px-5 text-[14px] font-medium transition ${
                active
                  ? isLight
                    ? "bg-[#111114] text-white"
                    : "bg-white text-[#0b0b10]"
                  : isLight
                    ? "text-black/55 hover:text-black/80"
                    : "text-white/60 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div key={activeTab} className="smart-link-tab-enter">
        {currentContent}
      </div>

      <style jsx>{`
        .smart-link-tab-enter {
          animation: smart-link-tab-enter 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes smart-link-tab-enter {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
          }

          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
