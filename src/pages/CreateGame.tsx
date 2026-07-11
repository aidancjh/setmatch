import { useNavigate } from "react-router-dom";
import type { NewGameInput } from "../types";
import { createGame } from "../services/gamesService";
import { celebrate } from "../lib/celebrate";
import GameForm, { blankGame } from "../components/GameForm";

export default function CreateGame() {
  const navigate = useNavigate();

  const handleSubmit = async (input: NewGameInput, repeatWeeks: number) => {
    const game = await createGame(input, repeatWeeks);
    celebrate("post"); // checkmark + sound; the host below persists across the nav
    navigate(`/game/${game.id}`);
  };

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm font-medium text-slate-400 hover:text-white"
      >
        ← Cancel
      </button>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-white">
        Post a game
      </h1>
      <p className="mb-5 text-sm text-slate-400">
        You'll automatically take the first slot as host.
      </p>

      <GameForm
        initial={blankGame}
        submitLabel="Post game"
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
        allowRepeat
      />
    </div>
  );
}
