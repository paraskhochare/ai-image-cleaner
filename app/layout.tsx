export const metadata = {
  title: "AI Image Cleaner",
  description: "Open-source image privacy and normalization tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
