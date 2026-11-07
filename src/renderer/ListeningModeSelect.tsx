import { listeningModes, listeningModeIds, isListeningMode, type ListeningMode } from '../shared/listeningModes';
import { keyLabel, type Shortcuts } from '../shared/shortcuts';

export function ListeningModeSelect({ value, bindings, disabled, onChange }: {
  value?: ListeningMode; bindings: Shortcuts; disabled: boolean; onChange: (id: ListeningMode) => void;
}) {
  return <label className="listening-mode"><span>听力模式</span>
    <select aria-label="听力模式" value={value || 'custom'} disabled={disabled}
      onChange={e=>{if(isListeningMode(e.target.value))onChange(e.target.value);e.currentTarget.blur();}}>
      {!value && <option value="custom" disabled>自定义</option>}
      {listeningModeIds.map(id=><option key={id} value={id}>
        {bindings[id] ? keyLabel(bindings[id])+' · ' : ''}{listeningModes[id].label}
      </option>)}
    </select>
  </label>;
}
