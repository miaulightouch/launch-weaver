import React from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "../components/controls";
import { Notice } from "../components/layout";
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
  noticeTone: "error" | "warning";
  onApply(): void;
  optiscaler: OptiscalerPageProps;
  parameters: ParametersPageProps;
  wrappers: WrappersPageProps;
}

export function EditorView({
  applying,
  canApply,
  close,
  environment,
  notice,
  noticeTone,
  onApply,
  optiscaler,
  parameters,
  wrappers,
}: EditorViewProps) {
  const page = (id: (typeof TABS)[number]["id"], title: string, content: React.ReactNode) => (
    <Tabs.Panel className="lw-page" keepMounted key={id} value={id}>
      <h1 className="lw-page-title">{title}</h1>
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
        <div className="lw-brand">LAUNCHWEAVER</div>
        <Tabs.List activateOnFocus aria-label="LaunchWeaver sections" className="lw-tabs">
          {TABS.map(({ id, label }) => (
            <Tabs.Tab className="lw-tab" key={id} value={id}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </aside>

      <main className="lw-main">
        {page("environment", "Environment", <EnvironmentPage {...environment} />)}
        {page("wrappers", "Wrappers", <WrappersPage {...wrappers} />)}
        {page("parameters", "Parameters", <ParametersPage {...parameters} />)}
        {page("optiscaler", "OptiScaler", <OptiscalerPage {...optiscaler} />)}

        <footer className="lw-footer">
          <Button disabled={!canApply} onClick={onApply} variant="primary">
            {applying ? "Applying…" : "Apply"}
          </Button>
          <Button disabled={applying} onClick={close}>
            Close
          </Button>
        </footer>
      </main>
    </Tabs.Root>
  );
}
