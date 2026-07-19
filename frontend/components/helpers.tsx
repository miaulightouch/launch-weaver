import React from "react";
import { Tooltip } from "@base-ui/react/tooltip";

export const joinClasses = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(" ");

export function usePortalContainer() {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const captureOwnerBody = React.useCallback((node: HTMLElement | null) => {
    const next = node?.ownerDocument.body ?? null;
    setContainer((current) => current === next ? current : next);
  }, []);
  return [container, captureOwnerBody] as const;
}

export function DescribedTooltip({
  children,
  container,
  content,
}: {
  children: React.ReactElement;
  container: HTMLElement | null;
  content?: string;
}) {
  const actionsRef = React.useRef<Tooltip.Root.Actions>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const setTriggerRef = React.useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!container || !open) return;
    const close = (event: Event) => {
      const scrollContainer = event.target as Node | null;
      if (scrollContainer?.contains(triggerRef.current)) {
        actionsRef.current?.close();
      }
    };
    const ownerDocument = container.ownerDocument;
    ownerDocument.addEventListener("scroll", close, true);
    return () => ownerDocument.removeEventListener("scroll", close, true);
  }, [container, open]);

  if (!content) return children;

  return (
    <Tooltip.Root
      actionsRef={actionsRef}
      disableHoverablePopup
      onOpenChange={setOpen}
    >
      <Tooltip.Trigger delay={350} ref={setTriggerRef} render={children} />
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner
          className="lw-positioner"
          collisionPadding={8}
          positionMethod="fixed"
          sideOffset={6}
        >
          <Tooltip.Popup className="lw-tooltip-popup">{content}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
