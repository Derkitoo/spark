import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
const dm = DM_Sans({ variable: "--font-dm", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });
export const metadata: Metadata = { title: "Étincelle — Capture tes idées", description: "L’espace calme où tes pensées deviennent des projets." };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr"><body className={`${dm.variable} ${playfair.variable}`}>{children}</body></html>}
