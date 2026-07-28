"use client";

import { useRef } from "react";

export default function UploadBox() {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section
      style={{
        maxWidth: "900px",
        margin: "50px auto",
        padding: "20px",
      }}
    >
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: "2px dashed #3b82f6",
          borderRadius: "18px",
          padding: "70px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: "#111827",
          transition: "0.2s",
        }}
      >
        <h2>Upload Images</h2>

        <p
          style={{
            color: "#9ca3af",
            marginTop: "10px",
          }}
        >
          Drag & Drop images here
        </p>

        <p
          style={{
            color: "#6b7280",
            fontSize: "14px",
          }}
        >
          or tap anywhere to browse
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          hidden
        />
      </div>
    </section>
  );
}
