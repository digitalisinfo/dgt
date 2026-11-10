import "./globals.css";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata = {
  title: "Digitalis Infoproducts — Digital products & online education",
  description:
    "Digitalis Infoproducts creates, markets, and distributes digital products (infoproducts) and online educational content for the Latin American market.",
  keywords: [
    "infoproducts",
    "digital content",
    "online education",
    "digital solutions",
    "online courses",
    "digital marketing",
  ],
  openGraph: {
    type: "website",
    title: "Digitalis Infoproducts",
    description: "Digital products and online education for the Latin American market.",
  },
  other: {
    "facebook-domain-verification": "ks95h1987y1ob05dy5wt1l1qcv83e7",
  },
};

export const viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="text-slate-900 antialiased">{children}</body>
    </html>
  );
}
