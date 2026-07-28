import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

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

// Temporary: keep using only the first file until the next step
const file = files[0];

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    const outputBuffer = await sharp(inputBuffer)
      .rotate() // Normalize orientation
      .jpeg({
        quality: 92,
        mozjpeg: true,
      })
      .toBuffer();

    return new Response(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${
          file.name.replace(/\.[^.]+$/, "")
        }-processed.jpg"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Image processing failed.",
      },
      {
        status: 500,
      }
    );
  }
}
