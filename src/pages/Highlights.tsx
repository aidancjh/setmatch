import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { Highlight } from "../types";
import { HeartIcon, TrashIcon, UploadIcon } from "../components/icons";
import { HighlightCardSkeleton } from "../components/Skeleton";

// ---------------------------------------------------------------------------
// Cloudinary unsigned upload
// ---------------------------------------------------------------------------
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

function cloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

function getMediaType(file: File): "video" | "photo" {
  return file.type.startsWith("image/") ? "photo" : "video";
}

function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ videoUrl: string; thumbUrl: string; mediaType: "video" | "photo" }> {
  const mediaType = getMediaType(file);
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET!);
    const endpoint = mediaType === "photo" ? "image" : "video";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 400) {
        try { reject(new Error(JSON.parse(xhr.responseText)?.error?.message || "Upload failed.")); }
        catch { reject(new Error("Upload failed.")); }
        return;
      }
      const data = JSON.parse(xhr.responseText);
      const thumbUrl = mediaType === "photo"
        ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_600/${data.public_id}.jpg`
        : `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0,f_jpg,w_600/${data.public_id}.jpg`;
      resolve({ videoUrl: data.secure_url as string, thumbUrl, mediaType });
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(form);
  });
}

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
// Photo crop UI
// ---------------------------------------------------------------------------

function CropPhoto({
  preview,
  onDone,
  onCancel,
}: {
  preview: string;
  onDone: (croppedFile: File) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [applying, setApplying] = useState(false);

  function clamp(ox: number, oy: number, dw: number, dh: number) {
    const c = containerRef.current;
    if (!c) return { x: ox, y: oy };
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    return {
      x: Math.min(0, Math.max(cw - dw, ox)),
      y: Math.min(0, Math.max(ch - dh, oy)),
    };
  }

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    const c = containerRef.current;
    if (!img || !c) return;
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = Math.round(img.naturalWidth * scale);
    const dh = Math.round(img.naturalHeight * scale);
    setImgSize({ w: dw, h: dh });
    setOffset({ x: Math.round((cw - dw) / 2), y: Math.round((ch - dh) / 2) });
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy, imgSize.w, imgSize.h));
  }
  function onPointerUp() { setDragging(false); }

  async function applyCrop() {
    const img = imgRef.current;
    const c = containerRef.current;
    if (!img || !c) return;
    setApplying(true);
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const srcX = -offset.x / scale;
    const srcY = -offset.y / scale;
    const srcW = cw / scale;
    const srcH = ch / scale;
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    const source = new Image();
    source.src = preview;
    await new Promise<void>((res) => { source.onload = () => res(); source.complete && res(); });
    ctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, 800, 1000);
    canvas.toBlob((blob) => {
      if (blob) onDone(new File([blob], "photo.jpg", { type: "image/jpeg" }));
      setApplying(false);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-slate-500">Drag to reposition your photo</p>

      {/* Crop frame — 4:5 aspect ratio */}
      <div
        ref={containerRef}
        className="relative mx-auto w-full overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: "4/5", cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* The image, positioned via offset */}
        <img
          ref={imgRef}
          src={preview}
          alt="Crop"
          draggable={false}
          onLoad={handleImgLoad}
          className="absolute pointer-events-none"
          style={{
            width: imgSize.w || "100%",
            height: imgSize.h || "auto",
            left: offset.x,
            top: offset.y,
          }}
        />

        {/* Rule-of-thirds grid overlay */}
        {imgSize.w > 0 && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 border-t border-white/25" style={{ top: "33.33%" }} />
            <div className="absolute inset-x-0 border-t border-white/25" style={{ top: "66.66%" }} />
            <div className="absolute inset-y-0 border-l border-white/25" style={{ left: "33.33%" }} />
            <div className="absolute inset-y-0 border-l border-white/25" style={{ left: "66.66%" }} />
            <div className="absolute inset-0 border-2 border-white/40 rounded-2xl" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={applying}
          className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition-all active:scale-[0.97] disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={applyCrop}
          disabled={applying || imgSize.w === 0}
          className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {applying ? "Cropping…" : "Use Photo"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload modal  (3 steps: pick → edit → caption+share)
// ---------------------------------------------------------------------------

type UploadStep = "pick" | "crop" | "ready";

function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (hl: Highlight) => void;
}) {
  const [step, setStep] = useState<UploadStep>("pick");
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"photo" | "video">("photo");
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    if (!f.type.startsWith("video/") && !f.type.startsWith("image/")) {
      setError("Please choose a video or photo file.");
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      setError("File must be under 200 MB.");
      return;
    }
    const type = getMediaType(f);
    const url = URL.createObjectURL(f);
    setRawPreview(url);
    setMediaType(type);
    setError("");
    if (type === "photo") {
      setStep("crop");
    } else {
      // Videos go straight to caption step
      setFile(f);
      setPreview(url);
      setStep("ready");
    }
  }

  function onCropDone(croppedFile: File) {
    const url = URL.createObjectURL(croppedFile);
    setFile(croppedFile);
    setPreview(url);
    setStep("ready");
  }

  async function handleShare() {
    if (!file) return;
    if (!cloudinaryConfigured()) {
      setError("Media upload is not configured. Contact the admin to set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { videoUrl, thumbUrl, mediaType: mt } = await uploadToCloudinary(file, setProgress);
      const hl = await api.post<Highlight>("/highlights", {
        caption: caption.trim(),
        videoUrl,
        thumbUrl,
        mediaType: mt,
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && !uploading && onClose()}
    >
      <div className="animate-sheet-up mx-auto w-full max-w-md rounded-t-3xl bg-white">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="px-4 pb-8 pt-2">
          <h2 className="mb-4 text-lg font-bold text-slate-900">
            {step === "pick" ? "Share a highlight" : step === "crop" ? "Crop photo" : "Add a caption"}
          </h2>

          {/* ---- Step 1: pick ---- */}
          {step === "pick" && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-slate-400 transition hover:border-brand hover:text-brand active:scale-[0.98]"
            >
              <UploadIcon className="h-10 w-10" />
              <span className="text-sm font-medium">Tap to choose a video or photo</span>
              <span className="text-xs">MP4, MOV, JPG, PNG · up to 200 MB</span>
            </button>
          )}

          {/* ---- Step 2: crop (photos only) ---- */}
          {step === "crop" && rawPreview && (
            <CropPhoto
              preview={rawPreview}
              onDone={onCropDone}
              onCancel={() => { setRawPreview(null); setStep("pick"); }}
            />
          )}

          {/* ---- Step 3: preview + caption + share ---- */}
          {step === "ready" && preview && (
            <>
              {/* Preview in same 4:5 ratio */}
              <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "4/5" }}>
                {mediaType === "photo" ? (
                  <img src={preview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <video
                    src={preview}
                    controls
                    playsInline
                    muted
                    className="h-full w-full object-contain"
                  />
                )}
                {!uploading && (
                  <button
                    onClick={() => {
                      if (mediaType === "photo") { setStep("crop"); }
                      else { setRawPreview(null); setFile(null); setPreview(null); setStep("pick"); }
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm"
                  >
                    {mediaType === "photo" ? "Re-crop" : "Change"}
                  </button>
                )}
              </div>

              {/* Caption */}
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 300))}
                placeholder="Add a caption…"
                rows={2}
                className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
              <p className="mt-0.5 text-right text-xs text-slate-400">{caption.length}/300</p>

              {/* Progress bar */}
              {uploading && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Uploading…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-300"
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
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShare}
                  disabled={uploading}
                  className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-all hover:bg-brand-dark active:scale-[0.97] disabled:opacity-40"
                >
                  {uploading ? "Sharing…" : "Share"}
                </button>
              </div>
            </>
          )}

          {error && step !== "ready" && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="video/*,image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
        />
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
      {/* Media — fixed 4:5 aspect ratio, always consistent */}
      <div className="relative overflow-hidden bg-black" style={{ aspectRatio: "4/5" }}>
        {hl.mediaType === "photo" ? (
          <img
            src={hl.videoUrl}
            alt={hl.caption || `Highlight by ${hl.userName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={hl.videoUrl}
            poster={hl.thumbUrl || undefined}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
            aria-label={`Highlight by ${hl.userName}`}
          />
        )}
      </div>

      {/* Author row */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
          aria-hidden
        >
          {hl.userName.charAt(0).toUpperCase()}
        </div>
        <span className="truncate text-sm font-semibold text-slate-900">{hl.userName}</span>
        <span className="ml-auto shrink-0 text-xs text-slate-400">{relativeTime(hl.createdAt)}</span>
      </div>

      {/* Caption — always reserve the space so layout is consistent */}
      <p className={`px-3 pb-2 text-sm leading-snug ${hl.caption ? "text-slate-700" : "text-slate-300 italic"}`}>
        {hl.caption || "No caption"}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-slate-50 px-3 py-2">
        <button
          onClick={() => onLike(hl.id)}
          aria-label={liked ? "Unlike" : "Like"}
          className={`flex items-center gap-1.5 text-sm font-medium transition-all duration-150 active:scale-90 ${
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
                <button onClick={() => onDelete(hl.id)} className="text-xs font-semibold text-rose-500 active:scale-90">
                  Yes
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 active:scale-90">
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete highlight"
                className="text-slate-300 transition hover:text-rose-400 active:scale-90"
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
    setHighlights((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const liked = h.likedBy.includes(user!.id);
        return {
          ...h,
          likesCount: liked ? h.likesCount - 1 : h.likesCount + 1,
          likedBy: liked ? h.likedBy.filter((uid) => uid !== user!.id) : [...h.likedBy, user!.id],
        };
      })
    );
    api.post(`/highlights/${id}/like`).catch(() => load());
  }

  async function handleDelete(id: string) {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    try { await api.del(`/highlights/${id}`); }
    catch { load(); }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Highlights</h1>
        <p className="text-sm text-slate-500">Sports clips from your community.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {slow && <p className="text-center text-xs text-slate-400">⏳ Waking up the server…</p>}
          {[1, 2].map((i) => <HighlightCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <button onClick={load} className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
            Try again
          </button>
        </div>
      ) : highlights.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <p className="mb-2 text-3xl">🎬</p>
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
