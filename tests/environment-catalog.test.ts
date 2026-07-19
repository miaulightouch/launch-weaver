import { describe, expect, test } from "bun:test";
import {
  DISCORD_BRIDGE_PRESET,
  ENVIRONMENT_PRESET_GROUPS,
  ENVIRONMENT_PRESETS,
} from "../frontend/features/environment/catalog";
import { environmentPresetOptions } from "../frontend/pages/EnvironmentPage";

describe("environment preset catalog", () => {
  test("contains the requested upstream groups", () => {
    expect(ENVIRONMENT_PRESET_GROUPS.map(({ label }) => label)).toEqual([
      "DXVK",
      "VKD3D",
      "Proton",
    ]);
  });

  test("contains valid, globally unique, documented entries", () => {
    const keys = ENVIRONMENT_PRESETS.map(({ key }) => key);

    expect(keys.length).toBeGreaterThan(100);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))).toBe(true);
    expect(ENVIRONMENT_PRESETS.every(({ description }) => description.length > 0)).toBe(true);
    expect(ENVIRONMENT_PRESET_GROUPS.every(({ source }) => source.startsWith("https://github.com/"))).toBe(
      true,
    );
    expect(
      ENVIRONMENT_PRESET_GROUPS.every(({ sources }) =>
        (sources ?? []).every((source) => source.startsWith("https://github.com/")),
      ),
    ).toBe(true);
    for (const { presets } of ENVIRONMENT_PRESET_GROUPS) {
      expect(new Set(presets.map(({ key }) => key)).size).toBe(presets.length);
    }
  });

  test("covers representative current keys from every upstream list", () => {
    const keys = new Set(ENVIRONMENT_PRESETS.map(({ key }) => key));

    for (const key of [
      "DXVK_DEBUG",
      "DXVK_LOG_PATH",
      "VK_INSTANCE_LAYERS",
      "VKD3D_SHADER_DUMP_PATH",
      "VKD3D_SHADER_OVERRIDE",
      "VKD3D_AUTO_CAPTURE_SHADER",
      "VKD3D_AUTO_CAPTURE_COUNTS",
      "VKD3D_SHADER_DEBUG_RING_SIZE_LOG2",
      "VKD3D_DESCRIPTOR_QA_LOG",
      "VKD3D_SWAPCHAIN_PRESENT_MODE",
      "VKD3D_TEST_PLATFORM",
      "PROTON_WAIT_ATTACH",
      "PROTON_FORCE_LARGE_ADDRESS_AWARE",
      "WINE_FULLSCREEN_INTEGER_SCALING",
      "PROTON_DUMP_DEBUG_COMMANDS",
      "PROTON_USE_WINED3D11",
      "PROTON_FSR4_RDNA3_UPGRADE",
      "PROTON_ADD_CONFIG",
      "FSR4_UPGRADE",
      "DXIL_SPIRV_CONFIG",
      "PROTON_MLFG_UPGRADE",
      "PROTON_FSR4_INDICATOR",
      "PROTON_NVIDIA_NVOPTIX",
      "PROTON_USE_PIPEWIRE",
      "ENABLE_HDR_WSI",
      "PROTON_NO_STEAMINPUT",
      "WINE_AUDIO_DRIVER",
    ]) {
      expect(keys.has(key)).toBe(true);
    }
  });

  test("keeps editable value suggestions valid and useful", () => {
    for (const preset of ENVIRONMENT_PRESETS) {
      if (!preset.suggestions) continue;

      expect(preset.suggestions).toContain(preset.value);
      expect(new Set(preset.suggestions).size).toBe(preset.suggestions.length);
      expect(preset.suggestions.every((value) => value.length > 0)).toBe(true);
    }

    expect(ENVIRONMENT_PRESETS.find(({ key }) => key === "DXVK_LOG_LEVEL")?.suggestions).toEqual([
      "none",
      "error",
      "warn",
      "info",
      "debug",
    ]);
    expect(ENVIRONMENT_PRESETS.find(({ key }) => key === "DXVK_HUD")?.suggestions).toEqual(
      expect.arrayContaining(["devinfo", "scale=1.5", "opacity=0.8"]),
    );
    expect(ENVIRONMENT_PRESETS.find(({ key }) => key === "DXVK_LOG_PATH")?.suggestions).toEqual([
      "none",
    ]);
    expect(ENVIRONMENT_PRESETS.find(({ key }) => key === "VKD3D_CONFIG")?.suggestions).toEqual(
      expect.arrayContaining([
        "pipeline_library_app_cache",
        "breadcrumbs",
        "descriptor_qa_checks",
      ]),
    );
    expect(ENVIRONMENT_PRESETS.find(({ key }) => key === "VKD3D_DEBUG")?.suggestions).toEqual([
      "none",
      "err",
      "info",
      "fixme",
      "warn",
      "trace",
    ]);
    const proton = ENVIRONMENT_PRESET_GROUPS.find(({ label }) => label === "Proton")!;
    expect(proton.presets.find(({ key }) => key === "WINE_FULLSCREEN_FSR_STRENGTH")?.suggestions).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(proton.presets.find(({ key }) => key === "PROTON_ADD_CONFIG")?.suggestions).toEqual([
      "sdlinput",
      "fsr4",
      "fsr4rdna3",
      "hdr",
      "wayland",
      "wow64",
      "nontsync",
    ]);
  });

  test("exposes Discord as a quick ENV preset and leaves OptiScaler to its tab", () => {
    expect(DISCORD_BRIDGE_PRESET).toMatchObject({
      key: "PROTON_DISCORD_BRIDGE",
      value: "1",
    });
    expect(ENVIRONMENT_PRESETS.some(({ key }) => key === DISCORD_BRIDGE_PRESET.key)).toBe(true);

    const keys = new Set(ENVIRONMENT_PRESETS.map(({ key }) => key));
    expect(keys.has("PROTON_USE_OPTISCALER")).toBe(false);
    expect(keys.has("PROTON_OPTISCALER_NAME")).toBe(false);
    expect(keys.has("PROTON_OPTISCALER_CONFIG")).toBe(false);
  });

  test("merges fork switches into Proton while annotating support", () => {
    const groupKeys = (label: string) =>
      new Set(
        ENVIRONMENT_PRESET_GROUPS.find((group) => group.label === label)?.presets.map(
          ({ key }) => key,
        ) ?? [],
      );
    const proton = groupKeys("Proton");

    for (const forkOnly of [
      "PROTON_NO_ESYNC",
      "PROTON_ENABLE_HDR",
      "PROTON_ADD_CONFIG",
      "PROTON_DXVK_SAREK",
      "PROTON_FSR4_UPGRADE",
    ]) {
      expect(proton.has(forkOnly)).toBe(true);
    }

    const protonGroup = ENVIRONMENT_PRESET_GROUPS.find(({ label }) => label === "Proton")!;
    const support = (key: string) => protonGroup.presets.find((preset) => preset.key === key)?.supportedBy;
    expect(support("PROTON_LOG")).toBeUndefined();
    expect(support("PROTON_NO_ESYNC")).toEqual(["GE"]);
    expect(support("PROTON_USE_SECCOMP")).toEqual(["GE"]);
    expect(support("PROTON_ENABLE_HDR")).toEqual(["GE", "EM"]);
    expect(support("PROTON_ADD_CONFIG")).toEqual(["EM"]);
    expect(support("PROTON_DXVK_SAREK")).toEqual(["CachyOS"]);
    expect(support("PROTON_FSR4_UPGRADE")).toEqual(["GE", "EM", "CachyOS"]);

    for (const [group, key] of [
      ["DXVK", "DXVK_HDR"],
      ["DXVK", "ENABLE_HDR_WSI"],
      ["VKD3D", "DXIL_SPIRV_CONFIG"],
    ]) {
      expect(groupKeys(group).has(key)).toBe(true);
      expect(proton.has(key)).toBe(false);
    }

    expect(
      Object.fromEntries(
        protonGroup.presets
          .filter(({ key }) => !key.startsWith("PROTON_"))
          .map(({ key, supportedBy }) => [key, supportedBy ?? []]),
      ),
    ).toEqual({
      COPYPREFIX: ["GE"],
      DXVK_NO_HDR: ["GE", "EM", "CachyOS"],
      DXVK_NVAPI_VKREFLEX: ["CachyOS"],
      FNA3D_FORCE_DRIVER: [],
      FSR4_UPGRADE: ["GE", "EM", "CachyOS"],
      GST_GL_WINDOW: [],
      HOST_LC_ALL: [],
      LOW_LATENCY_LAYER: ["CachyOS"],
      WAYLANDDRV_PRIMARY_MONITOR: ["GE", "EM", "CachyOS"],
      WAYLANDDRV_RAWINPUT: ["GE", "EM", "CachyOS"],
      WINEALSA_CHANNELS: ["GE", "CachyOS"],
      WINEALSA_SPATIAL: ["GE", "CachyOS"],
      WINE_AUDIO_DRIVER: ["CachyOS"],
      WINE_BLOCK_HOSTS: ["GE", "CachyOS"],
      WINE_DISABLE_VULKAN_OPWR: [],
      WINE_DO_NOT_CREATE_DXGI_DEVICE_MANAGER: [],
      WINE_FULLSCREEN_FSR: ["GE", "CachyOS"],
      WINE_FULLSCREEN_FSR_CUSTOM_MODE: ["GE", "CachyOS"],
      WINE_FULLSCREEN_FSR_STRENGTH: ["GE", "CachyOS"],
      WINE_FULLSCREEN_INTEGER_SCALING: [],
      WINE_USE_KWIN_HACKS: [],
    });
  });

  test("groups and sorts ENV names without duplicating their values", () => {
    const proton = ENVIRONMENT_PRESET_GROUPS.find(({ label }) => label === "Proton")!;
    const options = environmentPresetOptions(proton.presets);

    expect([...new Set(options.flatMap(({ group }) => group ? [group] : []))]).toEqual([
      "Proton forks — shared",
      "Proton-GE",
      "Proton-EM",
      "Proton-CachyOS",
    ]);
    expect(options.find(({ value }) => value === "PROTON_LOG")?.group).toBeUndefined();
    expect(options.find(({ value }) => value === "PROTON_FSR4_UPGRADE")?.group).toBe(
      "Proton forks — shared",
    );
    expect(options.find(({ value }) => value === "PROTON_ADD_CONFIG")?.group).toBe("Proton-EM");
    expect(new Set(options.map(({ value }) => value)).size).toBe(options.length);

    for (const { presets } of ENVIRONMENT_PRESET_GROUPS) {
      const groupOptions = environmentPresetOptions(presets);
      for (const optionGroup of new Set(groupOptions.map(({ group }) => group))) {
        const names = groupOptions
          .filter(({ group }) => group === optionGroup)
          .map(({ value }) => value);
        expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
      }
    }
  });
});
