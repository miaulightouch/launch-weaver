import { describe, expect, test } from "bun:test";
import {
  CACHY_OPTISCALER_NAME_SUGGESTIONS,
  customizedOptiscalerRows,
  getOptiscalerChanges,
  getOptiscalerConfigError,
  hasWrappedOptiscalerConfig,
  OPTISCALER_NAME_SUGGESTIONS,
} from "../frontend/features/optiscaler/model";

describe("OptiScaler direct INI model", () => {
  test("distinguishes upstream filenames from Proton-CachyOS injection names", () => {
    expect(OPTISCALER_NAME_SUGGESTIONS).toEqual([
      "dxgi.dll",
      "winmm.dll",
      "d3d12.dll",
      "dbghelp.dll",
      "version.dll",
      "wininet.dll",
      "winhttp.dll",
      "OptiScaler.asi",
    ]);
    expect(CACHY_OPTISCALER_NAME_SUGGESTIONS).toEqual([
      "dxgi.dll",
      "d3d12.dll",
      "dbghelp.dll",
    ]);
  });

  test("detects CONFIG assignments passed through an env wrapper", () => {
    expect(
      hasWrappedOptiscalerConfig([
        "env",
        "PROTON_OPTISCALER_CONFIG=Upscalers.Dx12Upscaler=fsr31",
      ]),
    ).toBe(true);
    expect(hasWrappedOptiscalerConfig(["env", "OTHER=value"])).toBe(false);
  });

  test("allows direct INI values that the removed env grammar could not encode", () => {
    expect(
      getOptiscalerConfigError([
        { section: "Paths", option: "Plugin", value: "C:\\50%=ready;name=a=b" },
      ]),
    ).toBeNull();
    expect(
      getOptiscalerConfigError([
        { section: "General", option: "Enabled", value: "true" },
        { section: "General", option: "enabled", value: "false" },
      ]),
    ).toContain("Duplicate");
  });

  test("rejects values that the INI parser would reinterpret as spacing or comments", () => {
    for (const value of [" leading", "trailing ", ";comment", "#comment", "value ;comment"]) {
      expect(
        getOptiscalerConfigError([{ section: "General", option: "Value", value }]),
      ).toContain("reinterpret");
    }
  });

  test("computes direct set and exact-default remove operations", () => {
    const base = [
      { section: "Upscalers", option: "Dx12", value: "fsr31" },
      { section: "Menu", option: "OverlayMenu", value: "false" },
    ];
    const next = [
      { section: "Upscalers", option: "dx12", value: "dlss" },
      { section: "FSR", option: "Fsr4EnableWatermark", value: "true" },
    ];

    expect(getOptiscalerChanges(base, next)).toEqual([
      { action: "remove", section: "Menu", option: "OverlayMenu" },
      { action: "set", section: "Upscalers", option: "dx12", value: "dlss" },
      { action: "set", section: "FSR", option: "Fsr4EnableWatermark", value: "true" },
    ]);
  });

  test("shows only values customized away from auto by default", () => {
    expect(
      customizedOptiscalerRows([
        { section: "General", option: "Dxgi", value: "auto" },
        { section: "Upscalers", option: "Dx12", value: "FSR31" },
      ]),
    ).toEqual([{ section: "Upscalers", option: "Dx12", value: "FSR31" }]);
  });
});
