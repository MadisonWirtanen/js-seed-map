/* ============================================================
   Seed · 图种核心字节逻辑
   - 图像边界识别（JPEG / PNG / GIF / WebP / BMP / AVIF）
   - 内嵌 ZIP 定位、中央目录解析与解压
   - ZIP 打包与拼合
   依赖全局 fflate
   ============================================================ */
(function (global) {
  'use strict';

  var F = global.fflate;

  var U32 = 4294967296;

  function u16le(u8, o) { return u8[o] | (u8[o + 1] << 8); }
  function u32le(u8, o) {
    return (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
  }
  function u64le(u8, o) { return u32le(u8, o + 4) * U32 + u32le(u8, o); }
  function be32(u8, o) {
    return ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
  }
  function ascii(u8, o, n) {
    var s = '';
    for (var i = 0; i < n && o + i < u8.length; i++) s += String.fromCharCode(u8[o + i]);
    return s;
  }

  /* ---------------- 图像边界 ---------------- */

  // 解析 JPEG 标记段，找到 EOI（FF D9）的真实结束位置
  function jpegEnd(u8) {
    if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return -1;
    var i = 2;
    while (i < u8.length - 1) {
      if (u8[i] !== 0xff) { i++; continue; }
      var m = u8[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd9) return i + 2;
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (i + 4 > u8.length) return -1;
      var len = (u8[i + 2] << 8) | u8[i + 3];
      if (len < 2) return -1;
      if (m === 0xda) {
        // 扫描熵编码数据，跳过 FF00 / RST，直到遇到下一个真实标记
        var j = i + 2 + len;
        while (j < u8.length - 1) {
          if (u8[j] !== 0xff) { j++; continue; }
          var n = u8[j + 1];
          if (n === 0x00 || n === 0xff || (n >= 0xd0 && n <= 0xd7)) { j += 2; continue; }
          if (n === 0xd9) return j + 2;
          break;
        }
        if (j >= u8.length - 1) return -1;
        i = j;
        continue;
      }
      i += 2 + len;
    }
    return -1;
  }

  function pngEnd(u8) {
    var p = 8;
    while (p + 12 <= u8.length) {
      var len = be32(u8, p);
      var type = ascii(u8, p + 4, 4);
      p += 12 + len;
      if (p > u8.length) return u8.length;
      if (type === 'IEND') return p;
    }
    return -1;
  }

  function gifSkipBlocks(u8, p) {
    while (p < u8.length) {
      var n = u8[p++];
      if (n === 0) return p;
      p += n;
    }
    return u8.length;
  }

  function gifEnd(u8) {
    if (u8.length < 13) return -1;
    var p = 13;
    var packed = u8[10];
    if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
    while (p < u8.length) {
      var b = u8[p];
      if (b === 0x3b) return p + 1;
      if (b === 0x21) {
        p = gifSkipBlocks(u8, p + 2);
      } else if (b === 0x2c) {
        if (p + 10 > u8.length) return -1;
        var lp = u8[p + 9];
        p += 10;
        if (lp & 0x80) p += 3 * (1 << ((lp & 7) + 1));
        p += 1;
        p = gifSkipBlocks(u8, p);
      } else {
        return -1;
      }
    }
    return -1;
  }

  function isobmffEnd(u8) {
    var p = 0;
    while (p + 8 <= u8.length) {
      var size = be32(u8, p);
      var header = 8;
      if (size === 1) {
        if (p + 16 > u8.length) return u8.length;
        size = u64le(u8, p + 8);
        header = 16;
      } else if (size === 0) {
        return u8.length;
      }
      if (size < header) return u8.length;
      p += size;
      if (p > u8.length) return u8.length;
    }
    return p || -1;
  }

  function sniffImage(u8) {
    if (!u8 || u8.length < 12) return null;

    if (u8[0] === 0xff && u8[1] === 0xd8) {
      var je = jpegEnd(u8);
      return { fmt: 'jpeg', ext: 'jpg', mime: 'image/jpeg', end: je > 0 ? je : -1, previewable: true };
    }
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
      var pe = pngEnd(u8);
      return { fmt: 'png', ext: 'png', mime: 'image/png', end: pe > 0 ? pe : -1, previewable: true };
    }
    if (ascii(u8, 0, 6) === 'GIF87a' || ascii(u8, 0, 6) === 'GIF89a') {
      var ge = gifEnd(u8);
      return { fmt: 'gif', ext: 'gif', mime: 'image/gif', end: ge > 0 ? ge : -1, previewable: true };
    }
    if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 4) === 'WEBP') {
      var we = 8 + u32le(u8, 4);
      return { fmt: 'webp', ext: 'webp', mime: 'image/webp', end: we > 0 && we <= u8.length ? we : -1, previewable: true };
    }
    if (u8[0] === 0x42 && u8[1] === 0x4d) {
      var be = u32le(u8, 2);
      return { fmt: 'bmp', ext: 'bmp', mime: 'image/bmp', end: be > 0 && be <= u8.length ? be : -1, previewable: true };
    }
    if (ascii(u8, 4, 4) === 'ftyp') {
      var brand = ascii(u8, 8, 4).toLowerCase();
      if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
        return { fmt: 'avif', ext: 'avif', mime: 'image/avif', end: isobmffEnd(u8), previewable: true };
      }
      if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'heim' || brand === 'msf1') {
        return { fmt: 'heic', ext: 'heic', mime: 'image/heic', end: isobmffEnd(u8), previewable: false };
      }
    }
    return null;
  }

  /* ---------------- ZIP 定位 ---------------- */

  function findZip(u8) {
    var min = Math.max(0, u8.length - 22 - 65535);
    var eocd = -1;
    for (var i = u8.length - 22; i >= min; i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return null;

    var cdSize = u32le(u8, eocd + 12);
    var cdOff = u32le(u8, eocd + 16);
    var commentLen = u16le(u8, eocd + 20);
    var end = Math.min(eocd + 22 + commentLen, u8.length);
    var cdActual = eocd - cdSize;
    var start = cdActual - cdOff;

    if (start < 0 || cdActual < 0 || start >= eocd) return null;
    if (!(u8[start] === 0x50 && u8[start + 1] === 0x4b && u8[start + 2] === 0x03 && u8[start + 3] === 0x04)) {
      // 起点校验失败时退化为在附近搜索首个本地文件头
      var found = -1;
      var lo = Math.max(0, start - 512);
      for (var k = lo; k < cdActual - 3; k++) {
        if (u8[k] === 0x50 && u8[k + 1] === 0x4b && u8[k + 2] === 0x03 && u8[k + 3] === 0x04) { found = k; break; }
      }
      if (found < 0) return null;
      start = found;
    }
    return { start: start, end: end, cdOffset: start + cdOff, commentLen: commentLen };
  }

  /* ---------------- ZIP 读取 ---------------- */

  function decodeName(raw, flags) {
    if (flags & 0x800) return new TextDecoder('utf-8').decode(raw);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch (e) {
      try { return new TextDecoder('gbk').decode(raw); } catch (e2) { return new TextDecoder('utf-8').decode(raw); }
    }
  }

  function parseZip64Extra(extra, entry) {
    var p = 0;
    while (p + 4 <= extra.length) {
      var id = u16le(extra, p);
      var size = u16le(extra, p + 2);
      var q = p + 4;
      if (id === 0x0001) {
        if (entry.usize === 0xffffffff && q + 8 <= extra.length) { entry.usize = u64le(extra, q); q += 8; }
        if (entry.csize === 0xffffffff && q + 8 <= extra.length) { entry.csize = u64le(extra, q); q += 8; }
        if (entry.localOffset === 0xffffffff && q + 8 <= extra.length) { entry.localOffset = u64le(extra, q); q += 8; }
      }
      p += 4 + size;
    }
  }

  function readZip(u8, region) {
    var zip = u8.subarray(region.start, region.end);
    var eocd = -1;
    for (var i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x05 && zip[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('未找到 ZIP 目录结构');

    var count = u16le(zip, eocd + 10);
    var cdOff = u32le(zip, eocd + 16);
    var p = cdOff;
    var entries = [];

    for (var n = 0; n < count; n++) {
      if (p + 46 > zip.length || ascii(zip, p, 4) !== 'PK\x01\x02') break;

      var flags = u16le(zip, p + 8);
      var method = u16le(zip, p + 10);
      var crc = u32le(zip, p + 16);
      var csize = u32le(zip, p + 20);
      var usize = u32le(zip, p + 24);
      var nameLen = u16le(zip, p + 28);
      var extraLen = u16le(zip, p + 30);
      var commentLen = u16le(zip, p + 32);
      var localOffset = u32le(zip, p + 42);
      var nameRaw = zip.subarray(p + 46, p + 46 + nameLen);
      var extra = zip.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);

      var entry = {
        name: decodeName(nameRaw, flags),
        flags: flags,
        method: method,
        crc: crc,
        csize: csize,
        usize: usize,
        localOffset: localOffset,
        encrypted: !!(flags & 0x1),
        dir: false,
        supported: false
      };
      if (entry.usize === 0xffffffff || entry.csize === 0xffffffff || entry.localOffset === 0xffffffff) {
        parseZip64Extra(extra, entry);
      }
      entry.dir = /\/$/.test(entry.name);
      entry.supported = !entry.encrypted && (entry.method === 0 || entry.method === 8);
      entries.push(entry);

      p += 46 + nameLen + extraLen + commentLen;
    }

    return { entries: entries, region: region };
  }

  function entryData(u8, region, entry) {
    if (!entry.supported) throw new Error(entry.encrypted ? '文件已加密，浏览器端暂不支持' : '不支持的压缩算法');
    var zip = u8.subarray(region.start, region.end);
    var lp = entry.localOffset;
    if (ascii(zip, lp, 4) !== 'PK\x03\x04') throw new Error('本地文件头损坏');
    var nameLen = u16le(zip, lp + 26);
    var extraLen = u16le(zip, lp + 28);
    var dataStart = lp + 30 + nameLen + extraLen;
    var raw = zip.subarray(dataStart, dataStart + entry.csize);

    if (entry.method === 0) return raw.slice();
    return F.inflateSync(raw);
  }

  /* ---------------- ZIP 打包 ---------------- */

  function extensionOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function zipFiles(files, level) {
    // files: [{ name, data: Uint8Array }]
    var obj = {};
    files.forEach(function (f) {
      var name = String(f.name || 'file').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!name) return;
      obj[name] = f.data;
    });
    return F.zipSync(obj, { level: typeof level === 'number' ? level : 6 });
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  /* ---------------- 其他工具 ---------------- */

  function detectPayloadType(u8, offset) {
    offset = offset || 0;
    var s = u8.subarray(offset, offset + 8);
    if (ascii(s, 0, 4) === 'PK\x03\x04') return { type: 'zip', label: 'ZIP' };
    if (ascii(s, 0, 4) === 'Rar!') return { type: 'rar', label: 'RAR' };
    if (ascii(s, 0, 6) === '7z\xBC\xAF\x27\x1C') return { type: '7z', label: '7Z' };
    if (s[0] === 0x1f && s[1] === 0x8b) return { type: 'gzip', label: 'GZIP' };
    if (s[0] === 0xfd && ascii(s, 1, 5) === '7zXZ\x00') return { type: 'xz', label: 'XZ' };
    if (ascii(s, 0, 3) === 'BZh') return { type: 'bzip2', label: 'BZIP2' };
    if (ascii(s, 0, 4) === '%PDF') return { type: 'pdf', label: 'PDF' };
    return { type: 'unknown', label: '未知数据' };
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var v = n / 1024;
    var i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)) + ' ' + units[i];
  }

  function readText(u8, maxBytes) {
    var slice = u8;
    var truncated = false;
    if (maxBytes && u8.length > maxBytes) { slice = u8.subarray(0, maxBytes); truncated = true; }
    var text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(slice);
    } catch (e) {
      try { text = new TextDecoder('gbk').decode(slice); } catch (e2) { text = new TextDecoder('utf-8').decode(slice); }
    }
    return { text: text.replace(/^\uFEFF/, ''), truncated: truncated };
  }

  global.Seed = {
    sniffImage: sniffImage,
    findZip: findZip,
    readZip: readZip,
    entryData: entryData,
    zipFiles: zipFiles,
    concat: concat,
    detectPayloadType: detectPayloadType,
    extensionOf: extensionOf,
    formatBytes: formatBytes,
    readText: readText
  };
})(window);
