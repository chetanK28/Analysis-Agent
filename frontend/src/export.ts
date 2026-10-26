import {labels, sections, type Result} from './types';
export function markdown(result:Result):string {
 return ['# Requirement analysis — draft for human review', `Provider: ${result.provider === 'openai' ? 'Capgemini GEP' : result.provider} | Model: ${result.model}`, 'Review decisions are local reviewer annotations, not automatic approval.', ...result.warnings.map(w=>`Warning: ${w}`), ...sections.flatMap(section=>[`\n## ${labels[section]}`, ...(result.analysis[section].length ? result.analysis[section].map(f=>`\n### ${f.id}: ${f.title}\n${f.description}\n\nClassification: ${f.classification} | Review: ${f.review || 'pending'}\n\nEvidence:\n${f.evidence.map(e=>`> ${e.replace(/\n/g,'\n> ')}`).join('\n') || 'None supplied'}`) : ['No findings.'])]), ...assessmentMarkdown(result)].join('\n\n');
}
export function download(result:Result, format:'json'|'md') {
 const blob = new Blob([format==='json'?JSON.stringify(result,null,2):markdown(result)], {type:format==='json'?'application/json':'text/markdown;charset=utf-8'});
 const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=`requirement-analysis.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function assessmentMarkdown(result:Result):string[] {
 const a=result.story_assessment;
 return ['## Story Assessment', 'Scores are AI estimates based on the original story, acceptance criteria, and context; human review is required and accuracy is not guaranteed.',
 ...(a ? [`Complexity: ${a.complexity_score}/5 - ${a.complexity_label}`, ...a.complexity_reasons.map(r=>`- ${r}`), `Readiness: ${a.readiness_score}/5 - ${a.readiness_label}`, 'Missing or ambiguous details:', ...(a.readiness_gaps.length?a.readiness_gaps.map(g=>`- ${g}`):['No gaps identified by the AI. Please review.'])] : ['Story Assessment unavailable. Run the analysis again.']),
 '## Reviewer feedback', ...(result.feedback ? [`Usefulness: ${result.feedback.rating}/5`, `Comment: ${result.feedback.comment || 'None supplied'}`] : ['No feedback submitted.'])];
}
