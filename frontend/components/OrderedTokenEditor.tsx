import React from "react";
import { Button, TextInput } from "./controls";
import { type DropPosition, useRowDrag } from "./useRowDrag";

export type DraftToken = { id: string; originalValue?: string; value: string };

export interface OrderedTokenEditorProps {
  addLabel: string;
  description: string;
  disabled: boolean;
  onAdd(): void;
  reorderable?: boolean;
  rows: DraftToken[];
  setRows: React.Dispatch<React.SetStateAction<DraftToken[]>>;
  singular: string;
  title: string;
}

export function reorderTokenRows(
  rows: DraftToken[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
) {
  if (sourceId === targetId) return rows;

  const sourceIndex = rows.findIndex(({ id }) => id === sourceId);
  if (sourceIndex < 0 || !rows.some(({ id }) => id === targetId)) return rows;

  const next = [...rows];
  const [moved] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex(({ id }) => id === targetId);
  next.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved!);
  return next.every((row, index) => row === rows[index]) ? rows : next;
}

export function OrderedTokenEditor({
  addLabel,
  description,
  disabled,
  onAdd,
  reorderable = true,
  rows,
  setRows,
  singular,
  title,
}: OrderedTokenEditorProps) {
  const drag = useRowDrag(rows.map(({ id }) => id), (sourceId, targetId, position) => {
    setRows((current) => reorderTokenRows(current, sourceId, targetId, position));
  });

  return (
    <section aria-label={title}>
      <div className="lw-section-heading">
        <p>{description}</p>
      </div>

      <div className="lw-compact-table">
        {rows.map((row, index) => (
          <div
            className="lw-compact-row lw-token-row"
            data-static={reorderable ? undefined : ""}
            key={row.id}
            {...drag.rowProps(row.id)}
          >
            {reorderable && (
              <button
                aria-label={`Reorder ${singular.toLowerCase()} ${index + 1}. Use Arrow Up or Arrow Down for keyboard sorting.`}
                className="lw-row-grip"
                disabled={disabled}
                draggable={!disabled}
                title="Drag to reorder; use Arrow Up or Arrow Down for keyboard sorting."
                type="button"
                {...drag.gripProps(row.id)}
              >
                <span aria-hidden>⠿</span>
              </button>
            )}
            <TextInput
              aria-label={singular + " " + (index + 1)}
              disabled={disabled}
              onValueChange={(value) =>
                setRows((current) =>
                  current.map((entry) =>
                    entry.id === row.id ? { ...entry, value } : entry,
                  ),
                )
              }
              value={row.value}
            />
            <Button
              aria-label={"Remove " + singular.toLowerCase() + " " + (index + 1)}
              className="lw-row-remove"
              disabled={disabled}
              onClick={() =>
                setRows((current) => current.filter(({ id }) => id !== row.id))
              }
              title={"Remove " + singular.toLowerCase()}
            >
              ×
            </Button>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="lw-compact-empty">
            No {title.toLowerCase()} configured.
          </div>
        )}

        <div className="lw-compact-footer">
          <Button disabled={disabled} onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}
