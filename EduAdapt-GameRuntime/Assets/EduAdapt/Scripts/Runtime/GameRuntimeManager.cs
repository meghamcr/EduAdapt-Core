using UnityEngine;

namespace EduAdapt.Runtime
{
    public class GameRuntimeManager : MonoBehaviour
    {
        public static GameRuntimeManager Instance { get; private set; }

        public enum RuntimeState
        {
            Booting,
            WaitingForGame,
            LoadingGame,
            Playing,
            Completing,
            Completed,
            Error
        }

        public RuntimeState CurrentState { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            SetState(RuntimeState.Booting);
        }

        private void Start()
        {
            InitializeRuntime();
        }

        private void InitializeRuntime()
        {
            Debug.Log("[EduAdapt] Runtime initialized.");
            SetState(RuntimeState.WaitingForGame);
        }

        public void SetState(RuntimeState newState)
        {
            CurrentState = newState;
            Debug.Log($"[EduAdapt] Runtime state: {newState}");
        }

        public void ReportRuntimeError(string message)
        {
            Debug.LogError($"[EduAdapt] Runtime error: {message}");
            SetState(RuntimeState.Error);
        }
    }
}