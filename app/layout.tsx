import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Du lịch đảo Phú Quý 3N2Đ",
  description: "Landing page du lịch đảo Phú Quý với scrollytelling, ảnh CDN và CTA theo ngữ cảnh."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
