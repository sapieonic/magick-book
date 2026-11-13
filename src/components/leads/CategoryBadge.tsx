import { Tag } from "@/components/ui/Badge";
import { DEFAULT_LEAD_CATEGORY, formatCategoryLabel } from "@/lib/constants";

/** A lead's classification category, drawn as the kit's square outline `Tag`. */
export function CategoryBadge({
  category,
  className,
  /** When true, render nothing for "Unclassified" (dense board cards). */
  hideUnclassified,
}: {
  category?: string | null;
  className?: string;
  hideUnclassified?: boolean;
}) {
  const value = category || DEFAULT_LEAD_CATEGORY;
  if (hideUnclassified && value === DEFAULT_LEAD_CATEGORY) return null;
  return <Tag className={className}>{formatCategoryLabel(value)}</Tag>;
}
