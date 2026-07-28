"use client";

import { useRef, useState } from "react";

export default function Hero() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [fileName, setFileName] = useState("");

  async function processImage(files: File[]) {
    setProcessing(true);
    setDownloadUrl("");

    try {
      const formData = new FormData();

files.forEach((file) => {
  formData.append("image", file);
});

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        alert("Processing failed.");
        setProcessing(false);
        return;
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setFileName(
  files.length === 1
    ? files[0].name.replace(/\.[^.]+$/, "") + "-cleaned.jpg"
    : "processed-images.zip"
);
    } catch (err) {
      console.error(err);
      alert("Unexpected error.");
    }

    setProcessing(false);
  }

  return (
    <section
      style={{
        minHeight: "calc(100vh - 70px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(180deg,#05020d 0%,#0a0617 45%,#120820 100%)",
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
          }}
        >
          AI Image Cleaner
        </h1>

        <p
          style={{
            color: "#c4b5fd",
            marginBottom: "40px",
          }}
        >
          Remove metadata, normalize encoding and process images securely.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: "2px dashed #8b5cf6",
            borderRadius: "20px",
            background: "#161022",
            padding: "70px 20px",
            cursor: "pointer",
          }}
        >
          <h2 style={{ color: "white" }}>
            {processing ? "Processing..." : "Upload Images"}
          </h2>

          <p style={{ color: "#b794f6" }}>
            Click to choose an image
          </p>

          <input
  hidden
  ref={inputRef}
  type="file"
  accept="image/*"
  multiple
            onChange={(e) => {
  const files = Array.from(e.target.files ?? []);

  if (files.length > 0) {
    processImage(files);
  }
}}
          />
        </div>

        {downloadUrl && (
          <div
            style={{
              marginTop: "35px",
            }}
          >
            <a
              href={downloadUrl}
              download={fileName}
              style={{
                display: "inline-block",
                background: "#8b5cf6",
                color: "white",
                padding: "15px 35px",
                borderRadius: "12px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Download Processed Image
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
