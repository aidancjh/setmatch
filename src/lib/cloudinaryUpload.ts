/**
 * Shared helper for Cloudinary SIGNED uploads. The server holds the API
 * secret and returns a short-lived signature (see POST /api/uploads/sign);
 * we never see the secret itself. Replaces the old unsigned upload_preset
 * flow, whose preset name lived in the client bundle and let anyone upload
 * arbitrary files to this Cloudinary account directly.
 */
import { api } from "./api";

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
}

export function getUploadSignature(): Promise<UploadSignature> {
  return api.post<UploadSignature>("/uploads/sign");
}
