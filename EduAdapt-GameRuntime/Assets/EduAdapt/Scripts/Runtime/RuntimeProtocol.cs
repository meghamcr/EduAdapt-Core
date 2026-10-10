using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEngine;

namespace EduAdapt.Runtime
{
    // No correctness rules or curriculum facts live in the client protocol.
    public static class RuntimeProtocol
    {
        public const string Version = "eduadapt-runtime-v1";
        public static readonly string[] Mechanics = { "CLOZE", "MCQ_CLOZE", "CONSTRUCTION" };
        public static readonly string[] Phases = { "INTRO", "TEACH", "DEMONSTRATE", "GUIDED_PRACTICE", "CORE_GAMEPLAY", "ADAPTIVE_CHALLENGE", "MASTERY_CHECK", "REMEDIATION", "COMPLETE" };
        public static bool IsId(string value) => value != null && Regex.IsMatch(value, "^[A-Za-z0-9_-]{1,160}$");
        public static bool IsValid(RuntimeGameData game)
        {
            if (game == null || game.runtimeVersion != Version || !IsId(game.gameId) || !IsId(game.sessionId) ||
                game.phases == null || game.phases.Length < 2 || game.phases.Length > 9 || game.challenges == null || game.challenges.Length > 32 ||
                game.progress == null || !new[] { "CREATED", "STARTED", "COMPLETED", "ABANDONED" }.Contains(game.progress.status) || game.progress.sequence < 0 || game.progress.resolved == null) return false;
            var phaseIds = new HashSet<string>(); var challengeIds = new HashSet<string>();
            foreach (var p in game.phases)
                if (p == null || !IsId(p.id) || !phaseIds.Add(p.id) || !Phases.Contains(p.type) || p.teaching == null) return false;
            foreach (var c in game.challenges)
                if (c == null || !IsId(c.id) || !challengeIds.Add(c.id) || !Mechanics.Contains(c.type) || !phaseIds.Contains(c.phaseId) ||
                    (c.type == "CONSTRUCTION" && !ValidConstruction(c.construction)) || c.prompt == null || c.choices == null || (c.type == "MCQ_CLOZE" ? c.choices.Length < 2 || c.choices.Length > 6 : c.choices.Length != 0)) return false;
            if (!string.IsNullOrEmpty(game.progress.phaseId) && !phaseIds.Contains(game.progress.phaseId)) return false;
            if (!string.IsNullOrEmpty(game.progress.activeChallengeId) && !game.challenges.Any(c => c.id == game.progress.activeChallengeId && c.phaseId == game.progress.phaseId)) return false;
            var resolved = new HashSet<string>();
            return game.progress.resolved.All(r => r != null && challengeIds.Contains(r.challengeId) && resolved.Add(r.challengeId));
        }
        public static bool ValidConstruction(ConstructionSpec s) => s != null && s.version=="block-model-v1" && s.origin=="GENERATED" && !s.originalExerciseResolved && s.assessment=="MATCH_GENERATED_REFERENCE" && s.columns>=4 && s.columns<=12 && s.rows>=4 && s.rows<=12 && s.pieces!=null && s.pieces.Length>=2 && s.pieces.Length<=8 && s.target!=null && s.target.Length==s.pieces.Length && s.pieces.All(p=>p!=null && IsId(p.id) && p.width>=1 && p.width<=6 && p.height>=1 && p.height<=6 && p.depth>=1 && p.depth<=4) && s.pieces.Select(p=>p.id).Distinct().Count()==s.pieces.Length && s.target.All(p=>p!=null && s.pieces.Any(b=>b.id==p.id) && p.x>=0 && p.x<s.columns && p.y>=0 && p.y<s.rows && (p.rotation==0 || p.rotation==1)) && s.target.Select(p=>p.id).Distinct().Count()==s.target.Length;
        public static string Answer(string eventId,string challengeId,BlockPlacement[] response)
        {
            if(!IsId(eventId)||!IsId(challengeId)||response==null||response.Length<2||response.Length>8)throw new ArgumentException("INVALID_ANSWER");
            return JsonUtility.ToJson(new ConstructionAnswer{eventId=eventId,type="ANSWER_SUBMITTED",challengeId=challengeId,response=response});
        }
        [Serializable] private class ConstructionAnswer { public string eventId,type,challengeId; public BlockPlacement[] response; }
        public static string Envelope(string eventJson) => "{\"runtimeVersion\":\"" + Version + "\",\"event\":" + eventJson + "}";
        public static string Signal(string eventId, string type)
        {
            if (!IsId(eventId) || !new[] { "GAME_STARTED", "GAME_COMPLETED", "GAME_ABANDONED" }.Contains(type)) throw new ArgumentException("INVALID_EVENT");
            return JsonUtility.ToJson(new SignalEvent { eventId = eventId, type = type });
        }
        public static string Phase(string eventId, RuntimePhase phase)
        {
            if (!IsId(eventId) || phase == null || !IsId(phase.id)) throw new ArgumentException("INVALID_EVENT");
            return JsonUtility.ToJson(new PhaseEvent { eventId = eventId, type = phase.type == "REMEDIATION" ? "REMEDIATION_STARTED" : "PHASE_STARTED", phaseId = phase.id });
        }
        public static string Challenge(string eventId, string type, string challengeId)
        {
            if (!IsId(eventId) || !IsId(challengeId) || !new[] { "CHALLENGE_PRESENTED", "HINT_REQUESTED", "CHALLENGE_SKIPPED" }.Contains(type)) throw new ArgumentException("INVALID_EVENT");
            return JsonUtility.ToJson(new ChallengeEvent { eventId = eventId, type = type, challengeId = challengeId });
        }
        public static string Answer(string eventId, string challengeId, string response)
        {
            if (!IsId(eventId) || !IsId(challengeId) || response == null || response.Length > 120) throw new ArgumentException("INVALID_ANSWER");
            return JsonUtility.ToJson(new TextAnswer { eventId = eventId, type = "ANSWER_SUBMITTED", challengeId = challengeId, response = response });
        }
        public static string Answer(string eventId, string challengeId, int response)
        {
            if (!IsId(eventId) || !IsId(challengeId) || response < 0 || response > 5) throw new ArgumentException("INVALID_ANSWER");
            return JsonUtility.ToJson(new ChoiceAnswer { eventId = eventId, type = "ANSWER_SUBMITTED", challengeId = challengeId, response = response });
        }
        [Serializable] private class SignalEvent { public string eventId, type; }
        [Serializable] private class PhaseEvent { public string eventId, type, phaseId; }
        [Serializable] private class ChallengeEvent { public string eventId, type, challengeId; }
        [Serializable] private class TextAnswer { public string eventId, type, challengeId, response; }
        [Serializable] private class ChoiceAnswer { public string eventId, type, challengeId; public int response; }
    }
    [Serializable] public class RuntimeReceipt { public string runtimeVersion, sessionId, eventId, feedback; public RuntimeProgress progress; }
    [Serializable] public class RuntimeVersionRequest { public string runtimeVersion = RuntimeProtocol.Version; }
    [Serializable] public class RuntimeOpenRequest : RuntimeVersionRequest { public string gameSpecId, creationKey; }
    [Serializable] public class RuntimeLaunchRequest : RuntimeVersionRequest { public string planId, gameId, creationKey; }
    [Serializable] public class LevelPlanRequest { public string curriculumArtifactVersionId, levelId, language = "en"; }
    [Serializable] public class LevelPlanData { public string planId, status; public LevelTitle level; public LevelNotes[] notes; public PlannedPractice[] games; public DeferredMaterial[] deferred; }
    [Serializable] public class LevelTitle { public string levelId, title; }
    [Serializable] public class LevelNotes { public string kind; public NoteMaterial[] materials; }
    [Serializable] public class NoteMaterial { public string materialRef, text, visualStatus; }
    [Serializable] public class PlannedPractice { public string id, mechanic, purpose; }
    [Serializable] public class DeferredMaterial { public string materialRef, reason, requiredCapability; }
}
