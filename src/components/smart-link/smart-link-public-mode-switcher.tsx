"use client";

import * as React from "react";

type SmartLinkPublicModeSwitcherProps = {
  coverContent: React.ReactNode;
  headerContent: React.ReactNode;
  releaseContent: React.ReactNode;
  newsContent: React.ReactNode;
};

type TabKey = "release" | "news";

export function SmartLinkPublicModeSwitcher({
  coverContent,
  headerContent,
  releaseContent,
  newsContent
}: SmartLinkPublicModeSwitcherProps) {
  const [activeTab, setActiveTab] = React.useState<TabKey>("release");
  const tabs = [
    { key: "release" as const, label: "Релиз" },
    { key: "news" as const, label: "Новости" }
  ];
  const currentContent = activeTab === "news" ? newsContent : releaseContent;

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-center gap-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative inline-flex h-14 items-center justify-center overflow-hidden rounded-[18px] px-8 text-[16px] font-semibold transition-all duration-250 ease-out ${
                active
                  ? "scale-100 bg-[#ff2140] text-white shadow-[0_20px_40px_-24px_rgba(255,33,64,0.72)]"
                  : "bg-black/[0.06] text-[#3c3c3c] hover:-translate-y-0.5 hover:bg-black/[0.08]"
              }`}
              aria-pressed={active}
            >
              <span
                className={`absolute inset-0 transition-opacity duration-250 ${
                  active ? "opacity-100" : "opacity-0"
                } bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0))]`}
              />
              <span className="relative z-[1]">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {coverContent}
      {headerContent}

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
