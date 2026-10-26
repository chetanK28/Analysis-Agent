import {afterEach,expect,it,vi} from 'vitest';
import {extractDocument} from '../api/client';
afterEach(()=>vi.unstubAllGlobals());
it('uploads multipart without overriding its boundary and forwards cancellation',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({filename:'story.pdf',text:'Story'})});vi.stubGlobal('fetch',fetch);
 const controller=new AbortController();const file=new File(['pdf'],'story.pdf',{type:'application/pdf'});
 expect(await extractDocument(file,controller.signal)).toEqual({filename:'story.pdf',text:'Story'});
 const [url,options]=fetch.mock.calls[0];
 expect(url).toContain('/api/v1/documents/extract');
 expect(options.method).toBe('POST');expect(options.headers).toBeUndefined();
 expect(options.body.get('file')).toBe(file);
 controller.abort();expect(options.signal.aborted).toBe(true);
});
it('preserves safe extraction error messages from the backend',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:{code:'no_extractable_text',message:'This PDF does not contain selectable text.'}})}));
 await expect(extractDocument(new File(['pdf'],'scanned.pdf'))).rejects.toThrow('This PDF does not contain selectable text.');
});
