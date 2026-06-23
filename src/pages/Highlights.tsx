import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { Highlight, HighlightComment } from "../types";
import { ChatIcon, HeartIcon, TrashIcon, UploadIcon } from "../components/icons";
import { HighlightCardSkeleton } from "../components/Skeleton";

// ---------------------------------------------------------------------------
// Cloudinary unsigned upload
// ---------------------------------------------------------------------------
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

function cloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

// Accepted media. Checked by MIME type first, then by file extension as a
// fallback — browsers commonly report an EMPTY file.type for files chosen via
// the OS "All files" filter (e.g. .mov, .mkv, .heic), which would otherwise be
// rejected even though they're valid videos/photos.
const VIDEO_EXTS = ["mp4", "mov", "m4v", "webm", "ogv", "avi", "mkv", "3gp", "mpeg", "mpg"];
const PHOTO_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "bmp"];

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Returns "video" | "photo", or null when the file is neither. */
function detectMediaType(file: File): "video" | "photo" | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  const ext = fileExt(file.name);
  if (PHOTO_EXTS.includes(ext)) return "photo";
  if (VIDEO_EXTS.includes(ext)) return "video";
  return null;
}

function getMediaType(file: File): "video" | "photo" {
  return detectMediaType(file) ?? "video";
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
// Video trim UI
// ---------------------------------------------------------------------------

function TrimVideo({
  src,
  onDone,
  onCancel,
}: {
  src: string;
  onDone: (trim: { startTime: number; endTime: number }) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const tenths = Math.floor((s % 1) * 10);
    return `${m}:${sec.toString().padStart(2, "0")}.${tenths}`;
  }

  function onMeta() {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    setDuration(v.duration);
    setEnd(v.duration);
  }

  function scrubTo(t: number) {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  }

  function previewTrim() {
    const v = videoRef.current;
    if (!v || previewing) return;
    v.currentTime = start;
    v.play().catch(() => {});
    setPreviewing(true);
    if (checkRef.current) clearInterval(checkRef.current);
    checkRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.currentTime >= end) {
        videoRef.current?.pause();
        if (videoRef.current) videoRef.current.currentTime = start;
        setPreviewing(false);
        if (checkRef.current) clearInterval(checkRef.current);
      }
    }, 80);
  }

  function stopPreview() {
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = start; }
    setPreviewing(false);
    if (checkRef.current) clearInterval(checkRef.current);
  }

  useEffect(() => () => { if (checkRef.current) clearInterval(checkRef.current); }, []);

  const clipLen = Math.max(0, end - start);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-slate-500">Drag handles to trim your clip</p>

      <div className="overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "4/5" }}>
        <video
          ref={videoRef}
          src={src}
          playsInline
          className="h-full w-full object-contain"
          onLoadedMetadata={onMeta}
        />
      </div>

      {duration > 0 ? (
        <div className="space-y-2.5 rounded-2xl bg-slate-50 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{fmt(start)}</span>
            <span className="font-semibold text-slate-700">{fmt(clipLen)} selected</span>
            <span className="text-slate-400">{fmt(end)}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-xs font-medium text-slate-400">Start</span>
              <input
                type="range" min={0} max={duration} step={0.1} value={start}
                onChange={(e) => { const v = Math.min(Number(e.target.value), end - 0.1); setStart(v); scrubTo(v); }}
                className="flex-1 accent-brand"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-xs font-medium text-slate-400">End</span>
              <input
                type="range" min={0} max={duration} step={0.1} value={end}
                onChange={(e) => { const v = Math.max(Number(e.target.value), start + 0.1); setEnd(v); scrubTo(v); }}
                className="flex-1 accent-brand"
              />
            </div>
          </div>

          <button
            onClick={previewing ? stopPreview : previewTrim}
            className="w-full rounded-xl border border-brand/40 bg-brand/5 py-2 text-xs font-semibold text-brand transition active:scale-95"
          >
            {previewing ? "⏸ Stop preview" : "▶ Preview trim"}
          </button>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center rounded-2xl bg-slate-50">
          <span className="text-xs text-slate-400">Loading video…</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition-all active:scale-[0.97]"
        >
          Back
        </button>
        <button
          onClick={() => onDone({ startTime: start, endTime: end > 0 ? end : duration })}
          disabled={duration === 0}
          className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
        >
          Use clip
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload modal  (4 steps: pick → crop/trim → caption+share)
// ---------------------------------------------------------------------------

type UploadStep = "pick" | "crop" | "trim" | "ready";

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
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    const type = detectMediaType(f);
    if (!type) {
      const ext = fileExt(f.name);
      setError(
        ext
          ? `".${ext}" files aren't supported. Pick a video (MP4, MOV, WebM) or a photo (JPG, PNG, HEIC, WebP).`
          : "That file isn't a video or photo. Pick a video (MP4, MOV, WebM) or a photo (JPG, PNG, HEIC, WebP)."
      );
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      const sizeMb = Math.round(f.size / (1024 * 1024));
      setError(`That file is ${sizeMb} MB — the maximum is 200 MB. Trim or compress it and try again.`);
      return;
    }
    const url = URL.createObjectURL(f);
    setRawPreview(url);
    setMediaType(type);
    setError("");
    if (type === "photo") {
      setStep("crop");
    } else {
      // Videos go to trim step before caption
      setFile(f);
      setPreview(url);
      setTrimStart(0);
      setTrimEnd(0);
      setStep("trim");
    }
  }

  function onCropDone(croppedFile: File) {
    const url = URL.createObjectURL(croppedFile);
    setFile(croppedFile);
    setPreview(url);
    setStep("ready");
  }

  function onTrimDone({ startTime, endTime }: { startTime: number; endTime: number }) {
    setTrimStart(startTime);
    setTrimEnd(endTime);
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
      const { videoUrl: rawVideoUrl, thumbUrl: rawThumbUrl, mediaType: mt } = await uploadToCloudinary(file, setProgress);
      let videoUrl = rawVideoUrl;
      let thumbUrl = rawThumbUrl;
      // Apply Cloudinary trim transformation when the user set in/out points
      if (mt === "video" && trimEnd > 0) {
        const so = trimStart.toFixed(2);
        const eo = trimEnd.toFixed(2);
        videoUrl = rawVideoUrl.replace("/upload/", `/upload/so_${so},eo_${eo}/`);
        thumbUrl = rawThumbUrl.replace("so_0,", `so_${so},`);
      }
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
            {step === "pick" ? "Share a highlight" : step === "crop" ? "Crop photo" : step === "trim" ? "Trim video" : "Add a caption"}
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

          {/* ---- Step 2a: crop (photos only) ---- */}
          {step === "crop" && rawPreview && (
            <CropPhoto
              preview={rawPreview}
              onDone={onCropDone}
              onCancel={() => { setRawPreview(null); setStep("pick"); }}
            />
          )}

          {/* ---- Step 2b: trim (videos only) ---- */}
          {step === "trim" && rawPreview && (
            <TrimVideo
              src={rawPreview}
              onDone={onTrimDone}
              onCancel={() => { setRawPreview(null); setFile(null); setPreview(null); setStep("pick"); }}
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
                      else { setStep("trim"); }
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm"
                  >
                    {mediaType === "photo" ? "Re-crop" : "Re-trim"}
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
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = ""; // let the user re-pick the same file after an error
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment section
// ---------------------------------------------------------------------------

function CommentSection({
  highlightId,
  ownerId,
  currentUserId,
  onCountChange,
}: {
  highlightId: string;
  ownerId: string;
  currentUserId: string;
  onCountChange: (n: number) => void;
}) {
  const [comments, setComments] = useState<HighlightComment[] | null>(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get<HighlightComment[]>(`/highlights/${highlightId}/comments`)
      .then((c) => { if (active) { setComments(c); onCountChange(c.length); } })
      .catch(() => { if (active) setComments([]); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  async function post() {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    setError("");
    try {
      const updated = await api.post<HighlightComment[]>(
        `/highlights/${highlightId}/comments`,
        { body }
      );
      setComments(updated);
      onCountChange(updated.length);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post comment.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(commentId: string) {
    try {
      const updated = await api.del<HighlightComment[]>(
        `/highlights/${highlightId}/comments/${commentId}`
      );
      setComments(updated);
      onCountChange(updated.length);
    } catch { /* silent */ }
  }

  return (
    <div className="border-t border-slate-50 px-3 py-3">
      {/* Existing comments */}
      {comments === null ? (
        <p className="py-1 text-center text-xs text-slate-400">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="py-1 text-center text-xs text-slate-400">No comments yet — be the first.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <Link
                to={`/user/${c.userId}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 transition active:scale-95"
                aria-label={`View ${c.userName}'s profile`}
              >
                {c.userName.charAt(0).toUpperCase()}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-slate-700">
                  <Link to={`/user/${c.userId}`} className="font-semibold text-slate-900 hover:underline">{c.userName}</Link>{" "}
                  {c.body}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">{relativeTime(c.createdAt)}</p>
              </div>
              {(c.userId === currentUserId || ownerId === currentUserId) && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="shrink-0 text-slate-300 transition hover:text-rose-400 active:scale-90"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}

      {/* Add comment */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => { if (e.key === "Enter") post(); }}
          placeholder="Add a comment…"
          className="flex-1 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-slate-400"
        />
        <button
          onClick={post}
          disabled={!text.trim() || posting}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
        >
          {posting ? "…" : "Post"}
        </button>
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
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(hl.commentsCount);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* Media — square keeps the feed compact and uniform */}
      <div className="relative overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
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

      {/* Author row — tap name/avatar to view their profile */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <Link
          to={`/user/${hl.userId}`}
          className="flex min-w-0 items-center gap-2 transition active:scale-[0.98]"
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
            aria-hidden
          >
            {hl.userName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate text-sm font-semibold text-slate-900 hover:underline">{hl.userName}</span>
        </Link>
        <span className="ml-auto shrink-0 text-xs text-slate-400">{relativeTime(hl.createdAt)}</span>
      </div>

      {/* Caption — only shown when present */}
      {hl.caption && (
        <div className="px-3 pb-2 pt-1">
          <p className="text-sm leading-snug text-slate-700">{hl.caption}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 border-t border-slate-50 px-3 py-2">
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

        <button
          onClick={() => setShowComments((v) => !v)}
          aria-label="Comments"
          aria-expanded={showComments}
          className={`flex items-center gap-1.5 text-sm font-medium transition-all duration-150 active:scale-90 ${
            showComments ? "text-brand" : "text-slate-400 hover:text-brand"
          }`}
        >
          <ChatIcon className="h-5 w-5" />
          {commentCount > 0 && <span>{commentCount}</span>}
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

      {/* Comments */}
      {showComments && (
        <CommentSection
          highlightId={hl.id}
          ownerId={hl.userId}
          currentUserId={currentUserId}
          onCountChange={setCommentCount}
        />
      )}
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
