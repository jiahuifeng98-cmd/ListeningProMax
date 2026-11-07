# 彩色词汇等级数据的来源与许可

这是社区词表匹配结果，不是考试机构对每个词的官方定级。未匹配不表示超纲，未收录词不猜造等级。

## JLPT N1–N5

- [Open Anki JLPT Decks](https://github.com/jamsinclair/open-anki-jlpt-decks)，作者 Jamie Sinclair。
- 固定提交 `1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0`；来源为该提交的 `src/n1.csv` 至 `src/n5.csv`。
- 原始行数依次为 N1 2699、N2 1906、N3 2140、N4 668、N5 718。
- MIT 许可全文见同目录 `open-anki-jlpt-decks.txt`。上游注明承自 chyyran/jlpt-anki-decks 与 [Tanos](https://www.tanos.co.uk/jlpt/) 词表；保留 Tanos 作者 Jonathan Waller 的 CC BY 署名及来源。
- 本应用只提取词形、读音、级别，去除词形括注及读音声调数字；不引入英文释义。源码中的生成脚本与索引 `sources` 字段保留各 CSV 链接和 SHA-256。

## 考研日语 203 核心词汇参考

- 作者：张小虎在学习（页面现署名程序员大旺）。[专栏](https://blog.csdn.net/ougaii_/category_12767491.html)。标题为「考研日语 - 高频核心 2200 词」的第（一）至（十五）篇公开学习笔记。
- [来源示例第九篇](https://blog.csdn.net/ougaii_/article/details/142100958)。全部十五篇原始 URL 保存在源码 `assets/vocabulary/exam-203-sources.json` 和编译索引 `sources` 字段中。
- 原网页标注 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。词形、读音及派生 KY 等级数据按同一许可提供。作者注明参考《考研日语蓝宝书词汇专项》；这里只依据作者公开笔记提取词形与读音，不复制书籍或笔记中的例句、解释和翻译。该参考词表不是官方完整考纲。
- 提取日期：2026-11-05。前十三篇各 150 项，第十四篇 120 项，第十五篇实际 165 项，共 2235 项。第十五篇原表序号跳过 132，未补造缺失项。外来语章节以原片假名词形作为读音。
- 改动：汇总十五篇，清除词形括注、读音中的声调数字，拆分明确列出的词形变体；按词形和读音去重，并与 JLPT 等级取并集。不复制释义或例句。快照及来源链接随源码提供；修改后的本词汇等级数据以 CC BY-SA 4.0 提供，上游 MIT/CC BY 署名保留。

## 显示规则

最低到最高：N5 → N4 → N3 → N2 → 考研 → N1。相同词形的不同读音分别匹配；读音不确定且等级冲突时不猜测。先确定最低等级，再判断该等级是否勾选。未勾选和未收录词显示灰色。形态分析和社区词表都可能有遗漏。
