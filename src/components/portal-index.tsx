"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

export type PortalIndexItem = { key: string; href: string; title: string; detail: string; image: string | null; alt: string };

/**
 * What the client will find inside, with the picture of each part beside the
 * list. Pointing at or focusing a row brings its picture forward; on a phone
 * the picture sits above the list.
 */
export function PortalIndex({ items, fallback }: { items: PortalIndexItem[]; fallback: string | null }) {
  const [active, setActive] = useState(items[0]?.key);
  const pictures = items.filter((i) => i.image);
  const shown = items.find((i) => i.key === active)?.image ?? fallback;

  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12 md:gap-6">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#e9e8e5] md:sticky md:top-[12vh] md:col-span-5 md:aspect-[4/5]">
        {pictures.length === 0 && fallback ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fallback} alt="" width={800} height={1000} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {pictures.map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i.key}
            src={i.image!}
            alt={i.alt}
            width={800}
            height={1000}
            loading="lazy"
            aria-hidden={i.image !== shown}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${i.image === shown ? "opacity-100" : "opacity-0"}`}
          />
        ))}
      </div>
      <ul className="md:col-span-6 md:col-start-7">
        {items.map((i) => {
          const on = i.key === active;
          return (
            <li key={i.key}>
              <Link
                href={i.href}
                onMouseEnter={() => setActive(i.key)}
                onFocus={() => setActive(i.key)}
                className="group flex min-h-[88px] items-center gap-4 py-4 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-[clamp(24px,2.4vw,34px)] font-medium leading-tight tracking-[-0.02em] ${on ? "text-text" : "text-muted"}`}>{i.title}</span>
                  <span className="mt-1 block text-base leading-6 text-muted">{i.detail}</span>
                </span>
                <ArrowRight
                  size={22}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={`flex-none transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none ${on ? "text-text" : "text-muted"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
