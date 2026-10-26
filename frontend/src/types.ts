import assessmentLabels from '../../backend/app/assessment_labels.json';
export {assessmentLabels};
export type AssessmentScore = 1|2|3|4|5;
export const sections = ['functional_requirements', 'non_functional_requirements', 'risks', 'assumptions', 'clarification_questions'] as const;
export type Section = typeof sections[number];
export const labels: Record<Section, string> = {functional_requirements:'Functional requirements', non_functional_requirements:'Non-functional requirements', risks:'Risks', assumptions:'Assumptions', clarification_questions:'Clarification questions'};
export type Finding = {id:string; title:string; description:string; evidence:string[]; classification:'explicit'|'inferred'; review?:'pending'|'accepted'|'rejected'};
export type Result = {provider:string; model:string; status:'draft'; warnings:string[]; analysis:Record<Section,Finding[]>; story_assessment?:StoryAssessment|null; feedback?:ReviewerFeedback};
export type Provider = {id:string; model:string; enabled:boolean};
export type Story = {user_story:string; acceptance_criteria:string; context:string; provider:string};
export type StoryAssessment = {
 complexity_score:AssessmentScore; complexity_label:typeof assessmentLabels.complexity[keyof typeof assessmentLabels.complexity]; complexity_reasons:string[];
 readiness_score:AssessmentScore; readiness_label:typeof assessmentLabels.readiness[keyof typeof assessmentLabels.readiness]; readiness_gaps:string[];
};
export type ReviewerFeedback = {rating:number; comment:string};

export type DocumentText = {filename:string; text:string};
