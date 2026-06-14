import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Auth from "./pages/Auth";
import Privacy from "./pages/Privacy";
import RequireAuth from "./auth/RequireAuth";
import ReviewPrompt from "./components/ReviewPrompt";
import { GameCardSkeleton } from "./components/Skeleton";

// Lazy-load all authenticated pages so the initial bundle is smaller.
const BrowseGames = lazy(() => import("./pages/BrowseGames"));
const GameDetail  = lazy(() => import("./pages/GameDetail"));
const CreateGame  = lazy(() => import("./pages/CreateGame"));
const EditGame    = lazy(() => import("./pages/EditGame"));
const MyGames     = lazy(() => import("./pages/MyGames"));
const Profile     = lazy(() => import("./pages/Profile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Admin       = lazy(() => import("./pages/Admin"));
const Highlights  = lazy(() => import("./pages/Highlights"));
const Settings    = lazy(() => import("./pages/Settings"));

function PageFallback() {
  return (
    <div className="space-y-3 pt-4">
      <GameCardSkeleton />
      <GameCardSkeleton />
    </div>
  );
}

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
            <>
              <Layout />
              <ReviewPrompt />
            </>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Suspense fallback={<PageFallback />}><BrowseGames /></Suspense>} />
        <Route path="/highlights" element={<Suspense fallback={<PageFallback />}><Highlights /></Suspense>} />
        <Route path="/game/:id" element={<Suspense fallback={<PageFallback />}><GameDetail /></Suspense>} />
        <Route path="/user/:id" element={<Suspense fallback={<PageFallback />}><UserProfile /></Suspense>} />
        <Route path="/game/:id/edit" element={<Suspense fallback={<PageFallback />}><EditGame /></Suspense>} />
        <Route path="/create" element={<Suspense fallback={<PageFallback />}><CreateGame /></Suspense>} />
        <Route path="/my-games" element={<Suspense fallback={<PageFallback />}><MyGames /></Suspense>} />
        <Route path="/profile" element={<Suspense fallback={<PageFallback />}><Profile /></Suspense>} />
        <Route path="/admin" element={<Suspense fallback={<PageFallback />}><Admin /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
        <Route path="*" element={<Suspense fallback={<PageFallback />}><BrowseGames /></Suspense>} />
      </Route>
    </Routes>
  );
}
