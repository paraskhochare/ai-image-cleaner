"use client";

import { useRef, useState } from "react";

export default function UploadBox() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    setFiles(Array.from(e.target.files));
  }

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
        }}
      >
        <h2>Upload Images</h2>

        <p style={{ color: "#9ca3af" }}>
          Tap here to choose one or more images
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFiles}
        />
      </div>

      {files.length > 0 && (
        <div
          style={{
            marginTop: "25px",
            background: "#1f2937",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h3>Selected Images ({files.length})</h3>

          {files.map((file, index) => (
            <div
              key={index}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid #374151",
              }}
            >
              <strong>{file.name}</strong>
              <br />
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
