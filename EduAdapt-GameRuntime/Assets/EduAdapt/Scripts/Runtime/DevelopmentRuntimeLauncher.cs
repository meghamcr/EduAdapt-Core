#if UNITY_EDITOR || DEVELOPMENT_BUILD
using System;
using System.IO;
using UnityEngine;

namespace EduAdapt.Runtime
{
    // Explicit local development entry point. Production builds have no launcher.
    // The connection file is server-issued, private and contains no answer keys.
    public sealed class DevelopmentRuntimeLauncher : MonoBehaviour
    {
        [Serializable] public class Scope { public string endpoint, versionId, levelId, title; }
        [Serializable] public class Connection { public string usage, token, generationStatus; public Scope[] endpoints; }
        private Connection connection;
        private RuntimeSessionController controller;
        private string error;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Attach()
        {
            var file = Environment.GetEnvironmentVariable("EDUADAPT_DEVELOPMENT_CONNECTION");
            if (string.IsNullOrEmpty(file)) return;
            Application.runInBackground = true;
            var controller = FindFirstObjectByType<RuntimeSessionController>();
            if (controller == null) return;
            var launcher = controller.gameObject.AddComponent<DevelopmentRuntimeLauncher>();
            launcher.controller = controller;
            try
            {
                launcher.connection = JsonUtility.FromJson<Connection>(File.ReadAllText(file));
                if (launcher.connection.usage != "DEVELOPMENT_ONLY" || launcher.connection.endpoints == null) throw new ArgumentException();
                controller.DevelopmentNotice=launcher.connection.generationStatus=="DEVELOPMENT_FIXTURE_NOT_AI_GENERATED" ? "DEVELOPMENT FIXTURE - NOT AI GENERATED - UNREVIEWED" : "UNREVIEWED DEVELOPMENT CONTENT";
                foreach (var scope in launcher.connection.endpoints)
                    if (!Uri.TryCreate(scope.endpoint, UriKind.Absolute, out var uri) || !uri.IsLoopback) throw new ArgumentException();
            }
            catch { launcher.connection = null; launcher.error = "Development connection unavailable."; }
        }
        private void Update()
        {
            if(connection==null || controller==null || controller.Current!=null || controller.CurrentPlan!=null || controller.Busy || controller.HasPendingRequest)return;
            var keyboard=UnityEngine.InputSystem.Keyboard.current;if(keyboard==null)return;
            for(int i=0;i<connection.endpoints.Length && i<9;i++)if(keyboard[(UnityEngine.InputSystem.Key)((int)UnityEngine.InputSystem.Key.Digit1+i)].wasPressedThisFrame)
            {var scope=connection.endpoints[i];controller.Configure(scope.endpoint,connection.token);controller.PrepareLevel(scope.versionId,scope.levelId);break;}
        }
        private void OnGUI()
        {
            PixelTheme.Apply();
            if (controller != null && (controller.Current != null || controller.CurrentPlan != null)) return;
            PixelTheme.Fill(new Rect(0,0,Screen.width,Screen.height),PixelTheme.Background);
            var style = new GUIStyle(GUI.skin.button) { richText = false, wordWrap = true };
            GUILayout.BeginArea(new Rect(20, 20, Math.Min(Screen.width - 40, 900), Screen.height - 40));
            GUILayout.Label("Local curriculum development — UNREVIEWED");
            if (error != null) GUILayout.Label(error);
            GUI.enabled = controller != null && !controller.Busy && !controller.HasPendingRequest;
            if (connection != null) foreach (var scope in connection.endpoints)
                if (GUILayout.Button((Array.IndexOf(connection.endpoints,scope)+1)+". "+scope.title, style))
                {
                    controller.Configure(scope.endpoint, connection.token);
                    controller.PrepareLevel(scope.versionId, scope.levelId);
                }
            GUI.enabled = true;
            GUILayout.EndArea();
        }
    }
}
#endif
