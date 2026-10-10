using UnityEngine;

namespace EduAdapt.Runtime
{
    public class RuntimeRenderer : MonoBehaviour
    {
        [Header("Runtime")]
        [SerializeField] private RuntimeLoader runtimeLoader;
        [SerializeField] private GameRuntimeManager gameRuntimeManager;
        [SerializeField] private RuntimeUIManager runtimeUIManager;

        public RuntimeGameData CurrentGame { get; private set; }
        public RuntimePhase CurrentPhase { get; private set; }
        public RuntimeChallenge CurrentChallenge { get; private set; }

        public int CurrentPhaseIndex { get; private set; } = -1;
        public int CurrentChallengeIndex { get; private set; } = -1;
        public bool ServerControlled { get; private set; }

        private void Awake()
        {
            if (runtimeLoader == null)
                runtimeLoader = FindFirstObjectByType<RuntimeLoader>();

            if (gameRuntimeManager == null)
                gameRuntimeManager = FindFirstObjectByType<GameRuntimeManager>();

            if (runtimeUIManager == null)
                runtimeUIManager = FindFirstObjectByType<RuntimeUIManager>();
        }

        public bool BeginLoadedGame()
        {
            ServerControlled = false;
            if (runtimeLoader == null || runtimeLoader.CurrentGame == null)
            {
                Fail("No runtime game has been loaded.");
                return false;
            }

            CurrentGame = runtimeLoader.CurrentGame;

            if (CurrentGame.phases == null || CurrentGame.phases.Length == 0)
            {
                Fail("Runtime game contains no phases.");
                return false;
            }

            gameRuntimeManager?.SetState(
                GameRuntimeManager.RuntimeState.LoadingGame
            );

            CurrentPhaseIndex = -1;
            CurrentChallengeIndex = -1;
            CurrentPhase = null;
            CurrentChallenge = null;

            Debug.Log(
                $"[EduAdapt Renderer] Preparing game: {CurrentGame.title}"
            );

            Debug.Log(
                $"[EduAdapt Renderer] Difficulty: {CurrentGame.difficulty}"
            );

            Debug.Log(
                $"[EduAdapt Renderer] Adaptive Mode: {CurrentGame.adaptiveMode}"
            );

            return MoveToNextPhase();
        }

        #if UNITY_EDITOR
        [ContextMenu("Test: Move To Next Phase")]
        private void TestMoveToNextPhase()
        {
            if (CurrentGame == null)
            {
                Debug.LogWarning(
                    "[EduAdapt Renderer] Load a runtime game before advancing phases."
                );
                return;
            }

            MoveToNextPhase();
        }
        #endif

        public bool MoveToNextPhase()
        {
            // Network play advances only after server acknowledgement. This
            // method remains a local presentation preview, never academic state.
            if (ServerControlled) return false;
            if (CurrentGame == null)
            {
                Fail("Cannot advance because no game is active.");
                return false;
            }

            int nextIndex = CurrentPhaseIndex + 1;

            if (nextIndex >= CurrentGame.phases.Length)
            {
                CompleteGamePresentation();
                return false;
            }

            CurrentPhaseIndex = nextIndex;
            CurrentPhase = CurrentGame.phases[CurrentPhaseIndex];

            CurrentChallenge = null;
            CurrentChallengeIndex = -1;

            if (CurrentPhase == null)
            {
                Fail($"Phase {CurrentPhaseIndex} is invalid.");
                return false;
            }

            Debug.Log(
                $"[EduAdapt Renderer] Phase " +
                $"{CurrentPhaseIndex + 1}/{CurrentGame.phases.Length}: " +
                $"{CurrentPhase.type} ({CurrentPhase.id})"
            );

            Debug.Log(
                $"[EduAdapt Renderer] Instruction: " +
                $"{CurrentPhase.instruction}"
            );

            RenderCurrentPhase();

            return true;
        }

        private void RenderCurrentPhase()
        {
            switch (CurrentPhase.type)
            {
                case "INTRO":
                case "TEACH":
                case "DEMONSTRATE":
                    runtimeUIManager?.ShowInstructions();
                    break;

                case "GUIDED_PRACTICE":
                case "PRACTICE":
                case "CHALLENGE":
                case "CORE_GAMEPLAY":
                case "ADAPTIVE_CHALLENGE":
                case "MASTERY_CHECK":
                    runtimeUIManager?.ShowGameplay();
                    if (!ServerControlled) SelectFirstChallengeForCurrentPhase();
                    break;

                case "REMEDIATION":
                    runtimeUIManager?.ShowRemediation();
                    if (!ServerControlled) SelectFirstChallengeForCurrentPhase();
                    break;

                case "COMPLETE":
                    gameRuntimeManager?.SetState(
                        GameRuntimeManager.RuntimeState.Completing
                    );

                    runtimeUIManager?.ShowCompletion();
                    break;

                default:
                    Fail(
                        $"Unsupported runtime phase type: " +
                        $"{CurrentPhase.type}"
                    );
                    return;
            }

            if (CurrentPhase.type != "COMPLETE")
            {
                gameRuntimeManager?.SetState(
                    GameRuntimeManager.RuntimeState.Playing
                );
            }

            LogTeachingContent();
        }

        public bool ApplyServerRuntime(RuntimeGameData game)
        {
            if (!RuntimeProtocol.IsValid(game)) { Fail("Invalid server runtime contract."); return false; }
            ServerControlled = true;
            CurrentGame = game;
            CurrentPhaseIndex = System.Array.FindIndex(game.phases, p => p.id == game.progress.phaseId);
            CurrentPhase = CurrentPhaseIndex < 0 ? null : game.phases[CurrentPhaseIndex];
            CurrentChallengeIndex = System.Array.FindIndex(game.challenges, c => c.id == game.progress.activeChallengeId);
            CurrentChallenge = CurrentChallengeIndex < 0 ? null : game.challenges[CurrentChallengeIndex];
            if (game.progress.status == "COMPLETED") CompleteGamePresentation();
            else if (game.progress.status == "ABANDONED") gameRuntimeManager?.SetState(GameRuntimeManager.RuntimeState.WaitingForGame);
            else if (CurrentPhase != null) RenderCurrentPhase();
            else runtimeUIManager?.ShowInstructions();
            return true;
        }

        private void SelectFirstChallengeForCurrentPhase()
        {
            if (CurrentGame.challenges == null ||
                CurrentGame.challenges.Length == 0)
            {
                Debug.Log(
                    "[EduAdapt Renderer] No challenges available."
                );

                return;
            }

            for (int i = 0; i < CurrentGame.challenges.Length; i++)
            {
                RuntimeChallenge challenge =
                    CurrentGame.challenges[i];

                if (challenge == null)
                    continue;

                if (challenge.phaseId == CurrentPhase.id)
                {
                    CurrentChallengeIndex = i;
                    CurrentChallenge = challenge;

                    LogChallenge(CurrentChallenge);

                    return;
                }
            }

            Debug.Log(
                $"[EduAdapt Renderer] No challenge assigned to phase " +
                $"{CurrentPhase.id}."
            );
        }

        private void LogTeachingContent()
        {
            if (CurrentPhase.teaching == null ||
                CurrentPhase.teaching.Length == 0)
            {
                return;
            }

            for (int i = 0; i < CurrentPhase.teaching.Length; i++)
            {
                Debug.Log(
                    $"[EduAdapt Teaching {i + 1}] " +
                    CurrentPhase.teaching[i]
                );
            }
        }

        private void LogChallenge(RuntimeChallenge challenge)
        {
            Debug.Log(
                $"[EduAdapt Challenge] {challenge.id}"
            );

            Debug.Log(
                $"[EduAdapt Challenge] Type: {challenge.type}"
            );

            Debug.Log(
                $"[EduAdapt Challenge] Prompt: {challenge.prompt}"
            );

            if (challenge.choices != null)
            {
                for (int i = 0; i < challenge.choices.Length; i++)
                {
                    Debug.Log(
                        $"[EduAdapt Choice {i}] " +
                        challenge.choices[i]
                    );
                }
            }
        }

        private void CompleteGamePresentation()
        {
            CurrentPhase = null;
            CurrentChallenge = null;

            gameRuntimeManager?.SetState(
                GameRuntimeManager.RuntimeState.Completed
            );

            runtimeUIManager?.ShowCompletion();

            Debug.Log(
                "[EduAdapt Renderer] Runtime presentation completed."
            );
        }

        private void Fail(string message)
        {
            Debug.LogError(
                $"[EduAdapt Renderer] {message}"
            );

            gameRuntimeManager?.ReportRuntimeError(message);
            runtimeUIManager?.ShowError();
        }
    }
}
