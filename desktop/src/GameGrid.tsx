import React from "react";
import { invoke } from "@tauri-apps/api/core";
import heroicIcon from "./assets/launchers/heroic.svg";
import faugusIcon from "./assets/launchers/faugus.svg";
import type { Game } from "./model";

type CoverLoader = (game: Game) => Promise<string | null>;
const loadGameCover: CoverLoader = (game) => invoke("load_cover", { id: game.id });

function GameCard({ game, disabled, onOpen, loadCover }: {
  game: Game;
  disabled: boolean;
  onOpen(game: Game): void;
  loadCover: CoverLoader;
}) {
  const card = React.useRef<HTMLButtonElement>(null);
  const [cover, setCover] = React.useState<string | null>(null);
  const launcherName = game.launcher === "heroic" ? "Heroic" : "Faugus";

  React.useEffect(() => {
    setCover(null);
    if (!game.hasCover || !card.current) return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadCover(game).then((url) => {
        if (active) setCover(url);
      }).catch(() => { /* Missing artwork keeps the title fallback. */ });
    }, { rootMargin: "200px" });
    observer.observe(card.current);
    return () => { active = false; observer.disconnect(); };
  }, [game, loadCover]);

  return (
    <button
      aria-label={`Edit ${game.name} (${launcherName})`}
      className="lw-game-card"
      disabled={disabled}
      onClick={() => onOpen(game)}
      ref={card}
      title={game.source}
    >
      <span className="lw-game-artwork">
        {cover ? (
          <img
            alt=""
            className="lw-game-cover"
            decoding="async"
            draggable={false}
            onError={() => setCover(null)}
            referrerPolicy="no-referrer"
            src={cover}
          />
        ) : (
          <span aria-hidden="true" className="lw-game-cover-fallback">
            <span>{game.name}</span>
          </span>
        )}
        <span className="lw-game-launcher" title={launcherName}>
          <img alt={launcherName} draggable={false} src={game.launcher === "heroic" ? heroicIcon : faugusIcon} />
        </span>
      </span>
    </button>
  );
}

export function GameGrid({ games, onOpen, disabled = false, loadCover = loadGameCover }: {
  games: Game[];
  onOpen(game: Game): void;
  disabled?: boolean;
  loadCover?: CoverLoader;
}) {
  return (
    <div aria-label="Games" className="lw-game-grid">
      {games.map((game) => <GameCard disabled={disabled} game={game} key={game.id} loadCover={loadCover} onOpen={onOpen} />)}
    </div>
  );
}
