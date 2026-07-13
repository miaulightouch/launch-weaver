# LaunchWeaver MVP 契約與研究紀錄

LaunchWeaver 是 Steam Client mod／SteamBrew plugin，在遊戲 Properties 的原生 Launch Options 旁提供環境變數編輯器。原生欄位仍是唯一資料來源；本專案不取代 Steam 的啟動或設定儲存流程。

## 現行 MVP 契約

- Millennium 建立 Properties window 時安裝 DOM patch，在 Launch Options 欄位下一行加入 `Launch Options Editor`。
- 按鈕透過該欄位的 React instance 取得 App ID 與目前值，並在同一個 Properties WebView 開啟 Steam 原生 inline `ConfirmModal`。
- Editor 只解析字串開頭、以空白或 tab 分隔的連續 `KEY=value`；key 必須符合 `^[A-Za-z_][A-Za-z0-9_]*$`。
- value 支援空值、單／雙引號、反斜線 escape 與 `=`；會執行 shell 展開的 `$`、反引號、`~`、控制字元或 malformed quote 不拆解。
- 第一個非 env token 起全部視為 opaque tail；Editor 不解析或編輯 wrapper、`%command%`、遊戲參數與複雜 shell。
- 未修改的 env token 與其間空白原樣保留；修改過的 value 必要時使用安全的單引號 quoting。
- 只要仍有至少一個 env，opaque tail 必須逐 byte 保留。空白 Launch Options 新增第一個 env 時補上 ` %command%`。
- 刪除所有 env 或在沒有任何 env 的 Editor 按 Apply，Launch Options 必須清空；不保留 opaque tail。
- UI 是等寬 Name／Value 欄、獨立垃圾桶欄、右上角新增按鈕；可新增、修改與刪除 env。
- Apply 前拒絕無效／重複 key，以及含 NUL、CR 或 LF 的 value。
- Apply 若內容未變則直接關閉；否則先重讀原生欄位，值已改變時拒絕覆寫。
- 寫入只呼叫一次 `SteamClient.Apps.SetAppLaunchOptions`，最多等兩秒確認原生欄位；失敗或未確認時不做第二次寫入或 rollback。
- Plugin dismount 時移除 observers 與注入的按鈕；Properties pagehide 時清理該視窗的 observer。

## 明確延後

- 通用 shell tokenizer／parser、wrapper／prefix、suffix／game args 與 Raw Mode。
- Presets、diff、backup／restore、secret masking、設定快取與 verbose logging。
- Standalone UI、manual-copy adapter、其他客戶端／商店、雲端同步與 marketplace。
- 上述功能有具體需求與測試案例時再加入；目前不得宣稱已支援。

## 最小驗證

```bash
bun test
bun run typecheck
./node_modules/.bin/millennium-ttc --no-update --build prod
```

關鍵契約測試： untouched input round-trip、opaque tail 保留、安全 quoting、零 env 清空、stale write 拒絕、單次 write 與 readback。

## Steam 原生 Dialog 研究結果

研究環境：Steam build `1782866176`（CLSTAMP `10776939`）、Millennium `3.4.0_beta.9-1`、實際安裝的 `@steambrew/client` `5.8.5`。

本機 bundle 的關鍵位置：

- `steamui/chunk~2dcc5aaf7.js` module `13869`：SteamBrew 找到的 `showModalRaw` 與 Steam 真正的高階 sizing helper。
- `steamui/library.js` module `3673`：`CModalManager`、`ShowModal`、`ShowLegacyPopupModal` 與 `WeakMap<Window, ModalManager>` registry。
- `steamui/library.js` module `36437`：inline overlay、measure renderer 與 legacy popup renderer。
- `steamui/library.js` module `91435`：dialog provider 建立並向所在 `Window` 註冊 manager。

確定的行為：

1. Properties popup 自己已有 modal manager；正確 parent 是 Launch Options input 的 `ownerDocument.defaultView`，不是 DOM button，也不是主 Steam window。
2. `@steambrew/client` 的 `showModal()` 直接呼叫底層 raw helper。實際分支為 `USE_POPUPS && manager.BUsePopups() && props && title` 時走 `ShowLegacyPopupModal`，否則走同一 manager 的 inline `ShowModal`。
3. 外層 options 的 `strTitle` 才是觸發巢狀 legacy popup 的原因；`bForcePopOut`、`bNeverPopOut` 不會被此 raw helper 讀取。`ConfirmModal` 自己的 `strTitle` 可以保留。
4. 正確最小修正是外層只傳 `{ fnOnClose }`，移除 `strTitle`、所有 popout options、`popupWidth`、`popupHeight` 與固定 content width。
5. Steam inline modal 自帶 viewport 上限；黑邊與裁切來自 legacy popup window chrome，不是缺少 sizing container。
6. 不要把「關閉 returned handle」的 callback 預先當成 element 的 `closeModal`。Steam clone element 時會注入 `closeModal`；自行注入可能讓 legacy close chain 遞迴或重複呼叫 `fnOnClose`。

實機截圖已確認：dialog 直接覆蓋 Properties WebView，沒有獨立 popup、黑邊或 overflow。

## 本機快速重載與 UI 驗證

不要手動進 Millennium 設定頁重載，也不要先猜滑鼠座標。compact 後使用以下流程。

### 建置

```bash
./node_modules/.bin/millennium-ttc --no-update --build prod
```

產物是 `.millennium/Dist/index.js`；`~/.local/share/millennium/plugins/launch-weaver` 是指向本 repo 的 symlink。

### 透過 Millennium MEP socket 重載

```bash
printf '\x42\x00\x00\x00\x83\xa2id\xa1\x31\xa6method\xaeplugin.restart\xa6params\x82\xa4name\xadlaunch-weaver\xa9reload_ui\xc3' \
  | socat1 -T 3 - UNIX-CONNECT:/tmp/millennium-mep.sock
```

這是帶 4-byte 長度前綴的 MessagePack request：`method: plugin.restart`、`params.name: launch-weaver`、`params.reload_ui: true`。plugin name 或 payload 長度改變時必須重新產生 frame，不能沿用硬編碼 bytes。

### 開啟 Properties 與截圖

```bash
steam steam://gameproperties/1973530
spectacle -b -n -o /tmp/launch-weaver-check.png
```

Plugin reload 後關閉舊 Properties 再重開，避免沿用舊 hook／React tree。需要點擊可用 `env DISPLAY=:0 /tmp/launch-weaver-click X Y`，但座標不是穩定 API，必須先截圖定位。

若需確定地自動開啟 Editor，可在 `fieldRoot.append(wrapper)` 後暫時加入一次性的 `button.click()` smoke trigger；驗證後立即刪除，並以 `git diff` 確認未留下測試碼。

### SteamBrew 能與不能做的事

- 已注入的 Steam JS context 可用 `SteamClient.Window.BringToFront()`、Steam Router、`showModal()` 與 Millennium CDP API 控制 Steam 視窗和內容。
- 外部 Codex shell 不在該 JS context，不能直接呼叫上述 API；plugin lifecycle 走 MEP socket，Properties 走 Steam URI，畫面驗證走 screenshot／必要時 XTest。
