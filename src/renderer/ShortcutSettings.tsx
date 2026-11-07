import {defaultShortcuts,keyLabel,normalizeShortcuts,shortcutError,shortcutKeys,shortcutLabels,type Shortcuts,type ShortcutAction} from '../shared/shortcuts';
export function ShortcutSettings({value,onChange}:{value?:Shortcuts;onChange:(value:Shortcuts)=>void}){
 const keys=value||normalizeShortcuts();const error=shortcutError(keys);
 return <section className="settings-card shortcuts-card"><div className="section-heading"><h3>功能快捷键</h3><button onClick={()=>onChange({...defaultShortcuts})}>恢复默认快捷键</button></div>
 <p>选择单个按键，保存设置后生效。编辑文字、输入框和下拉框中不会触发；Shift 仅单独轻按时生效，不影响组合选择。</p>
 <p>数字 1–4 默认切换四种听力模式，同时设置倍速和循环。底部菜单也可选择；切换保留播放位置与暂停状态。旧快捷键如占用了 1–4，仅该冲突项会变为未绑定，可在这里重设。</p>
 <div className="shortcut-grid">{(Object.keys(shortcutLabels) as ShortcutAction[]).map(action=><label key={action}>{shortcutLabels[action]}<select aria-label={shortcutLabels[action]+'快捷键'} value={keys[action]} onChange={e=>onChange({...keys,[action]:e.target.value})}><option value="">未绑定</option>{shortcutKeys.map(key=><option key={key} value={key}>{keyLabel(key)}</option>)}</select></label>)}</div>
 {error&&<p className="shortcut-error" role="alert">{error}</p>}
 </section>;
}
