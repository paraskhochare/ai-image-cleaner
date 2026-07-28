export default function Features() {
  const features = [
    {
      title: "Metadata Removal",
      desc: "Remove EXIF and other embedded metadata from supported images."
    },
    {
      title: "Image Normalization",
      desc: "Re-encode images using consistent formats and quality settings."
    },
    {
      title: "Batch Processing",
      desc: "Process multiple images in one session."
    },
    {
      title: "Privacy First",
      desc: "Images are processed temporarily and are not permanently stored."
    },
    {
      title: "Fast Processing",
      desc: "Optimized server-side processing for responsive performance."
    },
    {
      title: "Open Source",
      desc: "Hosted on GitHub with transparent source code."
    }
  ];

  return (
    <section
      style={{
        background: "#090510",
        padding: "80px 20px",
      }}
    >
      <h2
        style={{
          textAlign: "center",
          color: "white",
          fontSize: "42px",
          marginBottom: "50px",
        }}
      >
        Features
      </h2>

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
          gap: "24px",
        }}
      >
        {features.map((feature) => (
          <div
            key={feature.title}
            style={{
              background: "#161022",
              border: "1px solid #2d1b4f",
              borderRadius: "18px",
              padding: "28px",
              boxShadow: "0 0 20px rgba(139,92,246,.12)",
            }}
          >
            <h3
              style={{
                color: "#ffffff",
                marginBottom: "12px",
              }}
            >
              {feature.title}
            </h3>

            <p
              style={{
                color: "#bdb5d9",
                lineHeight: 1.7,
              }}
            >
              {feature.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
