# 从源码开发

源码面向 Windows 10/11 x64。用户使用发行包不需要开发环境；本页仅供开发者。
Node.js、pnpm、Python 的版本应与锁文件及 Electron 依赖兼容。不要在个人正在使用的便携目录上运行验收或清理脚本。

## 前端与类型检查

在源码根目录用 PowerShell：

```powershell
. .\scripts\env.ps1
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

项目原工作目录是 `D:\Listeningpromax`；`.npmrc` 中的 pnpm 缓存路径仍指向这个目录。若克隆至其他位置，先将 `.npmrc` 的三个缓存路径改为克隆目录下的 `cache`，再运行安装。`env.ps1` 按脚本位置解析其余临时与模型缓存路径。

`pnpm run build` 编译 Electron 主进程、数据库工作线程和 React 界面，不生成 Python、识别模型或大型词典。构建后的开发运行需要资源准备完成。

## 运行资源

Git 仓库不包含个人数据、Python 运行时、模型、词典数据库、node_modules 或完整便携程序。这些资源的来源、固定版本和校验值见 `assets/manifest.json`、`requirements.lock.txt` 和 `THIRD_PARTY_NOTICES.md`。

复用发行包中的运行资源是最直接的方式：先完整解压并启动发行包一次，再退出。首次启动会在 EXE 旁创建隐藏运行目录（资源在其中）；只复制所需 `runtime`、词典资源到源码目录，**不要复制 `data`**。模型可在应用设置中按需下载，或按固定清单准备。完整离线打包脚本还会要求标准、省资源和翻译三种模型。

从本机已有 Python 准备运行时可使用 `scripts/bootstrap-runtime.py`；当前运行时以 Python 3.13 为基线。它复制基础运行时到项目 `runtime/python`，随后用该目录中的 Python 安装锁定依赖：

```powershell
python scripts/bootstrap-runtime.py
.\runtime\python\python.exe -m pip install -r requirements.lock.txt
```

`scripts/restore-assets.py` 按 manifest 恢复固定资源，可能下载数 GB 文件；它不是运行界面的必需步骤。词典原始包就绪后使用 `node scripts/build-dictionaries.mjs` 生成数据库与分词数据。不要直接运行历史资源探索脚本来代替固定版本恢复。

## 打包

资源准备完成后：

```powershell
pnpm run package
.\runtime\python\python.exe scripts/build-share.py
```

`package` 生成完整便携目录；`build-share.py` 从便携目录制作不预装大模型的分享启动程序，需要 Windows 自带 .NET Framework C# 编译器。发布前应重新执行相关验收；GitHub 源码快照并不等于新完成的一轮干净机器兼容性测试。

## 测试与隐私

单元测试覆盖播放模式、时间轴、断句保护、词形处理、词汇等级和课程管理。源仓库中保留自编文本测试；包含真实课程摘录的 `tests/fixtures/jlpt-n2-dialogue.json` 只保存在作者机器，缺失时对应一项真实素材测试明确跳过，其余测试继续执行。此跳过不代表真题准确率通过。

`scripts/check-*.mjs` 等工具是特定版本的人工/集成验收脚本，有些需要完整资源与隔离测试目录；不要把它们全部无条件运行。源码历史验收报告是特定机器和素材的结果，不构成通用精度保证。

宣传片制作流程单独见 `assets/promo/README.md`，不影响软件功能和运行依赖。
