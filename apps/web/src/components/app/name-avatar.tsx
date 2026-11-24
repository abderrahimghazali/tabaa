import { Avatar, type AvatarProps } from "@/components/base/avatar/avatar";

const COLORS = ["blue", "lime", "pink", "neutral"] as const;

export function initialsOf(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** BoardUI Avatar with initials and a tint picked deterministically from the name. */
export function NameAvatar({ name, size = "md", ...props }: { name: string } & Omit<AvatarProps, "initials" | "color" | "src">) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <Avatar size={size} color={COLORS[h % COLORS.length]} initials={initialsOf(name)} aria-hidden {...props} />;
}
