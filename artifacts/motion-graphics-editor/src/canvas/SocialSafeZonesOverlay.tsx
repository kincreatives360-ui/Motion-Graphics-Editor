import React from "react";
import { Heart, MessageCircle, Share2, Music, Disc } from "lucide-react";

export type SafeZoneMode = "none" | "tiktok-9:16" | "youtube-16:9" | "auto";

interface SocialSafeZonesOverlayProps {
  aspectRatio: "16:9" | "9:16" | "1:1";
  mode: SafeZoneMode;
  width: number;
  height: number;
}

export function SocialSafeZonesOverlay({
  aspectRatio,
  mode,
  width,
  height,
}: SocialSafeZonesOverlayProps) {
  if (mode === "none") return null;

  const isVertical = mode === "tiktok-9:16" || (mode === "auto" && aspectRatio === "9:16");
  const isHorizontal = mode === "youtube-16:9" || (mode === "auto" && aspectRatio === "16:9");

  if (isVertical) {
    const topMargin = height * 0.12; // 12% top header safe margin
    const bottomMargin = height * 0.22; // 22% bottom caption and sound ticker margin
    const rightMargin = Math.min(76, width * 0.18); // 18% right action button column

    return (
      <div
        className="absolute inset-0 pointer-events-none z-20 overflow-hidden font-sans select-none"
        data-testid="social-safe-zones-overlay"
      >
        {/* Top Header Margin (Following / For You tabs, Search) */}
        <div
          className="absolute left-0 right-0 top-0 bg-[#000000]/30 border-b border-dashed border-[#f43f5e]/70 flex items-center justify-between px-3 text-[9px] font-mono text-[#fda4af]"
          style={{ height: `${topMargin}px` }}
        >
          <span className="bg-[#881337]/80 px-1.5 py-0.5 rounded border border-[#f43f5e]/50">
            Top Bar & Navigation (Unsafe)
          </span>
          <span className="opacity-80">12% Height</span>
        </div>

        {/* Right Interaction Column (Profile, Like, Comments, Bookmark, Share, Music Disc) */}
        <div
          className="absolute right-0 top-0 bottom-0 bg-[#000000]/25 border-l border-dashed border-[#f43f5e]/70 flex flex-col items-center justify-end pb-24 gap-3 text-[#fca5a5]"
          style={{ width: `${rightMargin}px` }}
        >
          <div className="flex flex-col items-center gap-1 opacity-70">
            <div className="w-6 h-6 rounded-full border border-[#f43f5e] bg-[#881337]/60 flex items-center justify-center">
              <span className="text-[8px] font-bold">Av</span>
            </div>
            <Heart size={14} className="text-[#f43f5e]" />
            <span className="text-[7px] font-mono">Like</span>
            <MessageCircle size={14} className="text-[#f43f5e]" />
            <span className="text-[7px] font-mono">Chat</span>
            <Share2 size={14} className="text-[#f43f5e]" />
            <span className="text-[7px] font-mono">Share</span>
            <Disc size={16} className="text-[#f43f5e] animate-spin" />
          </div>
        </div>

        {/* Bottom Caption & Audio Zone */}
        <div
          className="absolute left-0 right-0 bottom-0 bg-[#000000]/35 border-t border-dashed border-[#f43f5e]/70 flex flex-col justify-end p-3 text-[8.5px] text-[#fda4af]"
          style={{ height: `${bottomMargin}px` }}
        >
          <div className="space-y-1 max-w-[70%]">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-white">@creator</span>
              <span className="bg-[#881337]/80 px-1 py-0.2 rounded text-[7px] border border-[#f43f5e]/40">
                Follow
              </span>
            </div>
            <p className="text-[7.5px] text-[#cbd5e1] line-clamp-2">
              Captions, hashtags, subtitles & sound title appear here. Keep essential typography above this line.
            </p>
            <div className="flex items-center gap-1 text-[7px] text-[#93c5fd]">
              <Music size={8} />
              <span>Original Audio - Raylight Cinematic Sound</span>
            </div>
          </div>
        </div>

        {/* Central Safe Frame */}
        <div
          className="absolute border border-[#38bdf8] border-dashed rounded bg-[#0284c7]/5 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.15)]"
          style={{
            top: `${topMargin}px`,
            bottom: `${bottomMargin}px`,
            left: "12px",
            right: `${rightMargin}px`,
          }}
        >
          <span className="bg-[#0b131f]/85 border border-[#38bdf8]/60 text-[#38bdf8] text-[8.5px] font-mono px-2 py-0.5 rounded shadow-sm">
            Safe Visual Center (TikTok / Reels / Shorts)
          </span>
        </div>
      </div>
    );
  }

  if (isHorizontal) {
    // 16:9 Title Safe (90%) and Action Safe (93%)
    const titleMarginX = width * 0.05;
    const titleMarginY = height * 0.05;
    const actionMarginX = width * 0.035;
    const actionMarginY = height * 0.035;

    return (
      <div
        className="absolute inset-0 pointer-events-none z-20 font-sans select-none"
        data-testid="youtube-safe-zones-overlay"
      >
        {/* Action Safe (93%) */}
        <div
          className="absolute border border-dashed border-[#eab308]/60 rounded pointer-events-none"
          style={{
            left: `${actionMarginX}px`,
            right: `${actionMarginX}px`,
            top: `${actionMarginY}px`,
            bottom: `${actionMarginY}px`,
          }}
        >
          <span className="absolute top-1 left-1.5 text-[7px] font-mono text-[#eab308] bg-[#422006]/80 px-1 py-0.2 rounded border border-[#eab308]/40">
            Action Safe (93%)
          </span>
        </div>

        {/* Title Safe (90%) */}
        <div
          className="absolute border border-dashed border-[#38bdf8]/75 rounded pointer-events-none"
          style={{
            left: `${titleMarginX}px`,
            right: `${titleMarginX}px`,
            top: `${titleMarginY}px`,
            bottom: `${titleMarginY}px`,
          }}
        >
          <span className="absolute top-1 left-1.5 text-[7px] font-mono text-[#38bdf8] bg-[#0c2738]/80 px-1 py-0.2 rounded border border-[#38bdf8]/40">
            Title & Typography Safe (90%)
          </span>
        </div>
      </div>
    );
  }

  return null;
}
