from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];r=root/'reports/share-v19'
def load(name):return json.loads((r/(name+'.json')).read_text('utf-8-sig'))
b=load('build');ui=load('ui');first=load('first-entry');moved=load('moved-entry');infer=load('inference');archive=load('archive')
assert ui['passed'] and ui['translation']['completed']==3 and infer['passed'] and first['passed'] and moved['passed']
text=f'''# ListeningProMax 1.9 轻量分享版 · 发行验收

日期：2026-10-22。此包提供给新用户；现有 release/ListeningProMax 完整安装及个人数据未被覆盖。

## 交付

- 文件：`{Path(archive['path']).name}`
- ZIP 大小：{archive['bytes']:,} 字节（{archive['bytes']/1024**2:.2f} MiB）。
- SHA-256：`{archive['sha256']}`。
- ZIP 内一个 ListeningProMax 文件夹，内含且仅含 `ListeningProMax.exe`、`使用说明.html`。
- 图文说明为单个离线 HTML，全部截图嵌入，使用自编内容，无个人课程。
- 不包含开发环境、个人课程、收藏、任务缓存或模型权重。运行库、本地词典与读音数据保留。

## 启动与空间

- Windows 10/11 x64 为目标范围；运行库内置，不需要安装 Python / Node.js / VC 开发环境。启动器使用系统自带 .NET Framework 4.x，asInvoker 不请求管理员权限。
- 首次展开资源后，可见入口仍是程序和说明；旁边创建隐藏 `.ListeningProMax` 保存运行资源与用户数据。开启显示隐藏项目时能看到它，不能删除。
- 内嵌程序：{b['compressedBytes']:,} 字节。展开资源：{b['expandedBytes']:,} 字节（{b['expandedBytes']/1024**3:.3f} GiB）。
- 首次创建可编辑词典副本额外约 325 MiB，使用初期合计约 1.9 GiB，不含原 ZIP、课程与后续模型。建议首次准备留出至少 3 GB 可用空间。
- 首次准备后启动器自动缩至 {first['afterExeBytes']:,} 字节，移除已用的压缩副本，避免长期双份占用。
- 完整资源中的测试文件、编译静态库、调试符号、多余界面语言等剔除约 {b['removedRuntimeBytes']/1024**2:.1f} MiB；三个大模型另行按需下载。
- 自动创建桌面快捷方式；移动完整目录后，重新双击程序会更新快捷方式。应用其他主动写入都在选定目录，桌面链接是用户要求的系统用户目录写入例外。

## 联网和按需资源

- 新装轻量版默认启用必应联网翻译，默认不启用未安装的本地回退；没有免费在线 ASR，自动听写仍使用当前完整版的本地模型方案。
- 标准识别约 1.51 GiB；Small 约 464 MiB；离线翻译约 477 MiB。无需一次全部安装。
- 设置里显示每个资源的大小、真实字节进度、取消、错误与续传；使用固定版本源、镜像/原站切换和 SHA-256 校验。单次连接/停滞限时 30 秒，不无限重试。
- 首次触发需要模型的识别/校准会明确询问是否下载。拒绝仍保留课程；只有音频时先提取并提供播放，不强制下载。带 SRT/VTT 可直接使用原字幕时间精听。
- 下载可取消，部分文件保留于本机 cache/model-downloads 以续传。完整性验证不通过的文件不会发布。

## 本次实际验证

环境：Windows 11 家庭版中文版，10.0.26200 x64。未虚构 Windows 10 干净虚拟机或低配置电脑验收。

- TypeScript 类型检查通过；175 个 Vitest 测试通过，含下载续传、服务器忽略 Range、取消、校验失败和复用文件测试。
- 启动器 8 项隔离测试：中文空格路径、再次使用已有资源、损坏包拒绝、路径穿越拒绝、禁止覆盖用户数据、文件校验失败、准备中断恢复、不同包拒绝覆盖。
- 实际首次准备至应用窗口：{first['firstWindowMs']/1000:.3f} 秒；移动目录后的下一次启动：{moved['firstWindowMs']/1000:.3f} 秒。仅本机实测，不代表所有电脑。
- 启动测试移除了开发工具 PATH；桌面快捷方式在项目内的模拟桌面进行真实 WScript.Shell 创建和目标校验，没有改动开发者真实桌面。
- 发行副本初始课程、收藏均为空；三个模型均未包含。无模型时完成音频准备、SRT 字幕导入、真实播放器时钟前进、默认联网设置和本地辞书读音检查。
- 首次识别下载弹窗有容量说明；拒绝下载后课程保留，文稿空态不再显示永久处理中。
- 必应词语查询返回“图书馆”；三个演示句实际完成联网中文翻译。免费网页服务可能限流或变化，测试只代表本次网络。
- 实际获取固定版 Small config.json 并校验 SHA-256；没有重复下载多 GB 权重。大文件 Range 与取消使用确定性网络响应回归，不宣称已验证所有网络的完整大文件下载。
- 在发行副本内临时使用现有、校验过的模型硬链接，已运行 FFmpeg、VAD、Small 与 Turbo 两档 CPU 识别和对齐、M2M100 本地翻译，均通过。小公开音频的识别调用分别约 {infer['timings']['small']} / {infer['timings']['turbo']} 秒（包含加载），不能当作长音频速度或准确率。
- Electron 数据、缓存、临时文件和日志路径全部在发行目录内。
- 最终 ZIP 完整 CRC 校验通过；程序包内文件逐个 SHA-256 校验完成。原始分享 ZIP 不含教程演示课程。

## 已知边界

- 不支持 Windows 7/8、32 位 Windows；ARM、精简版、企业策略受限环境未验收。Electron 系统支持依据：https://www.electronjs.org/blog/windows-7-to-8-1-deprecation-notice 。
- 没有商业数字签名，SmartScreen 或安全软件可能提示未知发布者；不能保证所有 Windows 系统零提示运行。
- 镜像/原站及必应服务的可用性由用户网络和服务端决定。原音频不上传；联网翻译只发送待译文字。
- 分享时发送原始 ZIP；已经运行后的小 EXE 依赖旁边隐藏目录，不能单独复制给别人。
- 轻量是减少首发下载和延后模型占用，不能把本地 AI 运行环境变成几 MB。

详细机器可读证据和截图见 `reports/share-v19/`。临时发行副本与容量探测文件在最终归档后按清理清单删除。
'''
(root/'ACCEPTANCE-share-v1.9.md').write_text(text,'utf-8')
p=root/'PROGRESS.md';old=p.read_text('utf-8');entry='''## 2026-10-22 · 轻量分享包已交付

- 新增两文件分享 ZIP：自展开启动程序与含真实截图的离线 HTML 使用说明；首次准备后启动器自动瘦身，桌面快捷方式自动创建并在移动后更新。
- 首发不含识别/翻译模型，保留本地运行库与词典；默认必应联网翻译。按需下载固定模型版本，提供进度、取消、续传及 SHA-256 校验。沿用完整版本地识别方案，不冒充免费在线 ASR。
- 无模型音频可先播放，SRT/VTT 可直接精听；模型需求在首次识别前明确提示。
- 175 项单元回归、8 项启动器故障回归、真实联网翻译、中文空格路径、移动目录和两档本地推理通过。Win10 干净环境未另行实测。
- 现有个人完整安装不覆盖。最终路径与容量详见 ACCEPTANCE-share-v1.9.md。

'''
if '## 2026-10-22 · 轻量分享包已交付' not in old:p.write_text(entry+old,'utf-8')
p=root/'README.md';old=p.read_text('utf-8');entry='''> **轻量分享版（2026-10-22）**：`release/ListeningProMax-1.9.0-轻量分享包.zip`。解压后只有程序与图文说明，首次启动准备隐藏运行目录并创建桌面快捷方式。大模型按需下载，仍沿用本地识别；默认使用必应联网翻译。查看 [分享版验收](ACCEPTANCE-share-v1.9.md)。

'''
if '**轻量分享版（2026-10-22）**' not in old:p.write_text(entry+old,'utf-8')
print('Acceptance and progress updated')
