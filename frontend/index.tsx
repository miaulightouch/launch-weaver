import React from "react";
import * as client from "@steambrew/client";
import { installPropertiesPatch } from "./app/propertiesPatch";

export default client.definePlugin(() => {
  const uninstallPropertiesPatch = installPropertiesPatch();

  return {
    title: "LaunchWeaver",
    icon: (
      <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
        <path
          d="M3 5h8m4 0h2M3 10h2m4 0h8M3 15h6m4 0h4M11 3v4M5 8v4m4 1v4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    ),
    content: <></>,
    onDismount: uninstallPropertiesPatch,
  };
});
