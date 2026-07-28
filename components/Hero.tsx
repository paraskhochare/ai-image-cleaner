"use client";

import { useRef, useState } from "react";

export default function Hero() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);

  return (
    <section
      style={{
        minHeight: "calc(100vh - 70px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(180deg,#05020d 0%,#0a0617 40%,#11081f 100%)",
        padding: "30px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: "56px",
            fontWeight: 800,
            marginBottom: "20px",
          }}
        >
          AI Image Cleaner
        </h1>

        <p
          style={{
            color: "#b9b4d3",
            fontSize: "20px",
            lineHeight: 1.7,
            marginBottom: "45px",
          }}
        >
          Remove metadata, normalize encoding and apply optional
          privacy-focused image processing.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: "2px dashed #8b5cf6",
            borderRadius: "22px",
            padding: "70px 25px",
            cursor: "pointer",
            background: "#161022",
            transition: ".25s",
            boxShadow: "0 0 35px rgba(139,92,246,.25)",
          }}
        >
          <div
            style={{
              fontSize: "55px",
            }}
          >
            ☁
          </div>

          <h2
            style={{
              color: "white",
              marginTop: "20px",
            }}
          >
            Upload Images
          </h2>

          <p
            style={{
              color: "#c4b5fd",
            }}
          >
            Drag & Drop or Click to Upload
          </p>

          <p
            style={{
              color: "#8b8ba7",
              fontSize: "14px",
            }}
          >
            JPG • PNG • WEBP • AVIF • HEIC
          </p>

          {count > 0 && (
            <p
              style={{
                color: "#22c55e",
                marginTop: "18px",
                fontWeight: 700,
              }}
            >
              {count} image(s) selected
            </p>
          )}

          <input
            ref={inputRef}
            hidden
            multiple
            accept="image/*"
            type="file"
            onChange={(e) => {
              setCount(e.target.files?.length ?? 0);
            }}
          />
        </div>

        <div
          style={{
            marginTop: "35px",
            display: "flex",
            justifyContent: "center",
            gap: "25px",
            flexWrap: "wrap",
            color: "#b9b4d3",
          }}
        >
          <span>✓ No permanent storage</span>
          <span>✓ Batch processing</span>
          <span>✓ Fast processing</span>
          <span>✓ Metadata removal</span>
        </div>
      </div>
    </section>
  );
}
