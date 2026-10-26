import {useState} from 'react';
import type {Provider, Story} from '../types';
export const example = 'As a registered customer, I want to reset my password using my verified email address so that I can regain access to my account.';
export function StoryForm({providers, busy, onAnalyze,onProviderChange}:{providers:Provider[]; busy:boolean; onAnalyze:(s:Story)=>void;onProviderChange?:(id:string)=>void}) {
 const [story,setStory] = useState(''), [criteria,setCriteria] = useState(''), [context,setContext] = useState(''), [provider,setProvider] = useState(''), [error,setError] = useState('');
 const selected = provider || providers.find(p=>p.enabled)?.id || providers[0]?.id || '';
 return <form onSubmit={e=>{e.preventDefault(); if(!story.trim()){setError('Enter a user story.');return;} setError('');onAnalyze({user_story:story,acceptance_criteria:criteria,context,provider:selected});}}>
 <div className="section-heading"><h2>Describe the requirement</h2><div className="actions input-actions"><button type="button" disabled={busy} onClick={()=>{setStory(example);setCriteria('');setContext('');}}>Load example</button></div></div>
 <label>User story <span>Required · up to 12,000 characters</span><textarea aria-label="User story" maxLength={12000} rows={5} value={story} disabled={busy} onChange={e=>setStory(e.target.value)} placeholder="As a… I want… so that…"/></label>
 <label>Acceptance criteria <span>Optional</span><textarea maxLength={12000} rows={3} value={criteria} disabled={busy} onChange={e=>setCriteria(e.target.value)}/></label>
 <label>Context <span>Optional</span><textarea maxLength={12000} rows={3} value={context} disabled={busy} onChange={e=>setContext(e.target.value)}/></label>
 <label>LLM provider<select value={selected} disabled={busy} onChange={e=>{setProvider(e.target.value);onProviderChange?.(e.target.value);}}>{providers.map(p=><option key={p.id} value={p.id} disabled={!p.enabled}>{p.id === 'openai' ? 'Capgemini GEP' : p.id} · {p.model}{!p.enabled?' (configuration required)':''}</option>)}</select></label>
 {providers.length>0 && !providers.some(p=>p.enabled) && <p className="notice">Configure GENERATIVE_ENGINE_API_KEY, GENERATIVE_ENGINE_BASE_URL and GENERATIVE_ENGINE_MODEL in backend/.env and restart the backend. Submitting will show the configuration error.</p>}
 {error && <p role="alert">{error}</p>}
 <button className="primary" disabled={busy || !selected} type="submit">{busy?'Analyzing…':'Analyze'}</button><p className="small">Source text is sent to the selected provider. Every result requires human review.</p>
 </form>;
}