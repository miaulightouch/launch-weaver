import React from "react";
import {
  type DraftToken,
  OrderedTokenEditor,
} from "../components/OrderedTokenEditor";
import { QuickAddButton } from "../components/controls";
import {
  hasQuickParameter,
  QUICK_PARAMETERS,
} from "../features/parameters/model";

export interface ParametersPageProps {
  disabled: boolean;
  rows: DraftToken[];
  setRows: React.Dispatch<React.SetStateAction<DraftToken[]>>;
}

export function ParametersPage({
  disabled,
  rows,
  setRows,
}: ParametersPageProps) {
  return (
    <>
      <section aria-label="Quick parameters" className="lw-quick-add-section">
        <div className="lw-section-heading">
          <p>Each button adds its argument to the parameter list below.</p>
        </div>
        <div className="lw-quick-add-grid">
          {QUICK_PARAMETERS.map(({ description, label, value }) => (
            <QuickAddButton
              added={hasQuickParameter(rows, value)}
              disabled={disabled}
              key={value}
              label={label}
              onClick={() => setRows((current) => [
                ...current,
                { id: crypto.randomUUID(), value },
              ])}
              tooltip={description}
            />
          ))}
        </div>
      </section>

      <OrderedTokenEditor
        addLabel="Add parameter"
        description="One game argument per row. Spaces stay inside that argument; an empty row passes an empty argument."
        disabled={disabled}
        rows={rows}
        setRows={setRows}
        singular="Parameter"
        title="Parameters"
      />
    </>
  );
}
