"""Windows job: inference descendants cannot survive a crashed task worker."""
import ctypes,os
_job=None
def own_children():
 global _job
 if os.name!='nt':return
 from ctypes import wintypes as w
 class BASIC(ctypes.Structure):
  _fields_=[('PerProcessUserTimeLimit',ctypes.c_longlong),('PerJobUserTimeLimit',ctypes.c_longlong),('LimitFlags',w.DWORD),('MinimumWorkingSetSize',ctypes.c_size_t),('MaximumWorkingSetSize',ctypes.c_size_t),('ActiveProcessLimit',w.DWORD),('Affinity',ctypes.c_size_t),('PriorityClass',w.DWORD),('SchedulingClass',w.DWORD)]
 class IO(ctypes.Structure):_fields_=[(name,ctypes.c_ulonglong) for name in ['ReadOperationCount','WriteOperationCount','OtherOperationCount','ReadTransferCount','WriteTransferCount','OtherTransferCount']]
 class EXTENDED(ctypes.Structure):_fields_=[('BasicLimitInformation',BASIC),('IoInfo',IO),('ProcessMemoryLimit',ctypes.c_size_t),('JobMemoryLimit',ctypes.c_size_t),('PeakProcessMemoryUsed',ctypes.c_size_t),('PeakJobMemoryUsed',ctypes.c_size_t)]
 kernel=ctypes.WinDLL('kernel32',use_last_error=True)
 kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,w.LPCWSTR];kernel.CreateJobObjectW.restype=w.HANDLE
 kernel.SetInformationJobObject.argtypes=[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD];kernel.SetInformationJobObject.restype=w.BOOL
 kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE];kernel.AssignProcessToJobObject.restype=w.BOOL
 kernel.GetCurrentProcess.restype=w.HANDLE
 handle=kernel.CreateJobObjectW(None,None)
 if not handle:raise ctypes.WinError(ctypes.get_last_error())
 info=EXTENDED();info.BasicLimitInformation.LimitFlags=0x2000
 if not kernel.SetInformationJobObject(handle,9,ctypes.byref(info),ctypes.sizeof(info)) or not kernel.AssignProcessToJobObject(handle,kernel.GetCurrentProcess()):
  raise ctypes.WinError(ctypes.get_last_error())
 _job=handle
