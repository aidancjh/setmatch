import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { Highlight } from "../types";
import { HeartIcon, TrashIcon, UploadIcon, PlusIcon } from "../components/icons";
import { HighlightCardSkeleton } from "../components/Skeleton";

// ---------------------------------------------------------------------------
// Cloudinary unsigned upload — credentials set in Railway env vars:
//   VITE_CLOUDINARY_CLOUD_NAME   (e.g. "dxyz1234")
//   VITE_CLOUDINARY_UPLOAD_PRESET (e.g. "coterie_unsigned")
// ---------------------------------------------------------------------------
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

function cloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ videoUrl: string; thumbUrl: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET!);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 400) {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err?.error?.message || "Upload failed."));
        } catch {
          reject(new Error("Upload failed."));
        }
        return;
      }
      const data = JSON.parse(xhr.responseText);
      const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0,f_jpg,w_600/${data.public_id}.jpg`;
      resolve({ videoUrl: data.secure_url as string, thumbUrl });
    };

    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (hl: Highlight) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    if (!f.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      setError("Video must be under 200 MB.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  }

  async function handleShare() {
    if (!file) return;
    if (!cloudinaryConfigured()) {
      setError("Video upload is not set up yet. The admin needs to add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to the app's environment variables.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { videoUrl, thumbUrl } = await uploadToCloudinary(file, setProgress);
      const hl = await api.post<Highlight>("/highlights", {
        caption: caption.trim(),
        videoUrl,
        thumbUrl,
      });
      onUploaded(hl);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0"
      onClick={(e) => e.target === e.currentTarget && !uploading && onClose()}
    >
      <div className="mx-auto w-full max-w-md rounded-t-3xl bg-white pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="px-4 pb-6 pt-2">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Share a highlight</h2>

          {/* File picker */}
          {!preview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-slate-400 transition hover:border-brand hover:text-brand"
            >
              <UploadIcon className="h-10 w-10" />
              <span className="text-sm font-medium">Tap to choose a video</span>
              <span className="text-xs">MP4, MOV · up to 200 MB</span>
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video
                src={preview}
                controls
                playsInline
                muted
                className="max-h-64 w-full object-contain"
              />
              {!uploading && (
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
                >
                  Change
                </button>
              )}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
          />

          {/* Caption */}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 300))}
            placeholder="Add a caption… (optional)"
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          <p className="mt-0.5 text-right text-xs text-slate-400">{caption.length}/300</p>

          {/* Upload progress */}
          {uploading && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={onClose}
              disabled={uploading}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={!file || uploading}
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
            >
              {uploading ? "Sharing…" : "Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight card
// ---------------------------------------------------------------------------

function HighlightCard({
  hl,
  currentUserId,
  onLike,
  onDelete,
}: {
  hl: Highlight;
  currentUserId: string;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const liked = hl.likedBy.includes(currentUserId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* Video */}
      <div className="bg-black">
        <video
          src={hl.videoUrl}
          poster={hl.thumbUrl || undefined}
          controls
          playsInline
          preload="metadata"
          className="max-h-[70vh] w-full object-contain"
          aria-label={`Highlight by ${hl.userName}`}
        />
      </div>

      {/* Info row */}
      <div className="px-3 pt-3 pb-1 flex items-center gap-2">
        {/* Avatar */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
          aria-hidden
        >
          {hl.userName.charAt(0).toUpperCase()}
        </div>
        <span className="font-semibold text-sm text-slate-900 truncate">{hl.userName}</span>
        <span className="ml-auto shrink-0 text-xs text-slate-400">{relativeTime(hl.createdAt)}</span>
      </div>

      {/* Caption */}
      {hl.caption && (
        <p className="px-3 pt-0.5 pb-2 text-sm text-slate-700">{hl.caption}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-slate-50 px-3 py-2">
        <button
          onClick={() => onLike(hl.id)}
          aria-label={liked ? "Unlike" : "Like"}
          className={`flex items-center gap-1.5 text-sm font-medium transition ${
            liked ? "text-rose-500" : "text-slate-400 hover:text-rose-400"
          }`}
        >
          <HeartIcon className="h-5 w-5" filled={liked} />
          {hl.likesCount > 0 && <span>{hl.likesCount}</span>}
        </button>

        {hl.userId === currentUserId && (
          <div className="ml-auto">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Delete?</span>
                <button
                  onClick={() => onDelete(hl.id)}
                  className="text-xs font-semibold text-rose-500"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-slate-400"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete highlight"
                className="text-slate-300 hover:text-rose-400 transition"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Highlights() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  // Auto-open upload modal when navigated here via the "+" sheet (?upload=1)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("upload") === "1") {
      setShowUpload(true);
      navigate("/highlights", { replace: true });
    }
  }, [location.search, navigate]);

  async function load() {
    setError("");
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const data = await api.get<Highlight[]>("/highlights");
      setHighlights(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load highlights.");
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlow(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleLike(id: string) {
    // Optimistic update
    setHighlights((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const liked = h.likedBy.includes(user!.id);
        return {
          ...h,
          likesCount: liked ? h.likesCount - 1 : h.likesCount + 1,
          likedBy: liked
            ? h.likedBy.filter((uid) => uid !== user!.id)
            : [...h.likedBy, user!.id],
        };
      })
    );
    api.post(`/highlights/${id}/like`).catch(() => load());
  }

  async function handleDelete(id: string) {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    try {
      await api.del(`/highlights/${id}`);
    } catch {
      load();
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Highlights</h1>
          <p className="text-sm text-slate-500">Sports clips from your community.</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          aria-label="Share a highlight"
          className="flex items-center gap-1.5 rounded-full bg-brand py-1.5 pl-2.5 pr-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          <PlusIcon className="h-4 w-4" />
          Share
        </button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {slow && (
            <p className="text-center text-xs text-slate-400">
              ⏳ Waking up the server — hang tight…
            </p>
          )}
          {[1, 2, 3].map((i) => (
            <HighlightCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : highlights.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <p className="text-3xl mb-2">🎬</p>
          <p className="font-semibold text-slate-700">No highlights yet</p>
          <p className="mt-1 text-sm text-slate-500">Be the first to share a sports clip!</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Share your highlight
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {highlights.map((hl) => (
            <HighlightCard
              key={hl.id}
              hl={hl}
              currentUserId={user!.id}
              onLike={handleLike}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(hl) => setHighlights((prev) => [hl, ...prev])}
        />
      )}
    </div>
  );
}
