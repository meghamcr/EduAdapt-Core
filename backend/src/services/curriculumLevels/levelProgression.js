'use strict';
const {freeze}=require('../adaptiveLearning/learnerStateProvider');
// Interface only. The existing adaptive policy remains the sole WHAT/HOW policy.
// Multi-node mastery aggregation and approved scope mapping are not invented here.
const LEVEL_PROGRESSION=freeze({version:'level-progression-v1',initialState:'LEARN',states:['LEARN','PRACTISE','CHECK_UNDERSTANDING','ADVANCE','REINFORCE','REMEDIATE','RETRY'],
  transitions:[{from:'LEARN',to:'PRACTISE',requires:'PRESENTATION_COMPLETE_NOT_MASTERY'},
    {from:'PRACTISE',to:'CHECK_UNDERSTANDING',requires:'TRUSTED_EVIDENCE_REVIEW'},
    {from:'CHECK_UNDERSTANDING',to:'ADVANCE',requires:'FUTURE_APPROVED_LEVEL_MASTERY_POLICY'},
    {from:'CHECK_UNDERSTANDING',to:'REINFORCE',requires:'TRUSTED_ADAPTIVE_DECISION'},
    {from:'CHECK_UNDERSTANDING',to:'REMEDIATE',requires:'TRUSTED_ADAPTIVE_DECISION'},
    {from:'REINFORCE',to:'RETRY',requires:'SUPPORT_COMPLETE_NOT_MASTERY'},
    {from:'REMEDIATE',to:'RETRY',requires:'SUPPORT_COMPLETE_NOT_MASTERY'},
    {from:'RETRY',to:'PRACTISE',requires:'REUSE_APPROVED_SCOPE'}],
  adaptiveIntegration:{module:'adaptiveLearning/adaptiveDecision',entryPoint:'decideAdaptiveLearning',scope:'APPROVED_IMPORTED_NODE_ONLY',requiresIssuedContext:true,requiresTrustedLearnerState:true,requiresExplicitPrerequisiteEvidence:true,levelAggregation:'NOT_IMPLEMENTED'},
  gameCompletionImpliesMastery:false,automaticAdvancement:false,learnerEvidence:null});
module.exports={LEVEL_PROGRESSION};
