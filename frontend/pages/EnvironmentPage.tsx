import React from "react";
import {
  DISCORD_BRIDGE_PRESET,
  ENVIRONMENT_PRESET_GROUPS,
  ENVIRONMENT_PRESETS,
  type EnvironmentPreset,
} from "../features/environment/catalog";
import {
  type DraftEnvironmentVariable,
  type EnvironmentGroup,
  getEnvironmentValue,
  isHiddenEnvironmentKey,
  reorderVisibleEnvironmentRows,
} from "../features/environment/model";
import { Button, QuickAddButton, TextInput } from "../components/controls";
import {
  EditableDropdown,
  SelectField,
  type SelectOption,
} from "../components/dropdowns";
import { useRowDrag } from "../components/useRowDrag";

const ENVIRONMENT_GROUP_OPTIONS = [
  { label: "Custom", value: "Custom" },
  ...ENVIRONMENT_PRESET_GROUPS.map(({ label }) => ({ label, value: label })),
];

function presetForKey(key: string, group?: EnvironmentGroup): EnvironmentPreset | undefined {
  const grouped = ENVIRONMENT_PRESET_GROUPS.find(({ label }) => label === group)?.presets.find(
    (preset) => preset.key === key,
  );
  return grouped ?? ENVIRONMENT_PRESETS.find((preset) => preset.key === key);
}

export function environmentPresetOptions(
  presets: readonly EnvironmentPreset[],
): SelectOption[] {
  const options = presets.map(({ description, key, supportedBy }) => ({
    description: supportedBy?.length
      ? `${supportedBy.map((variant) => `[${variant}]`).join(" ")}\n${description}`
      : description,
    group: supportedBy?.length
      ? supportedBy.length === 1
        ? `Proton-${supportedBy[0]}`
        : "Proton forks — shared"
      : undefined,
    label: key,
    value: key,
  }));

  return [...new Set(options.map(({ group }) => group))].flatMap((group) =>
    options
      .filter((option) => option.group === group)
      .sort((left, right) => left.value.localeCompare(right.value)),
  );
}

export interface EnvironmentPageProps {
  disabled: boolean;
  rows: DraftEnvironmentVariable[];
  setEnvironmentValue(key: string, value: string | null, group?: EnvironmentGroup): void;
  setRows: React.Dispatch<React.SetStateAction<DraftEnvironmentVariable[]>>;
}

export function EnvironmentPage({
  disabled,
  rows,
  setEnvironmentValue,
  setRows,
}: EnvironmentPageProps) {
  const visibleRows = rows.filter(({ key }) => !isHiddenEnvironmentKey(key));
  const discordEnabled =
    getEnvironmentValue(rows, DISCORD_BRIDGE_PRESET.key) === DISCORD_BRIDGE_PRESET.value;
  const updateRow = (id: string, change: Partial<DraftEnvironmentVariable>) => {
    setRows((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    );
  };
  const changeGroup = (row: DraftEnvironmentVariable, group: EnvironmentGroup) => {
    if (group === "Custom") {
      updateRow(row.id, { group });
      return;
    }

    const firstPreset = ENVIRONMENT_PRESET_GROUPS.find(({ label }) => label === group)
      ?.presets[0];
    if (firstPreset) {
      updateRow(row.id, {
        group,
        key: firstPreset.key,
        value: firstPreset.value,
      });
    }
  };
  const drag = useRowDrag(
    visibleRows.map(({ id }) => id),
    (sourceId, targetId, position) => {
      setRows((current) =>
        reorderVisibleEnvironmentRows(current, sourceId, targetId, position),
      );
    },
  );

  return (
    <section>
      <div className="lw-quick-add-section">
        <div className="lw-quick-add-grid">
          <QuickAddButton
            added={discordEnabled}
            disabled={disabled}
            label="Discord Bridge"
            onClick={() =>
              setEnvironmentValue(
                DISCORD_BRIDGE_PRESET.key,
                DISCORD_BRIDGE_PRESET.value,
                "Proton",
              )
            }
            tooltip={`Adds ${DISCORD_BRIDGE_PRESET.key}=${DISCORD_BRIDGE_PRESET.value}. ${DISCORD_BRIDGE_PRESET.description}`}
          />
        </div>
      </div>

      <div className="lw-compact-table">
        {visibleRows.map((row, index) => {
          const group = ENVIRONMENT_PRESET_GROUPS.find(
            ({ label }) => label === row.group,
          );
          const groupPresets: readonly EnvironmentPreset[] = group?.presets ?? [];
          const preset = presetForKey(row.key, row.group);
          return (
            <div
              className="lw-compact-row lw-env-row"
              key={row.id}
              {...drag.rowProps(row.id)}
            >
              <button
                aria-label={`Reorder environment variable ${index + 1}. Use Arrow Up or Arrow Down for keyboard sorting.`}
                className="lw-row-grip"
                disabled={disabled}
                draggable={!disabled}
                title="Drag to reorder; use Arrow Up or Arrow Down for keyboard sorting."
                type="button"
                {...drag.gripProps(row.id)}
              >
                <span aria-hidden>⠿</span>
              </button>

              <SelectField
                ariaLabel={"Environment variable " + (index + 1) + " type"}
                className="lw-env-type"
                disabled={disabled}
                onValueChange={(value) => changeGroup(row, value as EnvironmentGroup)}
                options={ENVIRONMENT_GROUP_OPTIONS}
                value={row.group}
              />

              {row.group === "Custom" ? (
                <TextInput
                  aria-label={"Environment variable " + (index + 1) + " name"}
                  className="lw-env-name"
                  disabled={disabled}
                  onValueChange={(value) => updateRow(row.id, { key: value })}
                  value={row.key}
                />
              ) : (
                <SelectField
                  ariaLabel={"Environment variable " + (index + 1) + " name"}
                  className="lw-env-name"
                  disabled={disabled}
                  onValueChange={(value) => {
                    const nextPreset = groupPresets.find(({ key }) => key === value);
                    if (nextPreset) {
                      updateRow(row.id, {
                        key: nextPreset.key,
                        value: nextPreset.value,
                      });
                    }
                  }}
                  options={environmentPresetOptions(groupPresets)}
                  placeholder="Choose a key…"
                  value={row.key || null}
                />
              )}

              <EditableDropdown
                ariaLabel={"Environment variable " + (index + 1) + " value"}
                className="lw-env-value"
                disabled={disabled}
                onValueChange={(value) => updateRow(row.id, { value })}
                suggestions={preset?.suggestions}
                value={row.value}
              />

              <Button
                aria-label={"Remove environment variable " + (index + 1)}
                className="lw-row-remove"
                disabled={disabled}
                onClick={() =>
                  setRows((current) => current.filter(({ id }) => id !== row.id))
                }
                title="Remove"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="16"
                  viewBox="0 0 16 16"
                  width="16"
                >
                  <path
                    d="M3 4h10M6 4V2.5h4V4m1.5 0-.6 9H5.1l-.6-9M7 6.5v4M9 6.5v4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Button>
            </div>
          );
        })}

        {visibleRows.length === 0 && (
          <div className="lw-compact-empty">No environment variables.</div>
        )}

        <div className="lw-compact-footer">
          <Button
            disabled={disabled}
            onClick={() =>
              setRows((current) => [
                ...current,
                { group: "Custom", id: crypto.randomUUID(), key: "", value: "" },
              ])
            }
          >
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}
