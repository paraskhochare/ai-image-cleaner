import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No image uploaded." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const output = await sharp(buffer)
      .rotate()
      .withMetadata({})
      .jpeg({
        quality: 92,
      })
      .toBuffer();

    return new Response(output, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${file.name.replace(/\.[^.]+$/, "")}.jpg"`,
      },
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: "Processing failed.",
      },
      {
        status: 500,
      }
    );
  }
}
