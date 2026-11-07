using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
class Launcher {
 [STAThread] static void Main() {
  string root=AppDomain.CurrentDomain.BaseDirectory;
  try {
   foreach(string folder in new[]{"data","cache","cache/tmp","cache/session","logs"}) Directory.CreateDirectory(Path.Combine(root,folder));
   string probe=Path.Combine(root,"cache",Guid.NewGuid()+".probe");File.WriteAllText(probe,"ok");File.Delete(probe);
   var start=new ProcessStartInfo(Path.Combine(root,"app","ListeningProMax.App.exe"));
   start.UseShellExecute=false;start.WorkingDirectory=root;start.CreateNoWindow=true;
   start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");start.EnvironmentVariables["LPM_ROOT"]=root;
   foreach(string key in new[]{"TEMP","TMP"})start.EnvironmentVariables[key]=Path.Combine(root,"cache/tmp");
   foreach(string key in new[]{"APPDATA","LOCALAPPDATA","XDG_CACHE_HOME"})start.EnvironmentVariables[key]=Path.Combine(root,"cache");
   start.EnvironmentVariables["HF_HOME"]=Path.Combine(root,"cache/huggingface");
   start.EnvironmentVariables["TORCH_HOME"]=Path.Combine(root,"cache/torch");
   start.EnvironmentVariables["PYTHONPYCACHEPREFIX"]=Path.Combine(root,"cache/pycache");
   start.EnvironmentVariables["PYTHONUTF8"]="1";start.EnvironmentVariables["HF_HUB_OFFLINE"]="1";start.EnvironmentVariables["TRANSFORMERS_OFFLINE"]="1";
   Process.Start(start);
  } catch(Exception e) { MessageBox.Show("无法启动 ListeningProMax。请将整个文件夹解压到可写的磁盘目录，勿在 ZIP 内直接运行。\n\n"+e.Message,"ListeningProMax",MessageBoxButtons.OK,MessageBoxIcon.Error); }
 }
}
