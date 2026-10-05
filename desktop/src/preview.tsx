// Development-only fixture page; not a production build entry.
import React from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./Editor";
import { GameGrid } from "./GameGrid";
import type { Game } from "./model";
import "../../frontend/styles/editor.scss";
import "./style.scss";
const previewGames: Game[] = [
  { id: "violet", name: "Violet Horizon", launcher: "heroic", source: "Preview fixture", hasCover: true },
  { id: "ember", name: "Ember Coast", launcher: "faugus", source: "Preview fixture", hasCover: true },
  { id: "lunar", name: "Lunar Echo", launcher: "heroic", source: "Preview fixture", hasCover: true },
  { id: "missing", name: "Missing artwork", launcher: "faugus", source: "Preview fixture" },
  { id: "broken", name: "Unavailable artwork", launcher: "heroic", source: "Preview fixture", hasCover: true },
];
const previewCover = async (game: Game) => {
  if (game.id === "broken") return "data:image/png;base64,AA==";
  const colors: Record<string, string> = { violet: "#8272bc", ember: "#c88a59", lunar: "#578f9c" };
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${colors[game.id]}"/><stop offset="1" stop-color="#111824"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h300v400H0z"/><circle cx="110" cy="150" r="58" fill="#eee4d7" opacity=".6"/><path d="M0 300L90 210l60 70 75-100 75 100v120H0z" fill="#171b29"/><path d="M0 350l100-65 130 45 70-30v100H0z" fill="#10111c"/><text x="20" y="50" fill="white" font-family="sans-serif" font-size="23" font-weight="bold">${game.name.split(" ")[0].toUpperCase()}</text><text x="20" y="76" fill="white" font-family="sans-serif" font-size="19">${game.name.split(" ")[1].toUpperCase()}</text></svg>`);
};
function LibraryPreview() {
  return <div className="lw-shell"><aside className="lw-sidebar"><div className="lw-brand">LaunchWeaver</div><nav className="lw-tabs" aria-label="Launchers"><button className="lw-tab" aria-current="page">All games</button><button className="lw-tab">Heroic</button><button className="lw-tab">Faugus</button></nav></aside><main className="lw-main lw-library-main"><section className="lw-page"><h1 className="lw-page-title">Game library</h1><GameGrid games={previewGames} loadCover={previewCover} onOpen={() => {}} /></section></main></div>;
}
if (import.meta.env.DEV) createRoot(document.getElementById("launchweaver-root")!).render(<div className="lw-root">{new URLSearchParams(location.search).get("view") === "library" ? <LibraryPreview /> : <Editor close={() => { window.location.href = "/"; }} initial={{ game: { id: "fixture", name: "Preview · no files connected", launcher: "heroic", source: "/fixture" }, snapshot: "fixture", defaults: {}, settings: { enviromentOptions: [{ key: "DXVK_HDR", value: "1" }, { key: "CUSTOM_OPTION", value: "example" }], wrapperOptions: [{ exe: "gamescope", args: "-f --" }], launcherArgs: "-dx12" } }} />}</div>);
