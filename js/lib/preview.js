/* ============================================================
   Preview · 常见格式在线预览
   图片 / 视频 / 音频 / PDF / 文本 / 字体 / SVG
   ============================================================ */
(function (global) {
  'use strict';

  var Seed = global.Seed;

  var MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
    svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/mp4',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
    flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg',
    pdf: 'application/pdf',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'
  };

  var IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'heic', 'heif'];
  var VIDEO_EXT = ['mp4', 'm4v', 'webm', 'ogv', 'mov'];
  var AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus'];
  var FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];
  var TEXT_EXT = [
    'txt', 'md', 'markdown', 'json', 'xml', 'csv', 'tsv', 'log', 'js', 'mjs', 'cjs',
    'css', 'scss', 'less', 'html', 'htm', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg',
    'sh', 'bash', 'bat', 'ps1', 'c', 'h', 'cpp', 'hpp', 'cc', 'py', 'java', 'go', 'rs',
    'php', 'sql', 'ts', 'tsx', 'jsx', 'vue', 'srt', 'ass', 'gitignore', 'env'
  ];
  var ARCHIVE_EXT = ['zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz', 'tgz'];

  var ICONS = {
    image: '#i-image',
    video: '#i-play',
    audio: '#i-music',
    pdf: '#i-doc',
    text: '#i-file',
    font: '#i-font',
    archive: '#i-zip',
    other: '#i-file'
  };

  var state = { urls: [], styleEl: null, onKey: null, current: null };

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function classify(name, data) {
    var ext = extOf(name);

    // 以内容为准修正常见误判
    if (data && data.length > 12) {
      if (data[0] === 0xff && data[1] === 0xd8) ext = 'jpg';
      else if (data[0] === 0x89 && data[1] === 0x50) ext = 'png';
      else if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) ext = 'gif';
      else if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) ext = 'pdf';
    }

    if (IMAGE_EXT.indexOf(ext) > -1) return { kind: 'image', ext: ext, mime: MIME[ext] };
    if (VIDEO_EXT.indexOf(ext) > -1) return { kind: 'video', ext: ext, mime: MIME[ext] };
    if (AUDIO_EXT.indexOf(ext) > -1) return { kind: 'audio', ext: ext, mime: MIME[ext] };
    if (ext === 'pdf') return { kind: 'pdf', ext: ext, mime: MIME[ext] };
    if (FONT_EXT.indexOf(ext) > -1) return { kind: 'font', ext: ext, mime: MIME[ext] };
    if (TEXT_EXT.indexOf(ext) > -1) return { kind: 'text', ext: ext, mime: 'text/plain' };
    if (ARCHIVE_EXT.indexOf(ext) > -1) return { kind: 'archive', ext: ext, mime: 'application/zip' };
    return { kind: 'other', ext: ext, mime: 'application/octet-stream' };
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function icon(id) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', id);
    svg.appendChild(use);
    return svg;
  }

  function blobUrl(data, mime) {
    var url = URL.createObjectURL(new Blob([data], { type: mime || 'application/octet-stream' }));
    state.urls.push(url);
    return url;
  }

  function download(data, name) {
    var url = blobUrl(data, 'application/octet-stream');
    var a = document.createElement('a');
    a.href = url;
    a.download = name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function fallback(title, sub) {
    var box = el('div', 'preview-fallback');
    box.appendChild(icon('#i-file'));
    box.appendChild(el('p', '', title));
    if (sub) box.appendChild(el('small', '', sub));
    return box;
  }

  /* ---------------- 各类预览 ---------------- */

  function renderImage(name, data, info) {
    var img = el('img');
    img.alt = name;
    img.src = blobUrl(data, info.mime);
    img.onerror = function () {
      body.replaceChildren(fallback('浏览器无法预览该图片', 'HEIC / 特殊编码的图片可能不被当前浏览器支持，可下载后本地查看。'));
    };
    return img;
  }

  function renderVideo(name, data, info) {
    var v = el('video');
    v.controls = true;
    v.preload = 'metadata';
    v.src = blobUrl(data, info.mime);
    v.onerror = function () {
      body.replaceChildren(fallback('当前浏览器不支持该视频编码', '可下载后使用本地播放器打开。'));
    };
    return v;
  }

  function renderAudio(name, data, info) {
    var wrap = el('div');
    wrap.style.width = 'min(560px, 100%)';
    var a = el('audio');
    a.controls = true;
    a.src = blobUrl(data, info.mime);
    a.style.width = '100%';
    var label = el('p', '', name);
    label.style.cssText = 'font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);text-align:center;margin:0 0 14px;word-break:break-all';
    wrap.appendChild(label);
    wrap.appendChild(a);
    return wrap;
  }

  function renderPdf(name, data) {
    var frame = el('iframe');
    frame.src = blobUrl(data, 'application/pdf');
    frame.title = name;
    return frame;
  }

  function renderText(name, data) {
    var res = Seed.readText(data, 1024 * 1024);
    var text = res.text;

    if (extOf(name) === 'json') {
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* 保持原文 */ }
    }

    var lines = text.split(/\r\n|\r|\n/);
    var limit = 4000;
    if (lines.length > limit) {
      lines = lines.slice(0, limit);
      lines.push('… 仅显示前 ' + limit + ' 行 …');
    }

    var pre = el('pre', 'preview-text');
    var frag = document.createDocumentFragment();
    lines.forEach(function (line, i) {
      var no = el('span', 'ln', String(i + 1));
      frag.appendChild(no);
      frag.appendChild(document.createTextNode('  ' + line + '\n'));
    });
    pre.appendChild(frag);
    return pre;
  }

  function renderFont(name, data, info) {
    var fontName = 'PreviewFont_' + Date.now();
    var url = blobUrl(data, info.mime);

    state.styleEl = document.createElement('style');
    state.styleEl.textContent = '@font-face{font-family:"' + fontName + '";src:url("' + url + '")}';
    document.head.appendChild(state.styleEl);

    var wrap = el('div', 'preview-font');
    var big = el('p', 'sample-lg', '图种工坊 Aa');
    var mid = el('p', 'sample-md', 'The quick brown fox jumps over the lazy dog.');
    var small = el('p', 'sample-sm', name + ' · 0123456789 !@#$%^&*()');
    [big, mid, small].forEach(function (node) { node.style.fontFamily = '"' + fontName + '"'; });
    wrap.appendChild(big);
    wrap.appendChild(mid);
    wrap.appendChild(small);
    return wrap;
  }

  /* ---------------- 弹层控制 ---------------- */

  var modal, body, titleEl, metaEl, iconWrap, downloadBtn;

  function initRefs() {
    if (modal) return;
    modal = document.getElementById('previewModal');
    body = document.getElementById('previewBody');
    titleEl = document.getElementById('previewTitle');
    metaEl = document.getElementById('previewMeta');
    iconWrap = document.getElementById('previewIcon');
    downloadBtn = document.getElementById('previewDownload');

    document.getElementById('previewClose').addEventListener('click', close);
    document.querySelector('#previewModal [data-close]').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.hidden) close();
    });
  }

  function open(item) {
    initRefs();
    close(true);

    var data = item.data;
    var name = item.name || '未命名文件';
    var info = classify(name, data);

    titleEl.textContent = name;
    metaEl.textContent = info.ext.toUpperCase() + ' · ' + Seed.formatBytes(data.length);
    iconWrap.replaceChildren(icon(ICONS[info.kind] || '#i-file'));

    downloadBtn.onclick = function () { download(data, name); };

    var node;
    if (info.kind === 'image') node = renderImage(name, data, info);
    else if (info.kind === 'video') node = renderVideo(name, data, info);
    else if (info.kind === 'audio') node = renderAudio(name, data, info);
    else if (info.kind === 'pdf') node = renderPdf(name, data);
    else if (info.kind === 'font') node = renderFont(name, data, info);
    else if (info.kind === 'text') node = renderText(name, data);
    else if (info.kind === 'archive') node = fallback('压缩包无法直接预览', '可下载后使用解压工具打开。');
    else node = fallback('该格式暂不支持在线预览', '可以下载文件后用本地软件打开。');

    body.replaceChildren(node);
    modal.hidden = false;
    document.body.classList.add('is-modal-open');
    state.current = info.kind;
  }

  function close(immediate) {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('is-modal-open');
    if (body) body.replaceChildren();
    state.urls.forEach(function (u) { URL.revokeObjectURL(u); });
    state.urls = [];
    if (state.styleEl) { state.styleEl.remove(); state.styleEl = null; }
    state.current = null;
  }

  global.Preview = { open: open, close: close, classify: classify };
})(window);
