import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
const dm = DM_Sans({ variable: "--font-dm", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });
export const metadata: Metadata = { title: "Spark — Capture the spark. Grow the idea.", description: "Capture tes pensées, relie tes idées et fais-les grandir." };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr"><body className={`${dm.variable} ${playfair.variable}`}>{children}</body></html>}
