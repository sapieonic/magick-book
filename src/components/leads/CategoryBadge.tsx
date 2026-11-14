import { Tag } from "@/components/ui/Badge";
import { DEFAULT_LEAD_CATEGORY, formatCategoryLabel } from "@/lib/constants";

/** A lead's classification category, drawn as the kit's square outline `Tag`. */
export function CategoryBadge({ category }: { category?: string | null }) {
  return <Tag>{formatCategoryLabel(category || DEFAULT_LEAD_CATEGORY)}</Tag>;
}
