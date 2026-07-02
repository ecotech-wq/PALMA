import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { BRAND } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  // TODO tokens : aligner ces couleurs sur les tokens CSS de globals.css
  // (elles restent en dur ici tant que le chantier tokens/thème n'est pas passé)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#135858" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1212" },
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
  const isDark = themeEffective === "dark";

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${isDark ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
