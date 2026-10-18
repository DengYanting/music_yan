# NEON BEAT · 夢の向こうへ

一頁式下落音遊，使用純 HTML、CSS 和 JavaScript，適合部署到 GitHub Pages。

## 部署到 GitHub Pages

1. 將此資料夾的內容推送到 GitHub repository。
2. 在 repository 的 **Settings → Pages** 中，將 Build and deployment 設為 **Deploy from a branch**。
3. 選擇 `main` 分支與 `/ (root)` 資料夾並儲存。
4. 等待 GitHub Pages 發布完成後，使用設定頁顯示的網址開啟遊戲。

請保留以下檔案相對位置：

```text
index.html
style.css
script.js
assets/yume-no-mukou-e.m4a
assets/character-mira-v2.png
```

上傳時不需要包含 `work/`、`outputs/` 或 macOS 產生的 `.DS_Store`。舊版人物圖已移到 `work/archive/`，目前網頁使用的是 `assets/character-mira-v2.png`。

## 操作

- 點擊 **START GAME** 或按空白鍵開始。
- 使用鍵盤 `D F J K`，或點擊遊戲畫面底部的四個按鍵。
- 短音點按；遇到長音時按住對應按鍵，直到長條尾端到達判定線。
- 按空白鍵暫停或繼續。
- 128 BPM 譜面會依照歌曲長度和所選難度自動產生，音符落在節拍或半拍上，並隨歌曲進度增加變化；NOTE SPEED 可調整音符下落速度。
- 長按音符輪替出現在四軌，按住直到長條尾端抵達判定線即可完成，不需再按第二次。

歌曲位於 `assets/yume-no-mukou-e.m4a`，可直接替換同一路徑的音檔。GitHub Pages 是靜態網站服務，因此音檔必須與網頁檔案一起放在 repository 中。
