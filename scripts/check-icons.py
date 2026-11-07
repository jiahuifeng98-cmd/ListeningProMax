from pathlib import Path
import ctypes as c,struct,json,hashlib
root=Path(__file__).resolve().parents[1];icon=(root/'assets/branding/listening-promax.ico').read_bytes();count=struct.unpack_from('<H',icon,4)[0]
expected=set()
for i in range(count):
 size,offset=struct.unpack_from('<II',icon,6+i*16+8);expected.add(hashlib.sha256(icon[offset:offset+size]).hexdigest())
k=c.WinDLL('kernel32',use_last_error=True)
k.LoadLibraryExW.argtypes=[c.c_wchar_p,c.c_void_p,c.c_uint];k.LoadLibraryExW.restype=c.c_void_p
k.FindResourceW.argtypes=[c.c_void_p,c.c_void_p,c.c_void_p];k.FindResourceW.restype=c.c_void_p
k.LoadResource.argtypes=[c.c_void_p,c.c_void_p];k.LoadResource.restype=c.c_void_p
k.LockResource.argtypes=[c.c_void_p];k.LockResource.restype=c.c_void_p
k.SizeofResource.argtypes=[c.c_void_p,c.c_void_p];k.SizeofResource.restype=c.c_uint
k.FreeLibrary.argtypes=[c.c_void_p]
CB=c.WINFUNCTYPE(c.c_bool,c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p)
k.EnumResourceNamesW.argtypes=[c.c_void_p,c.c_void_p,CB,c.c_void_p]
files=[]
for relative in ['release/ListeningProMax/ListeningProMax.exe','release/ListeningProMax/app/ListeningProMax.App.exe']:
 h=k.LoadLibraryExW(str(root/relative),None,2);assert h
 def read(kind,name):
  r=k.FindResourceW(h,name,kind);assert r
  data=k.LockResource(k.LoadResource(h,r));return c.string_at(data,k.SizeofResource(h,r))
 found=[]
 @CB
 def cb(h,t,name,_):
  data=read(14,name);n=struct.unpack_from('<H',data,4)[0];hashes=[]
  for i in range(n):
   resource=struct.unpack_from('<H',data,6+i*14+12)[0];hashes.append(hashlib.sha256(read(3,resource)).hexdigest())
  found.append(set(hashes));return True
 k.EnumResourceNamesW(h,14,cb,None);k.FreeLibrary(h)
 assert found and all(values==expected for values in found),relative
 files.append({'file':relative,'groups':len(found),'sizes':count})
report={'passed':True,'files':files,'checks':['launcher and application PE icons exactly match generated ICO frames']}
(root/'reports/v17/icons.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report))
