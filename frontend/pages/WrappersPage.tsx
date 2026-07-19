import React from "react";
import {
  type DraftToken,
  OrderedTokenEditor,
} from "../components/OrderedTokenEditor";
import { QuickAddButton } from "../components/controls";
import {
  hasQuickWrapper,
  QUICK_WRAPPERS,
  type QuickWrapper,
} from "../features/wrappers/model";

export interface WrappersPageProps {
  disabled: boolean;
  rows: DraftToken[];
  setRows: React.Dispatch<React.SetStateAction<DraftToken[]>>;
}

export function WrappersPage({
  disabled,
  rows,
  setRows,
}: WrappersPageProps) {
  const addWrapper = (value: QuickWrapper) => {
    setRows((current) => {
      if (hasQuickWrapper(current, value)) return current;
      return [...current, { id: crypto.randomUUID(), value }];
    });
  };
  return (
    <>
      <section aria-label="Quick wrappers" className="lw-quick-add-section">
        <div className="lw-section-heading">
          <p>Each button adds its executable to the wrapper list below.</p>
        </div>
        <div className="lw-quick-add-grid">
          {QUICK_WRAPPERS.map(({ description, label, value }) => {
            const added = hasQuickWrapper(rows, value);
            return (
              <QuickAddButton
                added={added}
                disabled={disabled}
                key={value}
                label={label}
                onClick={() => addWrapper(value)}
                tooltip={description}
              />
            );
          })}
        </div>
      </section>

      <OrderedTokenEditor
        addLabel="Add wrapper"
        description="One wrapper command per row. Arguments may follow the executable; quote an argument to keep its spaces."
        disabled={disabled}
        onAdd={() =>
          setRows((current) => [
            ...current,
            { id: crypto.randomUUID(), value: "" },
          ])
        }
        reorderable={false}
        rows={rows}
        setRows={setRows}
        singular="Wrapper"
        title="Wrappers"
      />
    </>
  );
}
