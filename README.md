# 图种工坊 · Seed Archive

在线使用：**https://seedmap.003153.xyz**

把任意文件封进一张图片里的纯前端工具：打开是照片，改后缀即可解压出里面的内容。

原项目：[CasparGX/js-seed-map](https://github.com/CasparGX/js-seed-map)，本版本对前端与功能进行了完整重写。

## 功能

- **制作图种**：选择封面图（JPG / PNG / GIF / WebP / AVIF），拖入文件或整个文件夹，压缩后拼接到图片末尾，输出仍可正常显示的图种。
  - 支持多文件、文件夹（保留相对路径）
  - 快速 / 标准 / 极限三档压缩级别
  - 生成结果可直接预览与下载
- **解包预览**：拖入图种、普通 ZIP 或任意二进制文件，自动识别图片边界与内嵌 ZIP。
  - 自动拆分封面图与压缩数据
  - 文件列表、搜索过滤、单文件下载、全部打包下载
  - 在线预览：图片、视频、音频、PDF、文本 / 代码 / JSON、字体、SVG
  - 识别 RAR / 7z / GZIP 等格式并提示，可下载内嵌原始数据
- 所有处理均在浏览器本地完成，不上传任何文件。

## 目录结构

```
index.html            页面结构
css/style.css         视觉样式
js/app.js             交互逻辑
js/lib/seed.js        图像边界识别、ZIP 解析与打包
js/lib/preview.js     多格式预览
js/vendor/fflate.js   ZIP 引擎（fflate 0.8.3，MIT）
```

## 本地运行

任意静态服务器即可：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

也可以直接双击 `index.html`：所有脚本都是普通 `<script>`，无需构建或联网。

## 已知限制

- 浏览器端仅支持 **ZIP** 解压；RAR / 7z 只能识别并提供原始数据下载。
- 加密 ZIP 无法在浏览器中解密。
- HEIC 等格式的预览取决于浏览器支持。
- ZIP64（超过 4GB）暂不支持。
