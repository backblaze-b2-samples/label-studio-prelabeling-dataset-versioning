/**
 * Client-side allow-list for the raw-image dropzone, mirroring the backend's
 * `ALLOWED_TYPES` / `MIME_EXTENSION_MAP` in `services/api/app/service/upload.py`.
 * Label Studio's source storage imports exactly these extensions, so anything
 * else would upload an object that never becomes a task. The server
 * re-validates every upload; this only gives instant feedback.
 *
 * Shape matches react-dropzone's `accept`: MIME type → matching extensions.
 */
export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
