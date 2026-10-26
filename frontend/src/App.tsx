import {useEffect,useRef,useState} from 'react';
import {getProviders,analyzeStory,extractDocument} from './api/client';
import {StoryForm} from './components/StoryForm';
import {DocumentUpload} from './components/DocumentUpload';
import {AnalysisResults} from './components/AnalysisResults';
import type {Provider,Result,Story,DocumentText} from './types';
export default function App(){
 const [providers,setProviders]=useState<Provider[]>([]),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>{setError('');getProviders().then(setProviders).catch(e=>setError(e.message));};
 useEffect(()=>{load();},[]);
 const [document,setDocument]=useState<DocumentText|null>(null),[phase,setPhase]=useState(''),[chosenProvider,setChosenProvider]=useState('');
 const current=useRef(0), controller=useRef<AbortController|null>(null), inProgress=useRef(false), retryAction=useRef<(()=>void)|null>(null), activeFile=useRef<string|null>(null);
 const provider=chosenProvider || providers.find(p=>p.enabled)?.id || providers[0]?.id || '';
 const canAnalyze=providers.some(p=>p.id===provider&&p.enabled);
 useEffect(()=>()=>{current.current++;controller.current?.abort();},[]);
 function begin(){controller.current?.abort();controller.current=new AbortController();const id=++current.current;inProgress.current=true;setBusy(true);setError('');setResult(null);return {id,signal:controller.current.signal};}
 function finish(id:number){if(id===current.current){inProgress.current=false;activeFile.current=null;setBusy(false);setPhase('');}}
 async function runAnalysis(story:Story,id:number,signal:AbortSignal){
  if(id!==current.current)return;
  setPhase('Analyzing user story...');
  const response=await analyzeStory(story,signal);
  if(id===current.current)setResult(response);
 }
 async function submit(story:Story){
  if(inProgress.current)return;
  const {id,signal}=begin();setDocument(null);retryAction.current=()=>void submit(story);
  try{await runAnalysis(story,id,signal);}catch(e){if(id===current.current)setError(e instanceof Error?e.message:'Analysis failed.');}finally{finish(id);}
 }
 async function upload(file:File){
  const identity=JSON.stringify([file.name,file.size,file.type,file.lastModified]);
  if(inProgress.current&&activeFile.current===identity)return;
  activeFile.current=identity;
  const {id,signal}=begin();setDocument({filename:file.name,text:''});retryAction.current=()=>void upload(file);
  try{
   if(/\.doc$/i.test(file.name))throw new Error('Legacy .doc files are not supported. Save the document as .docx and upload it again.');
   if(!/\.(pdf|docx)$/i.test(file.name))throw new Error('Upload a PDF (.pdf) or Word DOCX (.docx) file.');
   if(file.size>10*1024*1024)throw new Error('The document exceeds the 10 MB limit.');
   if(!file.size)throw new Error('The uploaded file is empty.');
   setPhase('Reading document...');
   const extracted=await extractDocument(file,signal);
   if(id!==current.current)return;
   setDocument(extracted);
   retryAction.current=null;
  }catch(e){if(id===current.current)setError(e instanceof Error?e.message:'Document analysis failed. Please retry.');}finally{finish(id);}
 }
 async function rerun(source:DocumentText,providerId=provider){
  if(inProgress.current)return;
  const {id,signal}=begin();retryAction.current=()=>void rerun(source,providerId);
  try{await runAnalysis({user_story:source.text,acceptance_criteria:'',context:'',provider:providerId},id,signal);}catch(e){if(id===current.current)setError(e instanceof Error?e.message:'Analysis failed.');}finally{finish(id);}
 }
 return <main><header><p className="eyebrow">FROM STORY TO SHARED UNDERSTANDING</p><h1>Requirement Analysis Agent</h1><p className="subtitle">Explore requirements, surface uncertainty, and shape a draft you can review.</p></header><div className="workspace"><div className="input-options"><StoryForm providers={providers} busy={busy} onAnalyze={submit} onProviderChange={setChosenProvider}/><DocumentUpload onFile={upload} document={document} busy={busy} canAnalyze={canAnalyze} onText={text=>setDocument(d=>d?{...d,text}:d)} onAnalyze={()=>{if(document)void rerun(document);}}/></div><div aria-live="polite">{error&&<div role="alert" className="error">{error}{retryAction.current&&<button disabled={busy} onClick={()=>retryAction.current?.()}>Retry</button>}{!providers.length&&<button onClick={load}>Retry connection</button>}</div>}{busy&&<div role="status" className="placeholder">{phase} This may take a minute.</div>}{result?<AnalysisResults result={result} onChange={setResult}/>:!busy&&<div className="placeholder"><h2>A clearer starting point</h2><p>Your draft will include functional requirements, non-functional requirements, risks, assumptions, and clarification questions.</p><p>Edit findings, record review decisions, and download your work.</p></div>}</div></div><footer>Drafts only · No database · Review changes are lost on refresh. Download to save them.</footer></main>;
}