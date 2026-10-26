import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import App from '../App';
import {AnalysisResults} from '../components/AnalysisResults';
import {StoryForm} from '../components/StoryForm';
import {markdown,download} from '../export';
import type {Result} from '../types';
import {analyzeStory,getProviders,extractDocument} from '../api/client';
vi.mock('../api/client',()=>({getProviders:vi.fn(),analyzeStory:vi.fn(),extractDocument:vi.fn()}));
const result:Result={provider:'openai',model:'test-model',status:'draft',warnings:[],analysis:{functional_requirements:[{id:'FR-1',title:'Reset',description:'Allow reset',evidence:['reset password'],classification:'explicit'}],non_functional_requirements:[],risks:[],assumptions:[],clarification_questions:[]}};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getProviders).mockResolvedValue([{id:'openai',model:'test-model',enabled:true}]);});
describe('review workflow',()=>{
 it('validates a blank story and loads the example',()=>{
  const submit=vi.fn();render(<StoryForm providers={[{id:'openai',model:'test',enabled:true}]} busy={false} onAnalyze={submit}/>);
  fireEvent.click(screen.getByText('Analyze'));expect(screen.getByRole('alert')).toHaveTextContent('Enter a user story');expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Load example'));expect((screen.getByLabelText('User story') as HTMLTextAreaElement).value).toContain('registered customer');
 });
 it('shows loading, renders sections, and allows edits and reviewer acceptance',async()=>{
  let resolve!:(r:Result)=>void;vi.mocked(analyzeStory).mockReturnValue(new Promise(r=>{resolve=r;}));render(<App/>);
  await waitFor(()=>expect(screen.getByText('Analyze')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('User story'),{target:{value:'reset password'}});fireEvent.click(screen.getByText('Analyze'));
  expect(screen.getByRole('status')).toHaveTextContent('Analyzing');expect(screen.getByText('Analyzing…')).toBeDisabled();
  resolve(structuredClone(result));await screen.findByText('Analysis draft');
  expect(screen.getAllByText(/Capgemini GEP/).length).toBeGreaterThan(0);expect(screen.getByText('explicit')).toBeInTheDocument();expect(screen.getByText('reset password',{selector:'blockquote'})).toBeInTheDocument();expect(screen.getAllByText('No findings in this section.')).toHaveLength(4);
  fireEvent.change(screen.getByLabelText('Title FR-1'),{target:{value:'Revised reset'}});expect(screen.getByLabelText('Title FR-1')).toHaveValue('Revised reset');
  fireEvent.change(screen.getByLabelText('Review FR-1'),{target:{value:'accepted'}});expect(screen.getByLabelText('Review FR-1')).toHaveValue('accepted');
  fireEvent.change(screen.getByLabelText('Review FR-1'),{target:{value:'rejected'}});expect(screen.getByLabelText('Review FR-1')).toHaveValue('rejected');
 });
 it('shows provider errors',async()=>{
  vi.mocked(analyzeStory).mockRejectedValue(new Error('Configure GENERATIVE_ENGINE_API_KEY'));render(<App/>);await waitFor(()=>expect(screen.getByText('Analyze')).toBeEnabled());
  fireEvent.click(screen.getByText('Load example'));fireEvent.click(screen.getByText('Analyze'));expect(await screen.findByRole('alert')).toHaveTextContent('Configure GENERATIVE_ENGINE_API_KEY');
 });
 it('exports review decisions and downloads both formats',()=>{
  const reviewed=structuredClone(result);reviewed.analysis.functional_requirements[0].review='accepted';
  expect(markdown(reviewed)).toContain('Review: accepted');expect(markdown(reviewed)).toContain('No findings.');
  const create=vi.fn(()=> 'blob:test'),revoke=vi.fn();Object.defineProperty(URL,'createObjectURL',{value:create,configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:revoke,configurable:true});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});download(reviewed,'json');download(reviewed,'md');expect(create).toHaveBeenCalledTimes(2);expect(click).toHaveBeenCalledTimes(2);click.mockRestore();
 });
});
const assessment={complexity_score:2 as const,complexity_label:'Low' as const,complexity_reasons:['A small workflow'],readiness_score:3 as const,readiness_label:'Needs clarification' as const,readiness_gaps:['Clarify expired links']};
it('shows assessment and submits session feedback with exports',async()=>{
 vi.mocked(analyzeStory).mockResolvedValue({...structuredClone(result),story_assessment:assessment});
 render(<App/>);await waitFor(()=>expect(screen.getByText('Analyze')).toBeEnabled());
 fireEvent.click(screen.getByText('Load example'));fireEvent.click(screen.getByText('Analyze'));
 await screen.findByText('Story Assessment');
 expect(screen.getByText(/Complexity: 2/)).toHaveTextContent('Low');
 expect(screen.getByText(/Readiness: 3/)).toHaveTextContent('Needs clarification');
 expect(screen.getByText('Clarify expired links')).toBeInTheDocument();
 expect(screen.getByText('Submit feedback')).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Was this analysis useful?'),{target:{value:'4'}});
 fireEvent.change(screen.getByLabelText('Optional comment'),{target:{value:'Useful draft'}});
 fireEvent.click(screen.getByText('Submit feedback'));
 expect(screen.getByRole('status')).toHaveTextContent('Feedback submitted: 4/5');
 fireEvent.change(screen.getByLabelText('Title FR-1'),{target:{value:'Edited'}});
 expect(screen.getByRole('status')).toHaveTextContent('Useful draft');
 const reviewed={...result,story_assessment:assessment,feedback:{rating:4,comment:'Useful draft'}};
 expect(markdown(reviewed)).toContain('Complexity: 2/5');
 expect(markdown(reviewed)).toContain('Clarify expired links');
 expect(markdown(reviewed)).toContain('Usefulness: 4/5');
 expect(JSON.parse(JSON.stringify(reviewed)).feedback.comment).toBe('Useful draft');
});
it('handles older responses with no assessment',()=>{
 render(<AnalysisResults result={result} onChange={vi.fn()}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('Story Assessment is unavailable');
 expect(markdown(result)).toContain('Story Assessment unavailable');
});
it('shows no gaps when the model identifies none',()=>{
 render(<AnalysisResults result={{...result,story_assessment:{...assessment,readiness_gaps:[]}}} onChange={vi.fn()}/>);
 expect(screen.getByText('No gaps identified by the AI. Please review.')).toBeInTheDocument();
});

it('shows a clear temporary GEP failure and allows another analysis',async()=>{
 vi.mocked(analyzeStory).mockRejectedValue(new Error('GEP is temporarily unavailable; please retry'));
 render(<App/>);await waitFor(()=>expect(screen.getByText('Analyze')).toBeEnabled());
 fireEvent.click(screen.getByText('Load example'));fireEvent.click(screen.getByText('Analyze'));
 expect(await screen.findByRole('alert')).toHaveTextContent('GEP is temporarily unavailable; please retry');
 expect(screen.getByText('Analyze')).toBeEnabled();
 expect((screen.getByLabelText('User story') as HTMLTextAreaElement).value).toContain('registered customer');
});

const fileInput=()=>screen.getByLabelText('Choose PDF or Word document');
const selectFile=(name='story.pdf',type='application/pdf')=>fireEvent.change(fileInput(),{target:{files:[new File(['document'],name,{type})]}});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function readyUpload(){render(<App/>);await waitFor(()=>expect(fileInput()).toBeEnabled());}

it('extracts without analysis until the document button is clicked, and reruns edits',async()=>{
 const reading=deferred<{filename:string;text:string}>();
 const analysis=deferred<Result>();
 vi.mocked(extractDocument).mockReturnValue(reading.promise);
 vi.mocked(analyzeStory).mockReturnValueOnce(analysis.promise).mockResolvedValue(structuredClone(result));
 await readyUpload();selectFile();
 expect(screen.getByRole('status')).toHaveTextContent('Reading document');
 expect(extractDocument).toHaveBeenCalledTimes(1);
 expect(analyzeStory).not.toHaveBeenCalled();
 reading.resolve({filename:'story.pdf',text:'Original extracted story'});
 await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 expect(analyzeStory).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Analyze document'));
 await waitFor(()=>expect(analyzeStory).toHaveBeenCalledWith({user_story:'Original extracted story',acceptance_criteria:'',context:'',provider:'openai'},expect.any(AbortSignal)));
 expect(screen.getByRole('status')).toHaveTextContent('Analyzing user story');
 expect(screen.getByText('Analyze document')).toBeDisabled();
 analysis.resolve(structuredClone(result));await screen.findByText('Analysis draft');
 expect(screen.getByText('story.pdf')).toBeInTheDocument();
 fireEvent.click(screen.getByText('Preview and edit extracted text'));
 expect(screen.getByLabelText('Extracted text')).toHaveValue('Original extracted story');
 fireEvent.change(screen.getByLabelText('Extracted text'),{target:{value:'Corrected story'}});
 fireEvent.click(screen.getByText('Analyze document'));
 await waitFor(()=>expect(analyzeStory).toHaveBeenCalledTimes(2));
 expect(vi.mocked(analyzeStory).mock.calls[1][0].user_story).toBe('Corrected story');
 expect(extractDocument).toHaveBeenCalledTimes(1);
});

it('retries extraction without automatically analyzing',async()=>{
 vi.mocked(extractDocument).mockRejectedValueOnce(new Error('This PDF does not contain selectable text.')).mockResolvedValue({filename:'story.pdf',text:'Recovered story'});
 vi.mocked(analyzeStory).mockResolvedValue(structuredClone(result));
 await readyUpload();selectFile();
 expect(await screen.findByRole('alert')).toHaveTextContent('does not contain selectable text');
 fireEvent.click(screen.getByText('Retry'));
 await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 expect(analyzeStory).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Analyze document'));
 await screen.findByText('Analysis draft');
 expect(extractDocument).toHaveBeenCalledTimes(2);
 expect(analyzeStory).toHaveBeenCalledTimes(1);
});

it('retries analysis without re-uploading the document',async()=>{
 vi.mocked(extractDocument).mockResolvedValue({filename:'story.docx',text:'Word story'});
 vi.mocked(analyzeStory).mockRejectedValueOnce(new Error('GEP is temporarily unavailable; please retry')).mockResolvedValue(structuredClone(result));
 await readyUpload();selectFile('story.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 fireEvent.click(screen.getByText('Analyze document'));
 expect(await screen.findByRole('alert')).toHaveTextContent('GEP is temporarily unavailable');
 expect(screen.getByLabelText('Extracted text')).toHaveValue('Word story');
 fireEvent.click(screen.getByText('Retry'));await screen.findByText('Analysis draft');
 expect(extractDocument).toHaveBeenCalledTimes(1);
 expect(analyzeStory).toHaveBeenCalledTimes(2);
});

it.each(['legacy.doc','image.png'])('rejects unsupported file %s before upload',async(name)=>{
 await readyUpload();selectFile(name);
 expect(await screen.findByRole('alert')).toBeInTheDocument();
 expect(extractDocument).not.toHaveBeenCalled();expect(analyzeStory).not.toHaveBeenCalled();
});

it('rejects oversized files before upload',async()=>{
 await readyUpload();const file=new File(['x'],'large.pdf',{type:'application/pdf'});Object.defineProperty(file,'size',{value:10*1024*1024+1});
 fireEvent.change(fileInput(),{target:{files:[file]}});
 expect(await screen.findByRole('alert')).toHaveTextContent('10 MB');
 expect(extractDocument).not.toHaveBeenCalled();
});

it('ignores an older extraction after selecting another file',async()=>{
 const first=deferred<{filename:string;text:string}>();
 vi.mocked(extractDocument).mockReturnValueOnce(first.promise).mockResolvedValueOnce({filename:'new.docx',text:'New story'});
 vi.mocked(analyzeStory).mockResolvedValue(structuredClone(result));
 await readyUpload();selectFile('old.pdf');
 const oldSignal=vi.mocked(extractDocument).mock.calls[0][1];
 expect(fileInput()).toBeEnabled();selectFile('new.docx');
 await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 expect(oldSignal?.aborted).toBe(true);
 await act(async()=>first.resolve({filename:'old.pdf',text:'Old story'}));
 expect(screen.getByText('new.docx')).toBeInTheDocument();
 expect(screen.getByLabelText('Extracted text')).toHaveValue('New story');
 expect(analyzeStory).not.toHaveBeenCalled();
});

it.each(['success','failure'])('ignores older analysis %s after a newer result',async(outcome)=>{
 const old=deferred<Result>();
 vi.mocked(extractDocument).mockResolvedValueOnce({filename:'old.pdf',text:'Old story'}).mockResolvedValueOnce({filename:'new.pdf',text:'New story'});
 vi.mocked(analyzeStory).mockReturnValueOnce(old.promise).mockResolvedValueOnce({...structuredClone(result),model:'new-model'});
 await readyUpload();selectFile('old.pdf');
 await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 fireEvent.click(screen.getByText('Analyze document'));
 await waitFor(()=>expect(analyzeStory).toHaveBeenCalledTimes(1));
 selectFile('new.pdf');
 await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 fireEvent.click(screen.getByText('Analyze document'));
 await screen.findByText(/new-model/);
 await act(async()=>{if(outcome==='success')old.resolve({...structuredClone(result),model:'old-model'});else old.reject(new Error('Old error'));});
 expect(screen.getByText(/new-model/)).toBeInTheDocument();
 expect(screen.queryByText(/old-model/)).not.toBeInTheDocument();
 expect(screen.queryByText('Old error')).not.toBeInTheDocument();
});

it('does not submit the same file twice while reading',async()=>{
 const pending=deferred<{filename:string;text:string}>();
 vi.mocked(extractDocument).mockReturnValue(pending.promise);
 vi.mocked(analyzeStory).mockResolvedValue(structuredClone(result));
 await readyUpload();const file=new File(['doc'],'same.pdf',{type:'application/pdf'});
 fireEvent.change(fileInput(),{target:{files:[file]}});
 fireEvent.change(fileInput(),{target:{files:[file]}});
 expect(extractDocument).toHaveBeenCalledTimes(1);
 pending.resolve({filename:'same.pdf',text:'Story'});await waitFor(()=>expect(screen.getByText('Analyze document')).toBeEnabled());
 expect(analyzeStory).not.toHaveBeenCalled();
});
