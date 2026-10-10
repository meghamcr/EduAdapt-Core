using System;
using UnityEngine;

namespace EduAdapt.Runtime
{
    public class RuntimeLoader : MonoBehaviour
    {
        [Header("Runtime")]
        [SerializeField] private GameRuntimeManager gameRuntimeManager;
        [SerializeField] private RuntimeRenderer runtimeRenderer;

        [Header("Local Test")]
        [SerializeField] private TextAsset testRuntimeJson;

        public RuntimeGameData CurrentGame { get; private set; }

        private void Awake()
        {
            if (gameRuntimeManager == null)
            {
                gameRuntimeManager =
                    FindFirstObjectByType<GameRuntimeManager>();
            }
            if (runtimeRenderer == null)
            {
                runtimeRenderer =
                    FindFirstObjectByType<RuntimeRenderer>();
            }
        }

        public bool LoadRuntimeJson(string json, bool serverControlled = false)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                Fail("Runtime JSON is empty.");
                return false;
            }

            try
            {
                RuntimeGameData gameData =
                    JsonUtility.FromJson<RuntimeGameData>(json);

                if (gameData == null)
                {
                    Fail("Runtime JSON could not be parsed.");
                    return false;
                }

                if (gameData.runtimeVersion != "eduadapt-runtime-v1")
                {
                    Fail(
                        $"Unsupported runtime version: {gameData.runtimeVersion}"
                    );
                    return false;
                }

                if (string.IsNullOrWhiteSpace(gameData.gameId))
                {
                    Fail("Runtime payload does not contain a gameId.");
                    return false;
                }

                if (string.IsNullOrWhiteSpace(gameData.sessionId))
                {
                    Fail("Runtime payload does not contain a sessionId.");
                    return false;
                }

                CurrentGame = gameData;

                Debug.Log("[EduAdapt] Runtime loaded successfully.");
                Debug.Log($"[EduAdapt] Runtime Version: {CurrentGame.runtimeVersion}");
                Debug.Log($"[EduAdapt] Game ID: {CurrentGame.gameId}");
                Debug.Log($"[EduAdapt] Session ID: {CurrentGame.sessionId}");
                Debug.Log($"[EduAdapt] Title: {CurrentGame.title}");
                Debug.Log($"[EduAdapt] Difficulty: {CurrentGame.difficulty}");
                Debug.Log($"[EduAdapt] Adaptive Mode: {CurrentGame.adaptiveMode}");
                Debug.Log($"[EduAdapt] Theme: {CurrentGame.visuals?.theme}");
                Debug.Log($"[EduAdapt] Phases: {CurrentGame.phases?.Length ?? 0}");
                Debug.Log($"[EduAdapt] Challenges: {CurrentGame.challenges?.Length ?? 0}");

                if (CurrentGame.instructionalPolicy != null)
                {
                    Debug.Log(
                        $"[EduAdapt] Scaffolding: " +
                        $"{CurrentGame.instructionalPolicy.scaffoldingLevel}"
                    );

                    Debug.Log(
                        $"[EduAdapt] Guidance: " +
                        $"{CurrentGame.instructionalPolicy.guidanceLevel}"
                    );
                }
                if (runtimeRenderer == null)
                {
                    Fail("Runtime Renderer is unavailable.");
                    return false;
                }

                if (!(serverControlled ? runtimeRenderer.ApplyServerRuntime(CurrentGame) : runtimeRenderer.BeginLoadedGame()))
                {
                    return false;
                }

                return true;
            }
            catch (Exception exception)
            {
                Fail(
                    $"Failed to load runtime payload: {exception.Message}"
                );

                return false;
            }
        }

        [ContextMenu("Test Runtime JSON")]
        public void TestRuntimeJson()
        {
            if (testRuntimeJson == null)
            {
                Fail("No test runtime JSON has been assigned.");
                return;
            }

            Debug.Log("[EduAdapt] Loading local runtime test...");

            LoadRuntimeJson(testRuntimeJson.text);
        }

        private void Fail(string message)
        {
            CurrentGame = null;
            Debug.LogError($"[EduAdapt] {message}");
        }
    }
}
