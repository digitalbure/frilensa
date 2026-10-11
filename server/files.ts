import crypto from "crypto";
import express, { type Response } from "express";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";

// Receipts and other files, kept in a Cloud Storage bucket (FILES_BUCKET) rather than inside the
// workspace document, which has a 1 MB limit. Records live in the server-only `files` collection.
// Owners read their files here; clients see a receipt only through a document it's attached to
// (public document link or client portal), via sendDocumentFile.

const FILES = "files";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf"
};

interface FileRecord {
  uid: string;
  name: string;
  type: string;
  size: number;
  path: string;
  createdAt: string;
}

export const filesConfigured = () => Boolean(process.env.FILES_BUCKET);
const bucket = () => getStorage(getAdminApp()).bucket(process.env.FILES_BUCKET!);

function cleanName(name: unknown, ext: string) {
  const base = String(name || "").replace(/[\\/\0\r\n"]/g, "").trim().slice(0, 120);
  return base || `receipt.${ext}`;
}

async function streamFile(file: FileRecord, res: Response, download = false) {
  const [buf] = await bucket().file(file.path).download();
  res.setHeader("Content-Type", file.type);
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader("Cache-Control", "private, max-age=300");
  // Files are shown as-is, never run as a page.
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  res.end(buf);
}

/**
 * Sends a file attached to one of a consultant's documents (a receipt on a reimbursable line).
 * `flatDoc` is the document's flat copy, already checked by the caller to be visible to the requester.
 */
export async function sendDocumentFile(flatDoc: any, fileId: string, res: Response) {
  const attached = (flatDoc?.items || []).some((it: any) => it?.receiptFileId === fileId);
  if (!attached || !/^[A-Za-z0-9_-]{10,64}$/.test(fileId)) return res.status(404).json({ error: "File not found." });
  if (!filesConfigured()) return res.status(503).json({ error: "File storage isn't set up yet." });
  const snap = await getAdminDb().collection(FILES).doc(fileId).get();
  const file = snap.data() as FileRecord | undefined;
  if (!file || file.uid !== flatDoc.consultantId) return res.status(404).json({ error: "File not found." });
  await streamFile(file, res);
}

/** POST /api/files (upload), GET /api/files/:id (owner download). */
export function createFilesRouter() {
  const router = express.Router();
  router.use(requireUser);

  router.post("/", rateLimit({ name: "files-upload", max: 120, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res, next) => {
    try {
      if (!filesConfigured()) return res.status(503).json({ error: "File storage isn't set up yet, so the receipt stays saved on this device only." });
      const { name, type, dataUrl } = req.body || {};
      const ext = TYPES[String(type)];
      const match = typeof dataUrl === "string" ? dataUrl.match(/^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i) : null;
      if (!ext || !match || match[1].toLowerCase() !== type) return res.status(400).json({ error: "Upload a photo (JPG, PNG, WebP, HEIC) or a PDF." });
      const buf = Buffer.from(match[2], "base64");
      if (buf.length === 0 || buf.length > MAX_BYTES) return res.status(413).json({ error: "Files can be up to 8 MB." });
      const id = crypto.randomBytes(16).toString("base64url");
      const uid = req.user!.uid;
      const record: FileRecord = { uid, name: cleanName(name, ext), type, size: buf.length, path: `receipts/${uid}/${id}.${ext}`, createdAt: new Date().toISOString() };
      await bucket().file(record.path).save(buf, { contentType: type, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
      await getAdminDb().collection(FILES).doc(id).set(record);
      res.json({ id, name: record.name, type: record.type, size: record.size });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", rateLimit({ name: "files-read", max: 600, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res, next) => {
    try {
      if (!/^[A-Za-z0-9_-]{10,64}$/.test(req.params.id)) return res.status(404).json({ error: "File not found." });
      const snap = await getAdminDb().collection(FILES).doc(req.params.id).get();
      const file = snap.data() as FileRecord | undefined;
      if (!file || file.uid !== req.user!.uid) return res.status(404).json({ error: "File not found." });
      if (!filesConfigured()) return res.status(503).json({ error: "File storage isn't set up yet." });
      await streamFile(file, res, req.query.download === "1");
    } catch (err) {
      next(err);
    }
  });

  return router;
}
