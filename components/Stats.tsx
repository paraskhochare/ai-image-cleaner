export default function Stats() {
  const stats = [
    {
      number: "100+",
      label: "Images Per Batch",
    },
    {
      number: "10+",
      label: "Processing Options",
    },
    {
      number: "0",
      label: "Permanent Storage",
    },
    {
      number: "100%",
      label: "Open Source",
    },
  ];

  return (
    <section
      style={{
        background: "#0b0715",
        padding: "80px 20px",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "24px",
        }}
      >
        {stats.map((item) => (
          <div
            key={item.label}
            style={{
              background: "#161022",
              border: "1px solid #2d1b4f",
              borderRadius: "18px",
              padding: "35px",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                color: "#8b5cf6",
                fontSize: "46px",
                margin: 0,
              }}
            >
              {item.number}
            </h2>

            <p
              style={{
                color: "#d1d5db",
                marginTop: "12px",
              }}
            >
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
