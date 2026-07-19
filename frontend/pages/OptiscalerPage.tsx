import React from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import {
  type DraftEnvironmentVariable,
  type EnvironmentGroup,
  getEnvironmentValue,
  OPTISCALER_ENABLE_KEY,
  OPTISCALER_NAME_KEY,
} from "../features/environment/model";
import {
  CACHY_OPTISCALER_NAME_SUGGESTIONS,
  OPTISCALER_NAME_SUGGESTIONS,
  optiscalerRowKey,
  type OptiscalerConfigRow,
  type OptiscalerDocument,
} from "../features/optiscaler/model";
import { Button } from "../components/controls";
import { EditableDropdown, SelectField } from "../components/dropdowns";
import { FieldCard, Notice } from "../components/layout";

export type AppActivity = "running" | "stopped" | "unknown";
export type OptiscalerLoadStatus = "checking" | "ready" | "unavailable";
export type DraftOptiscalerConfigRow = OptiscalerConfigRow & { id: string };

export interface OptiscalerPageProps {
  activity: AppActivity;
  disabled: boolean;
  document: OptiscalerDocument | null;
  environmentRows: DraftEnvironmentVariable[];
  launchDisabled: boolean;
  loadMessage: string | null;
  loadStatus: OptiscalerLoadStatus;
  resetRequested: boolean;
  rows: DraftOptiscalerConfigRow[];
  setEnvironmentValue(key: string, value: string | null, group?: EnvironmentGroup): void;
  setResetRequested(value: boolean): void;
  setRows: React.Dispatch<React.SetStateAction<DraftOptiscalerConfigRow[]>>;
}

export function OptiscalerPage({
  activity,
  disabled,
  document,
  environmentRows,
  launchDisabled,
  loadMessage,
  loadStatus,
  resetRequested,
  rows,
  setEnvironmentValue,
  setResetRequested,
  setRows,
}: OptiscalerPageProps) {
  const titleId = React.useId();
  const enableValue = getEnvironmentValue(environmentRows, OPTISCALER_ENABLE_KEY);
  const enabled = enableValue !== undefined && enableValue !== "0";
  const name = getEnvironmentValue(environmentRows, OPTISCALER_NAME_KEY) ?? "";
  const unsupportedName =
    name.length > 0 && !OPTISCALER_NAME_SUGGESTIONS.includes(
      name as (typeof OPTISCALER_NAME_SUGGESTIONS)[number],
    );
  const upstreamOnlyName =
    name.length > 0 &&
    !unsupportedName &&
    !CACHY_OPTISCALER_NAME_SUGGESTIONS.includes(
      name as (typeof CACHY_OPTISCALER_NAME_SUGGESTIONS)[number],
    );
  const configDisabled = disabled || resetRequested || loadStatus !== "ready" || !document;
  const resetBlockReason = (() => {
    if (loadStatus === "checking") return "Reading the installed OptiScaler.ini…";
    if (loadStatus === "unavailable" || !document) {
      return "The installed OptiScaler.ini could not be resolved.";
    }
    if (activity === "running") return "Close the game before resetting OptiScaler.ini.";
    return null;
  })();
  const resetAvailabilityNote =
    activity === "unknown" && loadStatus === "ready"
      ? "Steam activity is unavailable here; the backend will verify that the game is stopped."
      : null;
  const usedKeys = new Set(rows.map(optiscalerRowKey));
  const availableRows =
    document?.rows.filter((row) => !usedKeys.has(optiscalerRowKey(row))) ?? [];

  const updateRow = (id: string, change: Partial<DraftOptiscalerConfigRow>) => {
    setRows((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    );
  };

  const changeSection = (row: DraftOptiscalerConfigRow, section: string) => {
    const candidate =
      row.section === section
        ? row
        : availableRows.find((entry) => entry.section === section);
    if (candidate) updateRow(row.id, { ...candidate });
  };

  const changeOption = (row: DraftOptiscalerConfigRow, option: string) => {
    const candidate =
      row.option === option
        ? row
        : availableRows.find(
            (entry) => entry.section === row.section && entry.option === option,
          );
    if (candidate) updateRow(row.id, { ...candidate });
  };

  return (
    <section aria-describedby={titleId}>
      <p className="lw-page-description" id={titleId}>
        Manage injection variables and directly edit this game's installed OptiScaler.ini.
      </p>

      <div className="lw-stack">
        <FieldCard
          description="Enable OptiScaler; an existing nonzero version pin is preserved."
          label="Enable OptiScaler"
        >
          <BaseSwitch.Root
            aria-label="Toggle OptiScaler"
            className="lw-switch"
            checked={enabled}
            disabled={launchDisabled}
            onCheckedChange={(checked) => {
              if (!checked) {
                setEnvironmentValue(OPTISCALER_ENABLE_KEY, null);
              } else if (enableValue === undefined || enableValue === "0") {
                setEnvironmentValue(OPTISCALER_ENABLE_KEY, "1");
              }
              if (checked && !name) {
                setEnvironmentValue(OPTISCALER_NAME_KEY, OPTISCALER_NAME_SUGGESTIONS[0]);
              }
            }}
          >
            <BaseSwitch.Thumb className="lw-switch-thumb" />
          </BaseSwitch.Root>
        </FieldCard>

        <FieldCard
          description={
            unsupportedName
              ? "Custom filename; it is not in OptiScaler's current official supported-name list."
              : name === "OptiScaler.asi"
                ? "Supported by upstream OptiScaler and requires a compatible x64 ASI loader."
                : upstreamOnlyName
                  ? "Supported by upstream OptiScaler; Proton-CachyOS injection currently documents dxgi.dll, d3d12.dll, and dbghelp.dll."
                  : "Type any filename or choose an officially documented suggestion."
          }
          label="Injection filename"
          layout="stacked"
        >
          <EditableDropdown
            ariaLabel="OptiScaler injection filename"
            disabled={launchDisabled}
            filterSuggestions={false}
            onValueChange={(value) =>
              setEnvironmentValue(OPTISCALER_NAME_KEY, value.length ? value : null)
            }
            suggestions={OPTISCALER_NAME_SUGGESTIONS}
            value={name}
          />
        </FieldCard>
      </div>

      <header className="lw-section-heading">
        <h2>Direct INI editor</h2>
        <p>
          Only existing INI options can be selected. Apply preserves comments and spacing;
          removing a row restores that option's exact-version default.
        </p>
      </header>

      {loadStatus === "checking" && (
        <Notice tone="info">Reading the installed OptiScaler.ini…</Notice>
      )}

      {loadStatus === "unavailable" && (
        <Notice tone="error">
          {loadMessage ?? "The installed OptiScaler.ini is unavailable."}
        </Notice>
      )}

      {document && loadStatus === "ready" && (
        <FieldCard
          description={
            document.path +
            (document.snapshot.exists ? "" : " · OptiScaler.ini is missing")
          }
          label={"OptiScaler " + document.snapshot.version}
        >
          <span>{document.rows.length + " options"}</span>
        </FieldCard>
      )}

      {document && loadStatus === "ready" ? (
        <div className="lw-stack">
          {rows.map((row, index) => (
            <FieldCard
              description={"[" + row.section + "]"}
              key={row.id}
              label={row.option}
              layout="stacked"
            >
              <div>
                <div className="lw-controls">
                  <span className="lw-label">Section</span>
                  <SelectField
                    ariaLabel={"OptiScaler setting " + (index + 1) + " section"}
                    disabled={configDisabled}
                    onValueChange={(value) => changeSection(row, value)}
                    options={[
                      ...new Set([
                        row.section,
                        ...availableRows.map(({ section }) => section),
                      ]),
                    ].map((section) => ({ label: section, value: section }))}
                    value={row.section}
                  />

                  <span className="lw-label">Option</span>
                  <SelectField
                    ariaLabel={"OptiScaler setting " + (index + 1) + " option"}
                    disabled={configDisabled}
                    onValueChange={(value) => changeOption(row, value)}
                    options={[row, ...availableRows]
                      .filter((entry) => entry.section === row.section)
                      .map(({ option }) => ({ label: option, value: option }))}
                    value={row.option}
                  />

                  <span className="lw-label">Value</span>
                  <EditableDropdown
                    ariaLabel={"OptiScaler setting " + (index + 1) + " value"}
                    disabled={configDisabled}
                    onValueChange={(value) => updateRow(row.id, { value })}
                    suggestions={["auto", "true", "false", "0", "1"]}
                    value={row.value}
                  />
                </div>

                <div className="lw-actions">
                  <Button
                    disabled={configDisabled}
                    onClick={() =>
                      setRows((current) => current.filter(({ id }) => id !== row.id))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </FieldCard>
          ))}

          {rows.length === 0 && (
            <FieldCard
              description="Add an existing INI option to change it from auto."
              label="No custom settings"
            />
          )}

          <FieldCard
            description="Choose another existing OptiScaler.ini option."
            label="Add setting"
          >
            <Button
              disabled={configDisabled || availableRows.length === 0}
              onClick={() => {
                const first = availableRows[0];
                if (first) {
                  setRows((current) => [
                    ...current,
                    { ...first, id: crypto.randomUUID() },
                  ]);
                }
              }}
            >
              Add
            </Button>
          </FieldCard>
        </div>
      ) : null}

      <header className="lw-section-heading">
        <h2>Maintenance</h2>
        <p>Restore the exact installed-version defaults while keeping a backup.</p>
      </header>
      <div className="lw-stack">
        <FieldCard
          description={
            resetRequested
              ? "Pending: restore the installed default and back up the current file."
              : resetBlockReason ??
                resetAvailabilityNote ??
                "The reset is performed when you Apply changes."
          }
          label="Reset OptiScaler.ini"
        >
          <Button
            disabled={disabled || (!resetRequested && Boolean(resetBlockReason))}
            onClick={() => setResetRequested(!resetRequested)}
          >
            {resetRequested ? "Keep current file" : "Reset on Apply"}
          </Button>
        </FieldCard>
      </div>
    </section>
  );
}
