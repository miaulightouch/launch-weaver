import React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import {
  DescribedTooltip,
  joinClasses,
  usePortalContainer,
} from "./helpers";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ className, type = "button", variant = "secondary", ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={joinClasses("lw-button", "lw-button-" + variant, className)}
      type={type}
    />
  );
}

export function QuickAddButton({
  added,
  disabled,
  label,
  onClick,
  tooltip,
}: {
  added: boolean;
  disabled: boolean;
  label: string;
  onClick(): void;
  tooltip: string;
}) {
  const [portalContainer, captureOwnerBody] = usePortalContainer();

  return (
    <DescribedTooltip container={portalContainer} content={tooltip}>
      <div className="lw-quick-add-trigger" ref={captureOwnerBody}>
        <Button
          aria-label={added
            ? `${label} already added. ${tooltip}`
            : `Add ${label}. ${tooltip}`}
          className="lw-quick-add-button"
          disabled={disabled || added}
          onClick={onClick}
        >
          <span>{label}</span>
          <span aria-hidden>{added ? "✓" : "+"}</span>
        </Button>
      </div>
    </DescribedTooltip>
  );
}

interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "onChange"> {
  className?: string;
  onValueChange(value: string): void;
}

export function TextInput({ className, onValueChange, ...props }: TextInputProps) {
  return (
    <Input
      {...props}
      className={joinClasses("lw-input", className)}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  );
}
