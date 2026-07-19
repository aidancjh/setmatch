import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { celebrate } from "../lib/celebrate";
import { getUploadSignature } from "../lib/cloudinaryUpload";
import type { Highlight } from "../types";

// ---------------------------------------------------------------------------
// Cloudinary signed upload
// ---------------------------------------------------------------------------
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;

function cloudinaryConfigured() {
  return Boolean(CLOUD_NAME);
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

async function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ videoUrl: string; thumbUrl: string; mediaType: "video" | "photo" }> {
  const mediaType = getMediaType(file);
  const { signature, timestamp, apiKey } = await getUploadSignature();
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", apiKey);
    form.append("timestamp", String(timestamp));
    form.append("signature", signature);
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
      <p className="text-center text-xs text-slate-400">Drag to reposition your photo</p>

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
            <div className="absolute inset-x-0 border-t border-slate-900/25" style={{ top: "33.33%" }} />
            <div className="absolute inset-x-0 border-t border-slate-900/25" style={{ top: "66.66%" }} />
            <div className="absolute inset-y-0 border-l border-slate-900/25" style={{ left: "33.33%" }} />
            <div className="absolute inset-y-0 border-l border-slate-900/25" style={{ left: "66.66%" }} />
            <div className="absolute inset-0 border-2 border-slate-900/40 rounded-2xl" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={applying}
          className="flex-1 rounded-xl border border-slate-700 py-3 text-sm font-semibold text-slate-400 transition-all active:scale-[0.97] disabled:opacity-50"
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
      <p className="text-center text-xs text-slate-400">Drag handles to trim your clip</p>

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
        <div className="space-y-2.5 rounded-2xl bg-slate-800 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{fmt(start)}</span>
            <span className="font-semibold text-slate-200">{fmt(clipLen)} selected</span>
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
        <div className="flex h-16 items-center justify-center rounded-2xl bg-slate-800">
          <span className="text-xs text-slate-400">Loading video…</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-700 py-3 text-sm font-semibold text-slate-400 transition-all active:scale-[0.97]"
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

/**
 * Self-contained "share a highlight" flow. Lives in a bottom sheet so it can be
 * opened from anywhere (currently the user's own profile). On success it calls
 * onUploaded with the created Highlight so the caller can prepend it to its list.
 */
export default function HighlightUploadModal({
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
  // Three separate hidden inputs, one per source. This mirrors how trusted
  // native apps present media access — Photo Library / Camera / Files — while
  // staying a pure web app: each input just biases which OS picker opens, and
  // the browser sandbox still only ever hands us the single file the user
  // picks (no silent library access, nothing read until they hit Share).
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
    e.target.value = ""; // let the user re-pick the same file after an error
  }

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
      setError("Media upload is not configured. Contact the admin to set VITE_CLOUDINARY_CLOUD_NAME (and the server's CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).");
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
      celebrate("post");
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
      <div className="animate-sheet-up mx-auto w-full max-w-md rounded-t-3xl bg-slate-900">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-700" />
        </div>

        <div className="px-4 pb-8 pt-2">
          <h2 className="mb-4 text-lg font-bold text-white">
            {step === "pick" ? "Share a highlight" : step === "crop" ? "Crop photo" : step === "trim" ? "Trim video" : "Add a caption"}
          </h2>

          {/* ---- Step 1: pick (source sheet — Library / Camera / Files) ---- */}
          {step === "pick" && (
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => libraryRef.current?.click()}
                className="flex items-center gap-3 rounded-2xl border border-brand bg-brand p-4 text-left text-white transition active:scale-[0.98]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900/20">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.8" />
                    <path d="m3 16 5-4 4 3 3-2 6 5" />
                  </svg>
                </span>
                <span className="text-[15px] font-bold">Photo Library</span>
              </button>

              <button
                onClick={() => cameraRef.current?.click()}
                className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left transition hover:border-brand/30 hover:bg-brand/5 active:scale-[0.98]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                <span className="text-[15px] font-bold text-white">Take Photo or Video</span>
              </button>

              <button
                onClick={() => filesRef.current?.click()}
                className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left transition hover:border-brand/30 hover:bg-brand/5 active:scale-[0.98]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
                  </svg>
                </span>
                <span className="text-[15px] font-bold text-white">Browse Files</span>
              </button>
            </div>
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
                className="mt-3 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
              <p className="mt-0.5 text-right text-xs text-slate-400">{caption.length}/300</p>

              {/* Progress bar */}
              {uploading && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>Uploading…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
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
                  className="flex-1 rounded-xl border border-slate-700 py-3 text-sm font-semibold text-slate-300 transition-all active:scale-[0.97] disabled:opacity-50"
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

        {/* Photo Library — media only; iOS shows its Photos picker. */}
        <input
          ref={libraryRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onInputChange}
        />
        {/* Camera — `capture` opens the camera directly on mobile. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={onInputChange}
        />
        {/* Files — no accept filter so the OS Files/storage browser opens and
            can reach media the Photos picker hides (e.g. some .mov/.heic);
            pickFile() still validates and rejects non-media with a message. */}
        <input
          ref={filesRef}
          type="file"
          className="hidden"
          onChange={onInputChange}
        />
      </div>
    </div>
  );
}
