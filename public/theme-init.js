/*
 * Script d'initialisation du thème — exécuté pendant le parsing HTML
 * AVANT la première peinture pour éviter le FOUC en mode sombre.
 *
 * Stratégie : lit `ogc-theme` dans le cookie d'abord (visible côté
 * serveur) puis fallback sur localStorage. Si "system" ou rien, on
 * suit la préférence OS via prefers-color-scheme.
 *
 * Servi en tant que fichier statique pour éviter le warning React 19
 * sur les <script dangerouslySetInnerHTML> rendus depuis un composant.
 */
(function () {
  try {
    var k = "ogc-theme";
    // Cookie d'abord (synchronisé avec le serveur)
    var v = null;
    var m = document.cookie.match(/(?:^|;\s*)ogc-theme=([^;]+)/);
    if (m) v = decodeURIComponent(m[1]);
    // Fallback localStorage (sessions plus anciennes)
    if (!v) v = localStorage.getItem(k);
    var mq = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = v === "dark" || ((v === "system" || !v) && mq);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {
    // No-op : si quelque chose pète, on reste en light (default)
  }
})();
