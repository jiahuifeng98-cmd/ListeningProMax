using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// Windows 10/11 include .NET Framework 4.x. No developer runtime is required.
class ShareLauncher {
 const string Magic="LPM19BUNDLE00001";
 static string home,root,self; static volatile bool cancelled;
 static readonly string[] required={"app/ListeningProMax.App.exe","app/resources/app/out/main.cjs","runtime/python/python.exe","assets/dictionaries.sqlite","bootstrap.exe"};
 [STAThread] static int Main(string[] args) {
  self=System.Reflection.Assembly.GetExecutingAssembly().Location;
  home=Path.GetDirectoryName(self);root=Path.Combine(home,".ListeningProMax");
  bool prepare=Array.IndexOf(args,"--prepare-only")>=0, verify=Array.IndexOf(args,"--verify-only")>=0;
  Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
  try {
   if(!Environment.Is64BitOperatingSystem)throw new Exception("需要 Windows 10/11 的 64 位系统。");
   string mutexName="Local\\ListeningProMaxShare-"+Hash(Encoding.UTF8.GetBytes(home.ToLowerInvariant())).Substring(0,24);
   using(var mutex=new Mutex(false,mutexName)) {
    bool locked=false;try {try{locked=mutex.WaitOne(0);}catch(AbandonedMutexException){locked=true;}
     if(!locked){if(!prepare)MessageBox.Show("软件正在准备资源，请等待当前窗口完成。","ListeningProMax");return 2;}
     CheckPath(root);Directory.CreateDirectory(root);File.SetAttributes(root,File.GetAttributes(root)|FileAttributes.Hidden|FileAttributes.NotContentIndexed);
     string probe=Path.Combine(root,"write-"+Guid.NewGuid()+".tmp");File.WriteAllText(probe,"ok");File.Delete(probe);
     string marker=Path.Combine(root,"ready.txt");
     Bundle bundle=ReadBundle();
     if(!File.Exists(marker)) {
      if(bundle==null)throw new Exception("运行资源不完整。请将原始分享 ZIP 重新解压到一个新文件夹后启动。保留旧文件夹，避免丢失课程。");
      Exception failure=null;var form=new Form{Text="ListeningProMax · 首次准备",Width=540,Height=220,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false};
      var label=new Label{Left=24,Top=24,Width=470,Height=54,Text="正在准备离线资源，只需执行一次。\n资源保存在当前文件夹，不需要联网或管理员权限。",Font=new Font("Microsoft YaHei UI",10)};
      var bar=new ProgressBar{Left=24,Top=100,Width=470,Height=20};var status=new Label{Left=24,Top=130,Width=470,Height=24,Text="校验发行包…"};form.Controls.AddRange(new Control[]{label,bar,status});
      bool finished=false;form.FormClosing+=(s,e)=>{if(!finished){cancelled=true;e.Cancel=true;status.Text="正在安全取消；下次打开可以重新准备。";}};
      form.Shown+=(s,e)=>{Task.Run(()=>{try{Prepare(bundle,(n,text)=>{if(!form.IsDisposed)form.BeginInvoke((Action)(()=>{bar.Value=Math.Max(0,Math.Min(100,n));status.Text=text;}));});}catch(Exception ex){failure=ex;}finally{form.BeginInvoke((Action)(()=>{finished=true;form.Close();}));}});};
      Application.Run(form);form.Dispose();if(failure!=null)throw failure;
     }else if(bundle!=null && File.ReadAllText(marker).Trim()!=bundle.digest)throw new Exception("此目录已有另一份发行资源。请把新的分享 ZIP 解压到新文件夹，不要覆盖已有课程目录。");
     foreach(string file in required)if(!File.Exists(Safe(file)))throw new Exception("缺少运行资源："+file+"。请重新解压原始分享 ZIP 到新目录。");
     if(verify)VerifyFiles();
     if(prepare||verify)return 0;
     if(bundle!=null && CompactLauncher())return 0;
     CleanupRetired();CreateShortcut();Launch();return 0;
    }finally{if(locked)mutex.ReleaseMutex();}
   }
  }catch(Exception e){try{File.AppendAllText(Path.Combine(root,"launcher-error.log"),DateTime.Now.ToString("s")+" "+e+Environment.NewLine);}catch{}
   if(!prepare&&!verify)MessageBox.Show(e is OperationCanceledException?"准备已取消。下次双击程序可以重新准备。":"无法启动 ListeningProMax。\n请先完整解压 ZIP 到可写目录（推荐 D 盘），不要在压缩包中直接打开。\n\n"+e.Message,"ListeningProMax",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}
 }
 static string Hash(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static string HashFile(string file){using(var s=File.OpenRead(file))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 static void CheckPath(string path){for(string p=Path.GetFullPath(path);p!=null;p=Path.GetDirectoryName(p))if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("为保证数据位置明确，请使用普通本地文件夹，不要通过目录链接运行。");}
 static string Safe(string relative){if(Path.IsPathRooted(relative)||relative.Contains(":")||relative.Contains("\\")||Array.IndexOf(relative.Split('/'),"..")>=0)throw new Exception("发行包路径异常");string p=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));if(!p.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("发行包路径越界");CheckPath(p);return p;}
 class Bundle{public long offset,length,expanded;public string digest;}
 static Bundle ReadBundle(){using(var f=File.OpenRead(self)){if(f.Length<72)return null;f.Position=f.Length-72;using(var r=new BinaryReader(f)){long o=r.ReadInt64(),l=r.ReadInt64(),e=r.ReadInt64();string d=BitConverter.ToString(r.ReadBytes(32)).Replace("-","").ToLowerInvariant();string m=Encoding.ASCII.GetString(r.ReadBytes(16));if(m!=Magic)return null;if(o<0||l<0||e<0||o+l!=f.Length-72)throw new Exception("发行包不完整，请重新获取 ZIP。");return new Bundle{offset=o,length=l,expanded=e,digest=d};}}}
 static Dictionary<string,string[]> Manifest(){var rows=new Dictionary<string,string[]>(StringComparer.OrdinalIgnoreCase);foreach(string line in File.ReadAllLines(Safe("bundle-manifest.tsv"),Encoding.UTF8)){var c=line.Split('\t');if(c.Length!=3||rows.ContainsKey(c[2]))throw new Exception("资源清单异常");Safe(c[2]);rows.Add(c[2],c);}return rows;}
 static void Prepare(Bundle b,Action<int,string> progress){
  long available=new DriveInfo(Path.GetPathRoot(root)).AvailableFreeSpace;if(available<b.expanded+512L*1024*1024)throw new Exception("磁盘空间不足。首次准备还需要约 "+Math.Ceiling((b.expanded+512L*1024*1024)/1073741824.0)+" GB 可用空间。");
  using(var file=File.OpenRead(self))using(var payload=new SliceStream(file,b.offset,b.length)){
   using(var hash=SHA256.Create()){byte[] buffer=new byte[1024*1024];int read;long done=0;while((read=payload.Read(buffer,0,buffer.Length))>0){if(cancelled)throw new OperationCanceledException();hash.TransformBlock(buffer,0,read,null,0);done+=read;progress((int)(done*10/b.length),"正在校验发行包 "+(done*100/b.length)+"%");}hash.TransformFinalBlock(new byte[0],0,0);if(BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant()!=b.digest)throw new Exception("发行包校验失败，请重新获取 ZIP。");}
   payload.Position=0;using(var zip=new ZipArchive(payload,ZipArchiveMode.Read,true)){
    var manifest=zip.GetEntry("bundle-manifest.tsv");if(manifest==null)throw new Exception("资源清单缺失");using(var source=manifest.Open())using(var target=File.Create(Safe("bundle-manifest.tsv")))source.CopyTo(target);
    var rows=Manifest();if(zip.Entries.Count!=rows.Count+1)throw new Exception("发行包清单不匹配");long done=0;
    foreach(var entry in zip.Entries){if(entry.FullName=="bundle-manifest.tsv")continue;if(cancelled)throw new OperationCanceledException();string[] row;if(!rows.TryGetValue(entry.FullName,out row)||entry.Length!=long.Parse(row[1]))throw new Exception("资源长度不符："+entry.FullName);
     // No data/cache/logs can ever appear in the payload or overwrite user state.
     string top=entry.FullName.Split('/')[0];if(Array.IndexOf(new[]{"app","runtime","models","assets","worker","licenses","bootstrap.exe","THIRD_PARTY_NOTICES.md","requirements.lock.txt"},top)<0)throw new Exception("不允许的资源目录");
     string target=Safe(entry.FullName),temp=Safe(entry.FullName+".unpacking");Directory.CreateDirectory(Path.GetDirectoryName(target));
     using(var source=entry.Open())using(var output=File.Create(temp))using(var hash=SHA256.Create()){
      byte[] buffer=new byte[1024*1024];int read;long written=0;while((read=source.Read(buffer,0,buffer.Length))>0){if(cancelled)throw new OperationCanceledException();output.Write(buffer,0,read);hash.TransformBlock(buffer,0,read,null,0);written+=read;done+=read;progress(10+(int)(done*89/b.expanded),"准备离线资源 "+(done*100/b.expanded)+"%");}hash.TransformFinalBlock(new byte[0],0,0);if(written!=entry.Length||BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant()!=row[0])throw new Exception("资源校验失败："+entry.FullName);}
     if(File.Exists(target))File.Delete(target);File.Move(temp,target);
    }
   }
  }
  File.WriteAllText(Safe("ready.txt.new"),b.digest,Encoding.ASCII);File.Move(Safe("ready.txt.new"),Safe("ready.txt"));progress(100,"准备完成");
 }
 static void VerifyFiles(){foreach(var row in Manifest().Values)if(!File.Exists(Safe(row[2]))||new FileInfo(Safe(row[2])).Length!=long.Parse(row[1])||HashFile(Safe(row[2]))!=row[0])throw new Exception("资源校验失败："+row[2]);}
 static bool CompactLauncher(){
  string retired=Safe("package-retired-"+Guid.NewGuid().ToString("N")+".exe");
  try{File.Move(self,retired);try{File.Copy(Safe("bootstrap.exe"),self);}catch{File.Move(retired,self);throw;}
   // Wait for this process to release its mutex before the small launcher takes over.
   var start=new ProcessStartInfo(self,"--finish-launch "+Process.GetCurrentProcess().Id){UseShellExecute=false,WorkingDirectory=home,CreateNoWindow=true};
   // Parent exit is handled by the small entry point before Main.
   Process.Start(start);return true;
  }catch(Exception e){File.AppendAllText(Safe("launcher-error.log"),"压缩启动器保留，软件仍可使用："+e.Message+Environment.NewLine);return false;}
 }
 static void CleanupRetired(){foreach(var file in Directory.GetFiles(root,"package-retired-*.exe")){string name=Path.GetFileNameWithoutExtension(file).Substring("package-retired-".Length);Guid id;if(!Guid.TryParseExact(name,"N",out id))continue;try{CheckPath(file);File.Delete(file);}catch{}}}
 static void CreateShortcut(){
  string marker=Safe("shortcut-target.txt");if(File.Exists(marker)&&File.ReadAllText(marker)==self)return;
  string desktop=Environment.GetEnvironmentVariable("LPM_SHORTCUT_TEST_DIR");if(String.IsNullOrEmpty(desktop))desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
  try{Directory.CreateDirectory(desktop);Type t=Type.GetTypeFromProgID("WScript.Shell");dynamic shell=Activator.CreateInstance(t);dynamic link=shell.CreateShortcut(Path.Combine(desktop,"ListeningProMax.lnk"));link.TargetPath=self;link.WorkingDirectory=home;link.IconLocation=self+",0";link.Description="ListeningProMax 日语精听";link.Save();Marshal.FinalReleaseComObject(link);Marshal.FinalReleaseComObject(shell);File.WriteAllText(marker,self);}
  catch(Exception e){File.AppendAllText(Safe("launcher-error.log"),"桌面快捷方式创建失败："+e.Message+Environment.NewLine);MessageBox.Show("软件已准备好，但桌面快捷方式未能创建。\n仍可双击当前文件夹内的程序使用；也可右键程序，发送到桌面快捷方式。","ListeningProMax");}
 }
 static void Launch(){foreach(string dir in new[]{"data","cache/tmp","cache/session","logs"})Directory.CreateDirectory(Safe(dir));
  var p=new ProcessStartInfo(Safe("app/ListeningProMax.App.exe")){UseShellExecute=false,WorkingDirectory=root,CreateNoWindow=true};p.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");p.EnvironmentVariables["LPM_ROOT"]=root;
  foreach(string k in new[]{"TEMP","TMP"})p.EnvironmentVariables[k]=Safe("cache/tmp");foreach(string k in new[]{"APPDATA","LOCALAPPDATA","XDG_CACHE_HOME"})p.EnvironmentVariables[k]=Safe("cache");
  p.EnvironmentVariables["HF_HOME"]=Safe("cache/huggingface");p.EnvironmentVariables["TORCH_HOME"]=Safe("cache/torch");p.EnvironmentVariables["PYTHONPYCACHEPREFIX"]=Safe("cache/pycache");p.EnvironmentVariables["PYTHONUTF8"]="1";p.EnvironmentVariables["HF_HUB_OFFLINE"]="1";p.EnvironmentVariables["TRANSFORMERS_OFFLINE"]="1";Process.Start(p);
 }
 class SliceStream:Stream{
  Stream inner;long start,size,position;public SliceStream(Stream s,long offset,long length){inner=s;start=offset;size=length;inner.Position=start;}
  public override bool CanRead{get{return true;}}public override bool CanWrite{get{return false;}}public override bool CanSeek{get{return true;}}public override long Length{get{return size;}}public override long Position{get{return position;}set{Seek(value,SeekOrigin.Begin);}}
  public override int Read(byte[] b,int o,int c){inner.Position=start+position;int n=inner.Read(b,o,(int)Math.Min(c,size-position));position+=n;return n;}public override long Seek(long o,SeekOrigin origin){long n=origin==SeekOrigin.Begin?o:origin==SeekOrigin.Current?position+o:size+o;if(n<0||n>size)throw new IOException("资源读取越界");position=n;return n;}public override void Flush(){}public override void SetLength(long n){throw new NotSupportedException();}public override void Write(byte[] b,int o,int c){throw new NotSupportedException();}
 }
 // Explicit entry point lets hand-off wait outside the single-instance preparation mutex.
 class Entry{[STAThread]static int Main(string[] args){if(args.Length==2&&args[0]=="--finish-launch"){int pid;if(int.TryParse(args[1],out pid))try{using(var p=Process.GetProcessById(pid)){if(!p.WaitForExit(30000))return 3;}}catch(ArgumentException){}}return ShareLauncher.Main(args);}}
}
