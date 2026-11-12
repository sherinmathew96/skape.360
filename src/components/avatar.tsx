/** A person's initial on a pale tint of their own hue, stable per name. */
export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.46),
        background: `hsl(${hash} 45% 91%)`,
        color: `hsl(${hash} 45% 24%)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
