# 工具箱（Toolbox）

一个**纯前端、零依赖、无服务端**的个人数据工作台。所有数据只保存在浏览器本地（localStorage），无需登录，刷新不丢失。

线上地址：
- Qoder Sites：https://daily-toolbox-fkxfixhzia3.qoder.website
- Cloudflare Pages：https://toolbox-7h7.pages.dev

## 功能

### JSON 工作台
- **容错解析**：自动去除转义与包裹引号（识别 `"{\"a\":1}"` 这类日志串）；兼容 Java toString 风格文本（无引号键值、带空格日期、中文值、`;` 分隔、括号内逗号）；缺失的括号/引号/逗号/值自动补全，补全部分以绿色虚线标记
- **格式化与折叠**：语法高亮、按块折叠/展开、一键复制
- **内嵌 JSON 字符串自动展开**（带徽标提示，可开关）
- **JSONPath 筛选**：支持 `$`、`.name`、`[0]`、`['key']`、`[*]`、`..name`
- **大整数保真**：19 位雪花 ID 等超出 JS Number 精度的整数按原始字面量保留（BigInt）
- **历史**：自动保存、双击回填、勾选两条对比差异（行级高亮）、单条/全部删除

### 正则工具
- 实时语法校验（错误直接给出原因）
- g / i / m / s / u 标志位开关
- 测试文本命中高亮预览、逐条提取全文/编号组/命名组、一键复制全部匹配

### 二维码
- **识别**：选择文件 / 拖拽 / Ctrl+V 粘贴截图，本地解码不上传；透明底 PNG 自动合成白底
- **生成**：输入即出图，UTF-8 中文支持，容错级 L/M/Q/H 与小/中/大尺寸，下载 PNG 或复制图片
- 解码库（jsQR）与生成库按需加载，仅在打开该页签时拉取

### 小工具
- **计时器**：开始/暂停/归零，今日累计时长本地保存
- **时间戳**：当前时间/秒/毫秒点即复制；时间 ⇄ 时间戳双向转换，自动识别 10 位秒 / 13 位毫秒
- **雪花 ID**：标准 41/5/5/12 结构解析（时间、数据中心位、机器位、序列号）；粘贴日志文本可批量提取 ID；支持按“已知 ID + 真实生成时间”校准自定义纪元

## 技术说明

- 纯静态：`web/` 目录即部署产物，无构建步骤、无包管理依赖
- `web/jsoncore.js`：容错分词器 + 修复器 + JSONPath + 行级 diff（零依赖，可在 Node 中单测）
- `web/app.js`：界面与交互；`web/jsqr.min.js`、`web/qrcode-gen.min.js`：第三方库（按需加载）
- 数据：全部存于浏览器 localStorage（输入内容、历史、纪元偏好、统计、计时），换浏览器/域名数据不互通；无任何网络上报

## 本地运行

任选一个静态服务器指向 `web/`：

```bash
npx serve web
# 或
python -m http.server 8000 -d web
```

## 部署

```bash
# Cloudflare Pages（项目名 toolbox，首次需 wrangler login）
wrangler pages deploy web --project-name toolbox
```

Qoder Sites 侧通过 Desktop 的发布流程更新（源码目录即本项目，输出目录 `web`）。

## 许可

[MIT](LICENSE)
