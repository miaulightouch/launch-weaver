import React from "react";
import {
  type DraftToken,
  OrderedTokenEditor,
} from "../components/OrderedTokenEditor";

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
    <OrderedTokenEditor
      addLabel="Add parameter"
      description="One game argument per row. Spaces stay inside that argument; an empty row passes an empty argument."
      disabled={disabled}
      onAdd={() =>
        setRows((current) => [
          ...current,
          { id: crypto.randomUUID(), value: "" },
        ])
      }
      rows={rows}
      setRows={setRows}
      singular="Parameter"
      title="Parameters"
    />
  );
}
