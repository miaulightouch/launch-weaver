import React from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Editor } from "./Editor";
import { GameGrid } from "./GameGrid";
import { Button, TextInput } from "../../frontend/components/controls";
import { Notice } from "../../frontend/components/layout";
import { type Game, type GameDocument } from "./model";
import "../../frontend/styles/editor.scss";
import "./style.scss";

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function App() {
  const [games, setGames] = React.useState<Game[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [selected, setSelected] = React.useState<GameDocument | null>(null);
  const [query, setQuery] = React.useState("");
  const [launcher, setLauncher] = React.useState("all");
  const refresh = async () => {
    setBusy(true); setMessage(null);
    try {
      if (!isTauri()) throw new Error("Open the desktop app to access your launcher settings. This browser preview has no filesystem access.");
      const result = await invoke<{ games: Game[]; warnings: string[] }>("discover_games");
      setGames(result.games); setWarnings(result.warnings);
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  React.useEffect(() => { void refresh(); }, []);
  const open = async (game: Game) => {
    setBusy(true); setMessage(null);
    try { setSelected(await invoke<GameDocument>("load_game", { id: game.id })); }
    catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const filtered = games.filter((game) => (launcher === "all" || game.launcher === launcher) && game.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="lw-root">{selected ? <Editor key={selected.game.id} initial={selected} close={() => setSelected(null)} /> :
    <div className="lw-shell"><aside className="lw-sidebar"><div className="lw-brand">LaunchWeaver</div>
      <nav className="lw-tabs" aria-label="Launchers">{[["all", "All games"], ["heroic", "Heroic"], ["faugus", "Faugus"]].map(([id, label]) => <button className="lw-tab" aria-current={launcher === id ? "page" : undefined} key={id} onClick={() => setLauncher(id!)}>{label}<span className="lw-tab-count">{games.filter((game) => id === "all" || game.launcher === id).length}</span></button>)}</nav>
    </aside><main className="lw-main lw-library-main"><section className="lw-page"><h1 className="lw-page-title">Game library</h1>
      <div className="lw-library-toolbar"><TextInput aria-label="Search games" placeholder="Search games…" value={query} onValueChange={setQuery} /><Button disabled={busy} onClick={() => void refresh()}>Refresh</Button></div>
      {message && <Notice tone="error">{message}</Notice>}{warnings.map((warning) => <Notice key={warning} tone="warning">{warning}</Notice>)}
      {busy ? <p role="status">Loading launcher settings…</p> : filtered.length ? <GameGrid games={filtered} disabled={busy} onOpen={(game) => void open(game)} /> : <div className="lw-library-empty"><h2>{games.length ? "No matching games" : "No game settings found"}</h2><p>{games.length ? "Try another name or launcher." : "For Heroic, save a game's settings in Heroic first, then refresh."}</p></div>}
    </section></main></div>}</div>;
}
createRoot(document.getElementById("launchweaver-root")!).render(<App />);
