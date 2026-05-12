import Script from "next/script";

/**
 * Script inline qui applique le thème AVANT la première peinture du DOM
 * pour éviter un flash blanc en mode sombre (FOUC).
 *
 * Implémenté via `next/script` avec strategy="beforeInteractive" : c'est
 * le seul moyen propre depuis Next 16 / React 19 — un `<script>` rendu
 * directement par un composant React déclenche un console warning car
 * il ne se ré-exécuterait pas si React re-render côté client.
 * `beforeInteractive` injecte le script dans le HTML SSR avant que le
 * `<body>` ne s'affiche, donc le thème est appliqué avant le premier
 * paint.
 *
 * À placer dans `<body>` du root layout (Next gère le placement).
 */
const code = `(function(){try{var k='ogc-theme';var v=localStorage.getItem(k);var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=v==='dark'||((v==='system'||!v)&&m);if(dark)document.documentElement.classList.add('dark');}catch(e){}})()`;

export function ThemeScript() {
  return (
    <Script
      id="theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
