import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import BrowseGames from "./pages/BrowseGames";
import GameDetail from "./pages/GameDetail";
import CreateGame from "./pages/CreateGame";
import EditGame from "./pages/EditGame";
import MyGames from "./pages/MyGames";
import Profile from "./pages/Profile";
import UserProfile from "./pages/UserProfile";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Privacy from "./pages/Privacy";
import RequireAuth from "./auth/RequireAuth";

export default function App() {
  return (
    <Routes>
      {/* Public — no sign-in required */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/privacy" element={<Privacy />} />

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
        <Route path="/user/:id" element={<UserProfile />} />
        <Route path="/game/:id/edit" element={<EditGame />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/my-games" element={<MyGames />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<BrowseGames />} />
      </Route>
    </Routes>
  );
}
