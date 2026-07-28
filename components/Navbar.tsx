export default function Navbar() {
  return (
    <header
      style={{
        height: "70px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 25px",
        background: "#0b0715",
        borderBottom: "1px solid #24153f",
      }}
    >
      <h2
        style={{
          color: "white",
          margin: 0,
        }}
      >
        AI Image Cleaner
      </h2>

      <a
        href="https://github.com/paraskhochare/ai-image-cleaner"
        target="_blank"
        style={{
          color: "#b794f6",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        GitHub
      </a>
    </header>
  );
}
