from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
def read(name):
 p=root/'reports'/name
 return json.loads(p.read_text('utf-8')) if p.exists() else {}
asr=read('benchmark/summary.json');portable=read('portable.json');memory=read('process-metrics.json');dic=read('dictionary-performance.json');long=read('long-audio/summary.json')
mb=lambda value:f'{value/1024**2:.1f} MiB'
rows=[]
playback_bytes=sum(p['workingSetSize']*1024 for p in portable.get('memory',[{'metrics':[]}])[0]['metrics'])
memory_status='超过 500 MB 目标，当前未达标' if playback_bytes>500_000_000 else '本次观测未超过 500 MB，但最低配置验收尚未完成'
for item in portable.get('memory',[]):rows.append(f"| {item['stage']} | {mb(sum(p['workingSetSize']*1024 for p in item['metrics']))} | Electron 所有进程工作集之和，含共享页重复计数 |")
report=f'''# 验收报告 — ListeningProMax 1.0.0

日期：2026-10-14。交付状态：**可运行的离线功能验收版；未通过全部计划质量门槛**。不把界面完成度、短句成功、自动转写或合成压力夹具当作人工精度验收。

## 测试环境

Windows 11 家庭中文版 10.0.26200，Intel i7-13650HX（14 核 / 20 线程），约 16 GB RAM。推理明确使用 CPU、最多 4 线程，未使用独显加速。此环境不等于四核 8 GB 基准机；没有 Windows 10 干净虚拟机实测。

测试运行中还存在其他开发评估任务，处理速度和内存仅作本机观测，不能当作最低配置性能保证。

## 识别准确率

公共人工转写语料：Google FLEURS 日语 test 的前 {asr.get('samples',0)} 条。模型 large-v3-turbo，CTranslate2 CPU INT8，beam 5。每条真实结果、人工原文、耗时和编辑距离均保存在 `reports/benchmark/0000.json` 等文件。

- 样本数：{asr.get('samples',0)}。
- 字符错误率 CER：{asr.get('cer',0)*100:.2f}%（NFKC；去除空白及标点；不按假名统一读音）。
- 音频总长：{asr.get('audioSeconds',0):.1f} 秒；识别推理累计：{asr.get('inferenceSeconds',0):.1f} 秒。
- 基准测试进程树观测峰值：{mb(asr.get('processTreePeakBytes',0))}，包含语料读取器；不是单独模型权重大小。

这是公开朗读语料上的 ASR 结果，不包含 Qwen 补标点与最终强制对齐耗时，不代表访谈、背景音乐、多人重叠场景。FLEURS 原文是数据集提供的人工作业；本次没有把这批文字重新逐条人工核听。计划中的自建 300 句人工句界数据集尚未完成。

## 句界和长音频

真实 2.06 秒日语短句已完成提轨、VAD、识别、Qwen 标点和 stable-ts 对齐，便携流程中得到「今日はいい天気だ。」。词级边界中存在零时长时明确标记复核，未把零时长伪装成可靠词界。

手工锚点真实音频回归通过：两侧固定锚点保持原值，中间句由错误的第 6 秒重新定位到第 10 秒附近，结果见 `reports/anchor-flow/summary.json`。这是按音频重新定位，不按前句时长顺延。

两小时夹具：在静音音轨的第 10、3600、7180 秒插入同一真实短句，经完整 VAD 扫描、绝对窗口识别及局部对齐。三处起点相对插入位置的差异跨度为 **{long.get('startBoundarySpreadMs','未测')} ms**。详见 `reports/long-audio/summary.json`。此检查验证绝对时间拼接没有产生累计时长偏移，**不等于两小时自然访谈验收或句界 P95**。

**句子起止误差 P95 ≤200 ms：未验收。** 需要人工标注真值；`scripts/evaluate-boundaries.py` 只接受带人工审核标记的真值，分别统计全程及前中后三段。不能拿 ASR 自己的时间当真值。

## 启动、播放与查词

- 最后一次便携测试启动至首屏可操作：{portable.get('startupMs','未测')} ms。是本机单次启动观测，不能替代清空系统缓存后的冷启动分布。
- 首次点译文至本条译文可用：{portable.get('translationMs','未测')} ms。只代表短句和当时机器负载，不能外推全课速度。
- 查词首条：{dic.get('firstQueryMs',0):.2f} ms；100 个未命中应用缓存的查询 P95：{dic.get('uniqueP95Ms',0):.2f} ms；重复查询 P95：{dic.get('warmP95Ms',0):.2f} ms。词典文件的 OS 缓存未清空。词形还原样例「食べました→食べる」通过。

| 阶段 | 工作集 | 口径 |
|---|---|---|
{chr(10).join(rows)}

最终便携流程采样的推理进程树峰值为 {mb(memory.get('peakInferenceTreeBytes',0))}；包括桌面进程的总峰值为 {mb(memory.get('peakAppTreeBytes',0))}。逐项数据见 `reports/process-metrics.json`。查词、较长课程及系统共享内存会改变峰值；播放 ≤500 MB、推理 ≤4 GB 尚未在 8 GB 基准机上通过完整场景验收。

**本次播放工作集 {mb(playback_bytes)}，{memory_status}。** 该口径含共享页重复计数，仍保留原始数值，不换用其他内存口径来宣称达标。

## 已通过的功能检查

- TypeScript 检查、29 项时间轴/词典单元测试、9 组存储事务/备份检查、6 项 Python 故障与锚点回归。
- 真音轨提取和媒体时钟；点击句子定位、进度条真正跳转、循环切句、循环边界、空格暂停、连续空格、高亮保留、原文两态、重置保留位置。
- 窗口最小化时单句循环通过；外层启动器实际启动并显示窗口，TEMP/TMP/APPDATA/LOCALAPPDATA 均在便携目录。截图曾发生超时，调整后台绘制后最终截图与界面回归通过；报告保留最终截图。
- 参考资料修改不改变正文；合并不丢字；拆分撤销；收藏去重与别名恢复；旧时间轴/参考资料/翻译结果不能覆盖新编辑。
- 三部离线辞书、中文核心释义、音调、关闭词卡清除选区；本地翻译完成。
- 课程 ZIP 流式备份恢复，含媒体及收藏引用重新映射；未把大音轨整体读进内存打包。
- 损坏音频、缺失模型、推理进程退出均产生可定位错误；进程重启可继续。Windows Job Object 已实测父任务被强制终止后子推理也退出，避免后台孤儿进程。
- 含中文及空格的移动目录下，识别、标点、对齐、查词、翻译完整流程已成功。修复了 llama.cpp 路径传递和 SentencePiece 文件名兼容问题。
- 1000×720 界面无横向溢出；截图在 `reports/screenshots`。

## 便携与离线范围

完整应用目录包含运行时、模型、三词典及音调；没有调用开发环境的 Python、Node 或绝对模型路径。核心 VC 运行库已随包补齐，其 wheel 版本、来源和校验值在 `assets/msvc-runtime.json`；进程采样记录实际加载路径。

桌面网络请求拦截测试未发现远程请求；HF/Transformers 设置为 offline。本机尚未真正禁用网卡或在完全无开发环境的系统中验收，因此不把该测试写成干净离线 Windows 10/11 认证。

已核对 Electron 的 userData/sessionData/temp/logs 和子进程缓存配置均在便携目录。**没有完整 Procmon/ETW 系统文件写入审计**，不宣称已从系统跟踪证明零 C 盘写入。Windows 自身日志、分页等不属于应用控制范围。

## 剩余限制

1. 人工 300 句句界真值及 P95、四核 8 GB 机器、Windows 10 干净环境、自然两小时音频和系统写入审计仍需完成。
2. 音频噪声、专名、多人同时说话和错误原文可能需要手工校准。零时长词、未匹配文字和失败区间会被标记；自动重对齐失败保留旧时间轴，不伪造可靠定位。
3. 已实现磁盘空间/权限错误的界面反馈，但没有把实体磁盘写满作破坏性故障实验。在线翻译未接入用户真实服务验收。
4. 中文词典为社区模型译本；英文辞书用于对照。机器翻译不保证语义全对。
5. 当前只提供 CPU 推理。Windows x64 之外平台未交付；EXE 未做商业代码签名。

完整事件与结果、脚本、源码均在项目目录。最终 ZIP 不包含开发测试课程、语料、缓存、日志或密钥。
'''
(root/'ACCEPTANCE.md').write_text(report,'utf-8')
print('REPORT UPDATED',flush=True)
