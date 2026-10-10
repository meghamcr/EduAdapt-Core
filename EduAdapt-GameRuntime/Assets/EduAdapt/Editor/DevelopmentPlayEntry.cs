#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace EduAdapt.Editor
{
    public static class DevelopmentPlayEntry
    {
        public static void Start()
        {
            EditorSceneManager.OpenScene("Assets/EduAdapt/Scenes/EduAdaptBootstrap.unity");
            EditorApplication.delayCall += () => EditorApplication.isPlaying=true;
        }
        [MenuItem("Tools/EduAdapt/Capture Game View")]
        public static void Capture()
        {
            var folder=System.Environment.GetEnvironmentVariable("EDUADAPT_SCREENSHOT_DIRECTORY");
            if(!EditorApplication.isPlaying||string.IsNullOrEmpty(folder))return;
            System.IO.Directory.CreateDirectory(folder);
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(folder,"gameplay-"+System.DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")+".png"));
        }
    }
}
#endif
