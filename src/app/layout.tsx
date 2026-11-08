import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "beply · Good food. Better numbers.",
  description:
    "beply helps food businesses plan ingredients, compare local supplier quotes, and shop with confidence. You focus on the food. We handle the numbers.",
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
