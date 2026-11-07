"""Replace PE icon resources on a new file, then atomically swap; preserve hardlinked originals."""
from pathlib import Path
import ctypes as c,struct,shutil,sys,json
root=Path(__file__).resolve().parents[1]
target=(root/sys.argv[1]).resolve();assert target.is_relative_to(root) and target.suffix=='.exe'
icon=(root/'assets/branding/listening-promax.ico').read_bytes();count=struct.unpack_from('<H',icon,4)[0]
k=c.WinDLL('kernel32',use_last_error=True)
k.LoadLibraryExW.argtypes=[c.c_wchar_p,c.c_void_p,c.c_uint];k.LoadLibraryExW.restype=c.c_void_p
k.FreeLibrary.argtypes=[c.c_void_p]
NameCB=c.WINFUNCTYPE(c.c_bool,c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p)
LangCB=c.WINFUNCTYPE(c.c_bool,c.c_void_p,c.c_void_p,c.c_void_p,c.c_ushort,c.c_void_p)
k.EnumResourceNamesW.argtypes=[c.c_void_p,c.c_void_p,NameCB,c.c_void_p]
k.EnumResourceLanguagesW.argtypes=[c.c_void_p,c.c_void_p,c.c_void_p,LangCB,c.c_void_p]
k.BeginUpdateResourceW.argtypes=[c.c_wchar_p,c.c_bool];k.BeginUpdateResourceW.restype=c.c_void_p
k.UpdateResourceW.argtypes=[c.c_void_p,c.c_void_p,c.c_void_p,c.c_ushort,c.c_void_p,c.c_uint];k.UpdateResourceW.restype=c.c_bool
k.EndUpdateResourceW.argtypes=[c.c_void_p,c.c_bool];k.EndUpdateResourceW.restype=c.c_bool
groups=[]
module=k.LoadLibraryExW(str(target),None,2);assert module,c.get_last_error()
@NameCB
def name_cb(h,kind,name,_):
 key=name if name<=65535 else c.wstring_at(name)
 @LangCB
 def language_cb(h,t,n,lang,_):groups.append((key,lang));return True
 k.EnumResourceLanguagesW(h,kind,name,language_cb,None);return True
k.EnumResourceNamesW(module,14,name_cb,None);k.FreeLibrary(module)
if not groups:groups=[(1,0)]
temp=target.with_name(target.stem+'.icon-new.exe');shutil.copyfile(target,temp)
handle=k.BeginUpdateResourceW(str(temp),False);assert handle,c.get_last_error()
def update(kind,key,lang,data):
 name=c.create_unicode_buffer(key) if isinstance(key,str) else None
 ptr=c.cast(name,c.c_void_p) if name is not None else c.c_void_p(key)
 payload=c.create_string_buffer(data)
 assert k.UpdateResourceW(handle,kind,ptr,lang,payload,len(data)),c.get_last_error()
try:
 group=bytearray(struct.pack('<HHH',0,1,count))
 frames=[]
 for i in range(count):
  entry=icon[6+i*16:22+i*16];size,offset=struct.unpack_from('<II',entry,8);resource=1001+i
  frames.append((resource,icon[offset:offset+size]));group+=entry[:12]+struct.pack('<H',resource)
 for key,lang in groups:
  for resource,data in frames:update(3,resource,lang,data)
  update(14,key,lang,bytes(group))
 assert k.EndUpdateResourceW(handle,False),c.get_last_error();handle=None
 temp.replace(target)
finally:
 if handle:k.EndUpdateResourceW(handle,True)
 if temp.exists():temp.unlink()
print(json.dumps({'target':str(target),'groups':groups,'sizes':count}))
