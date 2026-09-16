// Pannello di misura, temporaneo. Serve a capire perche' sul telefono l'intestazione
// appare sfocata: non riesco a riprodurlo, quindi invece di continuare a indovinare
// misuro sul dispositivo. Si apre toccando l'orologio tre volte.
//
// Da togliere quando la questione e' chiusa: basta cancellare questo file e le tre
// righe che lo richiamano in app.js.

function misura(nome) {
  const s = document.createElement('div');
  s.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;height:env(' + nome + ')';
  document.body.appendChild(s);
  const v = getComputedStyle(s).height;
  s.remove();
  return v;
}

export function mostra() {
  const intestazione = document.querySelector('header');
  const titolo = document.querySelector('.title');
  const vv = window.visualViewport;

  const righe = [
    ['modalità', matchMedia('(display-mode: standalone)').matches ? 'standalone (installata)' : 'browser'],
    ['finestra', innerWidth + ' × ' + innerHeight],
    ['schermo', screen.width + ' × ' + screen.height],
    ['pixel per punto', devicePixelRatio],
    ['area sicura sopra', misura('safe-area-inset-top')],
    ['area sicura sotto', misura('safe-area-inset-bottom')],
    ['bordo sup. intestazione', Math.round(intestazione.getBoundingClientRect().top) + ' px'],
    ['bordo sup. titolo', Math.round(titolo.getBoundingClientRect().top) + ' px'],
    ['altezza titolo', titolo.getBoundingClientRect().height.toFixed(1) + ' px'],
    ['riquadro visuale', vv ? Math.round(vv.width) + ' × ' + Math.round(vv.height) +
                              '  scala ' + vv.scale + '  offset ' + Math.round(vv.offsetTop) : '—'],
    ['meno movimento', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'sì' : 'no'],
    ['schema colori', matchMedia('(prefers-color-scheme: dark)').matches ? 'scuro' : 'chiaro'],
  ];

  const p = document.createElement('div');
  p.style.cssText = `position:fixed; inset:0; z-index:200; overflow:auto;
    background:#0f1115; color:#eceef2; padding:calc(env(safe-area-inset-top) + 20px) 18px 40px;
    font:500 13px/1.5 -apple-system, system-ui, sans-serif;`;
  p.innerHTML =
    '<div style="font-size:16px;font-weight:700;margin-bottom:4px">Misure del dispositivo</div>' +
    '<div style="color:#8b9099;margin-bottom:16px">Fai uno screenshot di questa schermata.</div>' +
    righe.map(([k, v]) =>
      '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)">' +
      '<span style="color:#8b9099;flex:1">' + k + '</span>' +
      '<span style="font-weight:600;text-align:right">' + v + '</span></div>').join('') +
    '<div style="margin-top:14px;color:#8b9099;word-break:break-all;font-size:11px">' +
      navigator.userAgent + '</div>' +
    '<button id="chiudi-misure" style="margin-top:22px;width:100%;min-height:46px;border-radius:13px;' +
      'background:#1f232b;border:1px solid rgba(255,255,255,.12);color:#eceef2;font:600 14px system-ui">' +
      'Chiudi</button>';
  document.body.appendChild(p);
  p.querySelector('#chiudi-misure').addEventListener('click', () => p.remove());
}
