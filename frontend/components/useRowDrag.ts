import React from "react";

export type DropPosition = "after" | "before";

export function useRowDrag(
  rowIds: string[],
  reorder: (sourceId: string, targetId: string, position: DropPosition) => void,
) {
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const draggedIdRef = React.useRef<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{
    id: string;
    position: DropPosition;
  } | null>(null);

  const finish = () => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
  };
  const positionAt = (event: React.DragEvent<HTMLElement>): DropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  return {
    gripProps(id: string) {
      return {
        onDragEnd: finish,
        onDragStart(event: React.DragEvent<HTMLButtonElement>) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
          draggedIdRef.current = id;
          setDraggedId(id);
        },
        onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? -1 : 1;
          const targetId = rowIds[rowIds.indexOf(id) + direction];
          if (targetId) reorder(id, targetId, direction === 1 ? "after" : "before");
        },
      };
    },
    rowProps(id: string) {
      return {
        "data-dragging": draggedId === id ? "" : undefined,
        "data-drop-position": dropTarget?.id === id ? dropTarget.position : undefined,
        onDragOver(event: React.DragEvent<HTMLElement>) {
          const sourceId = draggedIdRef.current;
          if (!sourceId) return;
          event.preventDefault();
          if (sourceId === id) {
            event.dataTransfer.dropEffect = "none";
            setDropTarget(null);
            return;
          }
          event.dataTransfer.dropEffect = "move";
          const position = positionAt(event);
          setDropTarget((current) =>
            current?.id === id && current.position === position
              ? current
              : { id, position },
          );
        },
        onDrop(event: React.DragEvent<HTMLElement>) {
          const sourceId = draggedIdRef.current;
          if (!sourceId) return;
          event.preventDefault();
          if (sourceId !== id) reorder(sourceId, id, positionAt(event));
          finish();
        },
      };
    },
  };
}
