(() => {
  if (globalThis.karenInspector) {
    globalThis.karenInspector.toggle();
    return;
  }
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important';
  const shadow = host.attachShadow({ mode: 'closed' });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = chrome.runtime.getURL('content/content.css');
  shadow.append(css);
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Karen inspector');
  panel.innerHTML = `
    <header><strong>Karen <small>INSPECTOR</small></strong><button id="close" aria-label="Close inspector">×</button></header>
    <p id="selected">Click a component on the page.</p>
    <button id="inspect" aria-pressed="true">Inspecting…</button>
    <label for="comment">Comment <span>saved when sent</span></label>
    <textarea id="comment" rows="4" placeholder="Select a component to add a comment" disabled></textarea>
    <label>Captured components</label>
    <ul id="attachments" aria-label="Captured components"></ul>
    <button id="send" disabled>Send · include snapshot</button>
    <p id="status" role="status">Nothing is saved until you press Send.</p>
    <button id="storage">Local activity ↗</button>`;
  const outline = document.createElement('div');
  outline.id = 'outline';
  shadow.append(outline, panel);
  const find = id => shadow.getElementById(id);
  let active = false;
  let inspecting = true;
  let instanceId;
  let attachments = [];
  let capturing = false;
  let sending = false;
  let submission;
  function renderAttachments() {
    find('attachments').replaceChildren(...attachments.map(attachment => {
      const row = document.createElement('li');
      const image = document.createElement('img');
      image.src = attachment.image.data_url;
      image.alt = `Captured ${attachment.name}`;
      row.append(image);
      const label = document.createElement('span');
      label.textContent = attachment.name;
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${attachment.name}`);
      remove.onclick = () => {
        attachments = attachments.filter(item => item.id !== attachment.id);
        submission = null;
        renderAttachments();
      };
      row.append(label, remove);
      return row;
    }));
    find('send').disabled = capturing || sending || !attachments.length;
  }
  function setInspecting(value) {
    inspecting = value;
    find('inspect').textContent = value ? 'Inspecting…' : 'Inspect another component';
    find('inspect').setAttribute('aria-pressed', String(value));
    outline.hidden = true;
  }
  function toggle() {
    if (sending) return;
    if (active) {
      host.remove();
    } else {
      document.documentElement.append(host);
      setInspecting(true);
    }
    active = !active;
  }
  function targetOf(event) {
    if (capturing || sending || !active || !inspecting || event.composedPath().includes(host)) return null;
    return event.target instanceof Element ? event.target : null;
  }
  document.addEventListener('pointermove', event => {
    const target = targetOf(event);
    if (!target) { outline.hidden = true; return; }
    const box = target.getBoundingClientRect();
    outline.hidden = false;
    Object.assign(outline.style, { left: `${box.x - 4}px`, top: `${box.y - 4}px`, width: `${box.width + 8}px`, height: `${box.height + 8}px` });
  }, true);
  async function captureComponent(box) {
    const visible = {
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      right: Math.min(innerWidth, box.right),
      bottom: Math.min(innerHeight, box.bottom)
    };
    if (visible.right <= visible.left || visible.bottom <= visible.top) throw new Error('The component must be visible to capture it.');
    host.style.setProperty('visibility', 'hidden', 'important');
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const capture = await chrome.runtime.sendMessage({ action: 'captureSnapshot' });
      if (!capture?.success) throw new Error(capture?.error || 'Component capture failed.');
      const source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not read the component snapshot.'));
        image.src = capture.data_url;
      });
      const scaleX = source.naturalWidth / innerWidth;
      const scaleY = source.naturalHeight / innerHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((visible.right - visible.left) * scaleX));
      canvas.height = Math.max(1, Math.round((visible.bottom - visible.top) * scaleY));
      canvas.getContext('2d').drawImage(source, visible.left * scaleX, visible.top * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      return { data_url: canvas.toDataURL('image/png'), mime_type: 'image/png', captured_at: capture.captured_at };
    } finally {
      host.style.removeProperty('visibility');
    }
  }
  async function getDeviceMetadata() {
    let userAgentData = navigator.userAgentData ? {
      brands: navigator.userAgentData.brands,
      mobile: navigator.userAgentData.mobile,
      platform: navigator.userAgentData.platform
    } : null;
    try {
      if (navigator.userAgentData?.getHighEntropyValues) Object.assign(userAgentData, await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'wow64']));
    } catch {
      // Low-entropy browser metadata remains useful when detailed hints are denied.
    }
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      user_agent: navigator.userAgent,
      user_agent_data: userAgentData,
      platform: navigator.platform,
      languages: [...navigator.languages],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewport: { width: innerWidth, height: innerHeight, scroll_x: scrollX, scroll_y: scrollY },
      visual_viewport: window.visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, offset_left: visualViewport.offsetLeft, offset_top: visualViewport.offsetTop } : null,
      screen: { width: screen.width, height: screen.height, available_width: screen.availWidth, available_height: screen.availHeight, color_depth: screen.colorDepth, pixel_depth: screen.pixelDepth },
      device_pixel_ratio: devicePixelRatio,
      orientation: screen.orientation ? { type: screen.orientation.type, angle: screen.orientation.angle } : null,
      color_scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reduced_motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      touch_points: navigator.maxTouchPoints,
      hardware_concurrency: navigator.hardwareConcurrency || null,
      device_memory_gb: navigator.deviceMemory || null,
      online: navigator.onLine,
      cookies_enabled: navigator.cookieEnabled,
      do_not_track: navigator.doNotTrack,
      connection: connection ? { effective_type: connection.effectiveType, downlink_mbps: connection.downlink, round_trip_ms: connection.rtt, save_data: connection.saveData } : null
    };
  }
  document.addEventListener('click', async event => {
    const target = targetOf(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    capturing = true;
    setInspecting(false);
    find('status').textContent = 'Capturing component…';
    renderAttachments();
    try {
      instanceId = crypto.randomUUID();
      const position = target.getBoundingClientRect();
      const image = await captureComponent(position);
      const component = {
        selector: window.KarenSelectorGenerator.generate(target),
        tag: target.tagName.toLowerCase(),
        classes: [...target.classList],
        bounds: { x: position.x, y: position.y, width: position.width, height: position.height },
        image
      };
      find('selected').textContent = component.selector;
      find('comment').disabled = false;
      attachments.push({ id: instanceId, name: component.selector, ...component });
      submission = null;
      renderAttachments();
      find('comment').placeholder = 'What should change?';
      find('comment').focus();
    } catch (error) {
      find('status').textContent = `Could not capture this element: ${error.message}`;
      setInspecting(true);
    } finally {
      capturing = false;
      renderAttachments();
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (!active || event.key !== 'Escape') return;
    if (inspecting) setInspecting(false);
    else toggle();
  }, true);
  find('inspect').onclick = () => setInspecting(!inspecting);
  find('close').onclick = toggle;
  find('storage').onclick = () => chrome.runtime.sendMessage({ action: 'openStorage' });
  find('comment').oninput = () => {
    submission = null;
  };
  find('send').onclick = async () => {
    if (sending || capturing || !attachments.length) return;
    sending = true;
    panel.inert = true;
    find('send').textContent = 'Saving…';
    renderAttachments();
    try {
      if (!submission) {
        host.style.setProperty('visibility', 'hidden', 'important');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let capture;
        try {
          capture = await chrome.runtime.sendMessage({ action: 'captureSnapshot' });
          if (!capture?.success) throw new Error(capture?.error || 'Snapshot capture failed.');
        } finally {
          host.style.removeProperty('visibility');
        }
        const components = attachments.map(({ id, name, ...component }) => component);
        submission = { id: crypto.randomUUID(), type: 'annotation_sent', url: location.href, page_title: document.title, comment: find('comment').value, components, device: await getDeviceMetadata(), snapshot: { data_url: capture.data_url, mime_type: 'image/png', captured_at: capture.captured_at } };
      }
      const response = await chrome.runtime.sendMessage({ action: 'recordActivity', event: submission });
      if (!response?.success) throw new Error(response?.error || 'Could not save.');
      attachments = [];
      submission = null;
      instanceId = null;
      find('comment').value = '';
      find('comment').disabled = true;
      find('selected').textContent = 'Sent. Inspect a component to start another message.';
      find('status').textContent = response.warning || `Sent locally to ${response.folder}/karen-activity.json`;
    } catch (error) {
      find('status').textContent = `Not sent: ${error.message} Your draft is still here; try Send again.`;
    } finally {
      sending = false;
      panel.inert = false;
      host.style.removeProperty('visibility');
      find('send').textContent = 'Send · include snapshot';
      renderAttachments();
    }
  };
  globalThis.karenInspector = { toggle };
  toggle();
})();
