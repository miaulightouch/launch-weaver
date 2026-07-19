import React from "react";

export function FieldCard({
  children,
  description,
  label,
  layout = "inline",
}: {
  children?: React.ReactNode;
  description: React.ReactNode;
  label: React.ReactNode;
  layout?: "inline" | "stacked";
}) {
  const descriptionId = React.useId();
  const labelId = React.useId();

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={labelId}
      className={"lw-card lw-card-" + layout}
      role="group"
    >
      <div className="lw-card-copy">
        <div className="lw-card-title" id={labelId}>
          {label}
        </div>
        <div className="lw-card-description" id={descriptionId}>
          {description}
        </div>
      </div>
      {children && <div className="lw-card-control">{children}</div>}
    </div>
  );
}

export function Notice({
  children,
  tone = "warning",
}: {
  children: React.ReactNode;
  tone?: "error" | "info" | "warning";
}) {
  return (
    <div
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="lw-notice"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
