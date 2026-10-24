// Shared by the activity gallery and the inspector's captured components.
globalThis.KarenImageViewer = (root, source, label) => {
  const dialog = document.createElement('dialog');
  dialog.className = 'karen-image-viewer';
  dialog.setAttribute('aria-label', 'Image viewer');
  dialog.innerHTML = `
    <style>
      .karen-image-viewer { box-sizing:border-box; position:fixed; inset:0; width:calc(100vw - 32px); height:calc(100dvh - 32px); max-width:1600px; max-height:none; margin:auto; padding:0; border:1px solid #ffffff26; border-radius:12px; background:#15181e; color:#f4f5f7; box-shadow:0 24px 80px #0008; font:13px/1.5 system-ui,sans-serif; pointer-events:auto; overflow:hidden; }
      .karen-image-viewer[open] { display:flex; flex-direction:column; }
      .karen-image-viewer::backdrop { background:#090c12bd; }
      .karen-image-viewer .viewer-bar { display:flex; flex-shrink:0; flex-wrap:wrap; align-items:center; gap:8px; padding:12px 16px; background:#1a1d24; border-bottom:1px solid #ffffff14; }
      .karen-image-viewer .viewer-title { flex:1; min-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:500 13px system-ui,sans-serif; }
      .karen-image-viewer button { width:auto; height:auto; margin:0; padding:6px 10px; border:1px solid #ffffff26; border-radius:6px; background:transparent; color:#f4f5f7; font:13px system-ui,sans-serif; cursor:pointer; }
      .karen-image-viewer button:hover { background:#ffffff14; }
      .karen-image-viewer button:disabled { opacity:.35; cursor:default; }
      .karen-image-viewer :focus-visible { outline:2px solid #0c8ce9; outline-offset:2px; }
      .karen-image-viewer .viewer-zoom { min-width:44px; text-align:center; font-variant-numeric:tabular-nums; }
      .karen-image-viewer .viewer-stage { position:relative; display:flex; flex:1; min-height:0; overflow:auto; padding:24px; background:repeating-conic-gradient(#20242c 0% 25%,#252a33 0% 50%) 0 0 / 20px 20px; }
      .karen-image-viewer .viewer-image { display:block; flex-shrink:0; max-width:none; max-height:none; object-fit:contain; margin:auto; }
      .karen-image-viewer .viewer-help { flex-shrink:0; height:32px; margin:0; padding:6px 16px; color:#a0a6b0; font-size:11px; background:#1a1d24; }
      @media(max-width:600px) { .karen-image-viewer .viewer-title { flex-basis:100%; } }
    </style>
    <div class="viewer-bar"><span class="viewer-title"></span><button data-action="out" aria-label="Zoom out">−</button><output class="viewer-zoom" aria-live="polite">100%</output><button data-action="in" aria-label="Zoom in">+</button><button data-action="fit">Fit</button><button data-action="actual">100%</button><button data-action="close" aria-label="Close image viewer">Close ×</button></div>
    <div class="viewer-stage" tabindex="0" aria-label="Image, scroll to pan"><img class="viewer-image" draggable="false"></div>
    <p class="viewer-help">+ / − to zoom · 0 to fit · scroll to pan · Esc to close</p>`;
  const image = dialog.querySelector('img');
  const stage = dialog.querySelector('.viewer-stage');
  dialog.querySelector('.viewer-title').textContent = label;
  image.alt = label;
  let scale = 1;
  function zoom(value) {
    const previous = scale;
    scale = Math.max(.01, Math.min(8, value));
    const x = (stage.scrollLeft + stage.clientWidth / 2) / previous;
    const y = (stage.scrollTop + stage.clientHeight / 2) / previous;
    image.style.width = `${image.naturalWidth * scale}px`;
    image.style.height = `${image.naturalHeight * scale}px`;
    stage.scrollLeft = x * scale - stage.clientWidth / 2;
    stage.scrollTop = y * scale - stage.clientHeight / 2;
    dialog.querySelector('output').textContent = `${Math.round(scale * 100)}%`;
    dialog.querySelector('[data-action="out"]').disabled = scale <= .01;
    dialog.querySelector('[data-action="in"]').disabled = scale >= 8;
  }
  const fit = () => zoom(Math.min(1, (stage.clientWidth - 48) / image.naturalWidth, (stage.clientHeight - 48) / image.naturalHeight));
  const actions = { in: () => zoom(scale * 1.25), out: () => zoom(scale / 1.25), fit, actual: () => zoom(1), close: () => { dialog.close(); dialog.remove(); } };
  dialog.querySelectorAll('button').forEach(button => { button.onclick = actions[button.dataset.action]; });
  dialog.onkeydown = event => {
    const action = { '+': 'in', '=': 'in', '-': 'out', '0': 'fit' }[event.key];
    if (action) { event.preventDefault(); actions[action](); }
    event.stopPropagation();
  };
  dialog.oncancel = event => { event.preventDefault(); actions.close(); };
  dialog.onclose = () => dialog.remove();
  image.onload = fit;
  image.onerror = () => { dialog.querySelector('.viewer-help').textContent = 'This image could not be loaded. Close the viewer and try another capture.'; };
  root.append(dialog);
  dialog.showModal();
  image.src = source;
};
