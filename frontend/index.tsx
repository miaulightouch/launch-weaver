import React from "react";
import * as client from "@steambrew/client";
import { installPropertiesPatch } from "./app/propertiesPatch";

export default client.definePlugin(() => {
  const uninstallPropertiesPatch = installPropertiesPatch();

  return {
    title: "LaunchWeaver",
    icon: (
      <svg aria-hidden="true" height="20" viewBox="0 0 64 64" width="20">
        <rect
          fill="#171d25"
          height="60"
          rx="14"
          stroke="#2a475e"
          strokeWidth="4"
          width="60"
          x="2"
          y="2"
        />
        <path
          d="M10 18h9c17 0 9 28 26 28h8"
          fill="none"
          stroke="#66c0f4"
          strokeLinecap="round"
          strokeWidth="6"
        />
        <path
          d="M10 46h9c17 0 9-28 26-28h8"
          fill="none"
          stroke="#c7d5e0"
          strokeLinecap="round"
          strokeWidth="6"
        />
        <path
          d="m49 13 6 5-6 5M49 41l6 5-6 5"
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    ),
    content: <></>,
    onDismount: uninstallPropertiesPatch,
  };
});
