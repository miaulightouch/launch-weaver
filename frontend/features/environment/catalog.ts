import { DXVK_PRESETS } from "./presets/dxvk";
import { PROTON_PRESETS, DISCORD_BRIDGE_PRESET } from "./presets/proton";
import { VKD3D_PRESETS } from "./presets/vkd3d";

type ProtonExtraVariant = "GE" | "EM" | "CachyOS";

// Catalog sources: DXVK README/dxvk.conf and Zamundaaa/VK_hdr_layer;
// HansKristian-Work/vkd3d-proton and the OptiScaler FSR4 wiki;
// ValveSoftware/Proton, GloriousEggroll/proton-ge-custom,
// Etaash-mathamsetty/Proton EM-ADDITIONS, CachyOS/proton-cachyos, and GStreamer.

export interface EnvironmentPreset {
  description: string;
  key: string;
  suggestions?: readonly string[];
  supportedBy?: readonly ProtonExtraVariant[];
  value: string;
}

export { DISCORD_BRIDGE_PRESET };

export const ENVIRONMENT_PRESET_GROUPS = [
  { label: "DXVK", presets: DXVK_PRESETS },
  { label: "VKD3D", presets: VKD3D_PRESETS },
  { label: "Proton", presets: PROTON_PRESETS },
] as const;

export const ENVIRONMENT_PRESETS = ENVIRONMENT_PRESET_GROUPS.flatMap<EnvironmentPreset>(
  ({ presets }) => presets,
);
