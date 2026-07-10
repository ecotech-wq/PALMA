import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { BRAND } from "@/lib/theme";

// Polices LYNX : « ce qui se lit est en Sans, ce qui se compte est en Mono ».
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: `${BRAND.appName} : ${BRAND.tagline}`,
  description: `${BRAND.appName}, outil de ${BRAND.tagline.toLowerCase()} : matériel, équipes, paie, planning`,
  manifest: "/manifest.webmanifest",
  applicationName: BRAND.appName,
  appleWebApp: {
    capable: true,
    title: BRAND.shortName,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Chrome sombre frais (encre rafraîchie #0e1116, préférence 2026-07-10).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e1116" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
   * Theme handling 100% côté serveur (zero JS / zero <script>).
   * Le cookie `ogc-theme` stocke la valeur EFFECTIVE ("dark" ou "light")
   * écrite par ThemeToggle quand l'utilisateur change le thème ou quand
   * le système change de mode (en "auto").
   *
   * 1er visit sans cookie → light par défaut. ThemeToggle ajustera
   * juste après l'hydratation si le user est en mode auto + OS dark.
   * C'est un FOUC très bref (un seul render) sur le tout premier accès.
   */
  const cookieStore = await cookies();
  const themeEffective = cookieStore.get("ogc-theme")?.value;
  // Sombre PAR DÉFAUT (préférence Youssoufou 2026-07-10) : sans cookie, on
  // sert le thème sombre ; la bascule clair/auto reste disponible.
  const isDark = themeEffective ? themeEffective === "dark" : true;

  return (
    <html
      lang="fr"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased ${isDark ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
