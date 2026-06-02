import type { ReactNode } from "react";

export const metadata = {
  title: "SEO Reporter",
  description: "SEO reporting and Google Search Console integrations",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif" }}>{children}</body>
    </html>
  );
}
