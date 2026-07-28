import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import sharp from "sharp";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

sharp.cache(false);

// ---------- Config ----------
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_BATCH_SIZE = 100;
const MAX_EXTRACTED_FILES = 500;
const MAX_ZIP_TOTAL_SIZE = 150 * 1024 * 1024;
const MAX_DIMENSION = 8000;
const MAX_PIXELS = 100_000_000;
const MAX_NESTING_DEPTH = 10;

const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "gif", "avif", "tiff"] as const;
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

const ALLOWED_MIME_TYPES: Record<string, SupportedFormat> = {
  "image/jpeg": "jpeg", "image/jpg": "jpeg",
  "image/png": "png",   "image/webp": "webp",
  "image/gif": "gif",   "image/avif": "avif",
  "image/tiff": "tiff",
};

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png",  ".webp": "image/webp",
  ".gif": "image/gif",  ".avif": "image/avif",
  ".tiff": "image/tiff", ".tif": "image/tiff",
};

const ZIP_MIME_TYPES = ["application/zip", "application/x-zip-compressed"];

const DEFAULT_QUALITY: Record<SupportedFormat, number> = {
  jpeg: 92, webp: 90, avif: 60, tiff: 90, png: 100, gif: 100
};

// ---------- Types ----------
interface ParsedOptions {
  width?: number;
  height?: number;
  fit: keyof sharp.FitEnum;
  quality?: number;
  keepMetadata: boolean;
  format?: SupportedFormat;
}

interface ProcessingTask {
  file: File;
  originalPath: string; 
}

// ---------- Helpers ----------

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { 
    status, 
    headers: { "X-Content-Type-Options": "nosniff" } 
  });
}

const normalizeFormat = (f: string): string => f.toLowerCase() === "jpg" ? "jpeg" : f.toLowerCase();

function parseOptions(searchParams: URLSearchParams): ParsedOptions {
  const parseNum = (k: string) => {
    const v = Number(searchParams.get(k));
    return (v > 0 && v <= MAX_DIMENSION) ? Math.floor(v) : undefined;
  };

  const qRaw = searchParams.get("quality");
  let quality = qRaw ? parseInt(qRaw, 10) : undefined;
  if (quality !== undefined && (isNaN(quality) || quality < 1 || quality > 100)) quality = undefined;

  const validFits: (keyof sharp.FitEnum)[] = ["cover", "contain", "fill", "inside", "outside"];
  const fitParam = searchParams.get("fit") as keyof sharp.FitEnum;
  const formatParam = searchParams.get("format")?.toLowerCase();

  return {
    width: parseNum("width"),
    height: parseNum("height"),
    fit: validFits.includes(fitParam) ? fitParam : "inside",
    quality,
    keepMetadata: searchParams.get("keepMetadata") === "true",
    format: SUPPORTED_FORMATS.includes(normalizeFormat(formatParam || "") as any) 
      ? (normalizeFormat(formatParam || "") as SupportedFormat) 
      : undefined,
  };
}

/**
 * Signature Verification (Magic Bytes) for ZIP archives
 */
function verifyZipSignature(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer.slice(0, 4));
  // Standard ZIP Signatures: PK\x03\x04, PK\x05\x06, PK\x07\x08
  const isPK = bytes[0] === 0x50 && bytes[1] === 0x4B;
  if (!isPK) return false;

  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04) || // Standard
    (bytes[2] === 0x05 && bytes[3] === 0x06) || // Empty/Multi-disk
    (bytes[2] === 0x07 && bytes[3] === 0x08)    // Spanned/Data Descriptor
  );
}

function isPotentialZip(file: File): boolean {
  if (ZIP_MIME_TYPES.includes(file.type)) return true;
  const isGeneric = file.type === "application/octet-stream" || !file.type;
  return isGeneric && file.name.toLowerCase().endsWith(".zip");
}

function validateEntry(relPath: string, entry: JSZip.JSZipObject): { valid: boolean; reason?: string } {
  if (typeof entry.unixPermissions === "number") {
    const isSymlink = (entry.unixPermissions & 0o120000) === 0o120000;
    if (isSymlink) return { valid: false, reason: "Symbolic links are rejected" };
  }
  if (relPath.includes("..") || relPath.startsWith("/") || /^[a-zA-Z]:/.test(relPath)) {
    return { valid: false, reason: "Invalid path structure" };
  }
  const segments = relPath.split(/[/\\]/).filter(Boolean);
  if (segments.length > MAX_NESTING_DEPTH) return { valid: false, reason: "Nesting depth limit exceeded" };
  for (const seg of segments) {
    if (seg.startsWith(".") || seg === "__MACOSX") return { valid: false };
  }
  return { valid: true };
}

function sanitizePathSegments(fullPath: string, isDirectUpload: boolean): { dir: string; base: string } {
  const segments = isDirectUpload ? [path.basename(fullPath)] : fullPath.split(/[/\\]/).filter(Boolean);
  const fileName = segments.pop() || "image";
  const safeBase = fileName.replace(/\.[^./\\]+$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().slice(0, 100) || "image";
  const safeDir = segments.map(s => s.replace(/[^a-zA-Z0-9-_ ]/g, "").trim()).join("/");
  return { dir: safeDir, base: safeBase };
}

/**
 * Image Processing Core
 */
async function processImage(file: File, options: ParsedOptions, isDirect: boolean): Promise<{ fileName: string; buffer: Buffer }> {
  if (file.size === 0) throw new Error("File is empty.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Exceeds 20MB limit.");

  const declaredMime = ALLOWED_MIME_TYPES[file.type];
  if (!declaredMime) throw new Error(`Unsupported MIME: ${file.type}`);

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const sharpInstance = sharp(inputBuffer);
  const metadata = await sharpInstance.metadata();

  const detected = normalizeFormat(metadata.format || "");
  if (!SUPPORTED_FORMATS.includes(detected as SupportedFormat)) throw new Error(`Unsupported format: ${detected}`);
  if (detected !== normalizeFormat(declaredMime)) throw new Error("Security mismatch: Declared MIME does not match content.");

  if (metadata.width && metadata.height) {
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) throw new Error(`Exceeds ${MAX_DIMENSION}px.`);
    if (metadata.width * metadata.height > MAX_PIXELS) throw new Error("Exceeds 100MP limit.");
  }

  const outputFormat = options.format ?? (detected as SupportedFormat);
  const sourceIsAnimated = Boolean(metadata.pages && metadata.pages > 1);
  let pipeline = sharp(inputBuffer, { animated: sourceIsAnimated }).rotate();

  if (options.width || options.height) {
    pipeline = pipeline.resize({ width: options.width, height: options.height, fit: options.fit, withoutEnlargement: true });
  }
  if (options.keepMetadata) pipeline = pipeline.withMetadata();

  const q = options.quality ?? DEFAULT_QUALITY[outputFormat];
  switch (outputFormat) {
    case "jpeg": pipeline.jpeg({ quality: q, mozjpeg: true, progressive: true }); break;
    case "png": pipeline.png({ compressionLevel: 9, effort: 10, ...(options.quality ? { quality: options.quality } : {}) }); break;
    case "webp": pipeline.webp({ quality: q, effort: 6 }); break;
    case "gif": pipeline.gif({ effort: 7 }); break;
    case "avif": pipeline.avif({ quality: q, effort: 9 }); break;
    case "tiff": pipeline.tiff({ quality: q }); break;
  }

  try {
    const buffer = await pipeline.toBuffer();
    const { dir, base } = sanitizePathSegments(file.name, isDirect);
    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    return { fileName: dir ? `${dir}/${base}-processed.${ext}` : `${base}-processed.${ext}`, buffer };
  } catch {
    throw new Error("Encoding failed.");
  }
}

// ---------- Main POST Route ----------

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const options = parseOptions(searchParams);
    const formData = await request.formData();
    const rawFiles = formData.getAll("image").filter((f): f is File => f instanceof File);

    if (rawFiles.length === 0) return errorResponse("No valid uploads.", 400);

    const tasks: ProcessingTask[] = [];
    const failures: { name: string; reason: string }[] = [];
    let extractedSizeTotal = 0;
    let extractedFileCount = 0;

    // 1. Signature Verification & Extraction Phase
    for (const file of rawFiles) {
      if (isPotentialZip(file)) {
        try {
          const buffer = await file.arrayBuffer();
          // Verify Magic Bytes
          if (!verifyZipSignature(buffer)) throw new Error("Invalid or corrupted ZIP signature.");

          // Load Archive with CRC Check enabled
          const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
          const entries = Object.entries(zip.files);

          for (const [relPath, entry] of entries) {
            if (entry.dir) continue;
            const validation = validateEntry(relPath, entry);
            if (!validation.valid) {
              if (validation.reason) failures.push({ name: relPath, reason: validation.reason });
              continue;
            }

            const ext = path.extname(relPath).toLowerCase();
            const mimeType = EXT_TO_MIME[ext];
            if (!mimeType) continue;

            extractedFileCount++;
            if (extractedFileCount > MAX_EXTRACTED_FILES) throw new Error(`Too many files in ZIP (max ${MAX_EXTRACTED_FILES}).`);

            const content = await entry.async("uint8array");
            extractedSizeTotal += content.byteLength;
            if (extractedSizeTotal > MAX_ZIP_TOTAL_SIZE) throw new Error("Extracted size limit exceeded.");

            tasks.push({ file: new File([content], relPath, { type: mimeType }), originalPath: relPath });
          }
        } catch (err) {
          failures.push({ name: file.name, reason: err instanceof Error ? err.message : "Archive integrity check failed." });
        }
      } else {
        const safeName = path.basename(file.name);
        tasks.push({ file: new File([await file.arrayBuffer()], safeName, { type: file.type }), originalPath: safeName });
      }
    }

    if (tasks.length > MAX_BATCH_SIZE) return errorResponse(`Total limit of ${MAX_BATCH_SIZE} images exceeded.`, 413);

    // 2. Processing Phase
    const outputZip = new JSZip();
    const usedPaths = new Set<string>();
    let successCount = 0;

    for (const task of tasks) {
      try {
        const isDirect = !task.originalPath.includes("/") && !task.originalPath.includes("\\");
        const result = await processImage(task.file, options, isDirect);
        
        let finalPath = result.fileName;
        let counter = 1;
        const ext = path.extname(finalPath);
        const base = finalPath.slice(0, -ext.length);

        while (usedPaths.has(finalPath)) {
          finalPath = `${base}-${counter}${ext}`;
          counter++;
        }
        
        usedPaths.add(finalPath);
        outputZip.file(finalPath, result.buffer);
        successCount++;
      } catch (err) {
        failures.push({ name: task.originalPath, reason: err instanceof Error ? err.message : "Processing failed" });
      }
    }

    // 3. Response Generation
    if (failures.length > 0) {
      const log = [`Processing Report`, `====================`, `Success: ${successCount}`, `Failed: ${failures.length}`, ``, `Details:`, ...failures.map(f => `- ${f.name}: ${f.reason}`)].join("\n");
      outputZip.file("errors.txt", log);
    }

    if (successCount === 0) return errorResponse(`All files failed processing. Last error: ${failures[0]?.reason}`, 400);

    const zipBuffer = await outputZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="processed-images.zip"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });

  } catch (error) {
    console.error("Critical Processing Error:", error);
    return errorResponse("Unexpected internal server error.", 500);
  }
}
