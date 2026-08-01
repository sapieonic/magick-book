import { Badge } from "@/components/ui/Badge";
import { categoryMeta, DEFAULT_LEAD_CATEGORY } from "@/lib/constants";

/** Pill tag showing a lead's classification category. */
export function CategoryBadge({
  category,
  className,
  /** When true, hide the muted "Unclassified" pill (useful on dense board cards). */
  hideUnclassified,
}: {
  category?: string | null;
  className?: string;
  hideUnclassified?: boolean;
}) {
  const value = category || DEFAULT_LEAD_CATEGORY;
  if (hideUnclassified && value === DEFAULT_LEAD_CATEGORY) return null;
  const meta = categoryMeta(value);
  return (
    <Badge tint={meta.tint} dot={meta.dot} className={className}>
      {meta.label}
    </Badge>
  );
}
