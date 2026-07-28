import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serverless functions shouldn't hold onto sharp's internal operation cache
sharp.cache(false);

// ---------- Config ----------
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_DIMENSION = 8000; // px, per-side hard cap
const MAX_PIXELS = 100_000_000; // ~100MP, guards against memory blowups from oddly-shaped images

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
  jpeg: 92,
  webp: 90,
  avif: 60,
  tiff: 90,
};

// Formats that cannot preserve animation if the target isn't animation-capable
const ANIMATION_CAPABLE: SupportedFormat[] = ["gif", "webp"];

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
function errorResponse(message: string, status: number, detail?: string) {
  return NextResponse.json(
    { error: message, ...(detail ? { detail } : {}) },
    { status, headers: { "X-Content-Type-Options": "nosniff" } }
  );
}

function parsePositiveInt(value: string | null, max: number): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), max);
}

function parseOptions(searchParams: URLSearchParams): ParsedOptions {
  const width = parsePositiveInt(searchParams.get("width"), MAX_DIMENSION);
  const height = parsePositiveInt(searchParams.get("height"), MAX_DIMENSION);

  const qualityRaw = searchParams.get("quality");
  let quality: number | undefined;
  if (qualityRaw) {
    const q = Number(qualityRaw);
    if (Number.isFinite(q) && !Number.isNaN(q)) {
      quality = Math.min(Math.max(Math.round(q), 1), 100);
    }
  }

  const validFits: (keyof sharp.FitEnum)[] = ["cover", "contain", "fill", "inside", "outside"];
  const fitParam = searchParams.get("fit");
  const fit = validFits.includes(fitParam as keyof sharp.FitEnum)
    ? (fitParam as keyof sharp.FitEnum)
    : "inside"; // never crops/distorts unexpectedly

  const formatParam = searchParams.get("format")?.toLowerCase();
  const normalizedFormatParam = formatParam === "jpg" ? "jpeg" : formatParam;
  const format = SUPPORTED_FORMATS.includes(normalizedFormatParam as SupportedFormat)
    ? (normalizedFormatParam as SupportedFormat)
    : undefined;

  return {
    width,
    height,
    fit,
    quality,
    keepMetadata: searchParams.get("keepMetadata") === "true",
    format,
  };
}

function sanitizeFilename(name: string): string {
  const withoutExt = name.replace(/\.[^./\\]+$/, "");
  return (
    withoutExt
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .slice(0, 100) || "image"
  );
}

function applyEncoder(
  pipeline: sharp.Sharp,
  format: SupportedFormat,
  quality: number | undefined,
  isAnimated: boolean
): sharp.Sharp {
  const q = quality ?? DEFAULT_QUALITY[format];

  switch (format) {
    case "jpeg":
      return pipeline.jpeg({
        quality: q ?? 92,
        mozjpeg: true,
        progressive: true,
        optimiseCoding: true,
      });
    case "png":
      return pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
        ...(quality ? { quality } : {}), // only meaningful for palette PNGs
      });
    case "webp":
  return pipeline.webp({
    quality: q ?? 90,
    effort: 6,
  });
    case "gif":
      return pipeline.gif({});
    case "avif":
      return pipeline.avif({
        quality: q ?? 60,
        effort: 9,
      });
    case "tiff":
      return pipeline.tiff({ quality: q ?? 90 });
  }
}

// ---------- Route ----------
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const options = parseOptions(searchParams);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse("Invalid form data.", 400);
    }

    const uploadedFiles = formData.getAll("image");

if (uploadedFiles.length === 0) {
  return errorResponse(
    "No images uploaded. Expected one or more 'image' fields.",
    400
  );
}

const files = uploadedFiles.filter(
  (item): item is File => item instanceof File
);

if (files.length === 0) {
  return errorResponse(
    "No valid image files were uploaded.",
    400
  );
}

// Temporary: keep using the first file until the next step
const file = files[0];
    if (file.size === 0) {
      return errorResponse("Uploaded file is empty.", 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`File too large. Max size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`, 413);
    }

    const declaredFormat = ALLOWED_MIME_TYPES[file.type];
    if (!declaredFormat) {
      return errorResponse(
        `Unsupported content type: ${file.type || "unknown"}. Allowed: ${Object.keys(ALLOWED_MIME_TYPES).join(", ")}.`,
        400
      );
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(inputBuffer).metadata();
    } catch {
      return errorResponse("Could not read image. File may be corrupt or an unsupported format.", 400);
    }

    if (!metadata.format) {
      return errorResponse("Could not determine image format.", 400);
    }

    const originalFormat: SupportedFormat | undefined = SUPPORTED_FORMATS.includes(
      metadata.format as SupportedFormat
    )
      ? (metadata.format as SupportedFormat)
      : undefined;

    if (!originalFormat) {
      return errorResponse(
        `Unsupported image format: ${metadata.format}. Supported: ${SUPPORTED_FORMATS.join(", ")}.`,
        400
      );
    }

    // Cross-check declared MIME type against actual decoded format (basic spoofing guard)
    if (declaredFormat !== originalFormat) {
      return errorResponse(
        `File content does not match its declared type (declared ${declaredFormat}, detected ${originalFormat}).`,
        400
      );
    }

    const { width: origW, height: origH } = metadata;
    if (origW && origH) {
      if (origW > MAX_DIMENSION || origH > MAX_DIMENSION) {
        return errorResponse(`Image dimensions exceed the ${MAX_DIMENSION}px per-side limit.`, 400);
      }
      if (origW * origH > MAX_PIXELS) {
        return errorResponse("Image has too many total pixels to process safely.", 400);
      }
    }

    const outputFormat = options.format ?? originalFormat;
    const sourceIsAnimated = Boolean(metadata.pages && metadata.pages > 1);
    const outputCanAnimate = ANIMATION_CAPABLE.includes(outputFormat);
    const isAnimated = sourceIsAnimated && outputCanAnimate;

    let pipeline = sharp(inputBuffer, { animated: sourceIsAnimated }).rotate(); // normalize EXIF orientation once

    if (options.width || options.height) {
      pipeline = pipeline.resize({
        width: options.width,
        height: options.height,
        fit: options.fit,
        withoutEnlargement: true,
      });
    }

    // Metadata: only call withMetadata() when the caller explicitly wants to keep it.
    // Omitting the call entirely strips EXIF/GPS/ICC — that's sharp's default behavior.
    if (options.keepMetadata) {
      pipeline = pipeline.withMetadata();
    }

    pipeline = applyEncoder(pipeline, outputFormat, options.quality, isAnimated);

    let outputBuffer: Buffer;
    let outputInfo: sharp.OutputInfo;
    try {
      const result = await pipeline.toBuffer({ resolveWithObject: true });
      outputBuffer = result.data;
      outputInfo = result.info;
    } catch (err) {
      console.error("sharp encode error:", err instanceof Error ? err.message : err);
      return errorResponse("Image processing failed during encoding.", 500);
    }

    const safeName = sanitizeFilename(file.name);
    const extension = outputFormat === "jpeg" ? "jpg" : outputFormat;
    const mimeType = `image/${outputFormat}`;

    const warnings: string[] = [];
    if (sourceIsAnimated && !outputCanAnimate) {
      warnings.push(`Source is animated but ${outputFormat} does not support animation; only the first frame was kept.`);
    }

    return new Response(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${safeName}-processed.${extension}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Original-Format": originalFormat,
        "X-Output-Format": outputFormat,
        "X-Original-Size": String(file.size),
        "X-Output-Size": String(outputBuffer.length),
        "X-Image-Width": String(outputInfo.width),
        "X-Image-Height": String(outputInfo.height),
        ...(warnings.length ? { "X-Warnings": warnings.join(" | ") } : {}),
      },
    });
  } catch (error) {
    console.error("Unhandled error in image processing route:", error instanceof Error ? error.message : error);
    return errorResponse("Unexpected server error.", 500);
  }
}
