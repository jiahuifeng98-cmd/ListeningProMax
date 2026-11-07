"""Replace manual/video in the current ZIP without rebuilding or duplicating its EXE."""
from pathlib import Path
import hashlib, json, re, shutil, zipfile

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/share-20261106'
ARCHIVE = ROOT / 'release/ListeningProMax-2026.11.06-分享包.zip'
PREFIX = 'ListeningProMax/'
NAMES = [PREFIX + n for n in ['ListeningProMax.exe', '使用说明.html', 'ListeningProMax-宣传片.mp4']]

def digest_stream(stream):
    h = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        h.update(chunk)
    return h.hexdigest()

def digest(path):
    with path.open('rb') as stream:
        return digest_stream(stream)

def read(name):
    return json.loads((REPORT / name).read_text('utf-8-sig'))

def write(name, obj):
    p = REPORT / name
    temp = p.with_suffix(p.suffix + '.next')
    temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), 'utf-8')
    temp.replace(p)

old = read('archive.json')
build = read('build.json')
video = read('video.json')
sound = read('sound-design.json') if (REPORT/'sound-design.json').exists() else None
has_effects = bool(sound and sound.get('videoSHA256')==video['sha256'] and sound['passed'])
assert has_effects, 'Run the current sound design and final video checks first'
sound_qa = read('sound-qa.json')
assert sound_qa['passed'] and sound_qa['videoSHA256']==video['sha256']
revision = sound['revision']
assert video['passed'] and read('guide.json')['passed']
assert digest(Path(video['path'])) == video['sha256'], 'Video changed after validation'
assert digest(ARCHIVE) == old['sha256'], 'Archive changed since the last report'
source_hashes = {NAMES[0]: build['sha256'], NAMES[1]: digest(REPORT / '使用说明.html'), NAMES[2]: video['sha256']}
staged = ARCHIVE.with_suffix('.media-next.zip')
with zipfile.ZipFile(ARCHIVE) as source:
    assert source.namelist() == NAMES
    with source.open(NAMES[0]) as stream:
        assert digest_stream(stream) == build['sha256'], 'Unexpected program binary'
    with zipfile.ZipFile(staged, 'w', zipfile.ZIP_STORED, allowZip64=True) as target:
        with source.open(NAMES[0]) as incoming, target.open(source.getinfo(NAMES[0]), 'w', force_zip64=True) as outgoing:
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
        for name in NAMES[1:]:
            target.write(REPORT / name.split('/')[-1], name)
with zipfile.ZipFile(staged) as check:
    assert check.namelist() == NAMES and check.testzip() is None
    for name, expected in source_hashes.items():
        with check.open(name) as stream:
            assert digest_stream(stream) == expected, name
new = {**old, 'bytes': staged.stat().st_size, 'sha256': digest(staged), 'mediaRevision': revision}
staged.replace(ARCHIVE)
write('archive.json', new)
write('verified.json', {**read('verified.json'), 'mediaRevision': new['mediaRevision'], 'outerCRCValid': True, 'programBinaryUnchanged': True, 'filesSHA256': source_hashes})
write('final-check.json', {**read('final-check.json'), 'archiveHash': new['sha256'], 'mediaRevision': new['mediaRevision'], 'mediaRevalidated': True, 'cleanupComplete': False})
write('music-update.json', {
    'passed': True, 'track': sound['musicTitle'], 'artist': sound['musicArtist'], 'sourceStartSeconds': sound['musicSourceStartSeconds'],
    'videoCutCentersSeconds': [round(n * 60 / 130, 4) for n in [6, 14, 22, 30, 38]],
    'crossfadeSeconds': 0.18, 'integratedLoudnessLUFS': video.get('integratedLoudnessLUFS'), 'truePeakDBFS': video.get('truePeakDBFS'),
    'soundEffects': has_effects, 'soundEffectCount': sound['soundCount'] if has_effects else 0,
    'selectionScope': 'Light melodic funk under Mandarin narration, not claimed to be a chart hit',
    'voiceover': sound.get('voiceover'),
    'videoSHA256': video['sha256'], 'archiveSHA256': new['sha256'], 'programBinaryUnchanged': True,
    'licenseUrl': 'https://mixkit.co/license/modal/musicFree/'
})
acceptance = (REPORT / 'acceptance.md').read_text('utf-8')
acceptance = acceptance.replace(f"{old['bytes']:,} 字节，约 {old['bytes']/1024**2:.2f} MiB", f"{new['bytes']:,} 字节，约 {new['bytes']/1024**2:.2f} MiB").replace(old['sha256'], new['sha256'])
acceptance = re.sub(r'AAC 48 kHz；[\d,]+ 字节。', f"AAC 48 kHz；{video['bytes']:,} 字节。", acceptance)
acceptance = re.sub(r'- 配乐[^\n]+', f"- 配乐为 {sound['musicTitle']} — {sound['musicArtist']}，Mixkit Stock Music Free License；从 {sound['musicSourceStartSeconds']} 秒起截取，女声期间配乐再降低 6 dB。鼠标/键盘采用录制素材，界面提示及短转场来自 Mixkit Sound Effects Free License。普通话 Xiaoxiao AI 女声 1.08 倍速，不附旁白字幕。当前混音 {video['integratedLoudnessLUFS']} LUFS，真峰值 {video['truePeakDBFS']} dBFS。授权、来源及处理方式见说明书和 media-sources.json。", acceptance)
acceptance = acceptance.replace('字幕淡入、画面推近', '功能标题淡入、画面推近')
acceptance = acceptance.split('\n## 配乐修订')[0].split('\n## 操作与转场音效')[0].split('\n## 2026-11-07 配乐、操作音与女声')[0]
if has_effects:
    acceptance = re.sub(r'响度实测 [-\d.]+ LUFS，真峰值 [-\d.]+ dBFS', f"当前混音响度实测 {video['integratedLoudnessLUFS']} LUFS，真峰值 {video['truePeakDBFS']} dBFS", acceptance)
    section = f"\n## 2026-11-07 配乐、操作音与女声\n\n更换配乐，重做 {sound['soundCount']} 处音效，实体鼠标按下/释放、键盘切换配合短转场。六句普通话 AI 女声采用固定 1.08 倍速，句尾完整落在对应镜头内，不烧录旁白字幕，亦无独立字幕流。说话期间声轨均方根音量高于配乐至少 8 dB；效果音按首个可见帧对齐，转场峰值对齐切换中心。为同步片尾署名，从源画布重新渲染 600 帧，无旧视频反复转码。最终混音 {video['integratedLoudnessLUFS']} LUFS，真峰值 {video['truePeakDBFS']} dBFS。全片解码、音轨一致性、旁白分段时长与离线说明书复核通过，程序二进制未改；应用测试沿用原分享构建结果。见 `sound-design.json`、`sound-qa.json`、`voiceover.json`。仅临时音轨、制作依赖与下载缓存列入 `sound-cleanup-plan.json`。\n"
    acceptance = acceptance.split('\n## 操作与转场音效')[0] + section
(REPORT / 'acceptance.md').write_text(acceptance, 'utf-8')
progress = ROOT / 'PROGRESS.md'
with progress.open('a', encoding='utf-8') as f:
    f.write(f"\n\n## 2026-11-07 · 宣传片新配乐、实录操作音与女声\n\n版本 {revision}，保持 20 秒／1440×1080／30 fps。{sound['soundCount']} 处操作与转场音效、六句 1.08 倍速普通话 AI 女声，无旁白字幕。配乐改为 Gimme that Groove!。从源画布重渲染；600 帧、音轨、说明书及 ZIP CRC/逐文件哈希复核通过；响度 {video.get('integratedLoudnessLUFS')} LUFS，真峰值 {video.get('truePeakDBFS')} dBFS。当前分享包 {new['bytes']/1024**2:.2f} MiB，SHA-256 `{new['sha256']}`。程序二进制未更换，课程与收藏未访问。详情见 reports/share-20261106/music-update.json 和 sound-design.json。\n")
cleanup = [ROOT / p for p in ['cache/promo-assets', 'cache/promo-sfx', 'cache/promo-tts', 'cache/promo-render', 'cache/share-build/guide-browser','scripts/inspect-promo-audio-sources.py','scripts/analyze-promo-audio.py']]
write('sound-cleanup-plan.json' if has_effects else 'music-cleanup-plan.json', {'items': [{'path': str(p.resolve()), 'reason': 'Downloaded production assets, temporary audio stems or browser cache; no course/model data'} for p in cleanup], 'scope': 'Only exact production paths; keep final video, guide, ZIP and reports'})
print(json.dumps(new, ensure_ascii=False))
