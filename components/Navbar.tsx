export default function Navbar() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        background: "#111827",
        borderBottom: "1px solid #222",
        padding: "18px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <h2 style={{ margin: 0 }}>AI Image Cleaner</h2>

      <a
        href="https://github.com"
        style={{
          color: "white",
          textDecoration: "none",
        }}
      >
        GitHub
      </a>
    </header>
  );
}
