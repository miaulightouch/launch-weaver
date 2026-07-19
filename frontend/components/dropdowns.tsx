import React from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Select } from "@base-ui/react/select";
import { TextInput } from "./controls";
import { DescribedTooltip, joinClasses, usePortalContainer } from "./helpers";

export interface SelectOption {
  description?: string;
  group?: string;
  label: React.ReactNode;
  value: string;
}

export interface SelectFieldProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
  options: readonly SelectOption[];
  placeholder?: string;
  value: string | null;
}

export function SelectField({
  ariaLabel,
  className,
  disabled,
  onValueChange,
  options,
  placeholder = "Choose…",
  value,
}: SelectFieldProps) {
  const [portalContainer, captureOwnerBody] = usePortalContainer();
  const selectedDescription = options.find(
    (option) => option.value === value,
  )?.description;
  const optionGroups = new Map<string | undefined, SelectOption[]>();

  for (const option of options) {
    const group = optionGroups.get(option.group);
    if (group) group.push(option);
    else optionGroups.set(option.group, [option]);
  }

  const renderOption = (option: SelectOption) => (
    <DescribedTooltip
      container={portalContainer}
      content={option.description}
      key={option.value}
    >
      <Select.Item
        aria-label={option.description
          ? `${option.value}. ${option.description}`
          : undefined}
        className="lw-popup-item"
        value={option.value}
      >
        <Select.ItemIndicator aria-hidden className="lw-item-indicator">
          ✓
        </Select.ItemIndicator>
        <Select.ItemText className="lw-item-text">
          {option.label}
        </Select.ItemText>
      </Select.Item>
    </DescribedTooltip>
  );
  const trigger = (
    <Select.Trigger
      aria-label={ariaLabel}
      className={joinClasses("lw-select-trigger", className)}
      ref={captureOwnerBody}
    >
      <Select.Value className="lw-select-value" placeholder={placeholder} />
      <Select.Icon aria-hidden className="lw-select-icon">
        ▾
      </Select.Icon>
    </Select.Trigger>
  );

  return (
    <Select.Root
      disabled={disabled}
      items={options}
      modal={false}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      value={value}
    >
      {selectedDescription ? (
        <DescribedTooltip container={portalContainer} content={selectedDescription}>
          {trigger}
        </DescribedTooltip>
      ) : trigger}
      <Select.Portal container={portalContainer}>
        <Select.Positioner
          align="start"
          alignItemWithTrigger={false}
          className="lw-positioner"
          collisionPadding={8}
          positionMethod="fixed"
          sideOffset={4}
        >
          <Select.Popup className="lw-popup">
            <Select.List className="lw-popup-list">
              {[...optionGroups].map(([group, groupOptions]) =>
                group ? (
                  <Select.Group key={group}>
                    <Select.GroupLabel className="lw-select-group-label">
                      {group}
                    </Select.GroupLabel>
                    {groupOptions.map(renderOption)}
                  </Select.Group>
                ) : (
                  <React.Fragment key="ungrouped">
                    {groupOptions.map(renderOption)}
                  </React.Fragment>
                ),
              )}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export interface EditableDropdownProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  filterSuggestions?: boolean;
  onValueChange(value: string): void;
  suggestions?: readonly string[];
  value: string;
}

export function EditableDropdown({
  ariaLabel,
  className,
  disabled,
  filterSuggestions = true,
  onValueChange,
  suggestions = [],
  value,
}: EditableDropdownProps) {
  const [portalContainer, captureOwnerBody] = usePortalContainer();

  if (suggestions.length === 0) {
    return (
      <TextInput
        aria-label={ariaLabel}
        className={className}
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      />
    );
  }

  return (
    <Autocomplete.Root
      disabled={disabled}
      items={suggestions}
      mode={filterSuggestions ? "list" : "none"}
      onValueChange={onValueChange}
      openOnInputClick
      value={value}
    >
      <Autocomplete.InputGroup className={joinClasses("lw-combobox", className)}>
        <Autocomplete.Input
          aria-label={ariaLabel}
          autoComplete="off"
          className="lw-combobox-input"
          disabled={disabled}
          ref={captureOwnerBody}
        />
        <Autocomplete.Trigger
          aria-label={ariaLabel + " suggestions"}
          className="lw-combobox-trigger"
          disabled={disabled}
        >
          <span aria-hidden>▾</span>
        </Autocomplete.Trigger>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal container={portalContainer}>
        <Autocomplete.Positioner
          align="start"
          className="lw-positioner"
          collisionPadding={8}
          positionMethod="fixed"
          sideOffset={4}
        >
          <Autocomplete.Popup className="lw-popup">
            <Autocomplete.Empty className="lw-popup-empty">
              No matching suggestions.
            </Autocomplete.Empty>
            <Autocomplete.List className="lw-popup-list">
              {(suggestion: string) => (
                <Autocomplete.Item
                  className="lw-popup-item"
                  key={suggestion}
                  value={suggestion}
                >
                  {suggestion}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
