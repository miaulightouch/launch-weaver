import type { EnvironmentPreset } from "../catalog";

export const VKD3D_PRESETS = [
  {
    key: "VKD3D_CONFIG",
    value: "dxr",
    suggestions: [
      "vk_debug",
      "dxr",
      "nodxr",
      "dxr12",
      "single_queue",
      "no_upload_hvv",
      "force_static_cbv",
      "force_host_cached",
      "no_invariant_position",
      "skip_application_workarounds",
      "pipeline_library_app_cache",
      "breadcrumbs",
      "descriptor_qa_checks",
    ],
    description: "Apply one or more comma-separated vkd3d-proton options.",
  },
  {
    key: "VKD3D_DEBUG",
    value: "info",
    suggestions: ["none", "err", "info", "fixme", "warn", "trace"],
    description: "Set the vkd3d-proton logging level.",
  },
  {
    key: "VKD3D_SHADER_DEBUG",
    value: "info",
    suggestions: ["none", "err", "info", "fixme", "warn", "trace"],
    description: "Set the vkd3d-proton shader compiler logging level.",
  },
  {
    key: "VKD3D_LOG_FILE",
    value: "",
    description: "Redirect vkd3d-proton logging to a file.",
  },
  {
    key: "VKD3D_VULKAN_DEVICE",
    value: "0",
    suggestions: ["0", "1", "2", "3"],
    description: "Select a Vulkan device by its zero-based index.",
  },
  {
    key: "VKD3D_FILTER_DEVICE_NAME",
    value: "",
    description: "Select a Vulkan device by a name substring.",
  },
  {
    key: "VKD3D_DISABLE_EXTENSIONS",
    value: "",
    description: "Disable a comma- or semicolon-separated list of Vulkan extensions.",
  },
  {
    key: "VKD3D_PROFILE_PATH",
    value: "",
    description: "Choose the output prefix for profiling data when supported.",
  },
  {
    key: "VKD3D_SWAPCHAIN_PRESENT_MODE",
    value: "FIFO",
    suggestions: ["IMMEDIATE", "MAILBOX", "FIFO", "FIFO_RELAXED", "FIFO_LATEST_READY"],
    description: "Force a supported Vulkan swapchain present mode.",
  },
  {
    key: "VKD3D_SHADER_CACHE_PATH",
    value: "0",
    suggestions: ["0"],
    description: "Disable the shader cache or choose its directory.",
  },
  {
    key: "VKD3D_SHADER_DUMP_PATH",
    value: "",
    description: "Choose the directory where shader bytecode is dumped.",
  },
  {
    key: "VKD3D_SHADER_OVERRIDE",
    value: "",
    description: "Choose the directory containing hash-named SPIR-V overrides.",
  },
  {
    key: "VKD3D_AUTO_CAPTURE_SHADER",
    value: "",
    description: "Capture with RenderDoc when this shader hash is encountered.",
  },
  {
    key: "VKD3D_AUTO_CAPTURE_COUNTS",
    value: "-1",
    suggestions: ["-1"],
    description: "Choose comma-separated queue-submission indices to capture.",
  },
  {
    key: "VKD3D_SHADER_DEBUG_RING_SIZE_LOG2",
    value: "28",
    suggestions: ["26", "27", "28", "29", "30"],
    description: "Set the log2 host-memory size of the shader debug ring.",
  },
  {
    key: "VKD3D_DESCRIPTOR_QA_LOG",
    value: "",
    description: "Choose the descriptor update log file for QA-enabled builds.",
  },
  {
    key: "VKD3D_FRAME_RATE",
    value: "60",
    suggestions: ["30", "60", "90", "120", "144", "165", "240", "0"],
    description: "Limit the frame rate; use 0 to uncap it.",
  },
  {
    key: "DXIL_SPIRV_CONFIG",
    value: "wmma_rdna3_workaround",
    suggestions: ["wmma_rdna3_workaround"],
    description: "Configure DXIL-SPIRV, including the RDNA 3 WMMA workaround.",
  },
] as const satisfies readonly EnvironmentPreset[];
