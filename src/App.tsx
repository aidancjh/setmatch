import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import BrowseGames from "./pages/BrowseGames";
import GameDetail from "./pages/GameDetail";
import CreateGame from "./pages/CreateGame";
import EditGame from "./pages/EditGame";
import MyGames from "./pages/MyGames";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import RequireAuth from "./auth/RequireAuth";

export default function App() {
  return (
    <Routes>
      {/* Public entry — the sign-in / intro gate (no app chrome) */}
      <Route path="/auth" element={<Auth />} />

      {/* Everything else requires an account. Logged-out users are sent to /auth. */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<BrowseGames />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/game/:id/edit" element={<EditGame />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/my-games" element={<MyGames />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<BrowseGames />} />
      </Route>
    </Routes>
  );
}
