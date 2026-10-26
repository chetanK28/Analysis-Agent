import {useRef} from 'react';
import type {DocumentText} from '../types';
export function DocumentPicker({canAnalyze,onFile}:{canAnalyze:boolean;onFile:(file:File)=>void}) {
 const input=useRef<HTMLInputElement>(null);
 return <><button type="button" disabled={!canAnalyze} onClick={()=>input.current?.click()}>Upload a document</button><input ref={input} type="file" hidden aria-label="Choose PDF or Word document" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={!canAnalyze} onChange={e=>{const file=e.target.files?.[0];if(file)onFile(file);e.target.value='';}}/></>;
}
export function DocumentUpload({document,busy,canAnalyze,onFile,onText,onAnalyze}:{document:DocumentText|null;busy:boolean;canAnalyze:boolean;onFile:(file:File)=>void;onText:(text:string)=>void;onAnalyze:()=>void}) {
 return <section className="document-upload" aria-labelledby="document-heading">
 <h2 id="document-heading">Document analysis</h2>
 <DocumentPicker canAnalyze={true} onFile={onFile}/>
 <p className="small">Text-based PDF (.pdf) or Word DOCX (.docx), up to 10 MB and 12,000 extracted characters. Upload to extract and preview the text, then click Analyze document to send it to the selected provider. No OCR.</p>

 <p className="small">Selecting another file replaces the current document. Analysis starts only when you click Analyze document.</p>
 {document&&<><p>File: <strong>{document.filename}</strong></p>{document.text&&<details><summary>Preview and edit extracted text</summary><label>Extracted text<textarea rows={8} maxLength={12000} disabled={busy} value={document.text} onChange={e=>onText(e.target.value)}/></label></details>}</>}
 <button className="primary" type="button" disabled={busy||!canAnalyze||!document?.text.trim()} onClick={onAnalyze}>Analyze document</button>
 </section>;
}
