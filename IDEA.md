# 主導人的想法

目前的設計太過複雜，應該依如下原則簡化：

## 分頁：Environment Variables

排版如下 code block

```md
[ ] MangoHud (set MANGOHUD=1)
[ ] Feral GameMode (show if installed)
[ ] Discord Bridge (set PROTON_DISCORD_BRIDGE=1)
<!-- https://wiki.cachyos.org/features/cachyos_settings/#scripts-and-tools -->
[ ] DLSS Swapper
[ ] game-performance (CachyOS helper)
[ ] zink-run (CachyOS helper)

<!-- 以上選項若非 Env vars，大多都是執行檔，請 prepend 在 %command% 之前 -->

|        | Type   | Name               | Value |         |
| ------ | ------ | ------------------ | ----- | ------- |
| [Drag] | Custom | SteamOS            | 1     | [trash] |
| [Drag] | Proton | PROTON_USE_WINED3D | 1     | [trash] |
|        |        |                    |       | [Add]   |
```

- 當 Type != "Custom" && Type != "Params"， Name 必定是下拉式選單
- Type == "Custom" 時， Name 跟 Value 是可編輯的文字欄位
- Type == "Params" 時， Name 與 Value 欄位合併，只有 Value header，裡面是可編輯的文字欄位
- 每一列都可以拖動上下順序
- Add 按鈕會在最下方新增一列，預設 Type 為 "Custom"， Name 與 Value 欄位為空
- Type == "Params" 時， 會自動 sort 到最下方，並且不會被拖動到 Custom 或 非 Params 的上方
- Type != "Custom" && Type != "Params" 時，Type 可能是 Proton, DXVK, VKD3D, Proton-CachyOS 等，Name 的下拉式選單內容會列出該 Type 的所有可用環境變數，並且不允許使用者輸入自訂的 Name，另外 Proton 會列出所有 Proton 支援的環境變數，DXVK 會列出所有 DXVK 支援的環境變數，Proton-CachyOS 會列出所有 Proton-CachyOS 專有的環境變數，因為 Proton 已經列出通用的環境變數。
- 當 Type 與 Name 都選定後，如果確定 Value 欄位也是有限的選項，則 Value 欄位會變成下拉式選單，否則 Value 欄位會是可編輯的文字欄位


## 分頁：Optiscaler (Proton-CachyOS)

```md
[] Enable

PROTON_OPTISCALER_NAME [input:-dxgi.dll]

| Type      | Name         | Value |         |
|-----------|--------------|-------|---------|
| Upscalers | Dx11Upscaler | fsr31 | [trash] |
| Upscalers | Dx12Upscaler | dlss  | [trash] |
|           |              |       | [Add]   |
```

- 詳情規則請見：https://github.com/CachyOS/proton-cachyos#optiscaler-integration

## Large Env layout

       [Type] [Name]
[Drag]               [Trash(icon only, button no padding)]
       [Value      ]