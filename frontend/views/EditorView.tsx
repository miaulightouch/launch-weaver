import React from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "../components/controls";
import { Notice } from "../components/layout";
import { isHiddenEnvironmentKey } from "../features/environment/model";
import type { AvailableUpdate } from "../features/update/model";
import {
  EnvironmentPage,
  type EnvironmentPageProps,
} from "../pages/EnvironmentPage";
import {
  OptiscalerPage,
  type OptiscalerPageProps,
} from "../pages/OptiscalerPage";
import {
  ParametersPage,
  type ParametersPageProps,
} from "../pages/ParametersPage";
import { WrappersPage, type WrappersPageProps } from "../pages/WrappersPage";

const TABS = [
  { id: "environment", label: "Environment" },
  { id: "wrappers", label: "Wrappers" },
  { id: "parameters", label: "Parameters" },
  { id: "optiscaler", label: "OptiScaler" },
] as const;

export interface EditorViewProps {
  applying: boolean;
  canApply: boolean;
  close(): void;
  environment: EnvironmentPageProps;
  notice: string | null;
  noticeTone: "error" | "warning" | "info";
  onApply(): void;
  optiscaler?: OptiscalerPageProps;
  context?: React.ReactNode;
  closeLabel?: string;
  parameters: ParametersPageProps;
  update: AvailableUpdate | null;
  wrappers: WrappersPageProps;
}

export function EditorView({
  context,
  closeLabel = "Close",
  applying,
  canApply,
  close,
  environment,
  notice,
  noticeTone,
  onApply,
  optiscaler,
  parameters,
  update,
  wrappers,
}: EditorViewProps) {
  const hiddenEnvironmentCount = environment.rows.filter(({ key }) =>
    !environment.includeHidden && isHiddenEnvironmentKey(key),
  ).length;
  const tabCounts = {
    environment: environment.rows.length - hiddenEnvironmentCount,
    optiscaler: (optiscaler?.rows.length ?? 0) + hiddenEnvironmentCount,
    parameters: parameters.rows.length,
    wrappers: wrappers.rows.length,
  };
  const page = (id: (typeof TABS)[number]["id"], title: string, content: React.ReactNode) => (
    <Tabs.Panel className="lw-page" keepMounted key={id} value={id}>
      <h1 className="lw-page-title">{title}</h1>
      {update && (
        <Notice tone="info">
          LaunchWeaver {update.version} is available. {" "}
          <a href={update.url} rel="noreferrer" target="_blank">View release</a>
        </Notice>
      )}
      {notice && <Notice tone={noticeTone}>{notice}</Notice>}
      {content}
    </Tabs.Panel>
  );

  return (
    <Tabs.Root
      className="lw-shell"
      defaultValue={TABS[0].id}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !applying) {
          event.preventDefault();
          close();
        }
      }}
      orientation="vertical"
    >
      <aside className="lw-sidebar">
        <div className="lw-brand">LaunchWeaver</div>
        {context}
        <Tabs.List activateOnFocus aria-label="LaunchWeaver sections" className="lw-tabs">
          {TABS.filter(({ id }) => id !== "optiscaler" || optiscaler).map(({ id, label }) => {
            const count = tabCounts[id];
            return (
              <Tabs.Tab
                aria-label={
                  count
                    ? `${label}, ${count} configured ${count === 1 ? "item" : "items"}`
                    : label
                }
                className="lw-tab"
                key={id}
                value={id}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span aria-hidden="true" className="lw-tab-count">
                    {count}
                  </span>
                )}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </aside>

      <main className="lw-main">
        {page("environment", "Environment", <EnvironmentPage {...environment} />)}
        {page("wrappers", "Wrappers", <WrappersPage {...wrappers} />)}
        {page("parameters", "Parameters", <ParametersPage {...parameters} />)}
        {optiscaler && page("optiscaler", "OptiScaler", <OptiscalerPage {...optiscaler} />)}

        <footer className="lw-footer">
          <Button disabled={!canApply} onClick={onApply} variant="primary">
            {applying ? "Applying…" : "Apply"}
          </Button>
          <Button disabled={applying} onClick={close}>
            {closeLabel}
          </Button>
        </footer>
      </main>
    </Tabs.Root>
  );
}
