/**
 * Inline script injected into <head> before first paint.
 * Reads the saved theme from localStorage and sets data-theme on <html>
 * so there's no flash of the wrong theme on load.
 * Normalizes legacy values (dim → dusk, system → dark).
 */
export function ThemeScript() {
  const script = `(function(){try{
    var t=localStorage.getItem('firstmove_app_theme')||'dark';
    if(t==='dim'||t==='system')t='dark';
    document.documentElement.setAttribute('data-theme',t);
  }catch(e){}})();`;
  // biome-ignore lint: required for theme hydration
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
