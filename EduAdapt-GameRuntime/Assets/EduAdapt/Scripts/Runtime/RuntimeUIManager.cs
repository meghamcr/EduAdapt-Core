using UnityEngine;

namespace EduAdapt.Runtime
{
    public class RuntimeUIManager : MonoBehaviour
    {
        public static RuntimeUIManager Instance { get; private set; }

        public enum ScreenState
        {
            Loading,
            Instructions,
            Gameplay,
            Feedback,
            Remediation,
            Completion,
            Error
        }

        [Header("Runtime Screens")]
        [SerializeField] private GameObject loadingScreen;
        [SerializeField] private GameObject instructionsScreen;
        [SerializeField] private GameObject gameplayScreen;
        [SerializeField] private GameObject feedbackScreen;
        [SerializeField] private GameObject remediationScreen;
        [SerializeField] private GameObject completionScreen;
        [SerializeField] private GameObject errorScreen;

        public ScreenState CurrentScreen { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            ShowScreen(ScreenState.Loading);
        }

        public void ShowScreen(ScreenState screen)
        {
            SetAllScreensInactive();

            GameObject targetScreen = GetScreenObject(screen);

            if (targetScreen == null)
            {
                Debug.LogError($"[EduAdapt UI] Screen reference missing: {screen}");
                CurrentScreen = ScreenState.Error;

                if (errorScreen != null)
                    errorScreen.SetActive(true);

                return;
            }

            targetScreen.SetActive(true);
            CurrentScreen = screen;

            Debug.Log($"[EduAdapt UI] Screen: {screen}");
        }

        private void SetAllScreensInactive()
        {
            SetActive(loadingScreen, false);
            SetActive(instructionsScreen, false);
            SetActive(gameplayScreen, false);
            SetActive(feedbackScreen, false);
            SetActive(remediationScreen, false);
            SetActive(completionScreen, false);
            SetActive(errorScreen, false);
        }

        private GameObject GetScreenObject(ScreenState screen)
        {
            switch (screen)
            {
                case ScreenState.Loading:
                    return loadingScreen;

                case ScreenState.Instructions:
                    return instructionsScreen;

                case ScreenState.Gameplay:
                    return gameplayScreen;

                case ScreenState.Feedback:
                    return feedbackScreen;

                case ScreenState.Remediation:
                    return remediationScreen;

                case ScreenState.Completion:
                    return completionScreen;

                case ScreenState.Error:
                    return errorScreen;

                default:
                    return null;
            }
        }

        private void SetActive(GameObject target, bool active)
        {
            if (target != null)
                target.SetActive(active);
        }

        public void ShowInstructions() =>
            ShowScreen(ScreenState.Instructions);

        public void ShowGameplay() =>
            ShowScreen(ScreenState.Gameplay);

        public void ShowFeedback() =>
            ShowScreen(ScreenState.Feedback);

        public void ShowRemediation() =>
            ShowScreen(ScreenState.Remediation);

        public void ShowCompletion() =>
            ShowScreen(ScreenState.Completion);

        public void ShowError() =>
            ShowScreen(ScreenState.Error);
    }
}