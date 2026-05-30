import { avatarTint, initials, cn } from "@/lib/utils";

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const { bg, fg } = avatarTint(name || "?");
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}
