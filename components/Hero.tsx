export default function Hero() {
  return (
    <section
      style={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "40px 20px",
        background:
          "linear-gradient(180deg, #0f172a 0%, #111827 60%, #030712 100%)",
      }}
    >
      <h1
        style={{
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
          fontWeight: 800,
          marginBottom: "20px",
          color: "#ffffff",
        }}
      >
        AI Image Cleaner
      </h1>

      <p
        style={{
          maxWidth: "760px",
          fontSize: "1.15rem",
          color: "#cbd5e1",
          lineHeight: 1.7,
          marginBottom: "36px",
        }}
      >
        Clean image metadata, normalize encoding, and apply optional
        privacy-focused image processing. Images are processed temporarily and
        are not permanently stored.
      </p>

      <button
        style={{
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: "12px",
          padding: "16px 32px",
          fontSize: "18px",
          fontWeight: 700,
          cursor: "pointer",
          transition: "0.2s",
        }}
      >
        Upload Images
      </button>
    </section>
  );
}
