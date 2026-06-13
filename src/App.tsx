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
      <Route element={<Layout />}>
        {/* Public */}
        <Route path="/" element={<BrowseGames />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/auth" element={<Auth />} />

        {/* Requires sign-in */}
        <Route
          path="/create"
          element={
            <RequireAuth>
              <CreateGame />
            </RequireAuth>
          }
        />
        <Route
          path="/game/:id/edit"
          element={
            <RequireAuth>
              <EditGame />
            </RequireAuth>
          }
        />
        <Route
          path="/my-games"
          element={
            <RequireAuth>
              <MyGames />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />

        <Route path="*" element={<BrowseGames />} />
      </Route>
    </Routes>
  );
}
