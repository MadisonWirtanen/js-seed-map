/* ============================================================
   App · 界面交互
   ============================================================ */
(function () {
  'use strict';

  var Seed = window.Seed;
  var Preview = window.Preview;

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { el.addEventListener(ev, fn); }
  function tick() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); }

  function icon(id) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', id);
    svg.appendChild(use);
    return svg;
  }

  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('is-error', !!isError);
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('is-show'); });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      t.classList.remove('is-show');
      setTimeout(function () { t.hidden = true; }, 260);
    }, 2600);
  }

  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.classList.remove('is-error', 'is-ok');
    if (type) el.classList.add(type === 'error' ? 'is-error' : 'is-ok');
  }

  function baseName(name) {
    var s = String(name || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i > -1 ? s.slice(i + 1) : s;
  }

  function downloadBlob(data, name, mime) {
    var url = URL.createObjectURL(new Blob([data], { type: mime || 'application/octet-stream' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function makeDropzone(zone, input, onFiles) {
    var depth = 0;
    zone.addEventListener('click', function (e) {
      if (e.target.closest('button') || e.target.closest('a')) return;
      input.click();
    });
    zone.addEventListener('keydown', function (e) {
      if (e.target.closest('button')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (ev === 'dragenter') depth++;
        zone.classList.add('is-over');
      });
    });
    zone.addEventListener('dragleave', function (e) {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) zone.classList.remove('is-over');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      zone.classList.remove('is-over');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) onFiles(files);
    });
    on(input, 'change', function () {
      if (input.files && input.files.length) onFiles(input.files);
      input.value = '';
    });
  }

  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { e.preventDefault(); });
  });

  /* ---------------- 标签页 ---------------- */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function switchTab(name) {
    tabs.forEach(function (t) {
      var active = t.dataset.tab === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $('panel-compose').hidden = name !== 'compose';
    $('panel-extract').hidden = name !== 'extract';
  }

  tabs.forEach(function (t) {
    on(t, 'click', function () { switchTab(t.dataset.tab); });
  });

  /* ============================================================
     制作图种
     ============================================================ */

  var compose = {
    cover: null,       // { file, bytes, info, url }
    items: [],         // { id, file, path }
    seq: 1,
    resultUrl: null,
    building: false
  };

  var coverDrop = $('coverDrop');
  var coverInput = $('coverInput');
  var coverEmpty = $('coverEmpty');
  var coverPreview = $('coverPreview');
  var coverImg = $('coverImg');
  var coverNameEl = $('coverName');
  var coverMetaEl = $('coverMeta');
  var filesDrop = $('filesDrop');
  var filesInput = $('filesInput');
  var folderInput = $('folderInput');
  var composeList = $('composeList');
  var filesTools = $('filesTools');
  var filesSummary = $('filesSummary');
  var btnBuild = $('btnBuild');
  var composeStatus = $('composeStatus');
  var buildProgress = $('buildProgress');
  var composeResult = $('composeResult');

  function refreshComposeUI() {
    var hasCover = !!compose.cover;
    coverEmpty.hidden = hasCover;
    coverPreview.hidden = !hasCover;

    if (hasCover) {
      coverNameEl.textContent = compose.cover.file.name;
      var dims = compose.cover.width && compose.cover.height
        ? compose.cover.width + ' × ' + compose.cover.height + ' px · '
        : '';
      coverMetaEl.textContent = dims + Seed.formatBytes(compose.cover.bytes.length) + ' · ' + compose.cover.info.fmt.toUpperCase();
      $('outExt').textContent = '.' + compose.cover.info.ext;
    }

    var total = 0;
    compose.items.forEach(function (i) { total += i.file.size; });
    filesDrop.classList.toggle('has-items', compose.items.length > 0);
    filesSummary.textContent = compose.items.length
      ? compose.items.length + ' 个文件 · ' + Seed.formatBytes(total)
      : '尚未选择';

    btnBuild.disabled = !(hasCover && compose.items.length) || compose.building;

    if (!hasCover && !compose.items.length) setStatus(composeStatus, '请先选择封面图和文件');
    else if (!hasCover) setStatus(composeStatus, '还需要一张封面图');
    else if (!compose.items.length) setStatus(composeStatus, '还需要选择要封入的文件');
    else setStatus(composeStatus, '准备就绪，可以开始制作');
  }

  function setCover(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|gif|webp|bmp|avif|heic)$/i.test(file.name)) {
      toast('请选择一张图片作为封面', true);
      return;
    }
    file.arrayBuffer().then(function (ab) {
      var bytes = new Uint8Array(ab);
      var info = Seed.sniffImage(bytes);
      if (!info) {
        toast('无法识别这张图片的格式', true);
        return;
      }
      if (!info.previewable) {
        toast('该格式在部分浏览器中无法预览，但图种仍可正常生成');
      }
      if (compose.cover && compose.cover.url) URL.revokeObjectURL(compose.cover.url);
      var url = URL.createObjectURL(file);
      compose.cover = { file: file, bytes: bytes, info: info, url: url, width: 0, height: 0 };
      coverImg.src = url;
      coverImg.onload = function () {
        compose.cover.width = coverImg.naturalWidth;
        compose.cover.height = coverImg.naturalHeight;
        refreshComposeUI();
      };
      resetResult();
      refreshComposeUI();
    }).catch(function () { toast('读取图片失败', true); });
  }

  function clearCover() {
    if (compose.cover && compose.cover.url) URL.revokeObjectURL(compose.cover.url);
    compose.cover = null;
    coverImg.removeAttribute('src');
    resetResult();
    refreshComposeUI();
  }

  function addFiles(fileList) {
    var added = 0;
    Array.prototype.forEach.call(fileList, function (file) {
      var path = file.webkitRelativePath || file.name;
      var dup = compose.items.some(function (i) {
        return i.path === path && i.file.size === file.size && i.file.lastModified === file.lastModified;
      });
      if (dup) return;
      compose.items.push({ id: compose.seq++, file: file, path: path });
      added++;
    });
    renderComposeList();
    resetResult();
    refreshComposeUI();
    if (added) toast('已添加 ' + added + ' 个文件');
  }

  function renderComposeList() {
    composeList.replaceChildren();
    composeList.hidden = !compose.items.length;
    filesTools.hidden = !compose.items.length;

    compose.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'file-row';

      li.appendChild(icon(item.path.indexOf('/') > -1 ? '#i-folder' : '#i-file'));

      var name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = item.path;
      name.title = item.path;
      li.appendChild(name);

      var size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = Seed.formatBytes(item.file.size);
      li.appendChild(size);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'entry-btn';
      del.title = '移除';
      del.setAttribute('aria-label', '移除 ' + item.path);
      del.appendChild(icon('#i-x'));
      del.addEventListener('click', function () {
        compose.items = compose.items.filter(function (i) { return i.id !== item.id; });
        renderComposeList();
        refreshComposeUI();
        resetResult();
      });
      li.appendChild(del);

      composeList.appendChild(li);
    });
  }

  function resetCompose() {
    compose.items = [];
    renderComposeList();
    clearCover();
    $('outName').value = '图种';
    setStatus(composeStatus, '请先选择封面图和文件');
    refreshComposeUI();
  }

  function resetResult() {
    if (compose.resultUrl) {
      URL.revokeObjectURL(compose.resultUrl);
      compose.resultUrl = null;
    }
    composeResult.hidden = true;
    $('btnDownloadSeed').removeAttribute('href');
  }

  function buildSeed() {
    if (!compose.cover || !compose.items.length || compose.building) return;

    compose.building = true;
    btnBuild.disabled = true;
    buildProgress.hidden = false;
    setStatus(composeStatus, '正在读取并压缩文件…');
    resetResult();

    tick().then(function () {
      return Promise.all(compose.items.map(function (item) {
        return item.file.arrayBuffer().then(function (ab) {
          return { name: item.path, data: new Uint8Array(ab) };
        });
      }));
    }).then(function (files) {
      var level = parseInt((document.querySelector('input[name="level"]:checked') || {}).value, 10);
      if (isNaN(level)) level = 6;
      var zipData = Seed.zipFiles(files, level);
      var output = Seed.concat(compose.cover.bytes, zipData);

      var url = URL.createObjectURL(new Blob([output], { type: compose.cover.info.mime }));
      compose.resultUrl = url;

      var rawName = ($('outName').value || '图种').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\.(jpe?g|png|gif|webp|avif|bmp|heic)$/i, '') || '图种';
      var fileName = rawName + '.' + compose.cover.info.ext;

      var link = $('btnDownloadSeed');
      link.href = url;
      link.download = fileName;

      $('resultImg').src = url;
      $('resultName').textContent = fileName;
      $('resultCover').textContent = compose.cover.info.fmt.toUpperCase() + ' · ' + Seed.formatBytes(compose.cover.bytes.length);
      $('resultPayload').textContent = 'ZIP · ' + Seed.formatBytes(zipData.length);
      $('resultTotal').textContent = Seed.formatBytes(output.length);
      $('resultCount').textContent = compose.items.length + ' 个';

      composeResult.hidden = false;
      setStatus(composeStatus, '图种已生成', 'ok');
      composeResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      toast('图种制作完成');
    }).catch(function (err) {
      console.error(err);
      setStatus(composeStatus, '制作失败：' + (err && err.message ? err.message : '未知错误'), 'error');
      toast('制作失败，请重试', true);
    }).finally(function () {
      compose.building = false;
      buildProgress.hidden = true;
      refreshComposeUI();
    });
  }

  makeDropzone(coverDrop, coverInput, function (files) { setCover(files[0]); });
  makeDropzone(filesDrop, filesInput, addFiles);

  on($('pickFiles'), 'click', function () { filesInput.click(); });
  on($('pickFolder'), 'click', function () { folderInput.click(); });
  on($('addFiles'), 'click', function () { filesInput.click(); });
  on($('addFolder'), 'click', function () { folderInput.click(); });
  on($('coverReplace'), 'click', function () { coverInput.click(); });
  on($('coverClear'), 'click', clearCover);
  on($('clearFiles'), 'click', function () {
    compose.items = [];
    renderComposeList();
    refreshComposeUI();
    resetResult();
  });
  on(btnBuild, 'click', buildSeed);
  on($('btnResetCompose'), 'click', resetCompose);

  /* 剪贴板图片快速设为封面 */
  on(document, 'paste', function (e) {
    if ($('panel-compose').hidden) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) {
          setCover(f);
          toast('已从剪贴板读取封面');
          e.preventDefault();
        }
        break;
      }
    }
  });

  /* ============================================================
     解包预览
     ============================================================ */

  var extract = {
    buf: null,
    file: null,
    image: null,
    region: null,
    entries: [],
    cache: new Map(),
    payloadOffset: 0,
    coverUrl: null
  };

  var extractDrop = $('extractDrop');
  var extractInput = $('extractInput');
  var extractEmpty = document.querySelector('#extractDrop .drop-empty');
  var extractResult = $('extractResult');
  var extractLoading = $('extractLoading');
  var extractTitle = $('extractTitle');
  var entryList = $('entryList');
  var explorer = $('explorer');
  var extractNotice = $('extractNotice');
  var extractActions = $('extractActions');
  var fileFilter = $('fileFilter');

  function resetExtract() {
    if (extract.coverUrl) { URL.revokeObjectURL(extract.coverUrl); extract.coverUrl = null; }
    extract = { buf: null, file: null, image: null, region: null, entries: [], cache: new Map(), payloadOffset: 0, coverUrl: null };
    extractResult.hidden = true;
    extractLoading.hidden = true;
    extractActions.hidden = true;
    $('extractFileName').hidden = true;
    extractEmpty.hidden = false;
    fileFilter.value = '';
  }

  function setNotice(text, ok) {
    extractNotice.hidden = !text;
    extractNotice.textContent = text || '';
    extractNotice.classList.toggle('is-ok', !!ok);
  }

  function dataOf(entry) {
    if (!extract.cache.has(entry)) {
      extract.cache.set(entry, Seed.entryData(extract.buf, extract.region, entry));
    }
    return extract.cache.get(entry);
  }

  function renderEntryList(filter) {
    var q = (filter || '').trim().toLowerCase();
    var list = extract.entries.filter(function (e) {
      return !e.dir && (!q || e.name.toLowerCase().indexOf(q) > -1);
    });
    var limit = 400;
    var shown = list.slice(0, limit);

    entryList.replaceChildren();
    shown.forEach(function (entry) {
      var row = document.createElement('li');
      row.className = 'entry-row';

      var info = Preview.classify(entry.name);
      var iconMap = { image: '#i-image', video: '#i-play', audio: '#i-music', pdf: '#i-doc', text: '#i-file', font: '#i-font', archive: '#i-zip', other: '#i-file' };
      row.appendChild(icon(iconMap[info.kind] || '#i-file'));

      var nameEl = document.createElement('span');
      nameEl.className = 'entry-name';
      nameEl.title = entry.name;
      var slash = entry.name.lastIndexOf('/');
      if (slash > -1) {
        var pathEl = document.createElement('span');
        pathEl.className = 'path';
        pathEl.textContent = entry.name.slice(0, slash + 1);
        nameEl.appendChild(pathEl);
      }
      nameEl.appendChild(document.createTextNode(entry.name.slice(slash + 1)));
      row.appendChild(nameEl);

      if (!entry.supported) {
        var badge = document.createElement('span');
        badge.className = 'entry-badge';
        badge.textContent = entry.encrypted ? '加密' : '不支持';
        row.appendChild(badge);
        var spacer = document.createElement('span');
        row.appendChild(spacer);
      } else {
        var sizeEl = document.createElement('span');
        sizeEl.className = 'entry-size';
        sizeEl.textContent = Seed.formatBytes(entry.usize);
        row.appendChild(sizeEl);

        var actions = document.createElement('span');
        actions.className = 'entry-actions';

        var eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'entry-btn';
        eye.title = '预览';
        eye.setAttribute('aria-label', '预览 ' + entry.name);
        eye.appendChild(icon('#i-eye'));
        eye.addEventListener('click', function () {
          try {
            Preview.open({ name: baseName(entry.name), data: dataOf(entry) });
          } catch (err) {
            toast(err.message || '预览失败', true);
          }
        });
        actions.appendChild(eye);

        var dl = document.createElement('button');
        dl.type = 'button';
        dl.className = 'entry-btn';
        dl.title = '下载';
        dl.setAttribute('aria-label', '下载 ' + entry.name);
        dl.appendChild(icon('#i-download'));
        dl.addEventListener('click', function () {
          try {
            downloadBlob(dataOf(entry), baseName(entry.name));
          } catch (err) {
            toast(err.message || '下载失败', true);
          }
        });
        actions.appendChild(dl);

        row.appendChild(actions);
      }

      entryList.appendChild(row);
    });

    var countText = q
      ? '匹配 ' + list.length + ' / ' + extract.entries.filter(function (e) { return !e.dir; }).length + ' 个文件'
      : '共 ' + list.length + ' 个文件';
    if (list.length > limit) countText += ' · 仅显示前 ' + limit + ' 个';
    $('explorerCount').textContent = countText;
  }

  function showExtractShell() {
    extractResult.hidden = false;
    extractActions.hidden = false;
    fileFilter.value = '';
  }

  function renderNoArchive(payloadOffset, payloadLen) {
    explorer.hidden = true;
    extractActions.hidden = false;
    $('extractCount').textContent = '—';

    if (payloadLen > 0) {
      var type = Seed.detectPayloadType(extract.buf, payloadOffset);
      $('extractArchive').textContent = type.label;
      setNotice('检测到' + (extract.image ? '图片尾部' : '文件中') + '有 ' + Seed.formatBytes(payloadLen) + ' 的 ' + type.label + ' 数据，但无法在浏览器中直接解压。可下载内嵌数据后使用本地工具打开。');
      $('btnDownloadPayload').hidden = false;
    } else if (extract.image) {
      $('extractArchive').textContent = '未发现';
      setNotice('未发现内嵌的压缩数据，这似乎只是一张普通图片。', true);
      $('btnDownloadPayload').hidden = true;
    } else {
      $('extractArchive').textContent = '未发现';
      setNotice('未能识别出图片或压缩包结构，文件可能已损坏或格式特殊。');
      $('btnDownloadPayload').hidden = payloadLen > 0;
    }
  }

  function renderExtractResult() {
    var buf = extract.buf;
    var image = extract.image;
    var region = extract.region;

    extractTitle.textContent = extract.file.name;
    $('extractTotal').textContent = Seed.formatBytes(buf.length);
    $('extractFormat').textContent = image ? image.fmt.toUpperCase() : '无（未检测到图片）';

    var figure = $('coverFigure');
    if (image) {
      var end = image.end > 0 ? Math.min(image.end, buf.length) : buf.length;
      var coverData = buf.subarray(0, end);
      var url = URL.createObjectURL(new Blob([coverData], { type: image.mime }));
      extract.coverUrl = url;
      $('extractCover').src = url;
      $('extractCover').onerror = function () {
        figure.classList.add('is-missing');
      };
      figure.classList.remove('is-missing');
    } else {
      figure.classList.add('is-missing');
    }

    showExtractShell();

    if (region) {
      try {
        var parsed = Seed.readZip(buf, region);
        extract.entries = parsed.entries;
        var files = parsed.entries.filter(function (e) { return !e.dir; });

        $('extractArchive').textContent = 'ZIP';
        $('extractCount').textContent = files.length + ' 个文件';
        explorer.hidden = false;
        renderEntryList('');
        $('btnDownloadPayload').hidden = false;

        var encrypted = files.filter(function (e) { return !e.supported; }).length;
        if (encrypted) {
          setNotice('有 ' + encrypted + ' 个文件使用了加密或不支持的压缩算法，无法在浏览器中预览与解压。');
        } else if (!image) {
          setNotice('该文件本身是一个 ZIP 压缩包，已直接列出内容。', true);
        } else {
          setNotice('');
        }
      } catch (err) {
        console.error(err);
        extract.entries = [];
        $('extractArchive').textContent = 'ZIP（解析失败）';
        setNotice('检测到 ZIP 结构，但解析失败：' + (err.message || '未知错误'));
        explorer.hidden = true;
        $('btnDownloadPayload').hidden = false;
        $('extractCount').textContent = '—';
      }
    } else {
      var payloadOffset = image && image.end > 0 ? image.end : 0;
      extract.payloadOffset = payloadOffset;
      renderNoArchive(payloadOffset, buf.length - payloadOffset);
    }

    extractResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function analyzeFile(file) {
    if (!file) return;
    extractInput.value = '';
    resetExtract();

    extract.file = file;
    $('extractFileName').hidden = false;
    extractEmpty.hidden = true;
    $('extractFileName').replaceChildren(icon('#i-file'), document.createTextNode(file.name));
    extractLoading.hidden = false;

    file.arrayBuffer().then(function (ab) {
      extract.buf = new Uint8Array(ab);
      extract.image = Seed.sniffImage(extract.buf);
      extract.region = Seed.findZip(extract.buf);
      extractLoading.hidden = true;
      renderExtractResult();
    }).catch(function (err) {
      console.error(err);
      extractLoading.hidden = true;
      toast('读取文件失败', true);
    });
  }

  makeDropzone(extractDrop, extractInput, function (files) { analyzeFile(files[0]); });

  on(fileFilter, 'input', function () { renderEntryList(fileFilter.value); });

  on($('btnDownloadAll'), 'click', function () {
    if (!extract.region || !extract.entries.length) return;
    var btn = $('btnDownloadAll');
    var original = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '正在打包…';

    tick().then(function () {
      var files = [];
      extract.entries.forEach(function (entry) {
        if (entry.dir || !entry.supported) return;
        files.push({ name: entry.name, data: dataOf(entry) });
      });
      if (!files.length) throw new Error('没有可解压的文件');
      var zip = Seed.zipFiles(files, 6);
      var name = extract.file.name.replace(/\.[a-z0-9]+$/i, '') + '_解包.zip';
      downloadBlob(zip, name, 'application/zip');
      toast('已开始下载（' + files.length + ' 个文件）');
    }).catch(function (err) {
      console.error(err);
      toast(err.message || '打包失败', true);
    }).finally(function () {
      btn.disabled = false;
      btn.innerHTML = original;
    });
  });

  on($('btnDownloadPayload'), 'click', function () {
    if (!extract.buf) return;
    var offset = extract.region ? extract.region.start : extract.payloadOffset;
    if (offset >= extract.buf.length) {
      toast('没有可下载的内嵌数据', true);
      return;
    }
    var type = Seed.detectPayloadType(extract.buf, offset);
    var extMap = { zip: 'zip', rar: 'rar', '7z': '7z', gzip: 'gz', xz: 'xz', bzip2: 'bz2', pdf: 'pdf', unknown: 'bin' };
    var name = extract.file.name.replace(/\.[a-z0-9]+$/i, '') + '.' + (extMap[type.type] || 'bin');
    downloadBlob(extract.buf.subarray(offset), name);
    toast('已开始下载内嵌数据');
  });

  on($('btnResetExtract'), 'click', function () {
    resetExtract();
    extractInput.value = '';
  });

  refreshComposeUI();
  resetExtract();
})();
