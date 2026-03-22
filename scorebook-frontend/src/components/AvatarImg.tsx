"use client";

import { useState } from "react";

type Props = {
  src: string | null | undefined;
  name: string;
  className?: string;
  ringClassName?: string;
};

/** Avatar with initials fallback when URL missing or image fails to load (broken CDN, etc.). */
export default function AvatarImg({ src, name, className = "w-9 h-9", ringClassName = "ring-1 ring-white/10" }: Props) {
  const [failed, setFailed] = useState(false);
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  if (!src || failed) {
    return (
      <div
        className={`${className} rounded-full bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-400 shrink-0`}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={`${className} rounded-full object-cover shrink-0 ${ringClassName}`}
      onError={() => setFailed(true)}
    />
  );
}
