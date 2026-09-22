import { Button, cn } from "@repo/ui";
import { COLUMN_HEADER } from "./chat-shell";

/**
 * The bar at the top of a side panel, below `lg`, where the panel covers the
 * conversation and needs a way back to it. From `lg` up the panel sits
 * alongside and this is hidden — there is nothing to close.
 */
export function PanelHeader({
  title,
  onClose,
  closeTestId,
}: {
  title: string;
  onClose: () => void;
  closeTestId: string;
}) {
  return (
    <div
      className={cn(
        COLUMN_HEADER,
        "flex items-center justify-between gap-2 px-4 lg:hidden",
      )}
    >
      <span className="truncate font-medium">{title}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        data-testid={closeTestId}
      >
        Close
      </Button>
    </div>
  );
}
