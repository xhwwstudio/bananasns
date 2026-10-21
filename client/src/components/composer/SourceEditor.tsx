import Icon from '../Icon';

// 信息来源编辑器：来源地址 + 原作者。受控组件，state 留在 Composer。
export interface SourceValue {
  url: string;
  author: string;
}

export default function SourceEditor({ value, onChange }: { value: SourceValue; onChange: (v: SourceValue | null) => void }) {
  return (
    <div className="poll-editor">
      <div className="poll-editor-head">
        <span><Icon name="link" size={15} /> 信息来源</span>
        <button type="button" className="faint" style={{ fontSize: 12.5 }} onClick={() => onChange(null)}>移除</button>
      </div>
      <div className="poll-editor-row">
        <input value={value.url} maxLength={500} placeholder="来源网络地址（https://…）"
          onChange={(e) => onChange({ ...value, url: e.target.value })} />
      </div>
      <div className="poll-editor-row">
        <input value={value.author} maxLength={100} placeholder="原作者（可选，如：某某媒体）"
          onChange={(e) => onChange({ ...value, author: e.target.value })} />
      </div>
      <div className="faint" style={{ fontSize: 12, padding: '2px 2px 8px', lineHeight: 1.6 }}>
        发布后会在动态下方显示「来自 原作者」，点击在新窗口打开来源地址。
      </div>
    </div>
  );
}
