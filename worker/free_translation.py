"""Bing's public web translator, without accounts, subscription keys or paid APIs."""
import json,re,time,threading,http.cookiejar,urllib.request,urllib.parse,urllib.error

_lock=threading.Lock()
_session=None
_failure=None
_headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36','Accept-Language':'zh-CN,zh;q=0.9'}

def blocks(text,limit=900):
    """Respect the web page's 1000 UTF-16-unit cap, preferably at punctuation."""
    while text:
        size=0;end=0;boundary=0
        for i,c in enumerate(text):
            units=2 if ord(c)>0xffff else 1
            if size+units>limit:break
            size+=units;end=i+1
            if c in '。！？!?\n':boundary=end
        if end<len(text) and boundary>=end//2:end=boundary
        yield text[:end];text=text[end:]

def session():
    global _session,_failure
    with _lock:
        if _session and time.monotonic()<_session['expires']:return _session
        if _failure and time.monotonic()-_failure[0]<15:raise RuntimeError(_failure[1])
        try:
            opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            request=urllib.request.Request('https://cn.bing.com/translator',headers=_headers)
            with opener.open(request,timeout=10) as response:
                address=urllib.parse.urlsplit(response.url)
                if address.scheme!='https' or address.hostname not in ('cn.bing.com','www.bing.com'):raise RuntimeError('必应跳转地址异常')
                page=response.read(1500000).decode('utf-8')
            auth=re.search(r'params_AbusePreventionHelper\s*=\s*(\[[^\]]+\])',page)
            ig=re.search(r'IG:"([^"]+)"',page);iid=re.search(r'data-iid="(translator\.[^"]+)"',page)
            if not auth or not ig or not iid:raise RuntimeError('必应网页暂不可用或需要人工验证')
            values=json.loads(auth.group(1))
            if len(values)<2 or not isinstance(values[1],str):raise RuntimeError('必应会话格式已变化')
            _session={'opener':opener,'origin':'https://'+address.hostname,'key':values[0],'token':values[1],'ig':ig.group(1),'iid':iid.group(1),'counter':0,'expires':time.monotonic()+300}
            _failure=None;return _session
        except Exception as e:
            message='必应连接失败：'+str(e)[:120];_failure=(time.monotonic(),message);raise RuntimeError(message) from e

def translate_free(text,provider='bing'):
    if provider!='bing':raise ValueError('不再支持此联网翻译服务，请使用微软必应')
    if not text.strip():raise ValueError('待翻译文字为空')
    deadline=time.monotonic()+45;state=session();values=[]
    for block in blocks(text):
        remaining=deadline-time.monotonic()
        if remaining<=0:raise RuntimeError('必应翻译超时，可重试未完成句子')
        with _lock:state['counter']+=1;counter=state['counter']
        url=state['origin']+'/ttranslatev3?'+urllib.parse.urlencode({'isVertical':'1','IG':state['ig'],'IID':state['iid']+'.'+str(counter)})
        data=urllib.parse.urlencode({'fromLang':'ja','to':'zh-Hans','text':block,'token':state['token'],'key':state['key']}).encode()
        headers={**_headers,'Referer':state['origin']+'/translator','Origin':state['origin'],'Content-Type':'application/x-www-form-urlencoded'}
        try:
            with state['opener'].open(urllib.request.Request(url,data=data,headers=headers),timeout=min(10,remaining)) as response:result=json.loads(response.read(1000000))
        except urllib.error.HTTPError as e:
            if e.code in (400,401,403):state['expires']=0
            raise RuntimeError('必应请求失败'+('（请求过于频繁，请稍后重试）' if e.code==429 else f'（HTTP {e.code}）')) from e
        except (ValueError,UnicodeError) as e:raise RuntimeError('必应未返回有效译文，可重试或使用本地翻译') from e
        rows=result[0].get('translations',[]) if isinstance(result,list) and result and isinstance(result[0],dict) else []
        value=next((row.get('text') for row in rows if isinstance(row,dict) and row.get('to')=='zh-Hans'),None)
        if not isinstance(value,str) or not value.strip():raise RuntimeError('必应未返回简体中文译文，可能限流或需要人工验证')
        values.append(value.strip())
    return ''.join(values)
