import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disable internal cache for serverless environments
sharp.cache(false);

// ---------- Config ----------
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_BATCH_SIZE = 50;              // Max 50 files per request
const MAX_DIMENSION = 8000;             // Max 8000px per side
const MAX_PIXELS = 100_000_000;        // Max 100 Megapixels

const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "gif", "avif", "tiff"] as const;
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

const ALLOWED_MIME_TYPES: Record<string, SupportedFormat> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

const DEFAULT_QUALITY: Partial<Record<SupportedFormat, number>> = {
  jpeg: 92, webp: 90, avif: 60, tiff: 90,
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

// ---------- Helpers ----------

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { 
    status, 
    headers: { "X-Content-Type-Options": "nosniff" } 
  });
}

function parseOptions(searchParams: URLSearchParams): ParsedOptions {
  const parseNum = (k: string) => {
    const v = Number(searchParams.get(k));
    return (v > 0 && v <= MAX_DIMENSION) ? Math.floor(v) : undefined;
  };

  let quality: number | undefined;
  const qRaw = searchParams.get("quality");
  if (qRaw) {
    const q = parseInt(qRaw, 10);
    if (!isNaN(q)) quality = Math.min(Math.max(q, 1), 100);
  }

  const validFits: (keyof sharp.FitEnum)[] = ["cover", "contain", "fill", "inside", "outside"];
  const fitParam = searchParams.get("fit") as keyof sharp.FitEnum;
  const fit = validFits.includes(fitParam) ? fitParam : "inside";

  const formatParam = searchParams.get("format")?.toLowerCase();
  const normalizedFormat = formatParam === "jpg" ? "jpeg" : formatParam;

  return {
    width: parseNum("width"),
    height: parseNum("height"),
    fit,
    quality,
    keepMetadata: searchParams.get("keepMetadata") === "true",
    format: SUPPORTED_FORMATS.includes(normalizedFormat as SupportedFormat) 
      ? (normalizedFormat as SupportedFormat) 
      : undefined,
  };
}

function sanitizeFilename(name: string): string {
  const withoutExt = name.replace(/\.[^./\\]+$/, "");
  return withoutExt.normalize("NFKD").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().slice(0, 100) || "image";
}

function applyEncoder(pipeline: sharp.Sharp, format: SupportedFormat, quality?: number): sharp.Sharp {
  const q = quality ?? DEFAULT_QUALITY[format];

  switch (format) {
    case "jpeg": return pipeline.jpeg({ quality: q ?? 92, mozjpeg: true, progressive: true });
    case "png": return pipeline.png({ compressionLevel: 9, effort: 10, ...(quality ? { quality } : {}) });
    case "webp": return pipeline.webp({ quality: q ?? 90, effort: 6 });
    case "gif": return pipeline.gif({ effort: 7 });
    case "avif": return pipeline.avif({ quality: q ?? 60, effort: 9 });
    case "tiff": return pipeline.tiff({ quality: q ?? 90 });
    default: return pipeline;
  }
}

/**
 * Validates and processes a single image.
 */
async function processImage(file: File, options: ParsedOptions): Promise<{ fileName: string; buffer: Buffer }> {
  if (file.size === 0) throw new Error("File is empty.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Exceeds 20MB limit.");

  const declaredMimeFormat = ALLOWED_MIME_TYPES[file.type];
  if (!declaredMimeFormat) throw new Error(`Unsupported MIME type: ${file.type}`);

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch {
    throw new Error("Invalid or corrupt image data.");
  }

  const detected = metadata.format === "jpg" ? "jpeg" : metadata.format;
  if (!SUPPORTED_FORMATS.includes(detected as SupportedFormat)) {
    throw new Error(`Unsupported internal format: ${detected}`);
  }
  const actualFormat = detected as SupportedFormat;

  if (declaredMimeFormat !== actualFormat) {
    throw new Error(`MIME mismatch: declared ${declaredMimeFormat}, detected ${actualFormat}`);
  }

  if (metadata.width && metadata.height) {
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) throw new Error(`Dimensions exceed ${MAX_DIMENSION}px.`);
    if (metadata.width * metadata.height > MAX_PIXELS) throw new Error("Pixel count exceeds 100MP limit.");
  }

  const outputFormat = options.format ?? actualFormat;
  const sourceIsAnimated = Boolean(metadata.pages && metadata.pages > 1);

  // Load the source. Always include the 'animated' flag based on source data.
  let pipeline = sharp(inputBuffer, { animated: sourceIsAnimated }).rotate();

  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit,
      withoutEnlargement: true,
    });
  }

  if (options.keepMetadata) {
    pipeline = pipeline.withMetadata();
  }

  pipeline = applyEncoder(pipeline, outputFormat, options.quality);

  try {
    const buffer = await pipeline.toBuffer();
    const safeBase = sanitizeFilename(file.name);
    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    return { fileName: `${safeBase}-processed.${ext}`, buffer };
  } catch {
    throw new Error("Image encoding failed.");
  }
}

// ---------- Main POST Route ----------

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const options = parseOptions(searchParams);

    const formData = await request.formData();
    const files = formData.getAll("image").filter((f): f is File => f instanceof File);

    if (files.length === 0) return errorResponse("No valid images uploaded.", 400);

    if (files.length > MAX_BATCH_SIZE) {
      return errorResponse(`Limit exceeded. Max ${MAX_BATCH_SIZE} images per upload.`, 413);
    }

    const zip = new JSZip();
    const usedFilenames = new Set<string>();
    const failures: { name: string; reason: string }[] = [];
    let successCount = 0;

    for (const file of files) {
      try {
        const result = await processImage(file, options);
        
        // Handle Duplicate Filenames
        let finalName = result.fileName;
        let counter = 1;
        const nameParts = finalName.split('.');
        const ext = nameParts.pop();
        const base = nameParts.join('.');

        while (usedFilenames.has(finalName)) {
          finalName = `${base}-${counter}.${ext}`;
          counter++;
        }
        
        usedFilenames.add(finalName);
        zip.file(finalName, result.buffer);
        successCount++;
      } catch (err) {
        failures.push({ 
          name: file.name, 
          reason: err instanceof Error ? err.message : "Processing error" 
        });
      }
    }

    // Add Error Log if partial success or total failure
    if (failures.length > 0) {
      const logContent = [
        `Upload Report`,
        `====================`,
        `Total Files: ${files.length}`,
        `Success: ${successCount}`,
        `Failed: ${failures.length}`,
        ``,
        `Failure Details:`,
        ...failures.map(f => `- ${f.name}: ${f.reason}`)
      ].join("\n");
      
      zip.file("errors.txt", logContent);
    }

    // If everything failed, return 400 instead of an empty ZIP
    if (successCount === 0) {
      return errorResponse(`None of the uploaded images could be processed. See errors: ${failures[0].reason}`, 400);
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });

    return new Response(zipBuffer, {
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
    console.error("Critical Route Error:", error);
    return errorResponse("Unexpected server error during batch processing.", 500);
  }
}
