import {japaneseSizes,translationSizes,type Appearance} from '../shared/appearance';
export function AppearanceSettings({value,onChange}:{value:Appearance;onChange:(value:Appearance)=>void}){
 return <section className="settings-card appearance-card" id="appearance-settings"><h3>外观与阅读</h3><p>分别调整日语和中文的大小，选择适合你的阅读方式。保存后应用到所有课程。</p>
 <div className="appearance-fields"><label>外观<select aria-label="外观模式" value={value.theme} onChange={e=>onChange({...value,theme:e.target.value as Appearance['theme']})}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
 <label>日语字号<select aria-label="日语字号" value={value.japaneseSize} onChange={e=>onChange({...value,japaneseSize:Number(e.target.value)})}>{japaneseSizes.map(n=><option key={n} value={n}>{n} px{n===28?' · 默认':''}</option>)}</select></label>
 <label>中文字号<select aria-label="中文字号" value={value.translationSize} onChange={e=>onChange({...value,translationSize:Number(e.target.value)})}>{translationSizes.map(n=><option key={n} value={n}>{n} px{n===17?' · 默认':''}</option>)}</select></label></div>
 <div className="reading-preview"><span>字号预览</span><p lang="ja" style={{fontSize:value.japaneseSize}}>少しずつ、聞き取れるようになりました。</p><p style={{fontSize:value.translationSize}}>渐渐地，我能听懂了。</p></div>
 </section>;
}
