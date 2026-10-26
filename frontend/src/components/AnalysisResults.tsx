import {useState} from 'react';
import {labels,sections,type Finding,type Result,type Section} from '../types';
import {download} from '../export';
export function AnalysisResults({result,onChange}:{result:Result;onChange:(r:Result)=>void}) {
 const [rating,setRating]=useState(''),[comment,setComment]=useState('');
 const assessment=result.story_assessment;
 const edit=(s:Section,id:string,patch:Partial<Finding>)=>onChange({...result,analysis:{...result.analysis,[s]:result.analysis[s].map(f=>f.id===id?{...f,...patch}:f)}});
 return <section className="results"><div className="section-heading"><div><h2>Analysis draft</h2><p>{result.provider === 'openai' ? 'Capgemini GEP' : result.provider} · {result.model}</p></div><div className="actions"><button onClick={()=>download(result,'json')}>Download JSON</button><button onClick={()=>download(result,'md')}>Download Markdown</button></div></div>
 <p className="notice">Review each finding. Accepted and rejected labels record your decisions in this browser session; the agent never approves requirements.</p>
 {result.warnings.length>0 && <details><summary>Validation notes ({result.warnings.length})</summary>{result.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
 {sections.map(s=><section key={s}><h3>{labels[s]} <span className="count">{result.analysis[s].length}</span></h3>{!result.analysis[s].length && <p className="empty">No findings in this section.</p>}{result.analysis[s].map(f=><article key={f.id} className="finding"><div className="section-heading"><strong>{f.id}</strong><span className={`badge ${f.classification}`}>{f.classification}</span></div><label>Title<input aria-label={`Title ${f.id}`} value={f.title} onChange={e=>edit(s,f.id,{title:e.target.value})}/></label><label>Description<textarea aria-label={`Description ${f.id}`} rows={3} value={f.description} onChange={e=>edit(s,f.id,{description:e.target.value})}/></label><div className="evidence"><strong>Source evidence</strong>{f.evidence.length?f.evidence.map((e,i)=><blockquote key={i}>{e}</blockquote>):<p>No direct evidence supplied.</p>}</div><label>Review decision<select aria-label={`Review ${f.id}`} value={f.review || 'pending'} onChange={e=>edit(s,f.id,{review:e.target.value as Finding['review']})}><option value="pending">Pending review</option><option value="accepted">Accepted by reviewer</option><option value="rejected">Rejected by reviewer</option></select></label></article>)}</section>)}
 <section aria-labelledby="assessment-heading"><h3 id="assessment-heading">Story Assessment</h3>
 <p className="notice">Scores are AI estimates based on the original story, acceptance criteria, and context. A person should review them; accuracy is not guaranteed.</p>
 {assessment ? <div className="assessment-grid"><article className="finding"><h4>Complexity: {assessment.complexity_score}/5 - {assessment.complexity_label}</h4><ul>{assessment.complexity_reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul></article><article className="finding"><h4>Readiness: {assessment.readiness_score}/5 - {assessment.readiness_label}</h4><h4>Missing or ambiguous details</h4>{assessment.readiness_gaps.length ? <ul>{assessment.readiness_gaps.map((gap,i)=><li key={i}>{gap}</li>)}</ul>:<p>No gaps identified by the AI. Please review.</p>}</article></div> : <p role="alert">Story Assessment is unavailable in this response. Run the analysis again to request scores.</p>}
 </section>
 <section aria-labelledby="feedback-heading"><h3 id="feedback-heading">Reviewer feedback</h3>
 <form onSubmit={e=>{e.preventDefault();if(rating)onChange({...result,feedback:{rating:Number(rating),comment:comment.trim()}});}}>
 <label>Was this analysis useful?<select value={rating} required onChange={e=>setRating(e.target.value)}><option value="">Select a rating</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}{n===1?' - Not useful':n===5?' - Very useful':''}</option>)}</select></label>
 <label>Optional comment<textarea maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/></label>
 <button type="submit" disabled={!rating}>Submit feedback</button>
 {result.feedback&&<p role="status">Feedback submitted: {result.feedback.rating}/5{result.feedback.comment&&` - ${result.feedback.comment}`}</p>}
 <p className="small">Feedback stays with this draft in the current browser session. Download a report to save it. Refreshing or starting another analysis clears it.</p>
 </form></section>
 </section>;
}