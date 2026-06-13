import { useNavigate } from "react-router-dom";
import type { NewGameInput } from "../types";
import { createGame } from "../services/gamesService";
import GameForm, { blankGame } from "../components/GameForm";

export default function CreateGame() {
  const navigate = useNavigate();

  const handleSubmit = async (input: NewGameInput) => {
    const game = await createGame(input);
    navigate(`/game/${game.id}`);
  };

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Cancel
      </button>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Post a game
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        You'll automatically take the first slot as host.
      </p>

      <GameForm
        initial={blankGame}
        submitLabel="Post game"
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
