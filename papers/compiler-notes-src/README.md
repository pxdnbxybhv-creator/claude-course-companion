# 《编译器是怎样炼成的》讲义源文件

OSTEP 风格的编译原理讲义（第一部：概览与扫描），为 iPad Pro 11″ 阅读排版。
成品 PDF 在仓库的 `pdf/` 目录。

## 文件

| 文件 | 内容 |
|---|---|
| `00_front.html` | 封面、致读者、目录 |
| `ch0.html` | 第 0 章 预备知识 |
| `ch1.html` | 第 1 章 编译器概览 |
| `ch2.html` | 第 2 章 扫描 |
| `appendix.html` | 附录 A/B/C |
| `style.css` | 版式（页面尺寸 165×236 mm、盒子、表格、代码） |
| `diagrams.js` | 内联 SVG 图形引擎：有限自动机 / 树 / T 型图 / 框图 |
| `build.js` | 拼接 → paged.js 分页 → Chromium 输出 PDF |
| `fetch-assets.py` | 下载字体（Noto Serif/Sans SC、JetBrains Mono）与 paged.js |

## 重新生成

```bash
python3 fetch-assets.py            # 生成 fonts/、lib/、fonts.css（只需一次）
npm i -g playwright                 # 需要 Chromium；已安装可跳过
NODE_PATH=$(npm root -g) node build.js out.pdf
```

## 图的写法

在 HTML 里放一个 `<div class="diagram" id="xxx">`，紧跟一个
`<script type="text/diagram" data-kind="fa|tree|tdiag|flow" data-target="xxx">{ ... }</script>`，
里面是一个 JS 对象字面量，`build.js` 渲染时由 `diagrams.js` 转成 SVG。

## 排版注意

- paged.js 每个命名字符串（`string-set`）只保留一个选择器，多个来源要写在同一条规则里。
- 被跨页拆分的容器会被 paged.js 加上 `text-align-last: justify`，所以只对 `p, li` 使用两端对齐。
