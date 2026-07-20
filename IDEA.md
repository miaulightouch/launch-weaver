# LaunchWeaver 現況與最終決策

本文件以目前實作為基線，不再保留已被後續需求取代的早期設計。每章先記錄現況，再列出仍可選擇的簡化方案；主導人可在章末填寫最終結論。

共同原則：不使用 Steam UI 元件；私有 DOM/class 只能留在明確的整合 seam。優先使用平台與既有 library、避免單一實作抽象，但不得簡化掉輸入驗證、資料安全、無障礙或已明確要求的功能。

## 1. 全域介面與 UI 技術

### 目前實作

- Millennium 提供 React runtime；專案自行 bundle Base UI，不引入 Steam UI 元件。
- Editor 是獨立的 `850 × 722` popup，Properties 關閉時會連動關閉。
- Environment、Wrappers、Parameters、OptiScaler 四個分頁等寬並保持 mounted，避免切換抖動。
- 所有 authored CSS 位於 stylesheet；標題與敘述不可選取。
- `Apply` 套用但不關閉；`Close` 關閉並捨棄尚未 Apply 的修改。
- Tooltip 使用 popup 自己的 document portal，沒有 hoverable popup，選項捲動時會關閉。
- 畫面驗收以桌面縮放 `135%` 為準。

### 待決策

- **A｜維持現況：** Button、Input、Select、Autocomplete、Tooltip、Tabs、Switch 全部沿用 Base UI。
- **B｜部分 native 化：** Button 與 TextInput 改成原生 `<button>`、`<input>`；先比較 bundle 大小、disabled/focus 與鍵盤行為。Select、Autocomplete、Tooltip、Tabs、Switch 仍保留 Base UI。
- **C｜移除裝飾動畫：** 刪除 popup、tooltip、switch transition 與 reduced-motion override，約可少 19 行 CSS，但會犧牲介面手感。

### 最終結論

> 決策：A
>
> 理由：不需要自己造輪子，雖然實做尚不滿意，過度工程的地方仍舊稍多，但可接受。

## 2. 專案結構與共用元件

### 目前實作

- `app/`：Millennium/Steam 整合、owned popup 啟動、跨功能 state 與 Apply 協調。
- `views/`：完整 Editor 組裝。
- `pages/`：四個分頁。
- `components/`：共用控制項與 Base UI wrappers。
- `features/`：launch options、ENV、wrappers、OptiScaler domain logic。
- `styles/`、`types/`：stylesheet 與非 runtime declarations。
- 依賴方向由測試限制，不使用 barrel file，也沒有 generic utilities dumping ground。

### 待決策

- **A｜收回相同 callback：** `OrderedTokenEditor` 直接用既有 `setRows` 新增空 row，移除兩個 caller 完全相同的 `onAdd`，約少 10～12 行；保留 `title`、`addLabel`、`singular`，避免隱藏的文案推導。
- **B｜縮減單檔 layer：** 下次修改 popup plumbing 時，把唯一的 `lib/ownedWindow.tsx` 移入 `app/`，同步刪除 `lib/` 這個概念層；不為搬檔單獨製造一次 churn。
- **C｜維持現況：** 保留 `lib/` 作為明確 platform seam。

### 最終結論

> 決策：A+B
>
> 理由：此專案僅是玩具專案，面向功能也只有這幾種，後續增加的更多變種也都是基於相同的形式。

## 3. 分頁：Environment

### 目前實作

- 列表沒有 header；每個 ENV 使用兩列 compact layout：

  ```text
  [drag] [Type]  [Name................]
  [drag] [Value................] [trash]
  ```

- Type 為 `Custom`、`DXVK`、`VKD3D` 或 `Proton`。
- Custom Name 是文字輸入；其他 Name 是依字母排序、寬度自適應的 dropdown。
- Proton fork 專屬項目併入 Proton，使用不可選 group header 與 `[Proton-GE] [Proton-EM] [Proton-CachyOS]` tooltip 標示支援來源。
- Catalog 依 DXVK、VKD3D、Proton 拆成三個 data module；玩家導向列表不收錄 `VKD3D_TEST_*`。
- Value 一律可輸入；有已知值時同時提供 dropdown suggestions。
- 選項描述只顯示於 tooltip；dropdown input 顯示目前 Name 選項的 tooltip。
- 可拖曳與鍵盤排序；隱藏的 OptiScaler ENV 仍保留在原 launch-options 相對位置。
- 垃圾桶是 Value 行尾的方形 icon button。
- `Add` 新增空的 Custom row。
- Discord Bridge 是兩欄 quick-add grid 內的 ENV 快捷按鈕。
- MangoHud 不屬於 ENV，已移到 Wrappers。

### 待決策

- **A｜完整 catalog：** 保留六個 `VKD3D_TEST_*` 選項；它們對一般遊戲幫助有限，但維持「完整收錄 upstream ENV」的承諾。
- **B｜玩家導向 catalog：** 移除 `VKD3D_TEST_*`，約少 31～33 行；catalog 定位改成實用選項而非完整索引。

### 最終結論

> 決策：B，另外 `[GE] [EM] [CachyOS]` 改為 `[Proton-GE] [Proton-EM] [Proton-CachyOS]`，frontend/features/environment/catalog.ts 太長，請切分檔案或是 json
>
> 理由：這就是玩家用的工具

## 4. 分頁：Wrappers

### 目前實作

- 快捷按鈕為兩欄、等寬、佔滿內容寬度：GameMode、MangoHud、DLSS Swapper、game-performance、zink-run。
- 不檢查 executable 是否 installed；tooltip 說明用途，quick-add 區塊下方有分隔線。
- 每列可輸入 executable 與其參數，例如 `mangohud -h`。
- `bash -c 'exec "$@"' --` 與其他 command 一樣按一般 wrapper token 處理，不使用 shell-specific model，並有明確 round-trip test。
- Wrapper rows 使用 compact layout、沒有 header、不可拖曳排序。
- Quick button 以解析後的 token 判定是否已加入，因此 `mangohud -h` 不會讓 MangoHud 按鈕重新可按。

### DLSS 重複升級政策

同時存在 `dlss-swapper` 與非 `0` 的 `PROTON_DLSS_UPGRADE` 時會顯示 warning，但不會禁止 Apply。兩者都會更新 DLSS DLL／preset，而上游文件沒有明文宣告它們不可共存：

- [CachyOS-Settings：dlss-swapper](https://github.com/CachyOS/CachyOS-Settings)
- [Proton-CachyOS：PROTON_DLSS_UPGRADE](https://github.com/CachyOS/proton-cachyos)

### 待決策

- **A｜維持 hard block：** 保守避免兩套 updater 同時介入。
- **B｜改成 warning：** 允許 Apply，但提醒功能重疊；需要保留額外 notice policy。
- **C｜移除特殊政策：** 不替使用者禁止上游未明定的組合，並刪除約 7 行唯一的跨功能硬編碼規則。

### 最終結論

> 決策：B 僅 warning
>
> 理由：沒必要這麼貼心

## 5. 分頁：Parameters

### 目前實作

- Parameters 與 ENV、Wrappers 完全獨立。
- 一列是一個 game argument；包含空白的文字仍是一個參數，空 row 會傳遞空參數。
- 使用 compact layout、沒有 header，支援拖曳與鍵盤排序。
- 新增 row 的共用 callback 簡化歸入「專案結構與共用元件」章節，不改變本頁功能。

### 待決策

- **A｜維持現況：** 沒有可移除而不改變語意的 Parameters 功能。

### 最終結論

> 決策：A
>
> 理由：

## 6. 分頁：OptiScaler

### 目前實作

- 每次開啟 Editor 都由 backend 直接讀取該遊戲目前安裝的 `OptiScaler.ini`。
- Enable 與 Injection filename 分別編輯隱藏的 `PROTON_USE_OPTISCALER`、`PROTON_OPTISCALER_NAME` ENV。
- Injection filename 是可輸入且不搜尋／過濾的 dropdown，suggestions 依 upstream wiki 完整列出。
- Direct INI editor 使用 compact rows，預設只顯示值不為 `auto` 的 existing options；新增時也只能選擇 INI 已存在的 section/option。
- Backend 動態擷取 INI option 前方與 inline 註解作為 description，Option dropdown 與目前選值會顯示 tooltip。
- 修改直接產生 INI patch；刪除 row 會恢復該 option 的 exact-version default。
- Reset on Apply 每次都會重新下載並驗證相同 OptiScaler 版本的官方 archive、保留 backup，再以 atomic rename 取代設定；不重用 archive cache。
- `PROTON_OPTISCALER_CONFIG` 與 wrapper 中的同名 assignment 會阻止 direct INI 修改，避免兩套來源互相覆蓋。
- 前端不訂閱遊戲執行狀態；backend 仍會在多個寫入階段 fail-closed 確認遊戲已停止。
- INI 尚未建立時會提示先以 OptiScaler 執行一次遊戲，再重新開啟 editor。

### Row 版面待決策

- **A｜沿用 FieldCard：** 每個 setting 使用 Section、Option、Value labels 與獨立 actions。
- **B｜改用 compact-table：** 重用 Environment/Parameters 已有的 compact pattern，保留全部欄位與 ARIA，並刪除專用 `.lw-controls/.lw-label/.lw-actions`，估計少 25～40 行；需在 135% 縮放下比較真實畫面。

### 遊戲執行狀態待決策

- **A｜雙層檢查：** 保留前端 AppActivity 的即時 UX，以及 backend 的 fail-closed 安全檢查。
- **B｜只留 backend：** 刪除約 30 行前端 subscription、state 與提示；資料安全不變，但使用者要按 Apply 後才知道遊戲仍在執行。

### Reset/cache 待決策

- **A｜維持 exact-version reset 與 archive cache：** 現行安全、可避免重複下載已驗證 archive，且符合「恢復實際預設」需求；reset 仍須連線取得最新 manifest。
- **B｜每次重新下載 archive：** 約少 18 行 cache reuse，但增加延遲、流量與網路依賴。
- **C｜一律寫成 `auto`：** 可刪除大量 manifest/download/tar/checksum 流程，但不是每個版本的每個預設值都是 `auto`，不符合目前需求。

### 最終結論

> 決策：
>  - Row 版面待決策: B，另外應該動態或事先解析 options/decriptions，並有與之前相同的 tooltip 等輔助功能
>  - 遊戲執行狀態待決策: 不需要，應只提供 ini editor
>  - Reset/cache 待決策：B
>  - 另外希望可以將警告改為請先執行一次遊戲，即可使用編輯器之類的警語
> 理由：

## 7. Steam／Millennium 整合與視窗生命週期

### 目前實作

- Steam 遊戲與第三方 Non-Steam shortcut 的 Properties 都能加入 Launch Options Editor 按鈕。
- DOM patch 只使用最低限度的 window/document/global seam，不 import 或 render Steam UI components。
- Editor popup 由 Properties window 擁有：同一 Properties 只允許一個 popup；Properties、popup 或 plugin 關閉時都會 unmount 並清理。
- Editor 使用可拖曳的原生視窗框；titlebar 顯示遊戲名稱，因此同時開啟多個 Properties 時仍可辨識。
- Backend 不可用時，launch-options editor 仍可使用；OptiScaler 分頁顯示 unavailable，不會假裝寫入成功。
- Apply 會先重新讀取原生 Launch Options，拒絕覆寫 stale value，寫入後也必須 readback 確認。

### 待決策

- **A｜維持現況：** popup ownership、stale/readback 與 non-Steam 路徑都屬必要整合，沒有安全的功能刪減。

### 最終結論

> 決策：A
>
> 理由：

## 8. Tests 與不可簡化的安全邊界

### 目前實作

- Launch parser/serializer 測試涵蓋 shell quoting、控制字元、placeholder、一般 `bash -c` wrapper、round-trip 與 fail-closed。
- Backend 測試涵蓋 exact reset、checksum、symlink/canonical path、snapshot/TOCTOU、running process、backup、atomic rename 與 readback。
- Architecture tests 禁止 Steam UI 依賴、inline CSS、錯誤的跨 layer import，並保留明確要求的 `views/pages/components` 結構。
- Catalog tests 只驗證 key 唯一、名稱合法、suggestion invariants，以及 sorting／完整 Proton fork 標示等明確 UI 契約；不硬編碼 catalog 容量或代表性 key 清單。

### 待決策

- **A｜小幅去重：** positive validation 只保留 `_B2` 合法 key 邊界，並刪除第二個完全相同的 malformed backend JSON assertion，約少 9 行。
- **B｜保留 suggestions 快照：** dropdown 內容遭誤改時能直接失敗，但 catalog 與 test 同時維護資料。
- **C｜只留 suggestions invariants：** 刪除逐字 suggestions expectations，保留預設值存在、唯一、非空，約少 46 行；代價是降低內容 change detection。
- **D｜移除 `> 100` 容量門檻：** 保留具體代表 key 與唯一性測試，避免任意數字妨礙合理 pruning；只有 1 行收益，應與其他測試整理一起做。

以下項目不列入刪減：trust-boundary input validation、`/proc` running fail-closed、canonical/symlink checks、snapshot/TOCTOU rechecks、verified backup、atomic rename/readback、accessibility，以及 exact-version reset 的必要驗證。

### 最終結論

> 決策：environment-catalog.test.ts 可能大部分都不用，應該設定檔多少就多少，不硬性認為所有 key 存在。
>
> 理由：
