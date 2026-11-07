"""Decode the delivered MP4, assert format/frames/audio, keep a compact report."""
from pathlib import Path
import json,hashlib,math,struct,zlib,subprocess,re
import av,numpy as np
root=Path(__file__).resolve().parents[1];d=root/'reports/share-20261106';p=d/'ListeningProMax-宣传片.mp4'
c=av.open(str(p));v=c.streams.video[0];a=c.streams.audio[0]
report={'path':str(p),'bytes':p.stat().st_size,'width':v.width,'height':v.height,'fps':str(v.average_rate),'sampleAspectRatio':str(v.sample_aspect_ratio),'videoCodec':v.codec_context.name,'pixelFormat':v.codec_context.format.name,'audioCodec':a.codec_context.name,'audioSampleRate':a.rate,'durationSeconds':c.duration/av.time_base}
assert (v.width,v.height)==(1440,1080) and v.average_rate==30 and v.sample_aspect_ratio==1
assert report['videoCodec']=='h264' and report['pixelFormat']=='yuv420p' and report['audioCodec']=='aac'
assert abs(report['durationSeconds']-20)<.05
last=-1;count=0;sample={48:'intro',144:'study',246:'modes',354:'dictionary',462:'colors',564:'end'};statistics=[]
for f in c.decode(video=0):
 assert f.time>last;last=f.time
 if count in sample:
  pixels=f.to_ndarray(format='rgb24');assert pixels.std()>20
  statistics.append({'frame':count,'time':f.time,'scene':sample[count],'pixelStdDev':round(float(pixels.std()),2)})
  if count==462:
   def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
   scanlines=b''.join(b'\x00'+row.tobytes() for row in pixels)
   (d/'video-preview.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1440,1080,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(scanlines,6))+chunk(b'IEND',b''))
 count+=1
assert count==600 and abs(last-599/30)<.001;c.close()
c=av.open(str(p));peak=0;energy=0;samples=0
for frame in c.decode(audio=0):
 x=frame.to_ndarray();peak=max(peak,float(np.abs(x).max()));energy+=float(np.square(x,dtype=np.float64).sum());samples+=x.size
c.close();rms=math.sqrt(energy/samples);assert rms>.005 and peak<1.0
report.update(passed=True,decodedFrames=count,lastFrameSeconds=last,audioPeak=peak,audioRMS=rms,sampledScenes=statistics,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
ff=root/'runtime/python/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
measurement=subprocess.run([str(ff),'-hide_banner','-i',str(p),'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True)
(d/'loudness.log').write_text(measurement.stderr,'utf-8')
summary=measurement.stderr.rsplit('Summary:',1)[-1]
integrated=float(re.search(r'I:\s*([-\d.]+) LUFS',summary)[1]);true_peak=float(re.search(r'Peak:\s*([-\d.]+) dBFS',summary)[1])
assert -16.5<=integrated<=-13.5 and true_peak<=-1.0
report.update(integratedLoudnessLUFS=integrated,truePeakDBFS=true_peak)
(d/'video.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False))
