# 宣传片制作

当前音频修订：20261107-funk-foley-voice。20 秒，1440×1080，30 fps。
六句普通话 AI 女声，实际混音固定 `atempo=1.08`，不制作旁白字幕。
音乐为 Gimme that Groove! / Michael Ramir C.，音效使用 Mixkit 的实体鼠标、键盘录音及短界面/转场素材。
来源和校验值在 `reports/share-20261106/media-sources.json`，仅在成片中使用，不把下载的音乐/音效原文件放进分享包。

在项目根目录 PowerShell 执行，所有临时目录由环境脚本指向 D 盘：

```powershell
. .\scripts\env.ps1
& .\runtime\python\python.exe scripts/fetch-promo-assets.py
node scripts/render-promo.mjs
& .\runtime\python\python.exe scripts/verify-promo.py
& .\runtime\python\python.exe scripts/verify-promo-sound.py
& .\runtime\python\python.exe scripts/check-promo-narration.py
& .\runtime\python\python.exe scripts/make-share-guide.py
node scripts/check-share-guide.mjs
& .\runtime\python\python.exe scripts/update-share-media.py
```

`voice/` 保留六条小体积原始女声和文案签名，正常重渲染不用再次调用语音服务。
若修改旁白，先在 `scripts/generate-promo-voice.py` 改稿，再安装临时制作依赖并生成：

```powershell
& .\runtime\python\python.exe -m pip install --target cache/promo-tts/lib --no-cache-dir edge-tts==7.3.1
& .\runtime\python\python.exe scripts/generate-promo-voice.py
```

语音仅发送作者编写的六句宣传文案，无个人课程。生成工具不加入软件运行依赖或发行包。
每段语音先保留辅音与尾音边距去掉首尾静音，再以 1.08 倍速处理，检查不越过镜头边界。
人声段配乐降低 6 dB，点击声取录音真实瞬态。AAC 320 kbps 用于保留短促操作音细节。

重新混音从原始素材开始，不叠加旧音效。画面从 `stage.html` 源画布渲染；只更换音轨时可运行 `design-promo-audio.py`，会验证视频包逐字节不变。
软件程序不因媒体修订重建。归档更新流式保留已验证 EXE，并检查 CRC 与三份文件哈希。
清理先运行 `scripts/check-dev-state.py`、阅读 `sound-cleanup-plan.json`、确认相关进程结束，再仅删除清单中项目内制作缓存。保留 `voice/`、成片、源码和报告。
