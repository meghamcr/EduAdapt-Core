using System;
using System.Collections;
using System.Linq;
using UnityEngine;

namespace EduAdapt.Runtime
{
    [RequireComponent(typeof(RuntimeApiClient))]
    public class RuntimeSessionController : MonoBehaviour
    {
        public RuntimeGameData Current { get; private set; }
        public LevelPlanData CurrentPlan { get; private set; }
        public string Feedback { get; private set; }
        public string DevelopmentNotice { get; set; }
        public string Error { get; private set; }
        public bool Busy { get; private set; }
        public bool HasPendingRequest => pendingJson != null;
        private RuntimeApiClient api;
        private RuntimeLoader loader;
        private RuntimeRenderer renderer;
        private string pendingPath, pendingJson, pendingEventId;
        private bool pendingRuntime;
        private bool pendingPlan;
        private string selectedArtifactVersionId, selectedLevelId;
        private readonly RuntimeMechanicRegistry mechanics = new RuntimeMechanicRegistry();
        private Vector2 scroll;
        private void Awake()
        {
            api = GetComponent<RuntimeApiClient>();
            loader = GetComponent<RuntimeLoader>();
            renderer = GetComponent<RuntimeRenderer>();
        }
        public void Configure(string endpoint, string verifiedBearerToken) => api.Configure(endpoint, verifiedBearerToken);
        public void PrepareLevel(string artifactVersionId, string levelId)
        {
            if (Busy || HasPendingRequest) return;
            if (!RuntimeProtocol.IsId(artifactVersionId) || !RuntimeProtocol.IsId(levelId)) { Error = "INVALID_LEVEL"; return; }
            selectedArtifactVersionId = artifactVersionId; selectedLevelId = levelId;
            Begin("/api/learning/plans", JsonUtility.ToJson(new LevelPlanRequest { curriculumArtifactVersionId = artifactVersionId, levelId = levelId }), false, planning: true);
        }
        public void Open(string gameSpecId, string creationKey)
        {
            if (!RuntimeProtocol.IsId(gameSpecId) || !RuntimeProtocol.IsId(creationKey)) { Error = "INVALID_LAUNCH"; return; }
            Begin("/api/runtime/sessions", JsonUtility.ToJson(new RuntimeOpenRequest { gameSpecId = gameSpecId, creationKey = creationKey }), true);
        }
        public void LaunchPlan(string planId, string gameId, string creationKey)
        {
            if (!RuntimeProtocol.IsId(planId) || !RuntimeProtocol.IsId(gameId) || !RuntimeProtocol.IsId(creationKey)) { Error = "INVALID_LAUNCH"; return; }
            Begin("/api/learning/launch", JsonUtility.ToJson(new RuntimeLaunchRequest { planId = planId, gameId = gameId, creationKey = creationKey }), true);
        }
        public void Restore(string sessionId)
        {
            if (!RuntimeProtocol.IsId(sessionId)) { Error = "INVALID_SESSION"; return; }
            Begin("/api/runtime/sessions/" + sessionId + "/restore", JsonUtility.ToJson(new RuntimeVersionRequest()), true);
        }
        private void Begin(string path, string json, bool runtime, string eventId = null, bool planning = false)
        {
            if (Busy || HasPendingRequest) return;
            pendingPath = path; pendingJson = json; pendingRuntime = runtime; pendingEventId = eventId; pendingPlan = planning;
            StartCoroutine(SendPending());
        }
        // A lost response retains the identical action ID and payload. No automatic
        // retries and no local advancement, scoring, completion or mastery guesses.
        public void RetryPending() { if (!Busy && HasPendingRequest) StartCoroutine(SendPending()); }
        private IEnumerator SendPending()
        {
            Busy = true; Error = null;
            yield return api.Post(pendingPath, pendingJson, json =>
            {
                try
                {
                    if (pendingPlan)
                    {
                        var plan = JsonUtility.FromJson<LevelPlanData>(json);
                        if (plan == null || !RuntimeProtocol.IsId(plan.planId) || !new[] { "READY", "UNSUPPORTED" }.Contains(plan.status) ||
                            plan.level == null || plan.notes == null || plan.games == null || plan.deferred == null ||
                            plan.notes.Any(n => n == null || n.materials == null || n.materials.Any(m => m == null || m.text == null)) ||
                            plan.games.Any(g => g == null || !RuntimeProtocol.IsId(g.id) || !RuntimeProtocol.Mechanics.Contains(g.mechanic))) throw new ArgumentException();
                        CurrentPlan = plan; Current = null; Feedback = null;
                    }
                    else if (pendingRuntime)
                    {
                        var game = JsonUtility.FromJson<RuntimeGameData>(json);
                        if (!RuntimeProtocol.IsValid(game)) throw new ArgumentException();
                        Current = game; mechanics.Reset(); Feedback = null;
                        if (loader != null) loader.LoadRuntimeJson(json, true);
                        else renderer?.ApplyServerRuntime(Current);
                    }
                    else
                    {
                        var receipt = JsonUtility.FromJson<RuntimeReceipt>(json);
                        if (receipt == null || receipt.runtimeVersion != RuntimeProtocol.Version || receipt.sessionId != Current.sessionId ||
                            receipt.eventId != pendingEventId || receipt.progress == null || receipt.progress.sequence < Current.progress.sequence) throw new ArgumentException();
                        var old = Current.progress; Current.progress = receipt.progress;
                        if (!RuntimeProtocol.IsValid(Current)) { Current.progress = old; throw new ArgumentException(); }
                        Feedback = receipt.feedback; renderer?.ApplyServerRuntime(Current);
                    }
                    pendingPath = pendingJson = pendingEventId = null;
                }
                catch { Error = "INVALID_SERVER_RESPONSE"; }
            }, code => Error = code);
            Busy = false;
        }
        private void SendEvent(Func<string, string> build)
        {
            if (Busy || HasPendingRequest || Current == null || new[] { "COMPLETED", "ABANDONED" }.Contains(Current.progress.status)) return;
            var key = Guid.NewGuid().ToString("N");
            Begin("/api/runtime/sessions/" + Current.sessionId + "/events", RuntimeProtocol.Envelope(build(key)), false, key);
        }
        public void Continue()
        {
            if (Current == null) return;
            var p = Current.progress;
            if (p.status == "CREATED") { SendEvent(key => RuntimeProtocol.Signal(key, "GAME_STARTED")); return; }
            if (p.status != "STARTED" || !string.IsNullOrEmpty(p.activeChallengeId)) return;
            var index = Array.FindIndex(Current.phases, phase => phase.id == p.phaseId);
            if (index >= 0)
            {
                var next = Current.challenges.FirstOrDefault(c => c.phaseId == p.phaseId && !p.resolved.Any(r => r.challengeId == c.id));
                if (next != null) { SendEvent(key => RuntimeProtocol.Challenge(key, "CHALLENGE_PRESENTED", next.id)); return; }
            }
            if (index + 1 < Current.phases.Length) SendEvent(key => RuntimeProtocol.Phase(key, Current.phases[index + 1]));
            else SendEvent(key => RuntimeProtocol.Signal(key, "GAME_COMPLETED"));
        }
        public void SubmitText(string answer)
        {
            var c = Active(); if (c?.type == "CLOZE" && answer != null && answer.Length <= 120) SendEvent(key => RuntimeProtocol.Answer(key, c.id, answer));
        }
        public void SubmitConstruction(BlockPlacement[] placements)
        {var c=Active();if(c?.type=="CONSTRUCTION")SendEvent(key=>RuntimeProtocol.Answer(key,c.id,placements));}
        public void SubmitChoice(int index)
        {
            var c = Active(); if (c?.type == "MCQ_CLOZE" && index >= 0 && index < c.choices.Length) SendEvent(key => RuntimeProtocol.Answer(key, c.id, index));
        }
        public void Skip() { var c = Active(); if (c != null) SendEvent(key => RuntimeProtocol.Challenge(key, "CHALLENGE_SKIPPED", c.id)); }
        public void Hint() { var c = Active(); if (c?.hint != null) SendEvent(key => RuntimeProtocol.Challenge(key, "HINT_REQUESTED", c.id)); }
        public void Abandon() => SendEvent(key => RuntimeProtocol.Signal(key, "GAME_ABANDONED"));
        public void RefreshLevel()
        {
            if (Current != null && !new[] { "COMPLETED", "ABANDONED" }.Contains(Current.progress.status)) return;
            PrepareLevel(selectedArtifactVersionId, selectedLevelId);
        }
        public void ReturnToCatalogue()
        {
            if (Busy || (HasPendingRequest && !pendingPlan) ||
                (Current != null && !new[] { "COMPLETED", "ABANDONED" }.Contains(Current.progress.status))) return;
            // A failed planning read may be dismissed. Uncertain gameplay/launch
            // actions retain their event or creation key until acknowledged.
            if (pendingPlan) pendingPath = pendingJson = pendingEventId = null;
            pendingPlan = false; Current = null; CurrentPlan = null; Error = Feedback = null;
        }
        private RuntimeChallenge Active() => Current?.challenges.FirstOrDefault(c => c.id == Current.progress.activeChallengeId);

        private void Update()
        {
            var keyboard=UnityEngine.InputSystem.Keyboard.current;
            if(keyboard==null||Busy)return;
            if(HasPendingRequest){if(keyboard.enterKey.wasPressedThisFrame)RetryPending();return;}
            if(Current==null && CurrentPlan!=null)
            {
                for(int i=0;i<CurrentPlan.games.Length && i<9;i++)if(keyboard[(UnityEngine.InputSystem.Key)((int)UnityEngine.InputSystem.Key.Digit1+i)].wasPressedThisFrame)
                {LaunchPlan(CurrentPlan.planId,CurrentPlan.games[i].id,Guid.NewGuid().ToString("N"));break;}
                return;
            }
            if(Current==null)return;
            if(Current.progress.status=="COMPLETED"||Current.progress.status=="ABANDONED")
            {if(keyboard.enterKey.wasPressedThisFrame)RefreshLevel();return;}
            var active=Active();
            if(active==null && keyboard.enterKey.wasPressedThisFrame)Continue();
            if(active!=null && keyboard.hKey.wasPressedThisFrame)Hint();
            if(active!=null && keyboard.tKey.wasPressedThisFrame)Restore(Current.sessionId);
        }
        // Minimal generic interaction surface. Source text is rendered literally,
        // without rich text. Replace styling independently of the trusted protocol.
        private void OnGUI()
        {
            PixelTheme.Apply();
            if(Current!=null || CurrentPlan!=null)PixelTheme.Fill(new Rect(0,0,Screen.width,Screen.height),PixelTheme.Background);
            var learn=Current?.phases.FirstOrDefault(p=>p.id==Current.progress.phaseId)?.type=="TEACH";
            var construction=Active() ?? (learn ? Current.challenges.FirstOrDefault(c=>c.type=="CONSTRUCTION") : null);
            if(construction?.type=="CONSTRUCTION" && mechanics.TryGet(construction.type,out var visual))
            {
                GUI.Label(new Rect(20,10,Screen.width-40,42),CurrentPlan?.level.title ?? Current.title);
                GUI.Label(new Rect(20,55,Screen.width-40,70),construction.prompt);
                GUI.Label(new Rect(20,125,Screen.width-40,60),construction.instruction);
                ((ConstructionMechanic)visual).DrawInteractive(new Rect(30,195,Screen.width-60,Screen.height-345),construction,Current.progress,SubmitConstruction,!Busy&&!HasPendingRequest,!learn,Current.sessionId + (learn ? "-explore" : "-challenge"));
                GUI.Label(new Rect(20,Screen.height-145,Screen.width-40,50),Feedback ?? (learn ? "Explore freely. Start the challenge when you are ready." : "Arrange all blocks, then ask the server to check."));
                GUI.enabled=!Busy&&!HasPendingRequest;
                if(learn && GUI.Button(new Rect(380,Screen.height-80,240,45),"Start challenge"))Continue();
                if(!learn && construction.hint!=null&&GUI.Button(new Rect(20,Screen.height-80,150,45),"Hint [H]"))Hint();
                if(GUI.Button(new Rect(185,Screen.height-80,180,45),"End session"))Abandon();
                if(!learn && GUI.Button(new Rect(635,Screen.height-80,240,45),"Restore saved [T]"))Restore(Current.sessionId);
                GUI.enabled=!Busy;
                if(HasPendingRequest&&GUI.Button(new Rect(380,Screen.height-80,180,45),"Retry request"))RetryPending();
                GUI.enabled=true;
                if(DevelopmentNotice!=null)GUI.Label(new Rect(20,Screen.height-35,Screen.width-40,30),DevelopmentNotice);
                if(Error!=null)GUI.Label(new Rect(20,Screen.height-35,Screen.width-40,30),Error);
                return;
            }
            if (Current == null && CurrentPlan == null && Error == null) return;
            var style = new GUIStyle(GUI.skin.label) { richText = false, wordWrap = true };
            var button = new GUIStyle(GUI.skin.button) { richText = false, wordWrap = true };
            GUILayout.BeginArea(new Rect(20, 20, Math.Min(Screen.width - 40, 900), Screen.height - 40), GUI.skin.box);
            scroll = GUILayout.BeginScrollView(scroll);
            if (Error != null) GUILayout.Label(Error, style);
            GUI.enabled = !Busy;
            if (HasPendingRequest && GUILayout.Button("Retry the same request", button)) RetryPending();
            if (HasPendingRequest && pendingPlan && GUILayout.Button("Choose another level", button)) ReturnToCatalogue();
            GUI.enabled = !Busy && !HasPendingRequest;
            if (Current == null && CurrentPlan != null)
            {
                GUILayout.Label(CurrentPlan.level.title, style);
                if(DevelopmentNotice!=null)GUILayout.Label(DevelopmentNotice,style);
                foreach (var game in CurrentPlan.games)
                    if (GUILayout.Button((game.mechanic=="CONSTRUCTION" ? (Array.IndexOf(CurrentPlan.games,game)+1)+". Start: build a generated model" : (Array.IndexOf(CurrentPlan.games,game)+1)+". Start source recall practice"), button)) LaunchPlan(CurrentPlan.planId, game.id, Guid.NewGuid().ToString("N"));
                GUILayout.Label("Source notes",style);
                foreach (var section in CurrentPlan.notes)
                    foreach (var m in section.materials)
                    {
                        GUILayout.Label(m.text, style);
                        if (m.visualStatus != "NOT_APPLICABLE") GUILayout.Label("This source material still needs its visual reference.", style);
                    }
                if (CurrentPlan.deferred.Length > 0) GUILayout.Label("Some source tasks need a different interaction or visual review and are not assessed here.", style);
                if (CurrentPlan.status == "UNSUPPORTED") GUILayout.Label("This level has no supported game yet.", style);
                if (GUILayout.Button("Choose another level", button)) ReturnToCatalogue();
            }
            if (Current != null)
            {
                GUILayout.Label(CurrentPlan?.level.title ?? Current.title, style);
                if(DevelopmentNotice!=null)GUILayout.Label(DevelopmentNotice,style);
                GUILayout.Label("Activities resolved: " + Current.progress.resolved.Length + "/" + Current.challenges.Length, style);
                var phase = Current.phases.FirstOrDefault(p => p.id == Current.progress.phaseId);
                if (phase != null) { GUILayout.Label(phase.instruction, style); foreach (var text in phase.teaching) GUILayout.Label(text, style); }
                var c = Active();
                if (c != null)
                {
                    GUILayout.Label(c.instruction, style); GUILayout.Label(c.prompt, style);
                    if (mechanics.TryGet(c.type, out var mechanic)) mechanic.Draw(c, button, SubmitText, SubmitChoice);
                    else GUILayout.Label("Unsupported interaction. This task cannot be executed.", style);
                    if (c.hint != null && GUILayout.Button("Hint", button)) Hint();
                    if (GUILayout.Button("Skip", button)) Skip();
                }
                else if (Current.progress.status == "COMPLETED") { PixelTheme.Celebration(new Rect(0,0,800,300)); GUILayout.Label("ACTIVITY COMPLETE — confirmed by the server. Unresolved source tasks remain; this is not a level mastery claim.", style); }
                else if (Current.progress.status == "ABANDONED") GUILayout.Label("Session ended.", style);
                else if (GUILayout.Button("Continue [Enter]", button)) Continue();
                if (!string.IsNullOrEmpty(Feedback)) GUILayout.Label(Feedback, style);
                if (Current != null && new[] { "COMPLETED", "ABANDONED" }.Contains(Current.progress.status))
                {
                    if (RuntimeProtocol.IsId(selectedLevelId) && GUILayout.Button("Return to level with updated learning state", button)) RefreshLevel();
                    if (GUILayout.Button("Choose another level", button)) ReturnToCatalogue();
                }
                else if (Current?.progress.status == "STARTED" && GUILayout.Button("End this session", button)) Abandon();
            }
            GUI.enabled = true;
            GUILayout.EndScrollView(); GUILayout.EndArea();
        }
    }
}
