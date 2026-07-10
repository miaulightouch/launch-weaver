# LaunchWeaver 專案規格書

## 1. 專案定位

**LaunchWeaver** 是一個桌面遊戲客戶端用的啟動參數結構化編輯工具。

它的核心目標是將原本單一文字欄位形式的啟動參數，轉換成可視化、可驗證、可編輯、可還原的設定介面，讓使用者可以更安全地管理環境變數、前置包裝命令、遊戲參數與相容層相關設定。

本工具不負責取代遊戲啟動流程，也不負責直接啟動遊戲。它的本質是：

```text
啟動參數欄位
⇄ parser / decompiler
⇄ 結構化設定模型
⇄ UI 編輯器
⇄ compiler
⇄ 啟動參數欄位
```

## 2. 專案目標

LaunchWeaver 的主要目標如下：

1. 將啟動參數中的環境變數拆解為可視化表格。
2. 將 `%command%` 前後的啟動結構拆成可理解的區塊。
3. 讓使用者透過 UI 管理常見設定，不需要手寫整串啟動參數。
4. 儲存時可將 UI 狀態重新編譯回合法的啟動參數字串。
5. 保留原始啟動參數中無法辨識或不支援的片段，避免破壞既有設定。
6. 提供 raw mode，允許進階使用者直接編輯原始啟動參數。
7. 提供 presets，快速加入常見的環境變數與包裝命令。
8. 提供變更前後 diff、備份與還原，降低誤改風險。

## 3. 非目標

LaunchWeaver 不處理以下事項：

1. 不直接修改作業系統全域環境變數。
2. 不注入或修改已啟動遊戲程序的環境變數。
3. 不取代原遊戲客戶端的啟動功能。
4. 不假設所有啟動參數都能安全完整解析。
5. 不強制改寫使用者原有的 raw 啟動參數。
6. 不依賴 shell wrapper 作為核心執行模型。
7. 不將任何特定平台、商店、相容層或第三方框架名稱放入產品名稱。

## 4. 使用場景

### 4.1 一般環境變數設定

使用者原本需要手動輸入：

```bash
FOO=1 BAR=baz %command%
```

LaunchWeaver 顯示為：

```text
Environment Variables
FOO = 1
BAR = baz

Command
%command%
```

儲存後重新編譯為：

```bash
FOO=1 BAR=baz %command%
```

### 4.2 相容層除錯設定

使用者想啟用相容層 log、指定除錯參數、開啟圖形 API 診斷資訊。
LaunchWeaver 提供 preset，讓使用者勾選後自動產生對應環境變數。

### 4.3 前置包裝命令

使用者原本輸入：

```bash
MANGOHUD=1 gamemoderun %command%
```

LaunchWeaver 拆解為：

```text
Environment Variables
MANGOHUD = 1

Wrappers
gamemoderun

Command
%command%
```

### 4.4 遊戲參數

使用者原本輸入：

```bash
FOO=1 %command% -novid -fullscreen
```

LaunchWeaver 拆解為：

```text
Environment Variables
FOO = 1

Game Arguments
-novid
-fullscreen
```

### 4.5 無法安全解析的複雜啟動參數

例如：

```bash
bash -c 'echo test; exec "$@"' dummy %command%
```

LaunchWeaver 不硬拆，改顯示：

```text
此啟動參數包含複雜 shell 語法，無法保證安全反解析。
目前已切換為 Raw Mode。
```

## 5. 核心概念

### 5.1 啟動參數模型

LaunchWeaver 使用以下內部資料模型：

```ts
type LaunchConfig = {
  env: EnvVar[];
  prefix: Token[];
  command: "%command%" | null;
  suffix: Token[];
  raw?: string;
  parseMode: "structured" | "partial" | "raw";
  warnings: ParseWarning[];
};

type EnvVar = {
  key: string;
  value: string;
  enabled: boolean;
  source?: "user" | "preset" | "imported";
};

type Token = {
  value: string;
  quoted?: boolean;
  original?: string;
};

type ParseWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
};
```

### 5.2 啟動參數結構

LaunchWeaver 優先支援以下保守語法：

```text
[ENV...] [PREFIX...] %command% [ARGS...]
```

範例：

```bash
A=1 B="hello world" wrapper-a wrapper-b %command% -arg1 -arg2
```

解析結果：

```text
ENV:
A = 1
B = hello world

PREFIX:
wrapper-a
wrapper-b

COMMAND:
%command%

ARGS:
-arg1
-arg2
```

## 6. Parser / Decompiler 規格

### 6.1 Tokenizer 必須支援

Tokenizer 不得使用單純空白切割。至少需支援：

1. 空白分隔。
2. 單引號。
3. 雙引號。
4. 反斜線 escape。
5. `KEY=value`。
6. `%command%`。
7. 空字串值。
8. value 中包含空白。
9. value 中包含 `=`。
10. 原始 token 保留。

### 6.2 Env 判斷規則

只有在 `%command%` 前方，且符合以下格式的 token 才可判定為環境變數：

```text
KEY=value
```

其中 `KEY` 必須符合：

```regex
^[A-Za-z_][A-Za-z0-9_]*$
```

範例：

```bash
FOO=1 BAR="hello world" %command% -x=y
```

解析為：

```text
ENV:
FOO = 1
BAR = hello world

ARGS:
-x=y
```

`-x=y` 不可被誤判為環境變數。

### 6.3 `%command%` 規則

1. 若存在 `%command%`，它是啟動命令的分界點。
2. `%command%` 前方為 env 與 prefix。
3. `%command%` 後方為 game args。
4. 若不存在 `%command%`，仍可進入 partial mode，但 UI 必須警告使用者。
5. 若出現多個 `%command%`，進入 partial mode，並提示可能無法安全重組。

### 6.4 Prefix 判斷

在 `%command%` 前方，非 env token 視為 prefix。

例如：

```bash
FOO=1 wrapper-a wrapper-b %command%
```

解析為：

```text
ENV:
FOO = 1

PREFIX:
wrapper-a
wrapper-b
```

### 6.5 Raw Mode 條件

遇到以下狀況時，應進入 raw mode 或 partial mode：

1. shell command substitution，例如 `$()`。
2. pipeline，例如 `|`。
3. redirect，例如 `>`, `2>`, `<`。
4. command separator，例如 `;`, `&&`, `||`。
5. unmatched quote。
6. tokenizer 無法安全還原。
7. 多層 shell 包裝且無法判定 `%command%` 邊界。

Raw mode 中仍允許使用者手動編輯完整啟動參數，但不顯示結構化 env 表格。

## 7. Compiler 規格

### 7.1 輸出順序

structured mode 的輸出順序固定為：

```text
enabled env vars
prefix tokens
%command%
suffix tokens
```

例如：

```bash
A=1 B="hello world" wrapper %command% -fullscreen
```

### 7.2 Quoting 規則

compiler 必須在必要時自動 quote value。

需要 quote 的條件：

1. value 含空白。
2. value 含 shell 特殊字元。
3. value 為空字串。
4. value 含引號或反斜線。

範例：

```text
FOO = hello world
```

輸出：

```bash
FOO='hello world'
```

### 7.3 保留原始 token

若 token 未被 UI 修改，compiler 應優先保留原始字串，降低重排或 quote 變動造成的差異。

### 7.4 Diff

儲存前必須提供 before / after diff。

範例：

```diff
- FOO=1 %command%
+ FOO=1 BAR=2 %command%
```

## 8. UI 規格

### 8.1 主畫面

主畫面包含以下區塊：

```text
LaunchWeaver

Current App
- Title
- App ID
- Launch Options status

Environment Variables
- Key
- Value
- Enabled
- Source
- Actions

Wrappers / Prefix
- Ordered list
- Add
- Remove
- Reorder

Command
- %command% status

Game Arguments
- Token list
- Raw text editor option

Presets
- Compatibility
- Debugging
- Graphics
- Performance
- Overlay

Raw
- Show raw
- Edit raw
- Copy raw

Actions
- Save
- Revert
- Restore backup
```

### 8.2 Env 編輯表格

每列包含：

```text
Enabled checkbox
Key input
Value input
Source badge
Delete button
```

功能：

1. 新增 env。
2. 刪除 env。
3. 暫時停用 env。
4. duplicate key 警告。
5. key 格式驗證。
6. value 自動 quote 預覽。
7. 顯示 preset 來源。

### 8.3 Preset 系統

Preset 格式：

```ts
type Preset = {
  id: string;
  name: string;
  description: string;
  env?: Record<string, string>;
  prefix?: string[];
  suffix?: string[];
  tags: string[];
};
```

Preset 套用規則：

1. 不直接覆蓋既有 key，除非使用者確認。
2. 可顯示即將新增、修改、衝突的項目。
3. 可一鍵移除由該 preset 新增的設定。
4. preset 不應綁定特定商標名稱；可使用一般分類名稱。

Preset 類別範例：

```text
Debug Logging
Frame Overlay
Graphics Diagnostics
Performance Wrapper
Compatibility Flags
Custom Runtime
```

### 8.4 Raw Mode UI

Raw mode 包含：

1. 完整原始啟動參數文字框。
2. parse warning 顯示。
3. 嘗試重新解析按鈕。
4. 儲存前 diff。
5. 還原上一版按鈕。

## 9. 資料儲存

LaunchWeaver 至少需要儲存以下資料：

```text
per-app backup
per-app UI state cache
preset definitions
plugin preferences
```

建議資料目錄：

```text
~/.config/launchweaver/
  config.json
  presets/
    builtin.json
    user.json
  backups/
    <app-id>/
      2026-07-10T10-00-00.json
```

Backup 格式：

```ts
type Backup = {
  appId: string;
  appTitle?: string;
  createdAt: string;
  rawBefore: string;
  rawAfter?: string;
  parsed?: LaunchConfig;
};
```

## 10. 安全性與隱私

### 10.1 不主動上傳資料

LaunchWeaver 不應上傳使用者的啟動參數、環境變數或遊戲清單。

### 10.2 Secret 顯示

Env key 若符合以下關鍵字，UI 預設遮蔽 value：

```text
TOKEN
SECRET
PASSWORD
PASS
KEY
AUTH
COOKIE
```

使用者可手動點擊顯示。

### 10.3 Log 限制

預設不輸出 env value 到 log。

Verbose mode 可顯示完整內容，但 UI 必須提示：

```text
Verbose output may expose secrets.
```

### 10.4 寫入保護

儲存前必須：

1. 產生 backup。
2. 顯示 diff。
3. 確認目標 app id。
4. 避免覆寫非目前 app 的設定。

## 11. 錯誤處理

### 11.1 Parser Error

若解析失敗：

```text
無法安全解析目前啟動參數。
已切換到 Raw Mode。
原始內容不會被修改。
```

### 11.2 Missing `%command%`

若缺少 `%command%`：

```text
目前啟動參數缺少命令佔位符，可能導致遊戲無法正常啟動。
```

提供按鈕：

```text
Insert %command%
```

### 11.3 Duplicate Env Key

若重複 key：

```text
同一個環境變數被設定多次，後面的值通常會覆蓋前面的值。
```

UI 可提示使用者合併或保留。

### 11.4 Write Failed

寫入失敗時：

1. 顯示錯誤。
2. 不丟棄目前 UI 狀態。
3. 提供 copy raw output。
4. 提供手動貼上模式。

## 12. 相容性策略

LaunchWeaver 應避免依賴不穩定的 UI selector。
若必須與宿主客戶端互動，應抽象為 adapter。

```ts
interface LaunchOptionsAdapter {
  getCurrentApp(): Promise<AppInfo | null>;
  readLaunchOptions(appId: string): Promise<string>;
  writeLaunchOptions(appId: string, value: string): Promise<void>;
  openNativeProperties?(appId: string): Promise<void>;
}
```

這樣未來可替換不同讀寫方式：

```text
Client internal API adapter
DOM patch adapter
Config file adapter
Manual copy adapter
```

MVP 可以先提供 manual copy adapter，確保核心 parser/compiler/UI 可以獨立運作。

## 13. MVP 範圍

第一版 MVP 必須包含：

1. 讀取目前 raw 啟動參數。
2. shell-like tokenizer。
3. env / prefix / `%command%` / args 拆解。
4. env 表格編輯。
5. raw preview。
6. compile 回啟動參數字串。
7. copy compiled output。
8. save 前 backup。
9. save 前 diff。
10. raw mode fallback。
11. 基本 preset 系統。
12. secret value 遮蔽。

MVP 不強制包含：

1. 自動 patch 原生設定頁。
2. 複雜 shell script 反解析。
3. 雲端同步。
4. preset marketplace。
5. 多平台商店支援。

## 14. Milestones

### Milestone 1：Core Parser

目標：

1. 完成 tokenizer。
2. 完成 structured decompiler。
3. 完成 compiler。
4. 完成 parser test cases。

驗收：

```text
輸入: A=1 B="hello world" %command% -x
輸出:
env A=1
env B=hello world
command %command%
args -x
```

### Milestone 2：Standalone UI

目標：

1. 建立獨立 UI。
2. 可貼上 raw launch options。
3. 可編輯 env。
4. 可產生 compiled output。
5. 可顯示 diff。

### Milestone 3：Client Plugin Integration

目標：

1. 可取得目前 app id。
2. 可讀取目前啟動參數。
3. 可將編譯結果寫回或 copy。
4. 可建立 backup。

### Milestone 4：Preset System

目標：

1. 內建 presets。
2. 使用者自定 presets。
3. preset conflict UI。
4. preset remove / rollback。

### Milestone 5：Hardening

目標：

1. 更多 parser edge cases。
2. raw mode 穩定性。
3. secret masking。
4. error recovery。
5. write failure fallback。

## 15. 測試案例

### 15.1 基本 env

Input：

```bash
FOO=1 %command%
```

Expected：

```text
env FOO=1
command %command%
```

### 15.2 多 env

Input：

```bash
A=1 B=2 C=3 %command%
```

Expected：

```text
env A=1
env B=2
env C=3
```

### 15.3 value 含空白

Input：

```bash
FOO="hello world" %command%
```

Expected：

```text
env FOO=hello world
```

Compile：

```bash
FOO='hello world' %command%
```

### 15.4 prefix

Input：

```bash
FOO=1 wrapper-a wrapper-b %command%
```

Expected：

```text
env FOO=1
prefix wrapper-a
prefix wrapper-b
```

### 15.5 suffix args

Input：

```bash
FOO=1 %command% -novid -fullscreen
```

Expected：

```text
args -novid
args -fullscreen
```

### 15.6 env-like game arg

Input：

```bash
FOO=1 %command% -foo=bar
```

Expected：

```text
env FOO=1
args -foo=bar
```

### 15.7 missing command

Input：

```bash
FOO=1 BAR=2
```

Expected：

```text
partial mode
warning: missing command placeholder
```

### 15.8 complex shell

Input：

```bash
bash -c 'echo test; exec "$@"'
```

Expected：

```text
raw mode
warning: complex shell syntax
```

## 16. 驗收標準

LaunchWeaver 第一版可接受交付的條件：

1. 使用者可以從 raw 啟動參數解析出 env。
2. 使用者可以透過 UI 新增、刪除、停用 env。
3. 使用者可以看到編譯後的啟動參數。
4. 使用者可以 copy 編譯結果。
5. 儲存或套用前可以看到 diff。
6. 無法安全解析時不破壞原始內容。
7. `%command%` 前後語意不會被誤判。
8. secret-like env 預設遮蔽。
9. 所有 parser/compiler 行為都有單元測試。
10. 工具名稱與 UI 文案不包含特定平台、商店或相容層商標作為產品識別。

## 17. 建議 Repo 結構

```text
launchweaver/
  packages/
    core/
      src/
        tokenize.ts
        parse.ts
        compile.ts
        quote.ts
        types.ts
      tests/
    ui/
      src/
        components/
        presets/
        state/
    plugin/
      src/
        adapter/
        main.ts
  docs/
    spec.md
    parser.md
    presets.md
  README.md
```

## 18. 專案一句話描述

LaunchWeaver turns fragile launch strings into a structured, reversible, and safer configuration UI.

## 19. 中文簡述

LaunchWeaver 是一個啟動參數結構化編輯器，能將原本難以維護的單行啟動參數拆解成環境變數、包裝命令與遊戲參數，並在儲存時安全地重新編譯回原始啟動欄位格式。

## 20. 下一步：研究 Steam 原生 Dialog

目前使用 `bForcePopOut`、固定 `popupWidth` 與內層寬度限制，只是 MVP workaround，不是最終解法。

下一步應直接研究 Steam WebView / shared SteamUI 的 dialog 實作：

1. 從 `steamloopback.host/library.js` 與 SteamUI chunks 追出 `showModalRaw`、modal manager、`BUsePopups`、`ShowLegacyPopupModal` 的完整呼叫路徑。
2. 確認 Properties popup 應使用的 parent window、已註冊 modal manager、正確的 sizing 與 close lifecycle。
3. 以宿主原生 dialog layout 取代固定 popup / container 寬度，不再逐項修補裁切與黑邊。

完成條件：不需要固定寬度、沒有黑邊或 overflow，並且 Open、Cancel、Apply 在 Properties WebView 中都能穩定運作。
