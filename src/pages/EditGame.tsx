import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Game, NewGameInput } from "../types";
import { getGame, updateGame } from "../services/gamesService";
import { useAuth } from "../auth/AuthContext";
import GameForm from "../components/GameForm";
import { Spinner } from "../components/Skeleton";

export default function EditGame() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [game, setGame] = useState<Game | undefined | null>(undefined);

  useEffect(() => {
    getGame(id).then((g) => setGame(g ?? null));
  }, [id]);

  if (game === undefined) {
    return <Spinner />;
  }
  if (game === null) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-400">This game no longer exists.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-3 text-sm font-semibold text-white underline"
        >
          Back to browse
        </button>
      </div>
    );
  }
  // Only the host may edit.
  if (!user || game.hostId !== user.id) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-400">
          Only the host can edit this game.
        </p>
        <button
          onClick={() => navigate(`/game/${game.id}`)}
          className="mt-3 text-sm font-semibold text-white underline"
        >
          Back to game
        </button>
      </div>
    );
  }

  const initial: NewGameInput = {
    title: game.title,
    type: game.type,
    skill: game.skill,
    gender: game.gender,
    netHeight: game.netHeight,
    positionsNeeded: game.positionsNeeded ?? [],
    rotationType: game.rotationType ?? "Standard",
    costPerPerson: game.costPerPerson ?? 0,
    region: game.region ?? "",
    date: game.date,
    time: game.time,
    endTime: game.endTime ?? "",
    location: game.location,
    area: game.area,
    totalSlots: game.totalSlots,
    notes: game.notes,
    preFilled: game.preFilled ?? 0,
  };

  const handleSubmit = async (input: NewGameInput) => {
    const updated = await updateGame(game!.id, input);
    navigate(`/game/${updated.id}`);
  };

  return (
    <div>
      <button
        onClick={() => navigate(`/game/${game.id}`)}
        className="mb-3 text-sm font-medium text-slate-400 hover:text-white"
      >
        ← Cancel
      </button>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-white">
        Edit game
      </h1>
      <p className="mb-5 text-sm text-slate-400">
        Update the details — everyone who joined will see the changes.
      </p>

      <GameForm
        initial={initial}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/game/${game.id}`)}
      />
    </div>
  );
}
