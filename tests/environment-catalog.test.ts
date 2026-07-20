import { describe, expect, test } from "bun:test";
import {
  DISCORD_BRIDGE_PRESET,
  ENVIRONMENT_PRESET_GROUPS,
  ENVIRONMENT_PRESETS,
  type EnvironmentPreset,
} from "../frontend/features/environment/catalog";
import { environmentPresetOptions } from "../frontend/pages/EnvironmentPage";

describe("environment preset catalog", () => {
  test("keeps catalog data valid without prescribing its contents", () => {
    expect(ENVIRONMENT_PRESET_GROUPS.map(({ label }) => label)).toEqual([
      "DXVK",
      "VKD3D",
      "Proton",
    ]);

    const keys = ENVIRONMENT_PRESETS.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))).toBe(true);
    expect(ENVIRONMENT_PRESETS.every(({ description }) => description.length > 0)).toBe(true);

    for (const { suggestions, value } of ENVIRONMENT_PRESETS) {
      if (!suggestions) continue;
      expect(suggestions).toContain(value);
      expect(new Set(suggestions).size).toBe(suggestions.length);
      expect(suggestions.every(Boolean)).toBe(true);
    }
  });

  test("keeps Discord quick-add separate from OptiScaler controls", () => {
    expect(DISCORD_BRIDGE_PRESET).toMatchObject({
      key: "PROTON_DISCORD_BRIDGE",
      value: "1",
    });
    expect(ENVIRONMENT_PRESETS).toContainEqual(
      expect.objectContaining({ key: DISCORD_BRIDGE_PRESET.key }),
    );

    const keys = new Set(ENVIRONMENT_PRESETS.map(({ key }) => key));
    expect(keys.has("PROTON_USE_OPTISCALER")).toBe(false);
    expect(keys.has("PROTON_OPTISCALER_NAME")).toBe(false);
    expect(keys.has("PROTON_OPTISCALER_CONFIG")).toBe(false);
  });

  test("sorts ENV names and spells out Proton fork support", () => {
    const presets = [
      {
        description: "GE option Z",
        key: "Z_GE",
        supportedBy: ["GE"],
        value: "1",
      },
      {
        description: "Shared option",
        key: "SHARED",
        supportedBy: ["GE", "EM", "CachyOS"],
        value: "1",
      },
      {
        description: "GE option A",
        key: "A_GE",
        supportedBy: ["GE"],
        value: "1",
      },
    ] as const satisfies readonly EnvironmentPreset[];
    const options = environmentPresetOptions(presets);

    expect(options.map(({ value }) => value)).toEqual(["A_GE", "Z_GE", "SHARED"]);
    expect(options[0]).toMatchObject({
      description: "[Proton-GE]\nGE option A",
      group: "Proton-GE",
    });
    expect(options[2]).toMatchObject({
      description:
        "[Proton-GE] [Proton-EM] [Proton-CachyOS]\nShared option",
      group: "Proton forks — shared",
    });
  });
});
