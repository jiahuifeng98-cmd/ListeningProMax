# 来源、许可证与修改说明

1.4 更新：免费联网翻译由用户启用，使用 [Microsoft Bing Translator](https://cn.bing.com/translator) 免费网页服务，未打包其服务端代码或模型。网络可用性、网页变更及限流由提供者决定；没有使用 Azure 付费订阅 API。Google 与 MyMemory 翻译入口已移除。1.1 已移除 Qwen 段落模型与 llama.cpp 运行时，下文相关条目仅保留历史来源记录。

本软件使用以下独立开源组件及数据。原权利人与项目不为本应用的输出背书。依赖精确版本在锁文件；模型下载来源、revision 和 SHA-256 在 `assets/manifest.json`；按需打包 ZIP 时生成实际分发文件清单 `SHA256SUMS.json`。

## 词典与音调

- **Jitendex 中文社区译本**：greyindex，v2026.08.11-zh.4，2026-09-27 全库模型校订去重版。源自 [Jitendex / Stephen Kraus](https://github.com/Jitendex/Jitendex)，© Stephen Kraus 2023–2026，CC BY-SA 4.0。中文为模型翻译和模型校订，不是官方中文辞书或全部人工核验。见 [发布项目](https://github.com/greyindex/jitendex-yomitan-zh)、`licenses/jitendex-zh-NOTICE.md` 及 `licenses/jitendex-zh-LICENSE`。
- **JMdict 英文**：James William Breen 与 Electronic Dictionary Research and Development Group (EDRDG)，CC BY-SA 4.0。使用 [yomidevs 的 2026-10-12 Yomitan 转换版](https://github.com/yomidevs/jmdict-yomitan)。[EDRDG 许可声明](https://www.edrdg.org/edrdg/licence.html) 的本地副本为 `licenses/JMdict-license.html`。
- **Wiktionary 日英**：Wiktionary contributors，经 Kaikki / Kaikki-to-Yomitan 转换，2025-04-08 版本，数据按 Wiktionary 的 CC BY-SA 及其适用条款提供。来源 [Wiktionary 转换项目](https://github.com/yomidevs/wiktionary-to-yomitan) 与 [Kaikki](https://kaikki.org/)。原索引和署名位于 `licenses/wiktionary-ja-en`。
- **音调**：Kanjium / Uros Ozvatic，CC BY-SA 4.0，经 FooSoft Yomichan 词库转换。[Kanjium](https://github.com/mifunetoshiro/kanjium)；原说明为 `licenses/kanjium-README.md`，索引为 `licenses/kanjium-pitch/index.json`。缺失数据不推测。
- Jitendex 的上游还包含 Tatoeba 例句（CC BY 2.0 FR）及 Jiten 词频相关署名；本地保留上游 NOTICE。当前界面只提取释义，不展示完整例句和图像。

本项目对上述词典的修改：将 Yomitan 条目转换为 SQLite 索引，提取词形、读音、核心释义与音调；去除显示层例句和装饰；同条重复释义在查询时去重。没有改写原释义。派生词典数据继续按上游适用 CC BY-SA 条款分发，转换源码随项目提供。

## 模型与推理

| 组件 / 模型 | 来源 | 许可 |
|---|---|---|
| Whisper small / large-v3-turbo | OpenAI Whisper；CTranslate2 转换来自 Systran、mobiuslabsgmbh | MIT；见 `licenses/whisper-LICENSE` |
| faster-whisper | SYSTRAN/faster-whisper | MIT |
| stable-ts | jianfch/stable-ts | MIT |
| CTranslate2 | OpenNMT/CTranslate2 | MIT |
| M2M100 418M | facebookresearch/fairseq，jncraton INT8 转换 | MIT；见 `licenses/m2m100-LICENSE` |
| Qwen3-1.7B Q4_K_M | Qwen，bartowski GGUF 量化 | Apache-2.0；见 `models/punctuation/LICENSE` |
| llama.cpp b6000 CPU x64 | ggml-org/llama.cpp | MIT；见 `licenses/llama.cpp-LICENSE` |
| Silero VAD | snakers4/silero-vad | MIT |

识别模型以 CPU INT8 计算运行；原转换模型文件按下载清单保存。Qwen 仅建议标点与分段，输出必须通过文字序列一致性检查。

## 桌面及基础运行时

Electron / Chromium / Node、React、TypeScript、SQLite、kuromoji / IPADIC、Python、PyTorch、NumPy、Transformers、SentencePiece、PyAV、imageio-ffmpeg 等分别按各自许可证使用。Electron 的 `LICENSE` 与 `LICENSES.chromium.html` 在 `app`；Python 的 `LICENSE.txt` 在 `runtime/python`；其他已安装包的元数据与随包许可证收集在 `licenses/python`、`licenses/javascript`。FFmpeg 的准确编译配置和许可输出另存 `licenses/ffmpeg-version.txt`。

FFmpeg 为 Gyan 7.1 essentials 静态构建，开启 GPL 和 version3；其许可证不是 imageio-ffmpeg Python 包的 BSD 许可证。上游构建、源码和依赖说明见 [Gyan FFmpeg Builds](https://www.gyan.dev/ffmpeg/builds/) 与 [FFmpeg 7.1 源码](https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz)。该二进制未经修改，通过独立进程调用。

Microsoft Visual C++ Runtime 为 Microsoft 专有可再分发运行库，补充文件来自 msvc-runtime 14.44.35112 wheel，保持未修改；Python 随附的运行库保留原文件。来源/校验值在 `assets/msvc-runtime.json`，分发条款在 `licenses/msvc-runtime/LICENSE`，参见 [Microsoft 分发清单](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution)。

## 彩色词汇等级词表

JLPT 采用 Jamie Sinclair 的 [Open Anki JLPT Decks](https://github.com/jamsinclair/open-anki-jlpt-decks)（MIT，承自 Tanos 社区词表）；考研采用张小虎在学习（现署名程序员大旺）的[公开核心词汇笔记](https://blog.csdn.net/ougaii_/category_12767491.html)（CC BY-SA 4.0）。仅保留词形、读音和等级，属于社区学习参考，不是官方完整考纲。固定版本、提取改动、十五篇出处及许可见 `licenses/vocabulary-sources.md`、`licenses/open-anki-jlpt-decks.txt`；编译索引附各来源校验值。词表和派生数据保留相应许可。

## 仅开发测试所用语料（不随包）

FLEURS Japanese test，Google，CC BY 4.0，下载来源和文件哈希在源码项目的 `reports/fixtures/fleurs-source.json`。只用于人工转写对照的识别评估，不代表人工句界标注。语料不随应用包分发。

短句功能测试来自 [Julius segmentation-kit](https://github.com/julius-speech/segmentation-kit) 的 sample.wav；测试素材也不纳入应用包。两小时压力夹具是静音中插入该短句，不能充当两小时自然音频准确率报告。
