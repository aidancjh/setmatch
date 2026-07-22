import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Auth from "./pages/Auth";
import Privacy from "./pages/Privacy";
import Waitlist from "./pages/Waitlist";
import RequireAuth from "./auth/RequireAuth";
import NotFound from "./components/NotFound";
import { GameCardSkeleton } from "./components/Skeleton";

// Lazy-load all authenticated pages so the initial bundle is smaller.
const BrowseGames = lazy(() => import("./pages/BrowseGames"));
const GameDetail  = lazy(() => import("./pages/GameDetail"));
const CreateGame  = lazy(() => import("./pages/CreateGame"));
const EditGame    = lazy(() => import("./pages/EditGame"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceItem = lazy(() => import("./pages/MarketplaceItem"));
const Profile     = lazy(() => import("./pages/Profile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Settings    = lazy(() => import("./pages/Settings"));
const Onboarding  = lazy(() => import("./pages/Onboarding"));
const Chats       = lazy(() => import("./pages/Chats"));
const ChatRoom    = lazy(() => import("./pages/ChatRoom"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Interested = lazy(() => import("./pages/Interested"));

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
      <Route path="/waitlist" element={<Waitlist />} />

      {/* Post-signup onboarding — requires auth but no nav bar */}
      <Route
        path="/welcome"
        element={
          <RequireAuth>
            <Suspense fallback={<PageFallback />}><Onboarding /></Suspense>
          </RequireAuth>
        }
      />

      {/* Everything else requires an account. Logged-out users are sent to /auth. */}
      <Route
        element={
          <RequireAuth>
            <>
              <Layout />
            </>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Suspense fallback={<PageFallback />}><BrowseGames /></Suspense>} />
        {/* Highlights feed removed — users post their own clips from their profile.
            Redirect any stray links (old bookmarks, admin moderation) to the profile. */}
        <Route path="/highlights" element={<Navigate to="/profile" replace />} />
        <Route path="/chats" element={<Suspense fallback={<PageFallback />}><Chats /></Suspense>} />
        <Route path="/notifications" element={<Suspense fallback={<PageFallback />}><Notifications /></Suspense>} />
        <Route path="/interested" element={<Suspense fallback={<PageFallback />}><Interested /></Suspense>} />
        <Route path="/chats/:id" element={<Suspense fallback={<PageFallback />}><ChatRoom /></Suspense>} />
        <Route path="/game/:id" element={<Suspense fallback={<PageFallback />}><GameDetail /></Suspense>} />
        <Route path="/user/:id" element={<Suspense fallback={<PageFallback />}><UserProfile /></Suspense>} />
        <Route path="/game/:id/edit" element={<Suspense fallback={<PageFallback />}><EditGame /></Suspense>} />
        <Route path="/create" element={<Suspense fallback={<PageFallback />}><CreateGame /></Suspense>} />
        <Route path="/marketplace" element={<Suspense fallback={<PageFallback />}><Marketplace /></Suspense>} />
        <Route path="/marketplace/:id" element={<Suspense fallback={<PageFallback />}><MarketplaceItem /></Suspense>} />
        {/* My Games merged into Browse's pill switcher — keep the old path working */}
        <Route path="/my-games" element={<Navigate to="/?view=upcoming" replace />} />
        <Route path="/profile" element={<Suspense fallback={<PageFallback />}><Profile /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
